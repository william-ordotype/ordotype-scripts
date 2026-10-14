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
 *   - a form WITH data-ordo-action is sent even when the member has no Stripe customer id: the server
 *     decides; a legacy form still needs it;
 *   - without a member nothing is sent, and a 409 from the endpoint shows no confirmation: each puts the
 *     form's own message, with a link to the account, in the error element and is reported under its own
 *     name; a later failure puts the page's own error content back, an ordinary failure leaves it alone;
 *   - a 401 or a missing session token stays the ordinary error (a stale session cannot sign in again);
 *   - the 409 wording follows the error code: `abonnement_absent` → no active subscription found
 *     (CancelFormSubscriptionAbsent), any other or unreadable body → the offer is not active
 *     (CancelFormPlanAbsent); a form without wording for a notice uses its planAbsent text;
 *   - a second submit while the first is in flight sends nothing;
 *   - two forms on the same page each take their own path.
 *
 * Usage: node test/redeem-cancel-forms.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'shared/redeem-cancel-forms.js'), 'utf8');
const NAVIGATING = REAL.split("window.location.href = '/';").join("window.__navigate('/');");
assert.notStrictEqual(NAVIGATING, REAL, 'navigation line not found: the test could not observe it');
// The 3 s redirect delay shortened to 30 ms: same checks, without sleeping.
const SCRIPT = NAVIGATING.split('const REDIRECT_DELAY = 3000;').join('const REDIRECT_DELAY = 30;');
assert.notStrictEqual(SCRIPT, NAVIGATING, 'redirect delay not found');
const AFTER_REDIRECT = 120;

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
    '<div id="' + ids.e + '" style="display:none"><div class="original">Oops! <a href="mailto:support@example.fr">support</a></div></div>';
}

// cancelAttr / redeemAttr: data-ordo-action value or null; answers: for fetch, { status } or
// { transport }; xhrStatus: what the legacy endpoint answers.
const MEMBER = { id: 'mem_test', stripeCustomerId: 'cus_test' };
const ORIGINAL_ERROR = '<div class="original">Oops! <a href="mailto:support@example.fr">support</a></div>';
const ACCOUNT = '/membership/compte#abonnements';

async function page({ cancelAttr = 'cancel-mg', redeem = false, redeemAttr = null, answers = [], token = 'jeton-de-test', xhrStatus = 200, member = MEMBER } = {}) {
  const html = '<!doctype html><html><body>' + formHtml('cancel', CANCEL_ACTION, cancelAttr) +
    (redeem ? formHtml('redeem', REDEEM_ACTION, redeemAttr) : '') + '</body></html>';
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/membership/offre-annulation', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.$memberstackDom = {
    getCurrentMember: () => Promise.resolve({ data: member }),
    getMemberCookie: () => Promise.resolve(token),
  };
  const fetches = [];
  const queue = answers.slice();
  w.fetch = (url, opts) => {
    fetches.push({ url, method: opts.method, headers: Object.assign({}, opts.headers), body: opts.body });
    const a = queue.shift() || { status: 200 };
    return wait(a.delay || 0).then(() => {
      if (a.transport) throw new TypeError(a.transport);
      const body = a.body !== undefined ? a.body : (a.status === 200 ? '{"ok":true}' : '{"error":"x"}');
      return { ok: a.status < 300, status: a.status, text: () => Promise.resolve(body) };
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
  const errorHtml = (id) => d.getElementById(id).innerHTML;
  return { w, d, fetches, xhrs, navigations, reports, shown, submit, errorHtml };
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
    await wait(AFTER_REDIRECT);
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
    await wait(AFTER_REDIRECT);
    assert.deepStrictEqual(p.navigations, ['/']);
  });

  for (const status of [202, 400, 401, 403, 422, 502, 503]) {
    await check(`with data-ordo-action: HTTP ${status} shows the error, gives the form back, is reported`, async () => {
      const p = await page({ answers: [{ status }] });
      p.submit('cancel-form');
      await wait(60);
      assert.ok(p.shown('error-message-cancel'));
      assert.ok(!p.shown('success-message-cancel'));
      assert.strictEqual(p.d.getElementById('cancel-form').style.display, 'block');
      assert.strictEqual(p.reports.length, 1);
      assert.match(p.reports[0].err.message, new RegExp(String(status)));
      await wait(AFTER_REDIRECT);
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

  // A notice: nothing sent or nothing done, the form is back, the message and the account link replace
  // the page's own error content, no confirmation and no navigation.
  async function assertNotice(p, errorId, formId, text, name) {
    assert.ok(p.shown(errorId), 'error element shown');
    assert.ok(!p.shown(errorId.replace('error', 'success')), 'no confirmation');
    assert.strictEqual(p.d.getElementById(formId).style.display, 'block', 'form given back');
    const el = p.d.getElementById(errorId);
    assert.ok(el.textContent.indexOf(text) !== -1, 'message: ' + el.textContent);
    const links = el.querySelectorAll('a');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].getAttribute('href'), ACCOUNT);
    assert.ok(!/mailto/.test(el.innerHTML), 'the page content is replaced');
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].err.name, name);
    await wait(AFTER_REDIRECT);
    assert.strictEqual(p.navigations.length, 0);
  }

  await check('with data-ordo-action: no session token, nothing is sent, ordinary error (page content kept)', async () => {
    const p = await page({ token: '' });
    const before = p.d.querySelector('#error-message-cancel .original');
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
    assert.ok(p.shown('error-message-cancel'));
    assert.strictEqual(p.d.querySelector('#error-message-cancel .original'), before, 'same nodes, not clones');
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].err.name, 'CancelFormSubmitFailed');
    assert.match(p.reports[0].err.message, /session token/);
  });

  await check('no member (logged out), marked form: nothing is sent, the sign-in notice shows', async () => {
    const p = await page({ cancelAttr: 'cancel-free-asso', member: null });
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
    await assertNotice(p, 'error-message-cancel', 'cancel-form', 'Connectez-vous pour résilier votre offre.', 'CancelFormNoSession');
  });

  await check('no member (logged out), legacy form: nothing is sent, the sign-in notice shows', async () => {
    const p = await page({ cancelAttr: null, member: null });
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
    await assertNotice(p, 'error-message-cancel', 'cancel-form', 'Connectez-vous pour résilier votre offre.', 'CancelFormNoSession');
  });

  await check('no member, redeem form: its own sign-in wording', async () => {
    const p = await page({ cancelAttr: null, redeem: true, redeemAttr: 'redeem-mg', member: null });
    p.submit('redeem-form');
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
    await assertNotice(p, 'error-message-redeem', 'redeem-form', 'Connectez-vous pour profiter de cette offre.', 'CancelFormNoSession');
  });

  await check('with data-ordo-action: HTTP 409 shows the offer-not-active notice, never the confirmation', async () => {
    const p = await page({ cancelAttr: 'cancel-free-asso', answers: [{ status: 409 }] });
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    await assertNotice(p, 'error-message-cancel', 'cancel-form', "Cette offre n'est pas active sur votre compte\u00a0: rien n'a été résilié.", 'CancelFormPlanAbsent');
  });

  await check('with data-ordo-action: HTTP 409 abonnement_absent says no active subscription was found', async () => {
    const p = await page({ cancelAttr: 'cancel-module-rhumato', answers: [{ status: 409, body: '{"error":"abonnement_absent"}' }] });
    p.submit('cancel-form');
    await wait(60);
    await assertNotice(p, 'error-message-cancel', 'cancel-form', "Aucun abonnement actif à cette offre n'a été trouvé sur votre compte.", 'CancelFormSubscriptionAbsent');
  });

  await check('redeem form: HTTP 409 abonnement_absent falls back to its own wording', async () => {
    for (const code of ['abonnement_absent']) {
      const p = await page({ cancelAttr: null, redeem: true, redeemAttr: 'redeem-storage', answers: [{ status: 409, body: JSON.stringify({ error: code }) }] });
      p.submit('redeem-form');
      await wait(60);
      const t = p.d.getElementById('error-message-redeem').textContent;
      assert.ok(t.indexOf("Cette offre n'est pas disponible pour votre compte.") !== -1, t);
      assert.ok(!/undefined/.test(t), t);
    }
  });

  await check('with data-ordo-action: HTTP 409 with an unreadable or other body is the offer-not-active notice', async () => {
    for (const body of ['not json', '{"error":"plan_absent"}', '{"error":"abonnement_impaye"}', '{"error":"autre"}', '']) {
      const p = await page({ answers: [{ status: 409, body }] });
      p.submit('cancel-form');
      await wait(60);
      assert.strictEqual(p.reports[0].err.name, 'CancelFormPlanAbsent', body);
      assert.strictEqual(p.d.querySelector('#error-message-cancel a').getAttribute('href'), ACCOUNT, body);
    }
  });

  await check('legacy form: HTTP 409 stays a plain error (only the endpoint speaks that code)', async () => {
    const p = await page({ cancelAttr: null, xhrStatus: 409 });
    p.submit('cancel-form');
    await wait(60);
    assert.ok(p.shown('error-message-cancel'));
    assert.strictEqual(p.errorHtml('error-message-cancel'), ORIGINAL_ERROR);
    assert.strictEqual(p.reports[0].err.name, 'CancelFormSubmitFailed');
  });

  await check('after a notice, a later failure puts the page error content back', async () => {
    const p = await page({ answers: [{ status: 409 }, { status: 502 }] });
    p.submit('cancel-form');
    await wait(60);
    assert.ok(/Voir mes abonnements/.test(p.errorHtml('error-message-cancel')));
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.errorHtml('error-message-cancel'), ORIGINAL_ERROR);
    assert.strictEqual(p.reports.length, 2);
    assert.strictEqual(p.reports[1].err.name, 'CancelFormSubmitFailed');
  });

  await check('with data-ordo-action: a member without a Stripe customer id is still sent (the server decides)', async () => {
    const p = await page({ cancelAttr: 'cancel-free-asso', member: { id: 'mem_test' } });
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length, 1);
    assert.strictEqual(JSON.parse(p.fetches[0].body).action, 'cancel-free-asso');
    assert.ok(p.shown('success-message-cancel'));
    assert.strictEqual(p.reports.length, 0);
  });

  await check('legacy form: a member without a Stripe customer id is not sent, plain error', async () => {
    const p = await page({ cancelAttr: null, member: { id: 'mem_test' } });
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length + p.xhrs.length, 0);
    assert.ok(p.shown('error-message-cancel'));
    assert.strictEqual(p.errorHtml('error-message-cancel'), ORIGINAL_ERROR);
    assert.strictEqual(p.reports[0].err.name, 'CancelFormSubmitFailed');
    assert.match(p.reports[0].err.message, /Stripe Customer ID not found/);
  });

  await check('redeem form with data-ordo-action: HTTP 409 uses the offer wording, never "résilié"', async () => {
    const p = await page({ cancelAttr: null, redeem: true, redeemAttr: 'redeem-mg', answers: [{ status: 409 }] });
    p.submit('redeem-form');
    await wait(60);
    await assertNotice(p, 'error-message-redeem', 'redeem-form', "Cette offre n'est pas disponible pour votre compte.", 'CancelFormPlanAbsent');
    assert.ok(!/résilié/.test(p.d.getElementById('error-message-redeem').textContent));
  });

  await check('a second submit while the first is in flight sends nothing', async () => {
    const p = await page({ answers: [{ status: 200, delay: 80 }] });
    p.submit('cancel-form');
    p.submit('cancel-form');
    await wait(20);
    p.submit('cancel-form');
    await wait(150);
    assert.strictEqual(p.fetches.length, 1);
    assert.ok(p.shown('success-message-cancel'));
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length, 1, 'still locked after success, until the redirect');
  });

  await check('after a refusal or an error the form can be sent again', async () => {
    const p = await page({ answers: [{ status: 409 }, { status: 502 }, { status: 200 }] });
    p.submit('cancel-form');
    await wait(60);
    p.submit('cancel-form');
    await wait(60);
    p.submit('cancel-form');
    await wait(60);
    assert.strictEqual(p.fetches.length, 3);
    assert.ok(p.shown('success-message-cancel'));
  });

  await check('an ordinary error with no notice before keeps the page nodes (listeners stay)', async () => {
    const p = await page({ answers: [{ status: 502 }] });
    const before = p.d.querySelector('#error-message-cancel .original');
    p.submit('cancel-form');
    await wait(60);
    assert.ok(p.shown('error-message-cancel'));
    assert.strictEqual(p.d.querySelector('#error-message-cancel .original'), before);
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
