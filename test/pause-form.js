#!/usr/bin/env node
/**
 * Pause form: a form that carries data-ordo-action goes to the member-forms endpoint with the
 * session token and its own non-identity fields; a form without it keeps the original behaviour.
 *
 * What must hold:
 *   - a form WITHOUT data-ordo-action is posted exactly as before: XHR POST to its own action, the
 *     form data with the prefilled customer, member and subscription ids and pageUrl;
 *   - a form WITH data-ordo-action never calls its own action: one fetch to the endpoint, with
 *     `Authorization: Bearer <token>` and `{ action, fields }`, where fields hold the form's own
 *     fields (the reason) and none of the identity fields, whatever name the prefilled inputs carry;
 *   - success only on 200 (confirmation, then the pause page); any other status or no answer shows
 *     the error, gives the form back and is reported as `PauseFormSubmitFailed`;
 *   - without a session token nothing is sent, the error shows and is reported;
 *   - a logged out visitor (getCurrentMember gives { data: null }) sends nothing from a marked form: the
 *     error element shows the sign-in message, whose link goes to the login page with this page stored
 *     in localStorage.locat for the way back, reported as PauseFormNoSession; a later ordinary failure
 *     puts the page's own error content back; a legacy form is unchanged; when the member cannot be read
 *     (no SDK, error, odd answer, no answer within the timeout) the request goes as before;
 *   - a 409 from the endpoint (no subscription the pause applies to) shows the not-eligible message with a
 *     link to the account tab, reported as PauseFormNotEligible; a legacy form's 409 stays the plain error;
 *   - a second submit while the first is pending sends nothing more; a retry after a failure does.
 *
 * Usage: node test/pause-form.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'offre-annulation/pause-form.js'), 'utf8');
const SCRIPT = REAL.split("window.location.href = '/membership/abonnement-en-pause';").join("window.__navigate('/membership/abonnement-en-pause');");
assert.notStrictEqual(SCRIPT, REAL, 'navigation line not found: the test could not observe it');
const SHORT_TIMEOUT = SCRIPT.split('var REQUEST_TIMEOUT = 10000;').join('var REQUEST_TIMEOUT = 30;');
const SHORT_MEMBER_CHECK = SCRIPT.split('var MEMBER_CHECK_TIMEOUT = 3000;').join('var MEMBER_CHECK_TIMEOUT = 40;');
assert.notStrictEqual(SHORT_MEMBER_CHECK, SCRIPT, 'member check timeout constant not found');
assert.notStrictEqual(SHORT_TIMEOUT, SCRIPT, 'timeout constant not found');

const ENDPOINT = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
const LEGACY_ACTION = 'https://example.invalid/pause-endpoint';
const PAGE_URL = 'https://www.ordotype.fr/membership/offre-annulation';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

// names: the name attribute of each prefilled input (the Designer may give them any name).
function formHtml(action, attr, names) {
  return '<form id="pause-form" action="' + action + '" method="POST"' + (attr ? ' data-ordo-action="' + attr + '"' : '') + '>' +
    '<input type="hidden" id="stripeCustomerIdPause" name="' + names[0] + '" value="">' +
    '<input type="hidden" id="memberIdPause" name="' + names[1] + '" value="">' +
    '<input type="hidden" id="stripeSubscriptionIdPause" name="' + names[2] + '" value="">' +
    '<input type="email" name="email" value="dr.someone@example.fr">' +
    '<input type="hidden" name="cancelReasonCodes" value="prix,autre">' +
    '<input type="hidden" name="cancelReasonLabels" value="Le tarif | Autre">' +
    '<input type="hidden" name="cancelReasonOther" value="Retraite">' +
    '<input type="submit" value="Mettre en pause"></form>' +
    '<div id="waiting-message-pause" style="display:none"></div>' +
    '<div id="success-message-pause" style="display:none"></div>' +
    '<div id="error-message-pause" style="display:none">Une erreur est survenue. <a class="original" href="mailto:support@example.fr">support</a>.</div>';
}

const NAMES = ['stripeCustomerIdPause', 'memberId', 'stripeSubscriptionIdPause'];
const MEMBER = {
  memberId: 'mem_test',
  stripeCustomerId: 'cus_test',
  planConnections: [{ status: 'ACTIVE', planId: 'pln_compte-praticien-ov4d0oln', payment: { stripeSubscriptionId: 'sub_test' } }],
};

// attr: data-ordo-action value or null; answers: for fetch, { status, body } or { transport } or
// { hang } (only the abort ends it), optional delay; xhrStatus: what the legacy endpoint answers.
// current: the member $memberstackDom.getCurrentMember() gives (null = logged out; 'none' = no such method,
// 'throw' = it fails, 'hang' = no answer, 'odd' = an answer without `data`); a function is called at each
// submit, so a test can log the visitor in between two submits. Default: a logged in member, as in production.
function page({ attr = 'pause', action = ENDPOINT, names = NAMES, member = MEMBER, answers = [], token = 'jeton-de-test', memberstack = true, xhrStatus = 200, script = SCRIPT, current = { id: 'mem_test' } } = {}) {
  const html = '<!doctype html><html><body>' + formHtml(attr ? action : LEGACY_ACTION, attr, names) + '</body></html>';
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: PAGE_URL, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  if (memberstack) w.$memberstackDom = { getMemberCookie: () => Promise.resolve(token) };
  const memberCalls = [];
  if (memberstack && current !== 'none') {
    w.$memberstackDom.getCurrentMember = (opts) => {
      memberCalls.push(opts);
      const c = typeof current === 'function' ? current() : current;
      if (c === 'throw') return Promise.reject(new Error('ms down'));
      if (c === 'hang') return new Promise(() => {});
      if (c === 'odd') return Promise.resolve(undefined);
      return Promise.resolve({ data: c });
    };
  }
  if (member) w.OrdoMemberstack = member;
  const fetches = [];
  const queue = answers.slice();
  w.fetch = (url, opts) => {
    fetches.push({ url, method: opts.method, headers: Object.assign({}, opts.headers), body: opts.body });
    const a = queue.shift() || { status: 200, body: '{"ok":true}' };
    return new Promise((resolve, reject) => {
      if (a.hang) {
        opts.signal.addEventListener('abort', () => reject(new w.DOMException('aborted', 'AbortError')));
        return;
      }
      setTimeout(() => {
        if (a.transport) return reject(new TypeError(a.transport));
        resolve({ ok: a.status < 300, status: a.status, text: () => Promise.resolve(a.body || '') });
      }, a.delay || 0);
    });
  };
  const xhrs = [];
  w.XMLHttpRequest = function() {
    const x = {};
    x.open = (method, url) => { x.method = method; x.url = url; };
    x.send = (data) => {
      x.data = {};
      data.forEach((v, k) => { x.data[k] = v; });
      xhrs.push(x);
      setTimeout(() => { x.status = xhrStatus; x.responseText = 'ok'; x.onload(); }, 5);
    };
    return x;
  };
  const navigations = [];
  w.__navigate = (u) => navigations.push(u);
  const reports = [];
  w.OrdoErrorReporter = { report: (ctx, err) => reports.push({ ctx, name: err.name, message: err.message }) };
  w.Webflow = [];
  w.eval(script);
  w.Webflow.forEach((fn) => fn());
  const d = w.document;
  const shown = (id) => d.getElementById(id).style.display === 'block';
  const submit = () => d.getElementById('pause-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  return { w, d, fetches, xhrs, navigations, reports, shown, submit, memberCalls };
}

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

const REASON = { cancelReasonCodes: 'prix,autre', cancelReasonLabels: 'Le tarif | Autre', cancelReasonOther: 'Retraite' };
const IDENTITY = /mem_test|cus_test|sub_test|dr\.someone|pageUrl/;

(async () => {
  await check('legacy form (no attribute): XHR to its own action with the prefilled ids and pageUrl, unchanged', async () => {
    const p = page({ attr: null });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 0, 'no call to the endpoint');
    assert.strictEqual(p.xhrs.length, 1);
    const x = p.xhrs[0];
    assert.strictEqual(x.method, 'POST');
    assert.strictEqual(x.url, LEGACY_ACTION);
    assert.strictEqual(x.data.stripeCustomerIdPause, 'cus_test');
    assert.strictEqual(x.data.memberId, 'mem_test');
    assert.strictEqual(x.data.stripeSubscriptionIdPause, 'sub_test');
    assert.strictEqual(x.data.cancelReasonCodes, 'prix,autre');
    assert.strictEqual(x.data.pageUrl, PAGE_URL);
    assert.ok(p.shown('success-message-pause'));
    await wait(3100);
    assert.deepStrictEqual(p.navigations, ['/membership/abonnement-en-pause']);
  });

  await check('legacy form: a non-200 answer shows the error and is reported', async () => {
    const p = page({ attr: null, xhrStatus: 500 });
    p.submit();
    await wait(60);
    assert.ok(p.shown('error-message-pause'));
    assert.strictEqual(p.d.getElementById('pause-form').style.display, 'block');
    assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormSubmitFailed']);
    assert.strictEqual(p.navigations.length, 0);
  });

  await check('legacy form without OrdoMemberstack: left unbound, as before', async () => {
    const p = page({ attr: null, member: null });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
  });

  await check('marked form: one fetch to the endpoint, token, reason only, never its own action', async () => {
    const p = page();
    // The prefill still runs: the identity is in the form, and must not leave it.
    assert.strictEqual(p.d.getElementById('stripeCustomerIdPause').value, 'cus_test');
    assert.strictEqual(p.d.getElementById('memberIdPause').value, 'mem_test');
    assert.strictEqual(p.d.getElementById('stripeSubscriptionIdPause').value, 'sub_test');
    p.submit();
    await wait(60);
    assert.strictEqual(p.xhrs.length, 0, 'the form action is never called');
    assert.strictEqual(p.fetches.length, 1);
    const f = p.fetches[0];
    assert.strictEqual(f.url, ENDPOINT);
    assert.strictEqual(f.method, 'POST');
    assert.strictEqual(f.headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(f.headers['Content-Type'], 'application/json');
    const body = JSON.parse(f.body);
    assert.deepStrictEqual(Object.keys(body).sort(), ['action', 'fields']);
    assert.strictEqual(body.action, 'pause');
    assert.deepStrictEqual(body.fields, REASON);
    assert.ok(!IDENTITY.test(f.body), 'no identity nor page URL in the request: ' + f.body);
  });

  await check('marked form whose action points elsewhere: the endpoint is used, never the action', async () => {
    const p = page({ action: LEGACY_ACTION });
    p.submit();
    await wait(60);
    assert.strictEqual(p.xhrs.length, 0);
    assert.strictEqual(p.fetches.length, 1);
    assert.strictEqual(p.fetches[0].url, ENDPOINT);
  });

  await check('marked form: prefilled inputs are left out whatever their name', async () => {
    const p = page({ names: ['Stripe Customer ID', 'Member ID', 'Subscription'] });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    assert.deepStrictEqual(JSON.parse(p.fetches[0].body).fields, REASON);
    assert.ok(!IDENTITY.test(p.fetches[0].body), p.fetches[0].body);
  });

  await check('marked form: 200 shows the confirmation, then the pause page', async () => {
    const p = page();
    p.submit();
    assert.ok(p.shown('waiting-message-pause'));
    assert.strictEqual(p.d.getElementById('pause-form').style.display, 'none');
    await wait(60);
    assert.ok(!p.shown('waiting-message-pause'));
    assert.ok(p.shown('success-message-pause'));
    assert.ok(!p.shown('error-message-pause'));
    assert.strictEqual(p.reports.length, 0);
    assert.deepStrictEqual(p.navigations, []);
    await wait(3100);
    assert.deepStrictEqual(p.navigations, ['/membership/abonnement-en-pause']);
  });

  for (const status of [202, 400, 401, 403, 422, 429, 502, 503]) {
    await check(`marked form: HTTP ${status} shows the error, gives the form back, is reported`, async () => {
      const long = 'e'.repeat(300);
      const p = page({ answers: [{ status, body: long }] });
      p.submit();
      await wait(60);
      assert.ok(p.shown('error-message-pause'));
      assert.ok(!p.shown('success-message-pause'));
      assert.ok(!p.shown('waiting-message-pause'));
      assert.strictEqual(p.d.getElementById('pause-form').style.display, 'block');
      assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormSubmitFailed']);
      assert.strictEqual(p.reports[0].message, 'Server returned ' + status + ': ' + 'e'.repeat(200));
      await wait(3100);
      assert.strictEqual(p.navigations.length, 0);
    });
  }

  await check('marked form: no answer shows the error and is reported', async () => {
    const p = page({ answers: [{ transport: 'Failed to fetch' }] });
    p.submit();
    await wait(60);
    assert.ok(p.shown('error-message-pause'));
    assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormSubmitFailed']);
    assert.match(p.reports[0].message, /Network error/);
  });

  await check('marked form: timeout aborts the request, shows the error and is reported', async () => {
    const p = page({ answers: [{ hang: true }], script: SHORT_TIMEOUT });
    p.submit();
    await wait(100);
    assert.strictEqual(p.fetches.length, 1);
    assert.ok(p.shown('error-message-pause'));
    assert.match(p.reports[0].message, /Request timeout/);
  });

  for (const [label, opts] of [['empty token', { token: '' }], ['no Memberstack', { memberstack: false }]]) {
    await check(`marked form: no session token (${label}), nothing is sent, error shown and reported`, async () => {
      const p = page(opts);
      p.submit();
      await wait(60);
      assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
      assert.ok(p.shown('error-message-pause'));
      assert.strictEqual(p.d.getElementById('pause-form').style.display, 'block');
      assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormSubmitFailed']);
      assert.match(p.reports[0].message, /session token/);
    });
  }

  await check('marked form: a second submit while the first is pending sends nothing more', async () => {
    const p = page({ answers: [{ status: 200, body: '{"ok":true}', delay: 40 }] });
    p.submit();
    p.submit();
    await wait(10);
    p.submit();
    await wait(100);
    assert.strictEqual(p.fetches.length, 1);
    assert.strictEqual(p.xhrs.length, 0);
    assert.ok(p.shown('success-message-pause'));
  });

  await check('marked form: a retry after a failure is sent', async () => {
    const p = page({ answers: [{ status: 502 }, { status: 200, body: '{"ok":true}' }] });
    p.submit();
    await wait(60);
    assert.ok(p.shown('error-message-pause'));
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 2);
    assert.ok(p.shown('success-message-pause'));
    assert.ok(!p.shown('error-message-pause'));
  });

  await check('marked form without OrdoMemberstack: still bound, sent with the token only', async () => {
    const p = page({ member: null });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    assert.strictEqual(p.fetches[0].headers.Authorization, 'Bearer jeton-de-test');
    assert.deepStrictEqual(JSON.parse(p.fetches[0].body), { action: 'pause', fields: REASON });
  });

  const LOGIN = '/membership/login-ms';
  const assertSignIn = (p) => {
    const el = p.d.getElementById('error-message-pause');
    assert.ok(p.shown('error-message-pause'));
    assert.ok(!p.shown('waiting-message-pause'));
    assert.ok(!p.shown('success-message-pause'));
    assert.strictEqual(p.d.getElementById('pause-form').style.display, 'block', 'form given back');
    assert.ok(el.textContent.indexOf('Connectez-vous pour mettre votre abonnement en pause.') !== -1, el.textContent);
    const links = el.querySelectorAll('a');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].getAttribute('href'), LOGIN);
    assert.strictEqual(p.w.localStorage.getItem('locat'), PAGE_URL, 'way back after login');
    assert.ok(!/mailto/.test(el.innerHTML));
  };

  await check('logged out, marked form: nothing is sent, sign-in message, PauseFormNoSession', async () => {
    const p = page({ member: null, current: null });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
    assertSignIn(p);
    assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormNoSession']);
    await wait(3100);
    assert.deepStrictEqual(p.navigations, []);
  });

  await check('logged out then logged in: the second submit goes, a failure puts the page content back', async () => {
    let who = null;
    const p = page({ current: () => who, answers: [{ status: 502 }] });
    p.submit();
    await wait(60);
    assertSignIn(p);
    who = { id: 'mem_test' };
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    const el = p.d.getElementById('error-message-pause');
    assert.ok(p.shown('error-message-pause'));
    assert.ok(el.querySelector('a.original'), 'page content back');
    assert.ok(!/Connectez-vous/.test(el.textContent));
    assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormNoSession', 'PauseFormSubmitFailed']);
  });

  await check('an ordinary failure with no notice before keeps the page nodes', async () => {
    const p = page({ current: { id: 'mem_test' }, answers: [{ status: 502 }] });
    const before = p.d.querySelector('#error-message-pause a.original');
    p.submit();
    await wait(60);
    assert.strictEqual(p.d.querySelector('#error-message-pause a.original'), before);
  });

  await check('marked form: HTTP 409 shows the not-eligible message, never the confirmation', async () => {
    const p = page({ answers: [{ status: 409, body: '{"error":"abonnement_absent"}' }] });
    p.submit();
    await wait(60);
    const el = p.d.getElementById('error-message-pause');
    assert.ok(p.shown('error-message-pause'));
    assert.ok(!p.shown('waiting-message-pause'));
    assert.ok(!p.shown('success-message-pause'));
    assert.strictEqual(p.d.getElementById('pause-form').style.display, 'block');
    assert.ok(el.textContent.indexOf("La pause n'est pas disponible pour votre abonnement\u00a0: rien n'a été modifié.") !== -1, el.textContent);
    const links = el.querySelectorAll('a');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].getAttribute('href'), '/membership/compte#abonnements');
    assert.strictEqual(p.w.localStorage.getItem('locat'), null, 'no way back stored for this notice');
    assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormNotEligible']);
    await wait(3100);
    assert.deepStrictEqual(p.navigations, []);
  });

  await check('marked form: after the not-eligible message, a later failure puts the page content back', async () => {
    const p = page({ answers: [{ status: 409 }, { status: 502 }] });
    p.submit();
    await wait(60);
    p.submit();
    await wait(60);
    const el = p.d.getElementById('error-message-pause');
    assert.ok(el.querySelector('a.original'));
    assert.ok(!/pas disponible/.test(el.textContent));
    assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormNotEligible', 'PauseFormSubmitFailed']);
  });

  await check('legacy form: HTTP 409 stays the plain error', async () => {
    const p = page({ attr: null, xhrStatus: 409 });
    p.submit();
    await wait(60);
    assert.ok(p.shown('error-message-pause'));
    assert.ok(p.d.querySelector('#error-message-pause a.original'));
    assert.deepStrictEqual(p.reports.map((r) => r.name), ['PauseFormSubmitFailed']);
  });

  await check('legacy form, logged out: unchanged, posted as before', async () => {
    const p = page({ attr: null, current: null });
    p.submit();
    await wait(60);
    assert.strictEqual(p.xhrs.length, 1);
    assert.ok(!/Connectez-vous/.test(p.d.getElementById('error-message-pause').textContent));
  });

  await check('member check without an answer: the request goes after the timeout', async () => {
    const p = page({ current: 'hang', script: SHORT_MEMBER_CHECK });
    p.submit();
    await wait(20);
    assert.strictEqual(p.fetches.length, 0, 'still waiting for the check');
    await wait(100);
    assert.strictEqual(p.fetches.length, 1);
    assert.ok(p.shown('success-message-pause'));
  });

  await check('member check with an odd answer (no data field): the request goes', async () => {
    const p = page({ current: 'odd' });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    assert.strictEqual(p.reports.length, 0);
  });

  await check('member check asks Memberstack for its cached member', async () => {
    const p = page();
    p.submit();
    await wait(60);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(p.memberCalls)), [{ useCache: true }]);
  });

  await check('no getCurrentMember in the SDK: the request goes as before', async () => {
    const p = page({ current: 'none' });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
  });

  await check('member unreadable (getCurrentMember fails): the request goes as before', async () => {
    const p = page({ current: 'throw' });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    assert.ok(p.shown('success-message-pause'));
  });

  await check('logged in (getCurrentMember gives a member): the request goes', async () => {
    const p = page({ current: { id: 'mem_test' } });
    p.submit();
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    assert.strictEqual(p.reports.length, 0);
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
