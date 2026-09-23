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
 *   - back from the portal, a page restored from the browser cache can open it again.
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

// Each answer: { status, body } or { transport } (network failure), optional delay
function page({ button = true, customer = 'cus_test', answers = [] } = {}) {
  const html = '<!doctype html><html><body>' +
    (button ? '<a id="viewInvoicesBtn" href="#" data-ms-action="customer-portal">Voir mes factures</a>' : '') +
    '</body></html>';
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/membership/compte', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: customer, auth: { email: 'dr@example.fr' } } };
  const portalCalls = [];
  const hooks = [];
  const queue = answers.slice();
  w.fetch = (url, opts) => {
    if (/notify-webhook/.test(url)) { hooks.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, status: 200 }); }
    portalCalls.push(url);
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
  return { w, portalCalls, hooks, navigations, reports, btn: () => w.document.getElementById('viewInvoicesBtn') };
}

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

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error('FAIL ' + err.message);
  process.exit(1);
});
