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
 *   - a failure (no answer, or an answer without a portal address) opens nothing, is reported,
 *     and a later click can try again;
 *   - back from the portal, a page restored from the browser cache can open it again;
 *   - with a Memberstack token the request carries `Authorization: Bearer`, without one it goes out
 *     as before (no header, same body), both with `v: 2`; the prefetch waits for the token;
 *   - a 401 opens nothing and is reported.
 *
 * Usage: node test/billing-portal.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'account/billing-portal.js'), 'utf8');
const SCRIPT = REAL.split('window.location.href = portalUrl;').join('window.__navigate(portalUrl);');
assert.notStrictEqual(SCRIPT, REAL, 'navigation line not found: the test could not observe it');

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
    await wait(20);
    assert.deepStrictEqual(p.navigations, [], 'never navigate to an undefined address');
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].kind, 'report');
    assert.strictEqual(p.reports[0].err.status, 500);
    assert.strictEqual(btn.textContent, 'Voir mes factures', 'the label comes back');
    p.w.OrdoBillingPortal.open();
    await wait(20);
    assert.strictEqual(p.portalCalls.length, 3, 'a later attempt goes through');
    assert.deepStrictEqual(p.navigations, [PORTAL]);
  });

  await check('no answer: nothing opens, reported as a network failure', async () => {
    const p = page({ button: false, answers: [{ transport: 'Failed to fetch' }, { transport: 'Failed to fetch' }] });
    await wait(20);
    p.w.OrdoBillingPortal.open();
    await wait(20);
    assert.deepStrictEqual(p.navigations, []);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].kind, 'network');
  });

  await check('an answer that is not JSON keeps its status in the report', async () => {
    const p = page({ button: false, answers: [{ transport: 'Failed to fetch' }, { status: 502 }] });
    await wait(20);
    p.w.OrdoBillingPortal.open();
    await wait(20);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].kind, 'report');
    assert.strictEqual(p.reports[0].err.status, 502);
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
    assert.strictEqual(btn.textContent, 'Patientez...');
    pageshow(true);
    assert.strictEqual(btn.textContent, 'Voir mes factures', 'the label comes back');
    click();
    await wait(20);
    assert.strictEqual(p.navigations.length, 2, 'not stuck on the first opening');
    pageshow(false);
    assert.strictEqual(btn.textContent, 'Patientez...', 'a normal load changes nothing');
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

  await check('a 401 opens nothing, is reported with its status, the label comes back', async () => {
    const refused = { status: 401, body: { error: 'unauthorized' } };
    const p = page({ answers: [refused, refused] });
    await wait(20);
    const btn = p.btn();
    btn.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(20);
    assert.deepStrictEqual(p.navigations, []);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].err.status, 401);
    assert.strictEqual(btn.textContent, 'Voir mes factures');
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error('FAIL ' + err.message);
  process.exit(1);
});
