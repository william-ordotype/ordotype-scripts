#!/usr/bin/env node
/**
 * Pause state: resume and definitive cancel go to the member-forms endpoint with the session token.
 *
 * What must hold:
 *   - `OrdoPause.resume` / `.cancelDefinitive` send one POST to the member-forms endpoint, with
 *     `Authorization: Bearer <token>`, JSON, and exactly `{ action, fields: {} }` (actions
 *     `resume-pause` / `cancel-pause`): no member id, no page URL;
 *   - onResult(true) only on HTTP 200; any other status, no answer, a timeout or a synchronous
 *     failure gives onResult(false) and a report with its own error name; onResult runs once;
 *   - without a session token nothing is sent, onResult(false), reported as `PauseStateNoSession`;
 *   - the script no longer holds any third-party webhook URL;
 *   - it reads nothing from the page: the paused card and its buttons are drawn by the « Mes abonnements »
 *     list (subscriptions-overview.js), which calls OrdoPause.
 *
 * Usage : node test/pause-state-api.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const REAL = fs.readFileSync(path.join(ROOT, 'account/pause-state.js'), 'utf8');
const SCRIPT = REAL;
const SHORT_TIMEOUT = SCRIPT.split('var REQUEST_TIMEOUT = 10000;').join('var REQUEST_TIMEOUT = 30;');
assert.notStrictEqual(SHORT_TIMEOUT, SCRIPT, 'timeout constant not found');

const ENDPOINT = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

// answers: { status, body } or { network: true } or { hang: true } (only the abort ends it).
// token: what getMemberCookie() gives; memberstack: 'absent' | 'throws' | 'rejects'.
function page({ answers = [], token = 'jeton-de-test', memberstack = null, script = SCRIPT, fetchThrows = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.ordotype.fr/membership/compte',
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  const requests = [];
  const reported = [];
  const queue = answers.slice();
  w.fetch = (url, opts) => {
    if (fetchThrows) throw new TypeError('blocked');
    requests.push({ url, method: opts.method, headers: Object.assign({}, opts.headers), body: opts.body });
    const a = queue.shift() || { status: 200, body: '{"ok":true}' };
    return new Promise((resolve, reject) => {
      if (a.hang) {
        opts.signal.addEventListener('abort', () => reject(new w.DOMException('aborted', 'AbortError')));
        return;
      }
      setTimeout(() => {
        if (a.network) return reject(new TypeError('Failed to fetch'));
        resolve({ ok: a.status < 300, status: a.status, text: () => Promise.resolve(a.body || '') });
      }, 0);
    });
  };
  if (memberstack !== 'absent') {
    w.$memberstackDom = {
      getMemberCookie: () => {
        if (memberstack === 'throws') throw new Error('no cookie');
        if (memberstack === 'rejects') return Promise.reject(new Error('no cookie'));
        return Promise.resolve(token);
      },
    };
  }
  w.OrdoErrorReporter = { report(ctx, err) { reported.push({ name: err.name, message: err.message }); } };
  w.eval(script);
  return { w, d: w.document, requests, reported, names: () => reported.map((r) => r.name) };
}

// Calls fn(onResult) and returns every value onResult received.
async function outcome(t, method) {
  const results = [];
  t.w.OrdoPause[method]((ok) => results.push(ok));
  await wait(60);
  return results;
}

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

async function main() {
  await check('the script holds no third-party webhook URL', async () => {
    assert.ok(!/hook\.eu1\.make\.com|make\.com|\/\/hook\./.test(REAL), 'a third-party webhook URL is still in pause-state.js');
    assert.ok(REAL.includes(ENDPOINT));
  });

  await check('resume: one POST to member-forms, Bearer token, JSON body { action: resume-pause, fields: {} }', async () => {
    const t = page();
    const results = await outcome(t, 'resume');
    assert.strictEqual(t.requests.length, 1);
    const r = t.requests[0];
    assert.strictEqual(r.url, ENDPOINT);
    assert.strictEqual(r.method, 'POST');
    assert.strictEqual(r.headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(r.headers['Content-Type'], 'application/json');
    assert.strictEqual(r.body, '{"action":"resume-pause","fields":{}}');
    assert.ok(!/mem_test|pageUrl|ordotype\.fr\/membership/.test(r.body), 'no identity nor page URL: ' + r.body);
    assert.deepStrictEqual(results, [true]);
    assert.deepStrictEqual(t.reported, []);
    assert.strictEqual(t.w.OrdoPause.resumedUrl, '/membership/abonnement-repris');
    assert.strictEqual(t.w.OrdoPause.redirectDelay, 3000);
  });

  await check('cancel definitive: action cancel-pause; 200 gives true', async () => {
    const t = page();
    const results = await outcome(t, 'cancelDefinitive');
    assert.strictEqual(t.requests.length, 1);
    assert.strictEqual(t.requests[0].url, ENDPOINT);
    assert.strictEqual(t.requests[0].headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(t.requests[0].body, '{"action":"cancel-pause","fields":{}}');
    assert.deepStrictEqual(results, [true]);
  });

  await check('HTTP 500: false, reported as PauseStateActionFailed with status and body (200 chars max)', async () => {
    const long = 'x'.repeat(300);
    const t = page({ answers: [{ status: 500, body: long }] });
    const results = await outcome(t, 'cancelDefinitive');
    assert.deepStrictEqual(results, [false]);
    assert.deepStrictEqual(t.names(), ['PauseStateActionFailed']);
    assert.strictEqual(t.reported[0].message, 'cancel-definitive: HTTP 500 — ' + 'x'.repeat(200));
  });

  for (const status of [202, 400, 401, 403, 409, 429, 502, 503]) {
    await check(`HTTP ${status}: false, reported as PauseStateActionFailed`, async () => {
      const t = page({ answers: [{ status, body: '{"error":"x"}' }] });
      const results = await outcome(t, 'resume');
      assert.deepStrictEqual(results, [false]);
      assert.deepStrictEqual(t.names(), ['PauseStateActionFailed']);
      assert.match(t.reported[0].message, new RegExp('HTTP ' + status));
    });
  }

  await check('no answer: false, reported as PauseStateNetworkError', async () => {
    const t = page({ answers: [{ network: true }] });
    const results = await outcome(t, 'resume');
    assert.deepStrictEqual(results, [false]);
    assert.deepStrictEqual(t.names(), ['PauseStateNetworkError']);
  });

  await check('timeout: the request is aborted, false, reported as PauseStateTimeout', async () => {
    const t = page({ answers: [{ hang: true }], script: SHORT_TIMEOUT });
    const results = await outcome(t, 'resume');
    assert.strictEqual(t.requests.length, 1);
    assert.deepStrictEqual(results, [false]);
    assert.deepStrictEqual(t.names(), ['PauseStateTimeout']);
  });

  await check('fetch throwing synchronously: false, reported as PauseStateSendFailed', async () => {
    const t = page({ fetchThrows: true });
    const results = await outcome(t, 'resume');
    assert.deepStrictEqual(results, [false]);
    assert.deepStrictEqual(t.names(), ['PauseStateSendFailed']);
  });

  for (const [label, opts] of [
    ['empty token', { token: '' }],
    ['no Memberstack', { memberstack: 'absent' }],
    ['getMemberCookie throws', { memberstack: 'throws' }],
    ['getMemberCookie rejects', { memberstack: 'rejects' }],
  ]) {
    await check(`no session token (${label}): nothing sent, false, reported as PauseStateNoSession`, async () => {
      const t = page(opts);
      const results = await outcome(t, 'resume');
      assert.strictEqual(t.requests.length, 0, 'no call without a session token');
      assert.deepStrictEqual(results, [false]);
      assert.deepStrictEqual(t.names(), ['PauseStateNoSession']);
    });
  }

  await check('no account card any more: nothing read from the page, only OrdoPause', async () => {
    assert.ok(!/getElementById|querySelector|document\./.test(REAL), 'no page element');
    const t = page();
    await wait(20);
    assert.deepStrictEqual(Object.keys(t.w.OrdoPause).sort(), ['cancelDefinitive', 'redirectDelay', 'resume', 'resumedUrl']);
    assert.strictEqual(t.requests.length, 0, 'nothing sent on load');
  });

  console.log('\npause-state-api: ' + passed + ' checks pass');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
