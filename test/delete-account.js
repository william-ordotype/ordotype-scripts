#!/usr/bin/env node
/**
 * Account deletion: the request carries the member's session token and nothing else.
 *
 * What must hold:
 *   - the request goes to the account-delete endpoint, never to the form's own action;
 *   - it carries `Authorization: Bearer <token>` and no identity at all (no member id, no email,
 *     even though the form's hidden fields hold them);
 *   - without a token nothing is sent, the error shows and is reported;
 *   - a refusal (401, 409, 5xx) or no answer shows the error, gives the form back, is reported,
 *     does not log out, and a second try is possible;
 *   - success shows the confirmation, clears the local member cache, logs out with
 *     reason `account_deleted`, then goes home;
 *   - a second submit while the first is running sends nothing more.
 *
 * Usage: node test/delete-account.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'account/delete-account.js'), 'utf8');
const SCRIPT = REAL
  .split("window.location.href = '/';").join("window.__navigate('/');")
  .split('}, 3000);').join('}, 30);')
  .split('const MS_MAX_ATTEMPTS = 50;').join('const MS_MAX_ATTEMPTS = 2;');
assert.ok(SCRIPT.includes("window.__navigate('/')"), 'navigation line not found: the test could not observe it');
assert.ok(SCRIPT.includes('}, 30);'), 'redirect delay not found');
assert.ok(SCRIPT.includes('MS_MAX_ATTEMPTS = 2;'), 'Memberstack wait not found');

const ENDPOINT = 'https://webhooks.ordotype.fr/.netlify/functions/account-delete';
const FORM_ACTION = 'https://example.invalid/old-endpoint';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

const HTML = '<!doctype html><html><body>' +
  '<a id="delete-account-btn" href="#">Supprimer mon compte</a>' +
  '<div id="delete-account-form-v2" style="display:none">' +
  '<form id="delete-form" action="' + FORM_ACTION + '" method="POST">' +
  '<input type="email" id="email-cancel" name="email" value="dr.someone@example.fr" style="display:none;">' +
  '<input type="text" id="MSuserId-delete" name="MSuserId" value="mem_test" style="display:none;">' +
  '<input class="checkbox" type="checkbox" checked required>' +
  '<input class="checkbox" type="checkbox" checked required>' +
  '<input type="submit" value="Supprimer définitivement mon compte">' +
  '</form>' +
  '<div id="waiting-message-delete" style="display:none">…</div>' +
  '</div>' +
  '<div id="success-message-delete" style="display:none">ok</div>' +
  '<div id="error-message-delete" style="display:none">erreur</div>' +
  '</body></html>';

// answers: { status } or { transport } (network failure), optional delay.
// token: what getMemberCookie() gives; memberstack: false = never appears.
async function page({ answers = [], token = 'jeton-de-test', memberstack = true } = {}) {
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/membership/compte', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: 'cus_test', auth: { email: 'dr.someone@example.fr' } } };
  const logouts = [];
  if (memberstack) {
    w.$memberstackDom = {
      getMemberCookie: () => Promise.resolve(token),
      logout: (o) => { logouts.push(o); return Promise.resolve(); },
    };
  }
  w.localStorage.setItem('_ms-mem', '{"id":"mem_test"}');
  w.localStorage.setItem('userExists', 'true');
  const requests = [];
  const queue = answers.slice();
  w.fetch = (url, opts) => {
    requests.push({ url, method: opts && opts.method, headers: Object.assign({}, opts && opts.headers), body: opts && opts.body });
    const a = queue.shift() || { status: 202 };
    return wait(a.delay || 0).then(() => {
      if (a.transport) throw new TypeError(a.transport);
      return { ok: a.status < 400, status: a.status, json: () => Promise.resolve({}) };
    });
  };
  const navigations = [];
  w.__navigate = (u) => navigations.push(u);
  const reports = [];
  w.OrdoErrorReporter = {
    report: (ctx, err) => reports.push({ kind: 'report', ctx, err }),
    reportNetwork: (ctx, err) => reports.push({ kind: 'network', ctx, err }),
  };
  w.eval(SCRIPT);
  await wait(10); // init runs on DOMContentLoaded
  const d = w.document;
  const shown = (id) => d.getElementById(id).style.display === 'block';
  const submit = () => d.getElementById('delete-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  return { w, d, requests, logouts, navigations, reports, shown, submit };
}

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

(async () => {
  await check('the button opens the form', async () => {
    const p = await page();
    p.d.getElementById('delete-account-btn').click();
    assert.strictEqual(p.d.getElementById('delete-account-form-v2').style.display, 'block');
    assert.strictEqual(p.requests.length, 0);
  });

  await check('submit: one POST to the endpoint with the token, no identity, never the form action', async () => {
    const p = await page();
    p.submit();
    await wait(20);
    assert.strictEqual(p.requests.length, 1);
    const r = p.requests[0];
    assert.strictEqual(r.url, ENDPOINT);
    assert.strictEqual(r.method, 'POST');
    assert.strictEqual(r.headers.Authorization, 'Bearer jeton-de-test');
    assert.ok(!p.requests.some((q) => q.url === FORM_ACTION), 'the form action is never called');
    const body = String(r.body);
    assert.ok(!/mem_test|dr\.someone|cus_test/.test(body), 'no member id, email or customer in the body: ' + body);
    assert.ok(typeof r.body === 'string', 'a JSON string, not the form data');
  });

  await check('success: confirmation, local cache cleared, logout account_deleted, then home', async () => {
    const p = await page();
    p.submit();
    await wait(80);
    assert.ok(p.shown('success-message-delete'));
    assert.ok(!p.shown('waiting-message-delete'));
    assert.ok(!p.shown('error-message-delete'));
    assert.strictEqual(p.w.localStorage.getItem('_ms-mem'), null);
    assert.strictEqual(p.w.localStorage.getItem('userExists'), null);
    assert.deepStrictEqual(p.logouts.map((o) => o.reason), ['account_deleted']);
    assert.deepStrictEqual(p.navigations, ['/']);
    assert.strictEqual(p.reports.length, 0);
  });

  for (const status of [401, 409, 502, 503]) {
    await check(`HTTP ${status}: error shown, form back, reported with its status, no logout`, async () => {
      const p = await page({ answers: [{ status }] });
      p.submit();
      await wait(60);
      assert.ok(p.shown('error-message-delete'));
      assert.ok(!p.shown('success-message-delete'));
      assert.ok(!p.shown('waiting-message-delete'));
      assert.strictEqual(p.d.getElementById('delete-form').style.display, 'block');
      assert.strictEqual(p.logouts.length, 0);
      assert.strictEqual(p.navigations.length, 0);
      assert.strictEqual(p.w.localStorage.getItem('_ms-mem'), '{"id":"mem_test"}', 'local cache kept');
      assert.strictEqual(p.reports.length, 1);
      assert.strictEqual(p.reports[0].kind, 'report');
      assert.strictEqual(p.reports[0].err.status, status);
    });
  }

  await check('no answer: error shown, reported as a network failure', async () => {
    const p = await page({ answers: [{ transport: 'Failed to fetch' }] });
    p.submit();
    await wait(60);
    assert.ok(p.shown('error-message-delete'));
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].kind, 'network');
  });

  await check('after a failure, a second try sends again and can succeed', async () => {
    const p = await page({ answers: [{ status: 502 }, { status: 202 }] });
    p.submit();
    await wait(60);
    assert.ok(p.shown('error-message-delete'));
    p.submit();
    await wait(80);
    assert.strictEqual(p.requests.length, 2);
    assert.ok(p.shown('success-message-delete'));
    assert.ok(!p.shown('error-message-delete'), 'the old error is hidden again');
  });

  await check('no session token: nothing is sent, error shown and reported', async () => {
    const p = await page({ token: '' });
    p.submit();
    await wait(60);
    assert.strictEqual(p.requests.length, 0);
    assert.ok(p.shown('error-message-delete'));
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].err.status, 'no_token');
  });

  await check('Memberstack never loads: nothing is sent, error shown', async () => {
    const p = await page({ memberstack: false });
    p.submit();
    await wait(700);
    assert.strictEqual(p.requests.length, 0);
    assert.ok(p.shown('error-message-delete'));
  });

  await check('a second submit while the first runs sends nothing more', async () => {
    const p = await page({ answers: [{ status: 202, delay: 50 }] });
    p.submit();
    p.submit();
    await wait(20);
    p.submit();
    await wait(120);
    assert.strictEqual(p.requests.length, 1);
    assert.deepStrictEqual(p.logouts.map((o) => o.reason), ['account_deleted']);
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
