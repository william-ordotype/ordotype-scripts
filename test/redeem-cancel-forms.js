#!/usr/bin/env node
/**
 * Redeem & cancel forms: a form that carries data-ordo-action goes to the member-forms endpoint with
 * the session token and its own fields only; every other form keeps the original behaviour.
 *
 * What must hold:
 *   - a form WITHOUT data-ordo-action is posted exactly as before: XHR POST to its own action, the
 *     form data with the injected Stripe customer id and pageUrl, success only on 200;
 *   - a form WITH data-ordo-action never calls its own action: one fetch to the endpoint, with
 *     `Authorization: Bearer <token>` and `{ action, fields }`, where fields hold the form's own
 *     fields (the reason) and none of the identity fields (email, member id, customer id);
 *   - success only on 200 (confirmation, then home); any other status or no answer shows the error,
 *     gives the form back and is reported;
 *   - without a session token nothing is sent, the error shows and is reported;
 *   - two forms on the same page each take their own path.
 *
 * Usage: node test/redeem-cancel-forms.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'shared/redeem-cancel-forms.js'), 'utf8');
const SCRIPT = REAL.split("window.location.href = '/';").join("window.__navigate('/');");
assert.notStrictEqual(SCRIPT, REAL, 'navigation line not found: the test could not observe it');

const ENDPOINT = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
const CANCEL_ACTION = 'https://example.invalid/cancel-endpoint';
const REDEEM_ACTION = 'https://example.invalid/redeem-endpoint';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

function formHtml(kind, action, attr) {
  const ids = kind === 'cancel'
    ? { form: 'cancel-form', cus: 'stripeCustomerIdCancel', w: 'waiting-message-cancel', s: 'success-message-cancel', e: 'error-message-cancel' }
    : { form: 'redeem-form', cus: 'stripeCustomerId', w: 'waiting-message-redeem', s: 'success-message-redeem', e: 'error-message-redeem' };
  return '<form id="' + ids.form + '" action="' + action + '" method="POST"' + (attr ? ' data-ordo-action="' + attr + '"' : '') + '>' +
    '<input type="email" name="email" value="dr.someone@example.fr">' +
    '<input type="text" name="MSuserId" value="mem_test">' +
    '<input type="text" id="' + ids.cus + '" name="stripeCustomerId" value="">' +
    (kind === 'cancel'
      ? '<input type="hidden" name="cancelReasonCodes" value="prix,autre">' +
        '<input type="hidden" name="cancelReasonLabels" value="Le tarif | Autre">' +
        '<input type="hidden" name="cancelReasonOther" value="Retraite">'
      : '') +
    '<input type="submit" value="Envoyer"></form>' +
    '<div id="' + ids.w + '" style="display:none"></div>' +
    '<div id="' + ids.s + '" style="display:none"></div>' +
    '<div id="' + ids.e + '" style="display:none"></div>';
}

// cancelAttr / redeemAttr: data-ordo-action value or null; answers: for fetch, { status } or
// { transport }; xhrStatus: what the legacy endpoint answers.
async function page({ cancelAttr = 'cancel-mg', redeem = false, redeemAttr = null, answers = [], token = 'jeton-de-test', xhrStatus = 200 } = {}) {
  const html = '<!doctype html><html><body>' + formHtml('cancel', CANCEL_ACTION, cancelAttr) +
    (redeem ? formHtml('redeem', REDEEM_ACTION, redeemAttr) : '') + '</body></html>';
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/membership/offre-annulation', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.$memberstackDom = {
    getCurrentMember: () => Promise.resolve({ data: { id: 'mem_test', stripeCustomerId: 'cus_test' } }),
    getMemberCookie: () => Promise.resolve(token),
  };
  const fetches = [];
  const queue = answers.slice();
  w.fetch = (url, opts) => {
    fetches.push({ url, method: opts.method, headers: Object.assign({}, opts.headers), body: opts.body });
    const a = queue.shift() || { status: 200 };
    return wait(a.delay || 0).then(() => {
      if (a.transport) throw new TypeError(a.transport);
      return { ok: a.status < 300, status: a.status, text: () => Promise.resolve(a.status === 200 ? '{"ok":true}' : '{"error":"x"}') };
    });
  };
  const xhrs = [];
  w.XMLHttpRequest = function() {
    const x = { headers: {} };
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
  w.OrdoErrorReporter = { report: (ctx, err) => reports.push({ ctx, err }) };
  w.Webflow = [];
  w.eval(SCRIPT);
  w.Webflow.forEach((fn) => fn());
  const d = w.document;
  const shown = (id) => d.getElementById(id).style.display === 'block';
  const submit = (id) => d.getElementById(id).dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  return { w, d, fetches, xhrs, navigations, reports, shown, submit };
}

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

(async () => {
  await check('legacy form (no attribute): XHR to its own action with the form data, unchanged', async () => {
    const p = await page({ cancelAttr: null });
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length, 0, 'no call to the endpoint');
    assert.strictEqual(p.xhrs.length, 1);
    const x = p.xhrs[0];
    assert.strictEqual(x.method, 'POST');
    assert.strictEqual(x.url, CANCEL_ACTION);
    assert.strictEqual(x.data.stripeCustomerId, 'cus_test', 'customer id injected as before');
    assert.strictEqual(x.data.MSuserId, 'mem_test');
    assert.strictEqual(x.data.pageUrl, 'https://www.ordotype.fr/membership/offre-annulation');
    assert.ok(p.shown('success-message-cancel'));
    await wait(3100);
    assert.deepStrictEqual(p.navigations, ['/']);
  });

  await check('legacy form: a non-200 answer shows the error and is reported', async () => {
    const p = await page({ cancelAttr: null, xhrStatus: 500 });
    p.submit('cancel-form');
    await wait(60);
    assert.ok(p.shown('error-message-cancel'));
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.navigations.length, 0);
  });

  await check('form with data-ordo-action: one fetch to the endpoint, token, reason only, never its own action', async () => {
    const p = await page();
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.xhrs.length, 0, 'the form action is never called');
    assert.strictEqual(p.fetches.length, 1);
    const f = p.fetches[0];
    assert.strictEqual(f.url, ENDPOINT);
    assert.strictEqual(f.method, 'POST');
    assert.strictEqual(f.headers.Authorization, 'Bearer jeton-de-test');
    const body = JSON.parse(f.body);
    assert.strictEqual(body.action, 'cancel-mg');
    assert.deepStrictEqual(Object.keys(body).sort(), ['action', 'fields']);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(body.fields)), {
      cancelReasonCodes: 'prix,autre', cancelReasonLabels: 'Le tarif | Autre', cancelReasonOther: 'Retraite'
    });
    assert.ok(!/mem_test|dr\.someone|cus_test/.test(f.body), 'no identity in the request: ' + f.body);
  });

  await check('with data-ordo-action: 200 shows the confirmation, then home', async () => {
    const p = await page();
    p.submit('cancel-form');
    await wait(60);
    assert.ok(p.shown('success-message-cancel'));
    assert.ok(!p.shown('error-message-cancel'));
    assert.strictEqual(p.reports.length, 0);
    await wait(3100);
    assert.deepStrictEqual(p.navigations, ['/']);
  });

  for (const status of [202, 400, 401, 422, 502, 503]) {
    await check(`with data-ordo-action: HTTP ${status} shows the error, gives the form back, is reported`, async () => {
      const p = await page({ answers: [{ status }] });
      p.submit('cancel-form');
      await wait(60);
      assert.ok(p.shown('error-message-cancel'));
      assert.ok(!p.shown('success-message-cancel'));
      assert.strictEqual(p.d.getElementById('cancel-form').style.display, 'block');
      assert.strictEqual(p.reports.length, 1);
      assert.match(p.reports[0].err.message, new RegExp(String(status)));
      await wait(3100);
      assert.strictEqual(p.navigations.length, 0);
    });
  }

  await check('with data-ordo-action: no answer shows the error and is reported', async () => {
    const p = await page({ answers: [{ transport: 'Failed to fetch' }] });
    p.submit('cancel-form');
    await wait(60);
    assert.ok(p.shown('error-message-cancel'));
    assert.strictEqual(p.reports.length, 1);
    assert.match(p.reports[0].err.message, /Network error/);
  });

  await check('with data-ordo-action: no session token, nothing is sent, error shown and reported', async () => {
    const p = await page({ token: '' });
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
    assert.ok(p.shown('error-message-cancel'));
    assert.strictEqual(p.reports.length, 1);
    assert.match(p.reports[0].err.message, /session token/);
  });

  await check('two forms on one page: the marked one goes to the endpoint, the other keeps its action', async () => {
    const p = await page({ redeem: true, redeemAttr: null });
    p.submit('redeem-form');
    await wait(60);
    assert.strictEqual(p.xhrs.length, 1);
    assert.strictEqual(p.xhrs[0].url, REDEEM_ACTION);
    assert.strictEqual(p.fetches.length, 0);
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    assert.strictEqual(p.fetches[0].url, ENDPOINT);
    assert.strictEqual(p.xhrs.length, 1, 'no second XHR');
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
