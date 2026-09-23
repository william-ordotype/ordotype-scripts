#!/usr/bin/env node
/**
 * The subscriptions list must never end in silence.
 *
 * Before this test, a list request that never answered produced no event at all: neither
 * `shown` nor `failed`. The failure rate was therefore underestimated, and a hung function
 * looked exactly like a member who left the page. What must hold:
 *   - a list request with no answer is cut at LIST_TIMEOUT_MS and recorded as `timeout`,
 *     in subs_outcome (the dimension GA4 actually reads), without being retried;
 *   - a page without the anchor is recorded as `no-anchor`;
 *   - a normal answer is still `shown`, and no late `timeout` follows it;
 *   - an HTTP error is still `failed`, never `timeout`;
 *   - actions (PDF, payment, reactivation) are never subject to the delay;
 *   - without AbortController, the request keeps its previous, unbounded behaviour.
 *
 * The real file is loaded in jsdom. Only LIST_TIMEOUT_MS is shortened, in the test's copy,
 * so each case runs in milliseconds instead of eight seconds.
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
const SOURCE = REAL.replace('var LIST_TIMEOUT_MS = 8000;', 'var LIST_TIMEOUT_MS = ' + SHORT_MS + ';');
assert.notStrictEqual(SOURCE, REAL, 'LIST_TIMEOUT_MS = 8000 not found: the test would not shorten the delay');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

function page({ anchor = true, fetch, withAbort = true } = {}) {
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
  w.OrdoErrorReporter = { report: (ctx, err) => reports.push({ ctx, err }), reportNetwork: (ctx, err) => reports.push({ ctx, err }) };
  if (!withAbort) delete w.AbortController;
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
const EMPTY = { subscriptions: [], paymentMethods: [], invoices: [] };

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

(async () => {
  await check('no answer: recorded as `timeout` in subs_outcome, page blocks back, not retried', async () => {
    const p = page({ fetch: hang });
    await wait(SHORT_MS * 5);
    const ev = p.events();
    assert.strictEqual(ev.length, 1, 'exactly one list event');
    assert.strictEqual(ev[0].subs_outcome, 'timeout');
    assert.strictEqual(ev[0].subs_status, 'timeout');
    assert.strictEqual(p.calls.length, 1, 'a timeout must not be retried: it would double the wait');
    assert.ok(p.fallback(), 'the page\'s own blocks come back');
    assert.strictEqual(p.reports.length, 1, 'a hung function is reported, so it shows in Sentry');
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
    assert.strictEqual(p.calls[0].opts.signal, undefined);
  });

  await check('actions are never subject to the delay (source check)', async () => {
    // Only the list passes LIST_TIMEOUT_MS: once defined, twice in load(), nowhere else.
    assert.strictEqual((REAL.match(/LIST_TIMEOUT_MS/g) || []).length, 3);
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
