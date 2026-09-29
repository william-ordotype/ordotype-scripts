#!/usr/bin/env node
/**
 * « Mes abonnements » for a member who only has free plans: shown at once, then replaced by the list.
 *
 * What must hold:
 *   - eligible = every plan connection is FREE, at least one is active, no pause, no payment in the
 *     last day. A paid plan, even cancelled, a connection without a type, or an empty snapshot is
 *     never eligible: the list is awaited as before, and the plans endpoint is not even called;
 *   - with a stored copy of the plans, the cards are rendered before any answer; without one, as
 *     soon as the plans endpoint answers, and the copy is stored;
 *   - the plans request is a simple one (no credentials, no Authorization header);
 *   - the cards are the list's own rules: visible plans only, one card per label, an ended access
 *     only when alone, sorted by order then label, no card for the free trial (awaited instead);
 *   - the list, still requested, replaces them; ONE `subscriptions_list` event (`instant`);
 *   - a list with a paid card after an instant render is reported (the rule was wrong);
 *   - a list that fails after an instant render leaves the cards (no page blocks), and only an HTTP
 *     error is reported, not a timeout;
 *   - the plans endpoint unavailable: the list is awaited; only an unexpected status is reported;
 *   - past PLANS_TIMEOUT_MS the list is awaited, but the plans request is not cut: a later answer is
 *     not shown, it is stored for the next visit;
 *   - only a real answer that cannot be used is reported: an error status, a body that is not JSON,
 *     or JSON without plans. A request or a body cut off on the way (page left, connection lost) is not;
 *   - the skeleton has one placeholder per plan that is not cancelled (1 to 3) and says when the
 *     wait is long; a timeout on a section never on screen is `timeout-unseen`, not reported.
 *
 * Usage: node test/subscriptions-instant.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'account/subscriptions-overview.js'), 'utf8');
function shorten(src, from, to) {
  const out = src.replace(from, to);
  assert.notStrictEqual(out, src, from + ' not found: the test would not shorten it');
  return out;
}
let SOURCE = shorten(REAL, 'var LIST_TIMEOUT_MS = 8000;', 'var LIST_TIMEOUT_MS = 160;');
SOURCE = shorten(SOURCE, 'var HEDGE_MS = 4000;', 'var HEDGE_MS = 80;');
SOURCE = shorten(SOURCE, 'var SLOW_MS = 3000;', 'var SLOW_MS = 40;');
SOURCE = shorten(SOURCE, 'var SKELETON_DELAY_MS = 200;', 'var SKELETON_DELAY_MS = 5;');
const PLANS_SHORT_MS = 50;
SOURCE = shorten(SOURCE, 'var PLANS_TIMEOUT_MS = 2500;', 'var PLANS_TIMEOUT_MS = ' + PLANS_SHORT_MS + ';');

const API = 'https://webhooks.ordotype.fr/.netlify/functions/account-subscriptions';
const PLANS = 'https://webhooks.ordotype.fr/.netlify/functions/abonnements-affiches';
const DAY = 24 * 3600 * 1000;

const PUBLIC = {
  pln_interne: { label: 'Interne MG', icon: 'https://cdn.prod.website-files.com/x/interne.svg', order: 10, ended: false,
    action: { label: 'Voir les offres', href: '/nos-offres' }, note: 'Accès pendant l’internat.' },
  pln_rhumato_free: { label: 'Module Rhumatologie', icon: null, order: 20, ended: false, action: null, note: null },
  pln_rhumato_bis: { label: 'Module Rhumatologie', icon: null, order: 20, ended: false, action: null, note: null },
  pln_adn: { label: 'Aide au diagnostic', icon: null, order: 20, ended: false, action: null, note: null },
  pln_fini: { label: 'Essai terminé', icon: null, order: 99, ended: true, action: { label: 'En profiter', href: '/nos-offres' }, note: null },
  pln_essai: { label: 'Essai de 15 jours', icon: null, order: 10, ended: false, action: null, note: 'Valable 15 jours.', trial: true },
};

const free = (planId, status = 'ACTIVE') => ({ id: 'con_' + planId, active: status === 'ACTIVE', status, planId, type: 'FREE', payment: null });
const paid = (planId, status = 'ACTIVE') => ({ id: 'con_' + planId, active: status === 'ACTIVE', status, planId, type: 'SUBSCRIPTION', payment: { amount: 30 } });

const card = (label, status = 'free', extra = {}) => ({ label, icon: null, status, price: null, discount: null, offeredUntil: null,
  next: null, endsOn: null, resumesOn: null, action: null, note: null, reactivation: null, ...extra });
const LIST_FREE = { subscriptions: [card('Interne MG')], paymentMethods: [], otherPaymentMethods: [], invoices: [], billingAddress: null };
const LIST_PAID = { subscriptions: [card('Médecine Générale', 'active', { price: { amount: 3000, current: 3000, currency: 'eur', interval: 'month', intervalCount: 1 } })],
  paymentMethods: [], otherPaymentMethods: [], invoices: [], billingAddress: null };

const hang = (w, opts) => new Promise((resolve, reject) => {
  if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new w.DOMException('aborted', 'AbortError')));
});
const reply = (status, body, delay = 0) => () => new Promise((r) => setTimeout(() => r({ ok: status < 400, status, json: () => Promise.resolve(body) }), delay));
// Answers after `delay` like a real fetch: an abort before that rejects it.
const late = (status, body, delay) => (w, opts) => new Promise((resolve, reject) => {
  const t = setTimeout(() => resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }), delay);
  if (opts && opts.signal) opts.signal.addEventListener('abort', () => { clearTimeout(t); reject(new w.DOMException('aborted', 'AbortError')); });
});
// Headers received, then the body cannot be read.
const brokenBody = (status, error) => (w) => Promise.resolve({ ok: status < 400, status, json: () => Promise.reject(error(w)) });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function page({ plans, meta = {}, stored = null, justPaid = null, list = reply(200, LIST_FREE, 30), plansReply = reply(200, { plans: PUBLIC }, 10), visible = true } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div class="tab-pane"><div class="w-embed"><div id="ordotype-subscriptions"></div></div>
        <div class="inner-block-wraper" id="old-section"><div class="abonnement-wrapper">Ancien bloc</div></div>
        <div class="inner-block-wraper" id="payment-method-block">Ajouter un moyen de paiement</div>
        <div class="inner-block-wraper" id="invoices-block">Mes factures</div>
      </div></body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }
  );
  const w = dom.window;
  w.dataLayer = [];
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: 'cus_test', planConnections: plans, metaData: meta } };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('test-token') };
  const reports = [];
  w.OrdoErrorReporter = { report: (ctx, err) => reports.push({ ctx, name: err && err.name, message: err && err.message }), reportNetwork: (ctx, err) => reports.push({ ctx, network: true, message: err && err.message }) };
  w.IntersectionObserver = function(cb) {
    this.observe = (target) => { if (visible) setTimeout(() => cb([{ target, isIntersecting: true }]), 0); };
    this.disconnect = () => {};
  };
  if (stored) w.localStorage.setItem('ordo_subs_plans', JSON.stringify(stored));
  if (justPaid) w.localStorage.setItem('justPaidTs', String(justPaid));
  const calls = { list: [], plans: [] };
  w.fetch = (url, opts) => {
    if (url === PLANS) { calls.plans.push({ url, opts }); return plansReply(w, opts); }
    if (url === API) { calls.list.push({ url, opts }); return list(w, opts); }
    throw new Error('unexpected fetch ' + url);
  };
  w.eval(SOURCE);
  const doc = w.document;
  return {
    w, calls, reports,
    events: () => w.dataLayer.filter((e) => e.event === 'subscriptions_list').map((e) => e.subs_outcome),
    labels: () => Array.from(doc.querySelectorAll('.ordo-subs-card .ordo-subs-label')).map((n) => n.textContent),
    statuses: () => Array.from(doc.querySelectorAll('.ordo-subs-card .ordo-subs-tag')).map((n) => n.textContent),
    text: () => doc.getElementById('ordotype-subscriptions').textContent,
    skeletons: () => doc.querySelectorAll('.ordo-subs-skel').length,
    fallback: () => doc.documentElement.classList.contains('ordo-subs-fallback'),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The script starts on DOMContentLoaded: open() returns once it has.
async function open(opts) {
  const p = page(opts);
  await wait(1);
  return p;
}
let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}
const COPY = { at: Date.now(), plans: PUBLIC };

(async () => {
  await check('stored copy: the free cards are rendered before any answer', async () => {
    const p = await open({ plans: [free('pln_interne')], stored: COPY, list: reply(200, LIST_FREE, 60), plansReply: reply(200, { plans: PUBLIC }, 40) });
    await wait(1);
    assert.strictEqual(p.w.localStorage.getItem('ordo_subs_plans'), JSON.stringify(COPY), 'the plans have not answered yet');
    assert.deepStrictEqual(p.labels(), ['Interne MG'], 'rendered at start, from the stored copy');
    assert.deepStrictEqual(p.events(), ['instant']);
    assert.ok(/Voir les offres/.test(p.text()) && /Accès pendant l’internat\./.test(p.text()), 'button and note of the plan');
    assert.ok(p.w.document.querySelector('.ordo-subs-logo'), 'logo of the plan');
    assert.strictEqual(p.w.document.getElementById('old-section').style.display, 'none', 'the page\'s own blocks give way');
    await wait(120);
    assert.deepStrictEqual(p.labels(), ['Interne MG'], 'then replaced by the list');
    assert.deepStrictEqual(p.events(), ['instant'], 'ONE list event per page');
    assert.strictEqual(p.calls.list.length, 1, 'the list is still requested');
    assert.strictEqual(p.calls.plans.length, 1, 'the stored copy is refreshed');
    assert.strictEqual(p.reports.length, 0);
  });

  await check('no copy: rendered when the plans answer, before the list; the copy is stored', async () => {
    const p = await open({ plans: [free('pln_interne')], list: reply(200, LIST_FREE, 60) });
    await wait(1);
    assert.deepStrictEqual(p.labels(), [], 'no copy: nothing yet');
    await wait(30);
    assert.deepStrictEqual(p.labels(), ['Interne MG'], 'from the plans endpoint, before the list');
    const saved = JSON.parse(p.w.localStorage.getItem('ordo_subs_plans'));
    assert.ok(saved && typeof saved.at === 'number' && saved.plans.pln_interne.label === 'Interne MG');
    await wait(80);
    assert.deepStrictEqual(p.events(), ['instant']);
  });

  await check('the plans request is a simple one: no credentials, no Authorization header', async () => {
    const p = await open({ plans: [free('pln_interne')] });
    await wait(5);
    const opts = p.calls.plans[0].opts;
    assert.strictEqual(opts.credentials, 'omit');
    assert.ok(!opts.headers, 'no header at all');
    assert.strictEqual(opts.method, 'GET');
  });

  await check('a copy older than 30 days is not used', async () => {
    const p = await open({ plans: [free('pln_interne')], stored: { at: Date.now() - 31 * DAY, plans: PUBLIC }, plansReply: hang });
    assert.deepStrictEqual(p.labels(), []);
    await wait(60);
    assert.deepStrictEqual(p.events(), ['shown'], 'the list, as before');
  });

  const notEligible = [
    ['a cancelled paid plan', { plans: [free('pln_interne'), paid('pln_mg', 'CANCELED')] }],
    ['an active paid plan', { plans: [free('pln_interne'), paid('pln_mg')] }],
    ['a one-time plan', { plans: [free('pln_interne'), { planId: 'pln_x', status: 'ACTIVE', type: 'ONETIME' }] }],
    ['a connection without a type', { plans: [free('pln_interne'), { planId: 'pln_x', status: 'ACTIVE' }] }],
    ['an empty snapshot', { plans: [] }],
    ['no plan connections at all', { plans: undefined }],
    ['no active free plan', { plans: [free('pln_interne', 'CANCELED')] }],
    ['a pause', { plans: [free('pln_interne')], meta: { 'pause-end-date': '2027-01-01', 'paused-group-key': 'grp' } }],
    ['a payment in the last day', { plans: [free('pln_interne')], justPaid: Date.now() - 3600 * 1000 }],
  ];
  for (const [what, opts] of notEligible) {
    await check('not eligible, ' + what + ': the list is awaited, the plans are not requested', async () => {
      const p = await open({ ...opts, stored: COPY, list: reply(200, LIST_PAID, 20) });
      assert.deepStrictEqual(p.labels(), [], 'nothing before the list');
      await wait(60);
      assert.deepStrictEqual(p.events(), ['shown']);
      assert.strictEqual(p.calls.plans.length, 0);
      assert.strictEqual(p.reports.length, 0);
    });
  }

  await check('a payment more than a day ago: eligible again', async () => {
    const p = await open({ plans: [free('pln_interne')], stored: COPY, justPaid: Date.now() - 2 * DAY });
    assert.deepStrictEqual(p.events(), ['instant']);
  });

  await check('the free trial is never shown before the list (its end date comes from the member)', async () => {
    const p = await open({ plans: [free('pln_essai')], stored: COPY });
    assert.deepStrictEqual(p.labels(), []);
    await wait(60);
    assert.deepStrictEqual(p.events(), ['shown']);
  });

  await check('the list\'s own rules: one card per label, sorted, ended access only when alone, unknown plan skipped', async () => {
    const p = await open({ plans: [free('pln_adn'), free('pln_rhumato_free'), free('pln_rhumato_bis'), free('pln_fini'), free('pln_inconnu'), free('pln_interne')], stored: COPY, list: hang });
    assert.deepStrictEqual(p.labels(), ['Interne MG', 'Aide au diagnostic', 'Module Rhumatologie']);
    const alone = await open({ plans: [free('pln_fini'), free('pln_inconnu')], stored: COPY, list: hang });
    assert.deepStrictEqual(alone.labels(), ['Essai terminé']);
    assert.deepStrictEqual(alone.statuses(), ['Terminé']);
    const nothing = await open({ plans: [free('pln_inconnu')], stored: COPY, list: hang });
    assert.deepStrictEqual(nothing.labels(), []);
    assert.ok(/Vous n’avez pas d’abonnement en cours/.test(nothing.text()), 'same empty state as the list');
  });

  await check('a paid card in the list after an instant render: the list wins, and it is reported', async () => {
    const p = await open({ plans: [free('pln_interne')], stored: COPY, list: reply(200, LIST_PAID, 20) });
    assert.deepStrictEqual(p.labels(), ['Interne MG']);
    await wait(60);
    assert.deepStrictEqual(p.labels(), ['Médecine Générale']);
    assert.deepStrictEqual(p.events(), ['instant']);
    assert.strictEqual(p.reports.length, 1);
    assert.strictEqual(p.reports[0].name, 'SubscriptionsInstantMismatch');
  });

  await check('labels that differ only (stale copy): replaced silently', async () => {
    const renamed = { at: Date.now(), plans: { ...PUBLIC, pln_interne: { ...PUBLIC.pln_interne, label: 'Ancien libellé' } } };
    const p = await open({ plans: [free('pln_interne')], stored: renamed });
    assert.deepStrictEqual(p.labels(), ['Ancien libellé']);
    await wait(60);
    assert.deepStrictEqual(p.labels(), ['Interne MG']);
    assert.strictEqual(p.reports.length, 0);
  });

  await check('the list times out after an instant render: the cards stay, no page blocks, nothing reported', async () => {
    const p = await open({ plans: [free('pln_interne')], stored: COPY, list: hang });
    await wait(300);
    assert.deepStrictEqual(p.labels(), ['Interne MG']);
    assert.ok(!p.fallback());
    assert.deepStrictEqual(p.events(), ['instant']);
    assert.strictEqual(p.reports.length, 0);
    assert.strictEqual(p.calls.list.length, 2, 'the list was still sent a second time');
  });

  await check('the list fails with an HTTP error after an instant render: the cards stay, the error is reported', async () => {
    const p = await open({ plans: [free('pln_interne')], stored: COPY, list: reply(502, { error: 'upstream_error' }) });
    await wait(60);
    assert.deepStrictEqual(p.labels(), ['Interne MG']);
    assert.ok(!p.fallback());
    assert.strictEqual(p.reports.length, 1);
  });

  for (const [status, reported] of [[404, true], [503, false], [429, false]]) {
    await check(`plans endpoint ${status}: the list is awaited, ${reported ? '' : 'not '}reported`, async () => {
      const p = await open({ plans: [free('pln_interne')], plansReply: reply(status, { error: 'x' }) });
      await wait(80);
      assert.deepStrictEqual(p.events(), ['shown']);
      assert.strictEqual(p.reports.filter((r) => r.name === 'SubscriptionsPlansUnavailable').length, reported ? 1 : 0);
      assert.strictEqual(p.w.localStorage.getItem('ordo_subs_plans'), null, 'nothing stored');
    });
  }

  await check('plans endpoint unreachable (network): the list is awaited, not reported', async () => {
    const p = await open({ plans: [free('pln_interne')], plansReply: () => Promise.reject(new TypeError('Failed to fetch')) });
    await wait(80);
    assert.deepStrictEqual(p.events(), ['shown']);
    assert.strictEqual(p.reports.length, 0);
  });

  await check('plans endpoint hangs: the list is shown, the plans request is not cut', async () => {
    const p = await open({ plans: [free('pln_interne')], plansReply: hang, list: reply(200, LIST_FREE, 20) });
    await wait(60);
    assert.deepStrictEqual(p.events(), ['shown']);
    assert.ok(!p.calls.plans[0].opts.signal, 'no abort signal on the plans request');
    assert.strictEqual(p.reports.length, 0);
  });

  await check('plans answer after the delay: not shown, stored for the next visit', async () => {
    const d = deferred();
    const p = await open({ plans: [free('pln_interne')], plansReply: late(200, { plans: PUBLIC }, PLANS_SHORT_MS + 40),
      list: () => d.promise.then(() => ({ ok: true, status: 200, json: () => Promise.resolve(LIST_FREE) })) });
    await wait(PLANS_SHORT_MS + 60);
    assert.deepStrictEqual(p.labels(), [], 'the late answer is not rendered while the list is awaited');
    assert.deepStrictEqual(p.events(), []);
    const saved = JSON.parse(p.w.localStorage.getItem('ordo_subs_plans'));
    assert.ok(saved && typeof saved.at === 'number' && saved.plans.pln_interne.label === 'Interne MG', 'the late answer is stored');
    d.resolve();
    await wait(20);
    assert.deepStrictEqual(p.events(), ['shown'], 'the list, as before');
    assert.deepStrictEqual(p.labels(), ['Interne MG']);
    assert.strictEqual(p.reports.length, 0);
    const next = await open({ plans: [free('pln_interne')], stored: saved, list: hang, plansReply: hang });
    assert.deepStrictEqual(next.events(), ['instant'], 'the next visit shows the free cards at once');
    assert.deepStrictEqual(next.labels(), ['Interne MG']);
  });

  await check('plans answer after the delay when the list is already shown: stored, nothing else', async () => {
    const p = await open({ plans: [free('pln_interne')], plansReply: late(200, { plans: PUBLIC }, PLANS_SHORT_MS + 40), list: reply(200, LIST_FREE, 10) });
    await wait(PLANS_SHORT_MS + 70);
    assert.deepStrictEqual(p.events(), ['shown']);
    assert.ok(p.w.localStorage.getItem('ordo_subs_plans'), 'stored');
    assert.strictEqual(p.reports.length, 0);
  });

  await check('plans request aborted by the browser: not reported, nothing stored', async () => {
    const p = await open({ plans: [free('pln_interne')], plansReply: (w) => Promise.reject(new w.DOMException('aborted', 'AbortError')) });
    await wait(80);
    assert.deepStrictEqual(p.events(), ['shown']);
    assert.strictEqual(p.reports.length, 0);
    assert.strictEqual(p.w.localStorage.getItem('ordo_subs_plans'), null);
  });

  for (const [what, error] of [
    ['aborted', (w) => new w.DOMException('aborted', 'AbortError')],
    ['connection lost', () => new TypeError('network error')],
  ]) {
    await check(`200 whose body cannot be read (${what}): not reported, nothing stored`, async () => {
      const p = await open({ plans: [free('pln_interne')], plansReply: brokenBody(200, error) });
      await wait(80);
      assert.deepStrictEqual(p.events(), ['shown']);
      assert.strictEqual(p.reports.length, 0, 'a body cut off on the way is not an unusable answer');
      assert.strictEqual(p.w.localStorage.getItem('ordo_subs_plans'), null);
    });
  }

  await check('200 without plans: reported', async () => {
    const p = await open({ plans: [free('pln_interne')], plansReply: reply(200, { fetchedAt: null }) });
    await wait(80);
    assert.deepStrictEqual(p.events(), ['shown']);
    const r = p.reports.filter((x) => x.name === 'SubscriptionsPlansUnavailable');
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].message, 'abonnements-affiches 200: no plans');
    assert.strictEqual(p.w.localStorage.getItem('ordo_subs_plans'), null);
  });

  await check('200 whose body is not JSON: reported', async () => {
    const p = await open({ plans: [free('pln_interne')], plansReply: brokenBody(200, () => new SyntaxError('Unexpected token <')) });
    await wait(80);
    assert.strictEqual(p.reports.filter((x) => x.name === 'SubscriptionsPlansUnavailable').length, 1);
  });

  await check('404 whose body cannot be read: still reported (the status is the answer)', async () => {
    const p = await open({ plans: [free('pln_interne')], plansReply: brokenBody(404, () => new TypeError('network error')) });
    await wait(80);
    const r = p.reports.filter((x) => x.name === 'SubscriptionsPlansUnavailable');
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].message, 'abonnements-affiches 404: no plans');
  });

  await check('skeleton: one placeholder per plan that is not cancelled (1 to 3), then a long-wait line', async () => {
    const two = await open({ plans: [paid('pln_mg'), free('pln_interne'), paid('pln_old', 'CANCELED')], list: hang });
    await wait(20);
    assert.strictEqual(two.skeletons(), 2);
    assert.ok(!/plus de temps/.test(two.text()));
    await wait(40);
    assert.ok(/Le chargement prend plus de temps que d’habitude…/.test(two.text()), 'the long wait is said');
    const many = await open({ plans: [paid('a'), paid('b'), paid('c'), paid('d')], list: hang });
    const none = await open({ plans: [paid('a', 'CANCELED')], list: hang });
    await wait(20);
    assert.strictEqual(many.skeletons(), 3);
    assert.strictEqual(none.skeletons(), 1);
  });

  await check('a timeout on a section never on screen: `timeout-unseen`, not reported, blocks back', async () => {
    const p = await open({ plans: [paid('pln_mg')], list: hang, visible: false });
    await wait(300);
    assert.deepStrictEqual(p.events(), ['timeout-unseen']);
    assert.strictEqual(p.reports.length, 0);
    assert.ok(p.fallback());
  });

  await check('the same timeout on screen: `timeout`, reported', async () => {
    const p = await open({ plans: [paid('pln_mg')], list: hang, visible: true });
    await wait(300);
    assert.deepStrictEqual(p.events(), ['timeout']);
    assert.strictEqual(p.reports.length, 1);
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error('FAIL ' + err.message);
  process.exit(1);
});
