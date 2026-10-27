#!/usr/bin/env node
/**
 * The billing portal must stay reachable without the page's own "invoices" button.
 *
 * Other account scripts open the portal through window.OrdoBillingPortal.open(). It used to click
 * the page's own button, hidden once the subscriptions list is shown: removing that button from the
 * page would have removed the portal from Mon compte without any error. What must hold:
 *   - without the page's button, open() is still exposed and opens the portal;
 *   - with it, the button keeps working, with the same prefetched session;
 *   - a member without a Stripe customer gets no open() and no request;
 *   - a second open() while the portal is opening creates no second session;
 *   - a failure (no answer, or an answer without a portal address) opens nothing, is reported once,
 *     leaves the button saying « Réessayer » with a title, and a later click can try again;
 *   - at the click, a 502, 503, 504 or no answer gets ONE new try after a short wait (the function
 *     answers 502 when Memberstack is slow to check the session); a refusal (401, 422, 500) none;
 *   - open(btn) shows the wait on the button it is given and resolves true (opening) or false;
 *   - open(btn, { retryLabel: false }): a failure gives the button its own label back, title kept;
 *   - back from the portal, a page restored from the browser cache can open it again;
 *   - with a Memberstack token the request carries `Authorization: Bearer`, without one it goes out
 *     as before (no header, same body), both with `v: 2`; the prefetch waits for the token;
 *   - a 401 opens nothing, is reported, and the title asks to log in again.
 *
 * Usage: node test/billing-portal.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'account/billing-portal.js'), 'utf8');
const NAVIGATING = REAL.split('window.location.href = portalUrl;').join('window.__navigate(portalUrl);');
assert.notStrictEqual(NAVIGATING, REAL, 'navigation line not found: the test could not observe it');
const SCRIPT = NAVIGATING.split('RETRY_DELAY_MS = 1000;').join('RETRY_DELAY_MS = 30;');
assert.notStrictEqual(SCRIPT, NAVIGATING, 'retry delay not found: the test would wait a full second per try');
const TITLE_FAILED = 'Le portail de paiement n’a pas pu s’ouvrir. Réessayez dans un instant.';
const TITLE_SESSION = 'Votre session a expiré : reconnectez-vous puis réessayez.';

const PORTAL = 'https://billing.stripe.com/p/session/live_abc';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

// Each answer: { status, body } or { transport } (network failure), optional delay.
// token: what getMemberCookie() gives; cookie: 'throws' makes it throw; memberstackAfter: ms before
// window.$memberstackDom appears (null = present from the start).
function page({ button = true, customer = 'cus_test', answers = [], token = 'jeton-de-test', cookie = null, memberstackAfter = null } = {}) {
  const html = '<!doctype html><html><body>' +
    (button ? '<a id="viewInvoicesBtn" href="#" data-ms-action="customer-portal">Voir mes factures</a>' : '') +
    '</body></html>';
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/membership/compte', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: customer, auth: { email: 'dr@example.fr' } } };
  const events = [];
  const memberstack = {
    getMemberCookie: () => {
      events.push('token');
      if (cookie === 'throws') throw new Error('cookie unavailable');
      return Promise.resolve(token);
    },
  };
  if (memberstackAfter === null) w.$memberstackDom = memberstack;
  else setTimeout(() => { w.$memberstackDom = memberstack; }, memberstackAfter);
  const portalCalls = [];
  const portalRequests = [];
  const hooks = [];
  const queue = answers.slice();
  w.fetch = (url, opts) => {
    if (/notify-webhook/.test(url)) { hooks.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, status: 200 }); }
    events.push('portal');
    portalCalls.push(url);
    portalRequests.push({ headers: Object.assign({}, opts.headers), body: JSON.parse(opts.body) });
    const a = queue.shift() || { status: 200, body: { url: PORTAL, id: 'bps_1' } };
    return wait(a.delay || 0).then(() => {
      if (a.transport) throw new TypeError(a.transport);
      return { ok: a.status < 400, status: a.status, json: () => (a.body === undefined ? Promise.reject(new SyntaxError('not json')) : Promise.resolve(a.body)) };
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
  return { w, events, portalCalls, portalRequests, hooks, navigations, reports, btn: () => w.document.getElementById('viewInvoicesBtn') };
}

const BODY_BEFORE = { stripeCustomerId: 'cus_test', returnUrl: 'https://www.ordotype.fr/membership/compte' };

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

(async () => {
  await check('without the page button: open() is exposed and opens the prefetched portal', async () => {
    const p = page({ button: false });
    await wait(20);
    assert.strictEqual(typeof (p.w.OrdoBillingPortal && p.w.OrdoBillingPortal.open), 'function');
    p.w.OrdoBillingPortal.open();
    await wait(20);
    assert.deepStrictEqual(p.navigations, [PORTAL]);
    assert.strictEqual(p.portalCalls.length, 1, 'the prefetch is reused, no second session');
    assert.strictEqual(p.hooks.length, 1);
    assert.strictEqual(p.hooks[0].option, 'billing_portal');
    assert.strictEqual(p.reports.length, 0);
  });

  await check('with the page button: a click still opens the portal, and open() does not click it', async () => {
    const p = page();
    await wait(20);
    const btn = p.btn();
    assert.strictEqual(btn.hasAttribute('data-ms-action'), false, 'Memberstack no longer owns the button');
    let clicks = 0;
    btn.addEventListener('click', () => { clicks += 1; });
    p.w.OrdoBillingPortal.open();
    await wait(20);
    assert.strictEqual(clicks, 0, 'open() goes to the portal directly, not through a click on the hidden button');
    assert.deepStrictEqual(p.navigations, [PORTAL]);
    const q = page();
    await wait(20);
    q.btn().dispatchEvent(new q.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(20);
    assert.deepStrictEqual(q.navigations, [PORTAL]);
  });

  await check('no Stripe customer: no open(), no request, the button is shown as unavailable', async () => {
    const p = page({ customer: '' });
    await wait(20);
    assert.strictEqual(p.w.OrdoBillingPortal, undefined);
    assert.strictEqual(p.portalCalls.length, 0);
    assert.strictEqual(p.btn().style.opacity, '0.5');
    const q = page({ customer: '', button: false });
    await wait(20);
    assert.strictEqual(q.w.OrdoBillingPortal, undefined);
  });

  await check('a second open() while the portal is opening creates no second session', async () => {
    const p = page({ button: false, answers: [{ transport: 'Failed to fetch' }, { status: 200, body: { url: PORTAL, id: 'bps_2' }, delay: 40 }] });
    await wait(20);
    p.w.OrdoBillingPortal.open();
    p.w.OrdoBillingPortal.open();
    await wait(100);
    assert.strictEqual(p.portalCalls.length, 2, 'the prefetch, then ONE fallback request');
    assert.deepStrictEqual(p.navigations, [PORTAL]);
    assert.strictEqual(p.hooks.length, 1);
  });

  await check('no portal address in the answer: nothing opens, reported with its status, retry possible', async () => {
    const p = page({ answers: [{ status: 500, body: { error: 'boom' } }, { status: 500, body: { error: 'boom' } }] });
    await wait(20);
    const btn = p.btn();
    btn.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(100);
    assert.deepStrictEqual(p.navigations, [], 'never navigate to an undefined address');
    assert.strictEqual(p.portalCalls.length, 2, 'a 500 is a refusal: no new try');
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].kind, 'report');
    assert.strictEqual(p.reports[0].err.status, 500);
    assert.strictEqual(btn.textContent, 'Réessayer', 'the failure shows on the button');
    assert.strictEqual(btn.getAttribute('title'), TITLE_FAILED);
    assert.strictEqual(btn.hasAttribute('aria-busy'), false);
    p.w.OrdoBillingPortal.open();
    await wait(20);
    assert.strictEqual(p.portalCalls.length, 3, 'a later attempt goes through');
    assert.deepStrictEqual(p.navigations, [PORTAL]);
  });

  await check('no answer at all: one new try, then nothing opens, reported once as a network failure', async () => {
    const dead = { transport: 'Failed to fetch' };
    const p = page({ button: false, answers: [dead, dead, dead] });
    await wait(20);
    const opened = p.w.OrdoBillingPortal.open();
    await wait(100);
    assert.strictEqual(p.portalCalls.length, 3, 'the prefetch, the click, its new try');
    assert.deepStrictEqual(p.navigations, []);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].kind, 'network');
    assert.strictEqual(await opened, false);
  });

  await check('an answer that is not JSON keeps its status in the report', async () => {
    const p = page({ button: false, answers: [{ transport: 'Failed to fetch' }, { status: 502 }, { status: 502 }] });
    await wait(20);
    p.w.OrdoBillingPortal.open();
    await wait(100);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].kind, 'report');
    assert.strictEqual(p.reports[0].err.status, 502);
  });

  await check('a 502, 503 or 504 at the click: one new try after a short wait, and the portal opens', async () => {
    for (const status of [502, 503, 504]) {
      const busy = { status, body: { error: 'upstream_error' } };
      const p = page({ answers: [busy, busy] });
      await wait(20);
      const btn = p.btn();
      btn.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(10);
      assert.strictEqual(p.portalCalls.length, 2, status + ': the new try waits');
      assert.strictEqual(btn.textContent, 'Patientez…', status + ': still waiting, no failure shown');
      await wait(80);
      assert.strictEqual(p.portalCalls.length, 3, status);
      assert.deepStrictEqual(p.navigations, [PORTAL], status);
      assert.strictEqual(p.reports.length, 0, status + ': nothing to report, the member got the portal');
    }
  });

  await check('two 502 in a row at the click: the button says Réessayer, one report, the next click starts over', async () => {
    const busy = { status: 502, body: { error: 'upstream_error' } };
    const p = page({ answers: [busy, busy, busy] });
    await wait(20);
    const btn = p.btn();
    const click = () => btn.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    await wait(100);
    assert.strictEqual(p.portalCalls.length, 3, 'no more than one new try');
    assert.deepStrictEqual(p.navigations, []);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].err.status, 502);
    assert.strictEqual(btn.textContent, 'Réessayer');
    assert.strictEqual(btn.getAttribute('title'), TITLE_FAILED);
    click();
    assert.strictEqual(btn.textContent, 'Patientez…');
    assert.strictEqual(btn.hasAttribute('title'), false, 'the failure title goes with the new attempt');
    await wait(20);
    assert.deepStrictEqual(p.navigations, [PORTAL]);
  });

  await check('a refusal at the click (401, 422) gets no new try', async () => {
    for (const status of [401, 422]) {
      const refused = { status, body: { error: 'refused' } };
      const p = page({ button: false, answers: [refused, refused] });
      await wait(20);
      p.w.OrdoBillingPortal.open();
      await wait(100);
      assert.strictEqual(p.portalCalls.length, 2, status);
      assert.strictEqual(p.reports.length, 1, status);
    }
  });

  await check('open(btn): the wait and the failure show on the given button, the promise says what happened', async () => {
    const busy = { status: 502, body: { error: 'upstream_error' } };
    const p = page({ button: false, answers: [busy, busy, busy] });
    await wait(20);
    const doc = p.w.document;
    const btn = doc.createElement('button');
    btn.textContent = 'Modifier';
    doc.body.appendChild(btn);
    const failed = p.w.OrdoBillingPortal.open(btn);
    assert.strictEqual(btn.textContent, 'Patientez…');
    assert.strictEqual(btn.disabled, true);
    assert.strictEqual(btn.getAttribute('aria-busy'), 'true');
    assert.strictEqual(p.w.OrdoBillingPortal.open(btn), failed, 'a second click gets the same opening');
    assert.strictEqual(await failed, false);
    assert.strictEqual(btn.textContent, 'Réessayer');
    assert.strictEqual(btn.disabled, false);
    const opened = p.w.OrdoBillingPortal.open(btn);
    assert.strictEqual(await opened, true);
    assert.deepStrictEqual(p.navigations, [PORTAL]);
    // A button with an icon keeps its own content
    const q = page({ button: false, answers: [busy, busy, busy] });
    await wait(20);
    const icon = q.w.document.createElement('button');
    icon.innerHTML = '<svg></svg><span>Factures</span>';
    q.w.document.body.appendChild(icon);
    const r = q.w.OrdoBillingPortal.open(icon);
    assert.strictEqual(icon.innerHTML, '<svg></svg><span>Factures</span>');
    assert.strictEqual(icon.getAttribute('aria-busy'), 'true');
    assert.strictEqual(await r, false);
    assert.strictEqual(icon.innerHTML, '<svg></svg><span>Factures</span>');
    assert.strictEqual(icon.getAttribute('title'), TITLE_FAILED);
  });

  await check('open(btn, { retryLabel: false }): a failure gives the button its own label back, title kept', async () => {
    const LABEL = 'Toutes mes factures et mes informations de facturation';
    const busy = { status: 502, body: { error: 'upstream_error' } };
    const p = page({ button: false, answers: [busy, busy, busy, busy, busy] });
    await wait(20);
    const btn = p.w.document.createElement('button');
    btn.textContent = LABEL;
    p.w.document.body.appendChild(btn);
    const failed = p.w.OrdoBillingPortal.open(btn, { retryLabel: false });
    assert.strictEqual(btn.textContent, 'Patientez…', 'the wait still shows');
    assert.strictEqual(btn.disabled, true);
    assert.strictEqual(await failed, false);
    assert.strictEqual(btn.textContent, LABEL, 'no « Réessayer »: the link keeps saying what it opens');
    assert.strictEqual(btn.getAttribute('title'), TITLE_FAILED);
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(btn.hasAttribute('aria-busy'), false);
    // The next attempt starts over, and fails the same way
    const again = p.w.OrdoBillingPortal.open(btn, { retryLabel: false });
    assert.strictEqual(btn.textContent, 'Patientez…');
    assert.strictEqual(btn.hasAttribute('title'), false);
    assert.strictEqual(await again, false);
    assert.strictEqual(btn.textContent, LABEL);
    assert.strictEqual(p.portalCalls.length, 5, 'the prefetch, then two tries per click');
    // A 401 keeps the label too, with the session title
    const refused = { status: 401, body: { error: 'unauthorized' } };
    const q = page({ button: false, answers: [refused, refused] });
    await wait(20);
    const link = q.w.document.createElement('button');
    link.textContent = LABEL;
    assert.strictEqual(await q.w.OrdoBillingPortal.open(link, { retryLabel: false }), false);
    assert.strictEqual(link.textContent, LABEL);
    assert.strictEqual(link.getAttribute('title'), TITLE_SESSION);
    // Any other option, or none: « Réessayer » as before
    for (const options of [undefined, null, {}, { retryLabel: true }]) {
      const r = page({ button: false, answers: [busy, busy, busy] });
      await wait(20);
      const b = r.w.document.createElement('button');
      b.textContent = 'Modifier';
      assert.strictEqual(await r.w.OrdoBillingPortal.open(b, options), false, JSON.stringify(options));
      assert.strictEqual(b.textContent, 'Réessayer', JSON.stringify(options));
      assert.strictEqual(b.getAttribute('title'), TITLE_FAILED, JSON.stringify(options));
    }
  });

  await check('back from the portal (page restored from cache): the portal opens again', async () => {
    const p = page();
    await wait(20);
    const btn = p.btn();
    const click = () => btn.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    const pageshow = (persisted) => {
      const ev = new p.w.Event('pageshow');
      Object.defineProperty(ev, 'persisted', { value: persisted });
      p.w.dispatchEvent(ev);
    };
    click();
    await wait(20);
    assert.strictEqual(btn.textContent, 'Patientez…');
    pageshow(true);
    assert.strictEqual(btn.textContent, 'Voir mes factures', 'the label comes back');
    click();
    await wait(20);
    assert.strictEqual(p.navigations.length, 2, 'not stuck on the first opening');
    pageshow(false);
    assert.strictEqual(btn.textContent, 'Patientez…', 'a normal load changes nothing');
  });

  await check('with a member token: prefetch and fallback carry Authorization: Bearer, and v: 2', async () => {
    const p = page({ button: false, answers: [{ status: 500, body: { error: 'boom' } }] });
    await wait(20);
    p.w.OrdoBillingPortal.open();
    await wait(20);
    assert.strictEqual(p.portalRequests.length, 2, 'the prefetch, then the fallback');
    for (const r of p.portalRequests) {
      assert.strictEqual(r.headers.Authorization, 'Bearer jeton-de-test');
      assert.strictEqual(r.headers['Content-Type'], 'application/json');
      assert.deepStrictEqual(r.body, Object.assign({ v: 2 }, BODY_BEFORE), 'the customer id stays in the body');
    }
    assert.deepStrictEqual(p.navigations, [PORTAL]);
  });

  await check('without a member token: no header, the same body as before plus v: 2', async () => {
    for (const opts of [{ token: null }, { token: '' }, { cookie: 'throws' }]) {
      const p = page(Object.assign({ button: false }, opts));
      await wait(20);
      assert.strictEqual(p.portalRequests.length, 1, JSON.stringify(opts) + ': the prefetch still goes out');
      const r = p.portalRequests[0];
      assert.deepStrictEqual(Object.keys(r.headers), ['Content-Type'], JSON.stringify(opts));
      assert.deepStrictEqual(r.body, Object.assign({ v: 2 }, BODY_BEFORE), JSON.stringify(opts));
      p.w.OrdoBillingPortal.open();
      await wait(20);
      assert.deepStrictEqual(p.navigations, [PORTAL], JSON.stringify(opts));
    }
  });

  await check('the prefetch waits for the member token', async () => {
    const p = page({ button: false, memberstackAfter: 150 });
    await wait(100);
    assert.strictEqual(p.portalRequests.length, 0, 'no request before Memberstack is there');
    await wait(400);
    assert.strictEqual(p.portalRequests.length, 1);
    assert.strictEqual(p.portalRequests[0].headers.Authorization, 'Bearer jeton-de-test');
    assert.deepStrictEqual(p.events, ['token', 'portal'], 'the token is read before the request');
  });

  await check('a 401 opens nothing, is reported with its status, the title asks to log in again', async () => {
    const refused = { status: 401, body: { error: 'unauthorized' } };
    const p = page({ answers: [refused, refused] });
    await wait(20);
    const btn = p.btn();
    btn.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(20);
    assert.deepStrictEqual(p.navigations, []);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].err.status, 401);
    assert.strictEqual(btn.textContent, 'Réessayer');
    assert.strictEqual(btn.getAttribute('title'), TITLE_SESSION);
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error('FAIL ' + err.message);
  process.exit(1);
});
