#!/usr/bin/env node
/**
 * The subscriptions list must never end in silence.
 *
 * Before this test, a list request that never answered produced no event at all: neither
 * `shown` nor `failed`. The failure rate was therefore underestimated, and a hung function
 * looked exactly like a member who left the page. What must hold:
 *   - a list request with no answer is sent a second time after HEDGE_MS, without cancelling
 *     the first; both are cut by LIST_TIMEOUT_MS, and the page records ONE `timeout`, in
 *     subs_outcome (the dimension GA4 actually reads);
 *   - the first answer wins: a second request that answers is recorded as `shown-retry`, and an
 *     answer before HEDGE_MS sends no second request;
 *   - an HTTP error is an answer: no second request;
 *   - a timeout the member did not see (tab in the background) is `timeout-unseen`, and is not
 *     reported: the page's own blocks still come back;
 *   - a page without the anchor is recorded as `no-anchor`;
 *   - a normal answer is still `shown`, and no late `timeout` follows it;
 *   - an HTTP error is still `failed`, never `timeout`;
 *   - a body cut while it is read (page left, connection lost) is a network failure: sent a
 *     second time, reported through reportNetwork, never as `unexpected body`; a 200 whose body
 *     is not JSON still is one, and an HTTP error with a cut body is still that HTTP error;
 *   - actions (PDF, payment, reactivation) are never subject to the delay;
 *   - without AbortController, the request keeps its previous, unbounded behaviour.
 *
 * The real file is loaded in jsdom. Only LIST_TIMEOUT_MS and HEDGE_MS are shortened, in the
 * test's copy, so each case runs in milliseconds instead of eight seconds.
 *
 * Usage: node test/subscriptions-list-timeout.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.resolve(__dirname, '..', 'account/subscriptions-overview.js');
const REAL = fs.readFileSync(FILE, 'utf8');
const SHORT_MS = 60;
const HEDGE_SHORT_MS = 30;
const SHORTENED = REAL.replace('var LIST_TIMEOUT_MS = 8000;', 'var LIST_TIMEOUT_MS = ' + SHORT_MS + ';');
assert.notStrictEqual(SHORTENED, REAL, 'LIST_TIMEOUT_MS = 8000 not found: the test would not shorten the delay');
const SOURCE = SHORTENED.replace('var HEDGE_MS = 4000;', 'var HEDGE_MS = ' + HEDGE_SHORT_MS + ';');
assert.notStrictEqual(SOURCE, SHORTENED, 'HEDGE_MS = 4000 not found: the test would not shorten the delay');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

function page({ anchor = true, fetch, withAbort = true, hidden = false } = {}) {
  const html = '<!doctype html><html><body>' + (anchor ? '<div id="ordotype-subscriptions"></div>' : '') + '</body></html>';
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://www.ordotype.fr/membership/compte',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  w.dataLayer = [];
  w.OrdoAccount = { member: { id: 'mem_test' } };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('test-token') };
  const calls = [];
  w.fetch = (url, opts) => { calls.push({ url, opts }); return fetch(w, opts); };
  const reports = [];
  w.OrdoErrorReporter = {
    report: (ctx, err) => reports.push({ ctx, err, via: 'report' }),
    reportNetwork: (ctx, err) => reports.push({ ctx, err, via: 'network' }),
  };
  if (!withAbort) delete w.AbortController;
  if (hidden) Object.defineProperty(w.document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  w.eval(SOURCE);
  const events = () => w.dataLayer.filter((e) => e.event === 'subscriptions_list');
  return { w, calls, reports, events, fallback: () => w.document.documentElement.classList.contains('ordo-subs-fallback') };
}

// Never answers, but honours the abort signal like a real fetch.
const hang = (w, opts) => new Promise((resolve, reject) => {
  if (opts && opts.signal) {
    opts.signal.addEventListener('abort', () => reject(new w.DOMException('The operation was aborted.', 'AbortError')));
  }
});
const answer = (status, body) => () => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
// Headers arrived, then reading the body fails: what a browser does when the page is left mid-read.
const cutBody = (status) => (w) => Promise.resolve({
  ok: status < 400,
  status,
  json: () => Promise.reject(new w.TypeError('NetworkError when attempting to fetch resource.')),
});
const notJson = (w) => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new w.SyntaxError('JSON.parse: unexpected character')) });
const EMPTY = { subscriptions: [], paymentMethods: [], invoices: [] };
// A status-less failure is sent again after RETRY_DELAY_MS, which the test keeps real.
const RETRY_WAIT_MS = 600;

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

(async () => {
  await check('no answer: a second request after HEDGE_MS, both cut by LIST_TIMEOUT_MS, ONE `timeout`', async () => {
    const p = page({ fetch: hang });
    await wait(HEDGE_SHORT_MS / 2);
    assert.strictEqual(p.calls.length, 1, 'no second request before HEDGE_MS');
    await wait(SHORT_MS * 5);
    const ev = p.events();
    assert.strictEqual(ev.length, 1, 'exactly one list event');
    assert.strictEqual(ev[0].subs_outcome, 'timeout');
    assert.strictEqual(ev[0].subs_status, 'timeout');
    assert.strictEqual(p.calls.length, 2, 'the unanswered request is sent a second time, and only once');
    assert.ok(p.calls.every((c) => c.opts.signal && c.opts.signal.aborted), 'both requests are cut');
    assert.ok(p.fallback(), 'the page\'s own blocks come back');
    assert.strictEqual(p.reports.length, 1, 'a hung function is reported, so it shows in Sentry');
  });

  await check('the total wait does not grow: both requests are over by LIST_TIMEOUT_MS', async () => {
    const p = page({ fetch: hang });
    const t0 = Date.now();
    while (!p.events().length && Date.now() - t0 < SHORT_MS * 10) await wait(5);
    assert.ok(p.events().length === 1 && Date.now() - t0 < SHORT_MS * 2, 'recorded well before twice the delay');
  });

  await check('first request hangs, the second answers: `shown-retry`, nothing reported', async () => {
    let n = 0;
    const p = page({ fetch: (w, opts) => (++n === 1 ? hang(w, opts) : answer(200, EMPTY)()) });
    await wait(SHORT_MS * 3);
    assert.deepStrictEqual(p.events().map((e) => e.subs_outcome), ['shown-retry']);
    assert.strictEqual(p.calls.length, 2);
    assert.ok(!p.fallback());
    assert.strictEqual(p.reports.length, 0);
  });

  await check('first request hangs, the second gets an HTTP error: `failed` at once, not a later `timeout`', async () => {
    let n = 0;
    const p = page({ fetch: (w, opts) => (++n === 1 ? hang(w, opts) : answer(503, { error: 'unavailable' })()) });
    await wait(HEDGE_SHORT_MS + 10);
    const ev = p.events();
    assert.strictEqual(ev.length, 1, 'recorded before the first request is cut');
    assert.strictEqual(ev[0].subs_outcome, 'failed');
    assert.strictEqual(ev[0].subs_status, '503');
    await wait(SHORT_MS * 2);
    assert.strictEqual(p.events().length, 1, 'no late event when the first request is cut');
  });

  await check('an answer before HEDGE_MS: no second request', async () => {
    const slow = (ms) => () => new Promise((r) => setTimeout(() => r({ ok: true, status: 200, json: () => Promise.resolve(EMPTY) }), ms));
    const p = page({ fetch: slow(HEDGE_SHORT_MS / 3) });
    await wait(SHORT_MS * 3);
    assert.deepStrictEqual(p.events().map((e) => e.subs_outcome), ['shown']);
    assert.strictEqual(p.calls.length, 1);
  });

  await check('tab in the background during the wait: `timeout-unseen`, not reported, blocks back', async () => {
    const p = page({ fetch: hang, hidden: true });
    await wait(SHORT_MS * 5);
    assert.deepStrictEqual(p.events().map((e) => e.subs_outcome), ['timeout-unseen']);
    assert.ok(p.fallback(), 'the page\'s own blocks still come back');
    assert.strictEqual(p.reports.length, 0, 'a wait nobody saw is not a failure');
  });

  await check('no anchor: recorded as `no-anchor`, no request, page blocks back', async () => {
    const p = page({ anchor: false, fetch: answer(200, EMPTY) });
    await wait(SHORT_MS * 2);
    const ev = p.events();
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].subs_outcome, 'no-anchor');
    assert.strictEqual(p.calls.length, 0);
    assert.ok(p.fallback());
  });

  await check('normal answer: still `shown`, and no late `timeout` after the delay', async () => {
    const p = page({ fetch: answer(200, EMPTY) });
    await wait(SHORT_MS * 5);
    const ev = p.events();
    assert.deepStrictEqual(ev.map((e) => e.subs_outcome), ['shown'], 'the abort timer must be cleared on success');
    assert.strictEqual(p.calls[0].opts.signal.aborted, false, 'a request that answered must not be aborted afterwards');
    assert.strictEqual(p.reports.length, 0);
  });

  await check('HTTP error: still `failed`, never `timeout`', async () => {
    const p = page({ fetch: answer(503, { error: 'unavailable' }) });
    await wait(SHORT_MS * 5);
    const ev = p.events();
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].subs_outcome, 'failed');
    assert.strictEqual(ev[0].subs_status, '503');
    assert.strictEqual(p.calls.length, 1, 'an HTTP error is an answer: no second request');
  });

  await check('body cut once: sent a second time, `shown-retry`, nothing reported', async () => {
    let n = 0;
    const p = page({ fetch: (w, opts) => (++n === 1 ? cutBody(200)(w) : answer(200, EMPTY)()) });
    await wait(RETRY_WAIT_MS);
    assert.deepStrictEqual(p.events().map((e) => e.subs_outcome), ['shown-retry']);
    assert.strictEqual(p.calls.length, 2);
    assert.strictEqual(p.reports.length, 0);
  });

  await check('body cut on both requests: a network failure, never `unexpected body`', async () => {
    const p = page({ fetch: cutBody(200) });
    await wait(RETRY_WAIT_MS);
    const ev = p.events();
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].subs_outcome, 'failed');
    assert.strictEqual(ev[0].subs_status, 'network');
    assert.strictEqual(p.calls.length, 2, 'sent a second time, like any network failure');
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].via, 'network', 'dropped by the reporter once the page is gone');
    assert.ok(!/unexpected body/.test(p.reports[0].err.message), p.reports[0].err.message);
  });

  await check('a 200 whose body is not JSON: still `unexpected body`, reported, no second request', async () => {
    const p = page({ fetch: notJson });
    await wait(RETRY_WAIT_MS);
    const ev = p.events();
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].subs_outcome, 'failed');
    assert.strictEqual(ev[0].subs_status, '200');
    assert.strictEqual(p.calls.length, 1);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].via, 'report');
    assert.ok(/unexpected body/.test(p.reports[0].err.message), p.reports[0].err.message);
  });

  await check('an HTTP error with a cut body: still that HTTP error, no second request', async () => {
    const p = page({ fetch: cutBody(503) });
    await wait(RETRY_WAIT_MS);
    const ev = p.events();
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].subs_outcome, 'failed');
    assert.strictEqual(ev[0].subs_status, '503');
    assert.strictEqual(p.calls.length, 1);
  });

  await check('the list request carries an abort signal', async () => {
    const p = page({ fetch: answer(200, EMPTY) });
    await wait(SHORT_MS);
    assert.ok(p.calls[0].opts.signal, 'the list must be bounded');
  });

  await check('without AbortController: previous behaviour, unbounded, no false `timeout`', async () => {
    const p = page({ fetch: hang, withAbort: false });
    await wait(SHORT_MS * 5);
    assert.strictEqual(p.events().length, 0, 'still pending, exactly as before the change');
    assert.ok(p.calls.every((c) => c.opts.signal === undefined));
  });

  await check('actions are never subject to the delay (source check)', async () => {
    // Only the list passes LIST_TIMEOUT_MS: once defined, twice in load(), nowhere else (comments aside).
    const code = REAL.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.strictEqual((code.match(/LIST_TIMEOUT_MS/g) || []).length, 3);
    const posts = REAL.match(/(?:call|request)\('POST',[^)]*\)/g) || [];
    assert.ok(posts.length >= 3, 'the action calls were found');
    for (const c of posts) {
      assert.ok(!/LIST_TIMEOUT_MS/.test(c), 'an action must not be bounded: ' + c);
    }
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error('FAIL ' + err.message);
  process.exit(1);
});
