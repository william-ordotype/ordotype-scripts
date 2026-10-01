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
 *   - the account card (#pause-state-card) uses the same call: resume sends `resume-pause`, then
 *     redirects; a failed definitive cancel shows the error and gives the buttons back.
 *
 * Usage : node test/pause-state-api.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const REAL = fs.readFileSync(path.join(ROOT, 'account/pause-state.js'), 'utf8');
const SCRIPT = REAL
  .split('window.location.href = redirectUrl;').join('window.__navigate(redirectUrl);')
  .split('window.location.reload();').join("window.__navigate('reload');");
assert.ok(SCRIPT.includes('window.__navigate(redirectUrl);'), 'redirect line not found: the test could not observe it');
assert.ok(SCRIPT.includes("window.__navigate('reload');"), 'reload line not found: the test could not observe it');
const SHORT_TIMEOUT = SCRIPT.split('var REQUEST_TIMEOUT = 10000;').join('var REQUEST_TIMEOUT = 30;');
assert.notStrictEqual(SHORT_TIMEOUT, SCRIPT, 'timeout constant not found');

const ENDPOINT = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

const CARD = '<div id="pause-state-card" class="hidden" style="display:none">' +
  '<div id="pause-plan-label"></div><div id="pause-resume-date"></div>' +
  '<a id="resume-btn" href="#">Reprendre</a><a id="cancel-definitive-btn" href="#">Annuler</a>' +
  '<div id="pause-action-waiting" style="display:none"></div>' +
  '<div id="pause-action-success" style="display:none"></div>' +
  '<div id="pause-action-error" style="display:none"></div></div>';

// answers: { status, body } or { network: true } or { hang: true } (only the abort ends it).
// token: what getMemberCookie() gives; memberstack: 'absent' | 'throws' | 'rejects'.
function page({ answers = [], token = 'jeton-de-test', memberstack = null, card = false, metaData = {}, script = SCRIPT, fetchThrows = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + (card ? CARD : '') + '</body></html>', {
    url: 'https://www.ordotype.fr/membership/compte',
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  const requests = [];
  const reported = [];
  const navigations = [];
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
  w.OrdoMemberstack = { memberId: 'mem_test', metaData, planConnections: [] };
  w.OrdoErrorReporter = { report(ctx, err) { reported.push({ name: err.name, message: err.message }); } };
  w.__navigate = (u) => navigations.push(u);
  w.confirm = () => true;
  w.eval(script);
  return { w, d: w.document, requests, reported, navigations, names: () => reported.map((r) => r.name) };
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

  const PAUSED = { 'pause-end-date': new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), 'paused-group-key': 'compte-praticien' };
  const shown = (t, id) => t.d.getElementById(id).style.display === 'block';
  const click = (t, id) => t.d.getElementById(id).dispatchEvent(new t.w.MouseEvent('click', { bubbles: true, cancelable: true }));

  await check('account card: resume sends resume-pause with the token, then redirects', async () => {
    const t = page({ card: true, metaData: PAUSED });
    await wait(20);
    assert.strictEqual(t.d.getElementById('pause-state-card').style.display, '', 'card shown');
    assert.strictEqual(t.d.getElementById('pause-plan-label').textContent, 'Module MG - Compte Praticien');
    click(t, 'resume-btn');
    assert.ok(shown(t, 'pause-action-waiting'));
    assert.strictEqual(t.d.getElementById('resume-btn').style.display, 'none');
    await wait(60);
    assert.strictEqual(t.requests.length, 1);
    assert.strictEqual(t.requests[0].url, ENDPOINT);
    assert.strictEqual(t.requests[0].headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(t.requests[0].body, '{"action":"resume-pause","fields":{}}');
    assert.ok(!shown(t, 'pause-action-waiting'));
    assert.ok(shown(t, 'pause-action-success'));
    assert.strictEqual(t.d.getElementById('pause-action-success').textContent, 'Votre abonnement a été réactivé !');
    assert.deepStrictEqual(t.navigations, []);
    await wait(3100);
    assert.deepStrictEqual(t.navigations, ['/membership/abonnement-repris']);
  });

  await check('account card: a failed definitive cancel shows the error and gives the buttons back', async () => {
    const t = page({ card: true, metaData: PAUSED, answers: [{ status: 502, body: 'bad gateway' }] });
    await wait(20);
    click(t, 'cancel-definitive-btn');
    await wait(60);
    assert.strictEqual(t.requests.length, 1);
    assert.strictEqual(t.requests[0].body, '{"action":"cancel-pause","fields":{}}');
    assert.ok(shown(t, 'pause-action-error'));
    assert.ok(!shown(t, 'pause-action-success'));
    assert.ok(!shown(t, 'pause-action-waiting'));
    assert.strictEqual(t.d.getElementById('resume-btn').style.display, '');
    assert.strictEqual(t.d.getElementById('cancel-definitive-btn').style.display, '');
    assert.deepStrictEqual(t.names(), ['PauseStateActionFailed']);
    await wait(3100);
    assert.deepStrictEqual(t.navigations, []);
  });

  await check('account card: without a session token nothing is sent and the error shows', async () => {
    const t = page({ card: true, metaData: PAUSED, token: '' });
    await wait(20);
    click(t, 'resume-btn');
    await wait(60);
    assert.strictEqual(t.requests.length, 0);
    assert.ok(shown(t, 'pause-action-error'));
    assert.deepStrictEqual(t.names(), ['PauseStateNoSession']);
  });

  console.log('\npause-state-api: ' + passed + ' checks pass');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
