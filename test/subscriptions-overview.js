#!/usr/bin/env node
/**
 * « Mes abonnements » list on the account page: rendering of each status, formats, loading and errors.
 *
 * Usage : node test/subscriptions-overview.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'account/subscriptions-overview.js'), 'utf8');
// jsdom cannot navigate: the redirections are captured instead (same approach as test/fin-internat.js).
const NAV_SCRIPT = SCRIPT.split('window.location.assign(').join('window.__navigate(');

const CARDS = [
  { label: 'Médecine Générale', status: 'active', price: { amount: 3000, current: 1500, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: { percentOff: 50, amountOff: null, currency: null, duration: 'repeating', end: '2026-12-21' },
    offeredUntil: null, next: { date: '2026-10-05', amount: 1500 }, endsOn: null, resumesOn: null },
  { label: 'Module Rhumatologie', status: 'active', price: { amount: 500, current: 500, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: '2026-10-01', next: { date: '2026-10-01', amount: 500 }, endsOn: null, resumesOn: null },
  { label: 'Offert', status: 'active', price: { amount: 3000, current: 0, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: { percentOff: 100, amountOff: null, currency: null, duration: 'repeating', end: '2027-03-20' },
    offeredUntil: null, next: { date: '2027-03-20', amount: 3000 }, endsOn: null, resumesOn: null },
  { label: 'Module Soins palliatifs', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Stockage', status: 'canceling', price: { amount: 200, current: 200, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: '2026-09-30', resumesOn: null },
  { label: 'Impayé', status: 'past_due', price: { amount: 3000, current: 3000, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'En pause', status: 'paused', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: '2027-03-17' },
  { label: 'Pause prévue', status: 'pause_scheduled', price: { amount: 3000, current: 3000, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: '2026-10-17', resumesOn: '2027-03-17' },
  { label: 'À vie', status: 'active', price: { amount: 3000, current: 2550, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: { percentOff: 15, amountOff: null, currency: null, duration: 'forever', end: null },
    offeredUntil: null, next: { date: '2026-11-01', amount: 2550 }, endsOn: null, resumesOn: null },
  { label: 'En attente', status: 'pending', price: { amount: 3000, current: 3000, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: null, status: 'active', price: { amount: 15000, current: 15000, currency: 'mad', interval: 'year', intervalCount: 1 },
    discount: null, offeredUntil: null, next: { date: '2027-01-10', amount: 15000 }, endsOn: null, resumesOn: null },
  { label: '<img src=x onerror=alert(1)>', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Essai terminé', status: 'ended', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Essai gratuit', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null,
    note: 'Valable 15 jours à partir de votre inscription.' },
  { label: 'Essai daté', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: '2026-10-07', resumesOn: null },
];

function page({ visible = true, prefilled = false, portal = true, whitespace = false, pause = null, confirmAnswer = true } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>
      <div class="tab-pane"><div class="w-embed"><div id="ordotype-subscriptions">${prefilled ? '<p>x</p>' : ''}${whitespace ? '\n  ' : ''}</div></div>
        <div class="inner-block-wraper" id="old-section"><div class="abonnement-wrapper">Ancien bloc</div></div>
        <div class="inner-block-wraper" id="payment-method-block">Ajouter un moyen de paiement</div>
        <div class="inner-block-wraper" id="invoices-block">Mes factures</div>
      </div>
      <div id="cancellation-warning-modal" style="display:none">Êtes-vous sûr ?</div>
    </body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', virtualConsole }
  );
  const w = dom.window;
  const reported = [];
  const network = [];
  const opened = [];
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: 'cus_test' } };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('jeton-de-test') };
  w.OrdoErrorReporter = {
    report(ctx, err) { reported.push({ ctx, err }); },
    reportNetwork(ctx, err) { network.push({ ctx, err }); return true; },
  };
  if (portal) w.OrdoBillingPortal = { open() { opened.push(true); } };
  const pauseCalls = [];
  if (pause) {
    w.OrdoPause = {
      resume(cb) { pauseCalls.push('resume'); setTimeout(() => cb(pause.ok), 0); },
      cancelDefinitive(cb) { pauseCalls.push('cancel'); setTimeout(() => cb(pause.ok), 0); },
      resumedUrl: '/membership/abonnement-repris',
      redirectDelay: 100000,
    };
  }
  w.confirm = () => confirmAnswer;
  const observer = { callback: null, target: null };
  w.IntersectionObserver = function(cb) {
    observer.callback = cb;
    this.observe = (target) => {
      observer.target = target;
      if (visible) setTimeout(() => cb([{ target, isIntersecting: true }]), 0);
    };
    this.disconnect = () => {};
  };
  return { dom, w, erreurs, reported, network, opened, observer, pauseCalls };
}

function installFetch(w, outcomes) {
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, options });
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (outcome.transport) return Promise.reject(new TypeError(outcome.transport));
    const response = { ok: outcome.status < 400, status: outcome.status, json: () => Promise.resolve(outcome.body || {}) };
    if (outcome.delay) return new Promise((r) => setTimeout(() => r(response), outcome.delay));
    return Promise.resolve(response);
  };
  return calls;
}

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
function text(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 4);
  const parts = [];
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue.replace(/[  ]/g, ' ').trim());
  return parts.filter(Boolean).join(' ');
}
const anchor = (w) => w.document.getElementById('ordotype-subscriptions');
const cards = (w) => Array.from(w.document.querySelectorAll('.ordo-subs-card'));
const cardText = (w, i) => text(cards(w)[i]);

async function main() {
  // Rendering of every status
  {
    const t = page();
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(calls[0].options.credentials, 'omit');
    assert.strictEqual(calls[0].options.method, 'GET');
    assert.strictEqual(anchor(t.w).style.display, '');
    assert.strictEqual(anchor(t.w).parentElement.style.display, '');
    assert.ok(text(anchor(t.w)).startsWith('Mes abonnements'));
    assert.strictEqual(cards(t.w).length, CARDS.length);

    assert.strictEqual(cardText(t.w, 0),
      'Médecine Générale Actif 15 € / mois au lieu de 30 € -50 % jusqu’au 21 décembre 2026 Puis 30 € / mois Prochain prélèvement 15 € le 5 octobre 2026');
    assert.strictEqual(cardText(t.w, 1),
      'Module Rhumatologie Actif 0 € / mois au lieu de 5 € Offert jusqu’au 1er octobre 2026 Puis 5 € / mois Prochain prélèvement 5 € le 1er octobre 2026');
    assert.strictEqual(cardText(t.w, 2),
      'Offert Actif 0 € / mois au lieu de 30 € Offert jusqu’au 20 mars 2027 Puis 30 € / mois Prochain prélèvement 30 € le 20 mars 2027');
    assert.strictEqual(cardText(t.w, 3), 'Module Soins palliatifs Gratuit');
    assert.strictEqual(cards(t.w)[3].querySelector('.ordo-subs-amount'), null);
    assert.strictEqual(cardText(t.w, 4), 'Stockage Résiliation programmée 2 € / mois Se termine le 30 septembre 2026');
    assert.strictEqual(cardText(t.w, 5), 'Impayé Paiement à régulariser 30 € / mois Paiement en échec Modifier le moyen de paiement');
    assert.strictEqual(cardText(t.w, 6), 'En pause En pause Reprise automatique le 17 mars 2027');
    assert.strictEqual(cardText(t.w, 7),
      'Pause prévue Pause programmée 30 € / mois Accès maintenu jusqu’au 17 octobre 2026, puis mise en pause. Reprise automatique le 17 mars 2027');
    assert.strictEqual(cardText(t.w, 8), 'À vie Actif 25,50 € / mois au lieu de 30 € -15 % à vie Prochain prélèvement 25,50 € le 1er novembre 2026');
    assert.strictEqual(cardText(t.w, 9), 'En attente Paiement en cours 30 € / mois Votre paiement est en cours de validation.');
    assert.strictEqual(cardText(t.w, 10), 'Abonnement Actif 150 MAD / an Prochain prélèvement 150 MAD le 10 janvier 2027');

    assert.strictEqual(cardText(t.w, 12), 'Essai terminé Terminé');
    assert.strictEqual(cardText(t.w, 13), 'Essai gratuit Gratuit Valable 15 jours à partir de votre inscription.');
    assert.strictEqual(cardText(t.w, 14), 'Essai daté Gratuit Se termine le 7 octobre 2026');
    assert.ok(cards(t.w)[12].querySelector('.ordo-subs-tone-muted'));

    // Labels are text, never markup
    assert.strictEqual(cards(t.w)[11].querySelector('img'), null);
    assert.ok(cardText(t.w, 11).startsWith('<img src=x onerror=alert(1)>'));

    // A failed payment links to the payment method page, which also retries the unpaid invoice
    const fix = cards(t.w)[5].querySelector('a.ordo-subs-link');
    assert.strictEqual(fix.getAttribute('href'), '/membership/moyen-de-paiement');
    assert.strictEqual(cards(t.w)[5].querySelector('button'), null);

    // Status tags follow the status
    assert.ok(cards(t.w)[0].querySelector('.ordo-subs-tag.ordo-subs-tone-ok'));
    assert.ok(cards(t.w)[3].querySelector('.ordo-subs-tone-free'));
    assert.ok(cards(t.w)[5].querySelector('.ordo-subs-tone-alert'));
    assert.ok(cards(t.w)[4].querySelector('.ordo-subs-tone-muted'));
    assert.strictEqual(t.w.document.querySelectorAll('#ordo-subs-style').length, 1);
    assert.deepStrictEqual(t.erreurs, []);
    assert.strictEqual(t.reported.length + t.network.length, 0);
  }

  // The old per-plan section is hidden once the list is shown; other sections stay
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(t.w.document.getElementById('old-section').style.display, 'none');
    assert.strictEqual(t.w.document.getElementById('invoices-block').style.display, '');
    assert.strictEqual(t.w.document.getElementById('payment-method-block').style.display, '');
    t.dom.window.close();
  }

  // Nothing billed (free or ended plans only, or no plan): no payment method block
  for (const list of [[CARDS[3], CARDS[12], CARDS[13]], []]) {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: list } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(t.w.document.getElementById('payment-method-block').style.display, 'none');
    assert.strictEqual(t.w.document.getElementById('invoices-block').style.display, '');
    t.dom.window.close();
  }

  // A paused or canceling subscription keeps it: the card may need updating before billing resumes
  for (const kept of [CARDS[4], CARDS[6], CARDS[5]]) {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[3], kept] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(t.w.document.getElementById('payment-method-block').style.display, '', kept.status);
    t.dom.window.close();
  }

  // Payment method section: the method Stripe will charge, replacing the page's own block
  const pmSection = (w) => w.document.querySelector('.ordo-pm');
  const VISA = { type: 'card', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2027, expired: false, expiresSoon: false, usedBy: ['Médecine Générale'] };
  async function withPms(list, pms) {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: list, paymentMethods: pms } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    return t;
  }
  {
    const t = await withPms([CARDS[0]], [VISA]);
    const s = pmSection(t.w);
    assert.ok(s, 'section rendered');
    assert.strictEqual(text(s), 'Moyen de paiement Carte Visa •••• 4242 Expire en août 2027. Modifier');
    const link = s.querySelector('a.ordo-subs-btn');
    assert.strictEqual(link.getAttribute('href'), '/membership/moyen-de-paiement');
    assert.ok(!link.classList.contains('is-primary'));
    assert.ok(s.querySelector('svg path'), 'card icon drawn');
    assert.strictEqual(anchor(t.w).lastElementChild, s, 'after the subscriptions box');
    assert.strictEqual(t.w.document.getElementById('payment-method-block').style.display, 'none');
    assert.strictEqual(t.w.document.getElementById('invoices-block').style.display, '');
    t.dom.window.close();
  }
  {
    const expired = Object.assign({}, VISA, { expMonth: 6, expYear: 2026, expired: true });
    const t = await withPms([CARDS[0]], [expired]);
    assert.strictEqual(text(pmSection(t.w)), 'Moyen de paiement Carte Visa •••• 4242 Expirée A expiré en juin 2026. Mettre à jour');
    assert.ok(pmSection(t.w).querySelector('.ordo-pm-tone-expired'));
    assert.ok(pmSection(t.w).querySelector('.ordo-pm-icon.is-alert'));
    assert.ok(pmSection(t.w).querySelector('a.ordo-subs-btn.is-primary'));
    t.dom.window.close();
  }
  {
    const soon = Object.assign({}, VISA, { brand: 'mastercard', expMonth: 10, expYear: 2026, expiresSoon: true });
    const t = await withPms([CARDS[0]], [soon]);
    assert.strictEqual(text(pmSection(t.w)), 'Moyen de paiement Carte Mastercard •••• 4242 Expire bientôt Expire en octobre 2026. Mettre à jour');
    assert.ok(pmSection(t.w).querySelector('.ordo-pm-tone-soon'));
    t.dom.window.close();
  }
  {
    const sepa = { type: 'sepa_debit', brand: null, last4: '4521', expMonth: null, expYear: null, expired: false, expiresSoon: false, usedBy: ['Médecine Générale'] };
    const t = await withPms([CARDS[0]], [sepa]);
    assert.strictEqual(text(pmSection(t.w)), 'Moyen de paiement Prélèvement SEPA •••• 4521 Modifier');
    t.dom.window.close();
  }
  {
    // Two methods: one row each, with the cards they pay, and a single button below
    const sepa = { type: 'sepa_debit', brand: null, last4: '4521', expMonth: null, expYear: null, expired: false, expiresSoon: false, usedBy: ['Médecine Générale'] };
    const card = Object.assign({}, VISA, { usedBy: ['Module Rhumatologie', 'Stockage'] });
    const t = await withPms([CARDS[0], CARDS[1]], [sepa, card]);
    const s = pmSection(t.w);
    assert.strictEqual(s.querySelectorAll('.ordo-pm-row').length, 2);
    assert.strictEqual(text(s),
      'Moyen de paiement Prélèvement SEPA •••• 4521 Pour : Médecine Générale. Carte Visa •••• 4242 Expire en août 2027. Pour : Module Rhumatologie, Stockage. Modifier');
    assert.strictEqual(s.querySelectorAll('a.ordo-subs-btn').length, 1);
    assert.ok(s.querySelector('.ordo-subs-actions a.ordo-subs-btn'));
    t.dom.window.close();
  }
  {
    // Nothing on file: say so, and offer to add one
    const none = { type: 'none', brand: null, last4: null, expMonth: null, expYear: null, expired: false, expiresSoon: false, usedBy: ['Médecine Générale'] };
    const t = await withPms([CARDS[0]], [none]);
    assert.strictEqual(text(pmSection(t.w)), 'Moyen de paiement Aucun moyen de paiement enregistré Ajouter un moyen de paiement');
    assert.ok(pmSection(t.w).querySelector('a.ordo-subs-btn.is-primary'));
    t.dom.window.close();
  }
  {
    // A failed payment makes the update the primary action, even on a valid card
    const t = await withPms([CARDS[5]], [VISA]);
    assert.strictEqual(pmSection(t.w).querySelector('a.ordo-subs-btn').textContent, 'Mettre à jour');
    assert.ok(pmSection(t.w).querySelector('a.ordo-subs-btn.is-primary'));
    t.dom.window.close();
  }
  {
    // Labels and card details are text, never markup; odd expiry data is skipped
    const odd = Object.assign({}, VISA, { brand: '<b>x</b>', last4: '<img src=x>', expMonth: 13, usedBy: ['<img src=x onerror=alert(1)>'] });
    const t = await withPms([CARDS[0], CARDS[1]], [odd, VISA]);
    assert.strictEqual(pmSection(t.w).querySelector('img'), null);
    assert.strictEqual(pmSection(t.w).querySelector('b'), null);
    assert.ok(text(pmSection(t.w)).includes('Carte bancaire •••• <img src=x>'));
    assert.ok(!text(pmSection(t.w)).includes('undefined'));
    assert.deepStrictEqual(t.erreurs, []);
    t.dom.window.close();
  }
  {
    // An unexpected brand never reads an inherited property
    const t = await withPms([CARDS[0]], [Object.assign({}, VISA, { brand: 'constructor' })]);
    assert.ok(text(pmSection(t.w)).startsWith('Moyen de paiement Carte bancaire •••• 4242'));
    t.dom.window.close();
  }
  {
    // No payment method in the response (free account): no section, and the block goes too
    const t = await withPms([CARDS[3]], []);
    assert.strictEqual(pmSection(t.w), null);
    assert.strictEqual(t.w.document.getElementById('payment-method-block').style.display, 'none');
    t.dom.window.close();
  }
  {
    // Resubscribing re-renders the whole list: one payment section, never two
    const t = page();
    const canceling = Object.assign({}, CARDS[4], { reactivation: '0123456789abcdef0123' });
    installFetch(t.w, [
      { status: 200, body: { subscriptions: [canceling], paymentMethods: [VISA] } },
      { status: 200, body: { ok: true, subscriptions: [Object.assign({}, canceling, { status: 'active', reactivation: null, endsOn: null, next: { date: '2026-10-30', amount: 200 } })], paymentMethods: [VISA] } },
    ]);
    t.w.eval(SCRIPT);
    await wait(60);
    cards(t.w)[0].querySelector('button').click();
    await wait(60);
    assert.strictEqual(t.w.document.querySelectorAll('.ordo-pm').length, 1);
    assert.ok(text(anchor(t.w)).includes('C’est fait'));
    t.dom.window.close();
  }

  // Updating the payment method opens Stripe directly: same request, return page and tracking as the
  // payment method page, which stays the link's address and the fallback
  const CHECKOUT = { url: 'https://checkout.stripe.com/c/pay/cs_test_123#fragment', id: 'cs_test_123' };
  async function withSetup(outcomes, { memberstack = null, list = [CARDS[0]], pms = [VISA] } = {}) {
    const t = page();
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: list, paymentMethods: pms } }].concat(outcomes));
    const navigations = [];
    const beacons = [];
    t.w.__navigate = (u) => navigations.push(u);
    Object.defineProperty(t.w.navigator, 'sendBeacon', { configurable: true, value: (url, blob) => { beacons.push({ url, blob }); return true; } });
    if (memberstack) t.w.OrdoMemberstack = memberstack;
    t.w.eval(NAV_SCRIPT);
    await wait(60);
    return { t, calls, navigations, beacons };
  }
  const click = (w, node, init = {}) => {
    const ev = new w.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true, button: 0 }, init));
    node.dispatchEvent(ev);
    return ev;
  };
  {
    const s = await withSetup([{ status: 200, body: CHECKOUT }], { memberstack: { stripeCustomerId: 'cus_ms', memberId: 'mem_ms', email: 'dr@example.fr' } });
    const link = pmSection(s.t.w).querySelector('a.ordo-subs-btn');
    assert.strictEqual(link.getAttribute('href'), '/membership/moyen-de-paiement', 'the page stays the address');
    const ev = click(s.t.w, link);
    assert.ok(ev.defaultPrevented);
    await wait(60);
    assert.strictEqual(s.calls.length, 2);
    assert.strictEqual(s.calls[1].url, 'https://billing.ordotype.fr/.netlify/functions/create-checkout');
    assert.deepStrictEqual(JSON.parse(s.calls[1].options.body), {
      stripeCustomerId: 'cus_ms',
      cancelUrl: 'https://www.ordotype.fr/membership/compte',
      successUrl: 'https://www.ordotype.fr/membership/moyen-de-paiement-ajoute',
      payment_method_types: ['sepa_debit'],
    });
    assert.strictEqual(s.beacons.length, 1);
    assert.strictEqual(s.beacons[0].url, 'https://billing.ordotype.fr/.netlify/functions/notify-webhook');
    const tracking = JSON.parse(await s.beacons[0].blob.text());
    assert.deepStrictEqual(tracking, {
      type: 'setup-tracking', checkoutSessionId: 'cs_test_123', stripeCustomerId: 'cus_ms', memberstackUserId: 'mem_ms',
      memberstackEmail: 'dr@example.fr', option: 'setup-sepa', paymentMethods: ['sepa_debit'], originPage: 'https://www.ordotype.fr/membership/compte',
    });
    assert.deepStrictEqual(s.navigations, [CHECKOUT.url]);
    assert.strictEqual(s.t.reported.length + s.t.network.length, 0);
    s.t.dom.window.close();
  }
  {
    // Without the shared member utilities, the account snapshot provides the Stripe customer
    const s = await withSetup([{ status: 200, body: CHECKOUT }]);
    click(s.t.w, pmSection(s.t.w).querySelector('a.ordo-subs-btn'));
    await wait(60);
    assert.strictEqual(JSON.parse(s.calls[1].options.body).stripeCustomerId, 'cus_test');
    assert.deepStrictEqual(s.navigations, [CHECKOUT.url]);
    s.t.dom.window.close();
  }
  {
    // A double click creates one session only
    const s = await withSetup([{ status: 200, body: CHECKOUT, delay: 40 }]);
    const link = pmSection(s.t.w).querySelector('a.ordo-subs-btn');
    click(s.t.w, link);
    const second = click(s.t.w, link);
    assert.ok(second.defaultPrevented);
    assert.strictEqual(link.textContent, 'Patientez…');
    await wait(120);
    assert.strictEqual(s.calls.length, 2);
    assert.strictEqual(s.navigations.length, 1);
    s.t.dom.window.close();
  }
  for (const failure of [{ status: 500, body: { error: 'boom' } }, { status: 200, body: { url: 'javascript:alert(1)' } }, { transport: 'Failed to fetch' }]) {
    // Any failure lands on the payment method page, and says so
    const s = await withSetup([failure]);
    const link = pmSection(s.t.w).querySelector('a.ordo-subs-btn');
    click(s.t.w, link);
    await wait(60);
    assert.deepStrictEqual(s.navigations, ['/membership/moyen-de-paiement'], JSON.stringify(failure));
    assert.strictEqual(s.beacons.length, 0);
    assert.strictEqual(s.t.reported.length + s.t.network.length, 1);
    assert.strictEqual(link.textContent, 'Modifier');
    s.t.dom.window.close();
  }
  {
    // A new-tab click keeps the browser's own behaviour, and so does a member without a Stripe customer
    const s = await withSetup([{ status: 200, body: CHECKOUT }]);
    const ev = click(s.t.w, pmSection(s.t.w).querySelector('a.ordo-subs-btn'), { ctrlKey: true });
    assert.ok(!ev.defaultPrevented);
    await wait(30);
    assert.strictEqual(s.calls.length, 1);
    s.t.dom.window.close();
    const n = await withSetup([{ status: 200, body: CHECKOUT }]);
    n.t.w.OrdoAccount.member.stripeCustomerId = '';
    const ev2 = click(n.t.w, pmSection(n.t.w).querySelector('a.ordo-subs-btn'));
    assert.ok(!ev2.defaultPrevented);
    await wait(30);
    assert.strictEqual(n.calls.length, 1);
    n.t.dom.window.close();
  }
  {
    // The failed-payment link on a card opens Stripe the same way
    const s = await withSetup([{ status: 200, body: CHECKOUT }], { list: [CARDS[5]] });
    click(s.t.w, cards(s.t.w)[0].querySelector('a.ordo-subs-link'));
    await wait(60);
    assert.strictEqual(s.calls[1].url, 'https://billing.ordotype.fr/.netlify/functions/create-checkout');
    assert.deepStrictEqual(s.navigations, [CHECKOUT.url]);
    s.t.dom.window.close();
  }

  // Invoices: the last ones with a clear status, their PDF downloaded through the function, and the
  // page's invoices block replaced by this section and a help box
  const INVOICES = [
    { ref: 'aaaaaaaaaaaaaaaaaaaa', date: '2026-09-14', label: 'Médecine Générale', amount: 1500, currency: 'eur', status: 'paid', pdf: true },
    { ref: 'bbbbbbbbbbbbbbbbbbbb', date: '2026-09-01', label: 'Module Rhumatologie', amount: 500, currency: 'eur', status: 'processing', pdf: true },
    { ref: 'cccccccccccccccccccc', date: '2026-08-14', label: null, amount: 3000, currency: 'eur', status: 'due', pdf: true },
  ];
  const invSection = (w) => w.document.querySelector('.ordo-inv');
  const helpBox = (w) => w.document.querySelector('.ordo-help');
  async function withInvoices(invoices, { outcomes = [], portal = true, toggle = false, list = [CARDS[0]] } = {}) {
    const t = page({ portal });
    if (toggle) {
      t.w.document.getElementById('invoices-block').innerHTML = '<div class="w-embed"><div id="ordotype-invoice-emails">Recevoir mes factures par e-mail</div></div>';
      // Like the real toggle, it keeps its own node: once detached, getElementById no longer finds it.
      const node = t.w.document.getElementById('ordotype-invoice-emails').parentElement;
      t.relocated = [];
      t.w.OrdoInvoiceEmails = {
        relocate(container) {
          container.appendChild(node);
          t.relocated.push(container);
          return true;
        },
      };
    }
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: list, paymentMethods: [VISA], invoices } }].concat(outcomes));
    t.w.__navigate = () => {};
    t.w.eval(NAV_SCRIPT);
    await wait(60);
    return { t, calls };
  }
  {
    const { t } = await withInvoices(INVOICES, { toggle: true });
    const s = invSection(t.w);
    assert.ok(s, 'invoices section rendered');
    const rows = Array.from(s.querySelectorAll('.ordo-inv-row:not(.ordo-inv-head)')).map((r) => text(r));
    assert.deepStrictEqual(rows, [
      '14 sept. 2026 Médecine Générale 15 € Payée PDF',
      '1er sept. 2026 Module Rhumatologie 5 € Prélèvement en cours PDF',
      '14 août 2026 Abonnement 30 € À régler Régler',
    ]);
    assert.strictEqual(text(s.querySelector('.ordo-inv-head')), 'Date Abonnement Montant Statut Facture');
    assert.strictEqual(s.querySelectorAll('[role="row"]').length, 4);
    assert.ok(s.querySelector('.ordo-inv-tone-paid') && s.querySelector('.ordo-inv-tone-pending') && s.querySelector('.ordo-inv-tone-due'));
    assert.strictEqual(s.querySelectorAll('.ordo-inv-row')[3].querySelector('a.ordo-subs-link').getAttribute('href'), '/membership/moyen-de-paiement');
    assert.strictEqual(s.querySelector('button.ordo-inv-pdf').getAttribute('aria-label'), 'Télécharger la facture du 14 septembre 2026');
    // Order: subscriptions, payment method, invoices, help
    const order = Array.from(anchor(t.w).children).map((n) => n.className);
    assert.deepStrictEqual(order, ['ordo-subs', 'ordo-subs ordo-pm', 'ordo-subs ordo-inv', 'ordo-help']);
    // The page's invoices block gives way, and its invoice emails toggle moves into the section
    assert.strictEqual(t.w.document.getElementById('invoices-block').style.display, 'none');
    assert.strictEqual(t.relocated.length, 1);
    assert.ok(s.querySelector('.ordo-inv-emails #ordotype-invoice-emails'));
    // The billing portal stays one click away
    const more = Array.from(s.querySelectorAll('button.ordo-subs-link')).find((b) => b.textContent === 'Toutes mes factures et mes informations de facturation');
    more.click();
    assert.strictEqual(t.opened.length, 1);
    // Help box with icons: email, phone, videos
    const help = helpBox(t.w);
    assert.strictEqual(text(help), 'Une question sur votre abonnement ou vos factures ? comptabilite@ordotype.fr +33 (0)6 76 52 00 55 Appel non surtaxé Vidéo : ajouter un moyen de paiement Vidéo : obtenir mes factures');
    assert.strictEqual(help.querySelector('a[href="mailto:comptabilite@ordotype.fr"]').querySelectorAll('svg').length, 1);
    assert.ok(help.querySelector('a[href="tel:+33676520055"] svg'));
    assert.strictEqual(help.querySelectorAll('a.ordo-help-video svg').length, 2);
    assert.deepStrictEqual(t.erreurs, []);
    t.dom.window.close();
  }
  {
    // Without the portal hook, no dead link
    const { t } = await withInvoices(INVOICES, { portal: false });
    assert.ok(!text(invSection(t.w)).includes('Toutes mes factures'));
    t.dom.window.close();
  }
  {
    // Invoices unknown (the function could not read them): the page's block stays, no help box
    const { t } = await withInvoices(null);
    assert.strictEqual(invSection(t.w), null);
    assert.strictEqual(helpBox(t.w), null);
    assert.strictEqual(t.w.document.getElementById('invoices-block').style.display, '');
    t.dom.window.close();
  }
  {
    // No invoice at all: no section, the help box replaces the block
    const { t } = await withInvoices([]);
    assert.strictEqual(invSection(t.w), null);
    assert.ok(helpBox(t.w));
    assert.strictEqual(t.w.document.getElementById('invoices-block').style.display, 'none');
    t.dom.window.close();
  }
  {
    // The PDF is fetched through the function and saved under its dated name
    const pdf = Buffer.from('%PDF-1.4 facture').toString('base64');
    const { t, calls } = await withInvoices(INVOICES, { outcomes: [{ status: 200, body: { ok: true, filename: 'Facture-Ordotype-2026-09-14.pdf', pdf } }] });
    const blobs = [];
    const saved = [];
    t.w.URL.createObjectURL = (b) => { blobs.push(b); return 'blob:facture'; };
    t.w.URL.revokeObjectURL = () => {};
    t.w.HTMLAnchorElement.prototype.click = function() { saved.push({ href: this.getAttribute('href'), download: this.download }); };
    invSection(t.w).querySelector('button.ordo-inv-pdf').click();
    await wait(60);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[1].options.method, 'POST');
    assert.deepStrictEqual(JSON.parse(calls[1].options.body), { action: 'invoice_pdf', ref: 'aaaaaaaaaaaaaaaaaaaa' });
    assert.strictEqual(blobs.length, 1);
    assert.strictEqual(blobs[0].type, 'application/pdf');
    assert.strictEqual(Buffer.from(await blobs[0].arrayBuffer()).toString('latin1'), '%PDF-1.4 facture');
    assert.deepStrictEqual(saved, [{ href: 'blob:facture', download: 'Facture-Ordotype-2026-09-14.pdf' }]);
    assert.strictEqual(t.reported.length + t.network.length, 0);
    t.dom.window.close();
  }
  {
    // A failed download says so on the button, and is reported once
    const { t } = await withInvoices(INVOICES, { outcomes: [{ status: 502, body: { error: 'upstream_error' } }] });
    const btn = invSection(t.w).querySelector('button.ordo-inv-pdf');
    btn.click();
    await wait(60);
    assert.strictEqual(btn.lastChild.textContent, 'Réessayer');
    assert.ok(btn.getAttribute('title').startsWith('Téléchargement impossible'));
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(t.reported.length + t.network.length, 1);
    t.dom.window.close();
  }
  {
    // Labels are text; an invalid reference gets no download button
    const odd = [{ ref: 'not-a-ref', date: '2026-09-14', label: '<img src=x onerror=alert(1)>', amount: 100, currency: 'eur', status: 'paid', pdf: true }];
    const { t } = await withInvoices(odd);
    assert.strictEqual(invSection(t.w).querySelector('img'), null);
    assert.ok(text(invSection(t.w)).includes('<img src=x onerror=alert(1)>'));
    assert.strictEqual(invSection(t.w).querySelector('button.ordo-inv-pdf'), null);
    t.dom.window.close();
  }
  {
    // Resubscribing re-renders everything once: one invoices section, one help box, the toggle kept
    const canceling = Object.assign({}, CARDS[4], { reactivation: '0123456789abcdef0123' });
    const after = Object.assign({}, canceling, { status: 'active', reactivation: null, endsOn: null, next: { date: '2026-10-30', amount: 200 } });
    const { t } = await withInvoices(INVOICES, {
      toggle: true,
      list: [canceling],
      outcomes: [{ status: 200, body: { ok: true, subscriptions: [after], paymentMethods: [VISA], invoices: INVOICES } }],
    });
    cards(t.w)[0].querySelector('button').click();
    await wait(60);
    assert.strictEqual(t.w.document.querySelectorAll('.ordo-inv').length, 1);
    assert.strictEqual(t.w.document.querySelectorAll('.ordo-help').length, 1);
    assert.ok(invSection(t.w).querySelector('#ordotype-invoice-emails'), 'toggle moved into the new section');
    t.dom.window.close();
  }
  {
    // A later render without invoices gives the toggle back to the page's block, shown again
    const canceling = Object.assign({}, CARDS[4], { reactivation: '0123456789abcdef0123' });
    const after = Object.assign({}, canceling, { status: 'active', reactivation: null, endsOn: null, next: { date: '2026-10-30', amount: 200 } });
    const { t } = await withInvoices(INVOICES, {
      toggle: true,
      list: [canceling],
      outcomes: [{ status: 200, body: { ok: true, subscriptions: [after], paymentMethods: [VISA], invoices: null } }],
    });
    cards(t.w)[0].querySelector('button').click();
    await wait(60);
    const block = t.w.document.getElementById('invoices-block');
    assert.strictEqual(block.style.display, '');
    assert.ok(block.querySelector('#ordotype-invoice-emails'), 'toggle back in the block');
    assert.strictEqual(invSection(t.w), null);
    t.dom.window.close();
  }

  // On a load error the old section stays as the fallback, and so does the payment method block
  {
    const t = page();
    installFetch(t.w, [{ status: 502, body: { error: 'upstream_error' } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(t.w.document.getElementById('old-section').style.display, '');
    assert.strictEqual(t.w.document.getElementById('payment-method-block').style.display, '');
    t.dom.window.close();
  }

  // Card buttons: site link, page element, refused link
  {
    const t = page();
    const withActions = [
      Object.assign({}, CARDS[0], { label: 'MG', action: { label: 'Résilier', href: '#cancellation-warning-modal' } }),
      Object.assign({}, CARDS[3], { label: 'SP', action: { label: 'Voir les offres', href: '/nos-offres' } }),
      Object.assign({}, CARDS[3], { label: 'Piège', action: { label: 'Cliquer', href: '//evil.example/x' } }),
      Object.assign({}, CARDS[3], { label: 'Script', action: { label: 'Cliquer', href: 'javascript:alert(1)' } }),
    ];
    installFetch(t.w, [{ status: 200, body: { subscriptions: withActions } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    const btn = cards(t.w)[0].querySelector('.ordo-subs-actions button');
    assert.strictEqual(btn.textContent, 'Résilier');
    btn.click();
    assert.strictEqual(t.w.document.getElementById('cancellation-warning-modal').style.display, 'block');
    const link = cards(t.w)[1].querySelector('.ordo-subs-actions a');
    assert.strictEqual(link.textContent, 'Voir les offres');
    assert.strictEqual(link.getAttribute('href'), '/nos-offres');
    assert.strictEqual(cards(t.w)[2].querySelector('.ordo-subs-actions'), null);
    assert.strictEqual(cards(t.w)[3].querySelector('.ordo-subs-actions'), null);
    t.dom.window.close();
  }

  // Missing page element: reported, nothing thrown
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [Object.assign({}, CARDS[0], { action: { label: 'Résilier', href: '#absent' } })] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    cards(t.w)[0].querySelector('.ordo-subs-actions button').click();
    assert.strictEqual(t.reported.length, 1);
    t.dom.window.close();
  }

  // Pause cards: resume and definitive cancellation through the pause script
  {
    const t = page({ pause: { ok: true } });
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[6], CARDS[7]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    const [paused, scheduled] = cards(t.w);
    assert.ok(cardText(t.w, 0).endsWith('Annuler définitivement Reprendre mon abonnement'));
    assert.ok(scheduled.querySelector('.ordo-subs-actions'));
    paused.querySelector('.is-primary').click();
    await wait(20);
    assert.deepStrictEqual(t.pauseCalls, ['resume']);
    assert.ok(text(paused).includes('Votre abonnement a été réactivé !'));
    t.dom.window.close();
  }
  {
    const t = page({ pause: { ok: false }, confirmAnswer: false });
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[6]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    const buttons = cards(t.w)[0].querySelectorAll('button');
    buttons[0].click();
    assert.deepStrictEqual(t.pauseCalls, [], 'no call without confirmation');
    t.w.confirm = () => true;
    buttons[0].click();
    await wait(20);
    assert.deepStrictEqual(t.pauseCalls, ['cancel']);
    assert.ok(text(cards(t.w)[0]).includes('Une erreur est survenue. Merci de réessayer.'));
    assert.strictEqual(buttons[0].disabled, false);
    t.dom.window.close();
  }

  // Scheduled cancellation: resubscribe on the same subscription
  {
    const REF = '0123456789abcdef0123';
    const canceling = Object.assign({}, CARDS[4], { label: 'Stockage', reactivation: REF });
    const reactivated = Object.assign({}, CARDS[4], { label: 'Stockage', status: 'active', reactivation: null, endsOn: null, next: { date: '2026-10-30', amount: 200 } });
    const t = page({ confirmAnswer: false });
    const calls = installFetch(t.w, [
      { status: 200, body: { subscriptions: [canceling] } },
      { status: 200, body: { ok: true, subscriptions: [reactivated] } },
    ]);
    t.w.eval(SCRIPT);
    await wait(60);
    const btn = cards(t.w)[0].querySelector('.ordo-subs-actions button');
    assert.strictEqual(btn.textContent, 'Me réabonner');
    btn.click();
    await wait(20);
    assert.strictEqual(calls.length, 1, 'no call without confirmation');
    t.w.confirm = () => true;
    btn.click();
    await wait(60);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[1].options.method, 'POST');
    assert.strictEqual(calls[1].options.headers['Content-Type'], 'application/json');
    assert.strictEqual(calls[1].options.headers.Authorization, 'Bearer jeton-de-test');
    assert.deepStrictEqual(JSON.parse(calls[1].options.body), { action: 'reactivate', ref: REF });
    assert.ok(text(anchor(t.w)).includes('C’est fait : votre abonnement continue.'));
    assert.ok(cardText(t.w, 0).startsWith('Stockage Actif'));
    assert.strictEqual(cards(t.w)[0].querySelector('.ordo-subs-actions'), null);
    t.dom.window.close();
  }
  {
    const t = page();
    installFetch(t.w, [
      { status: 200, body: { subscriptions: [Object.assign({}, CARDS[4], { reactivation: '0123456789abcdef0123' })] } },
      { status: 409, body: { error: 'not_reactivable' } },
    ]);
    t.w.eval(SCRIPT);
    await wait(60);
    const btn = cards(t.w)[0].querySelector('.ordo-subs-actions button');
    btn.click();
    await wait(60);
    assert.ok(text(cards(t.w)[0]).includes('Ce réabonnement n’est pas possible depuis cette page : écrivez-nous.'));
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(t.reported.length, 0);
    t.dom.window.close();
  }
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [Object.assign({}, CARDS[4], { reactivation: 'sub_123' })] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(cards(t.w)[0].querySelector('.ordo-subs-actions'), null);
    t.dom.window.close();
  }

  // Without the pause script, no dead buttons
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[6]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(cards(t.w)[0].querySelector('.ordo-subs-actions'), null);
    t.dom.window.close();
  }

  // The failed-payment link does not depend on the billing portal hook
  {
    const t = page({ portal: false });
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[5]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(cards(t.w)[0].querySelector('a.ordo-subs-link').getAttribute('href'), '/membership/moyen-de-paiement');
    assert.ok(cardText(t.w, 0).endsWith('Paiement en échec Modifier le moyen de paiement'));
    assert.strictEqual(t.opened.length, 0);
  }

  // Empty list
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.ok(text(anchor(t.w)).endsWith('Vous n’avez pas d’abonnement en cours.'));
  }

  // Nothing is requested before the block is visible, and the block stays hidden until then
  {
    const t = page({ visible: false });
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(anchor(t.w).parentElement.style.display, 'none');
    assert.strictEqual(t.observer.target.className, 'tab-pane');
    t.observer.callback([{ target: t.observer.target, isIntersecting: true }]);
    await wait(60);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(cards(t.w).length, CARDS.length);
  }

  // A second copy of the script leaves an already filled block alone
  {
    const t = page({ prefilled: true });
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 0);
  }

  // Whitespace left in the embed is not a rendered block
  {
    const t = page({ whitespace: true });
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(cards(t.w).length, CARDS.length);
  }

  // One network failure is retried
  {
    const t = page();
    const calls = installFetch(t.w, [{ transport: 'Failed to fetch' }, { status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(600);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(cards(t.w).length, CARDS.length);
    assert.strictEqual(t.network.length, 0);
  }

  // Two network failures: hidden, reported as a network incident
  {
    const t = page();
    const calls = installFetch(t.w, [{ transport: 'Failed to fetch' }]);
    t.w.eval(SCRIPT);
    await wait(600);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(anchor(t.w).childNodes.length, 0);
    assert.strictEqual(t.network.length, 1);
  }

  // Server error: hidden, reported, not retried
  {
    const t = page();
    const calls = installFetch(t.w, [{ status: 502, body: { error: 'upstream_error' } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(t.reported.length, 1);
  }

  // Expected refusals: hidden, not reported
  for (const status of [401, 409, 429, 503]) {
    const t = page();
    installFetch(t.w, [{ status, body: { error: 'x' } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(anchor(t.w).style.display, 'none', `status ${status}`);
    assert.strictEqual(t.reported.length + t.network.length, 0, `status ${status}`);
  }

  // Unexpected body: hidden and reported
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { ok: true } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(t.reported.length, 1);
  }

  // Slow answer: a placeholder first, then the list
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS }, delay: 400 }]);
    t.w.eval(SCRIPT);
    await wait(300);
    assert.ok(t.w.document.querySelector('.ordo-subs-skel'));
    assert.strictEqual(anchor(t.w).style.display, '');
    await wait(300);
    assert.strictEqual(t.w.document.querySelector('.ordo-subs-skel'), null);
    assert.strictEqual(cards(t.w).length, CARDS.length);
  }

  console.log('subscriptions-overview: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
