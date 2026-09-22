#!/usr/bin/env node
/**
 * Checkout : quand la fonction répond 409 (déjà abonné à la famille de l'offre, ou
 * paiement en attente), la page transforme le bouton Stripe en lien vers le compte
 * et ne bascule jamais sur le bouton Memberstack, qui créerait un second
 * abonnement. Sur une vraie erreur (500), le repli d'avant reste intact.
 *
 * Couvre shared/stripe-checkout.js (pages d'offre) et pricing/ + pricing-v2/
 * (deux boutons par page).
 *
 * Usage : node test/stripe-checkout-already-subscribed.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SHARED = lire('shared/stripe-checkout.js');
const PRICING = { 'pricing': lire('pricing/stripe-checkout.js'), 'pricing-v2': lire('pricing-v2/stripe-checkout.js') };

const BOUTON = (id, extra = '') => `<a id="${id}" class="button" href="#"${extra}><div class="button-content outer"><div>En profiter</div></div></a>`;
const GABARIT_OFFRE = `<!doctype html><html><head></head><body>
  ${BOUTON('signup-rempla-from-decouverte')}
  ${BOUTON('signup-rempla-stripe-customer')}
</body></html>`;
const GABARIT_PRICING = `<!doctype html><html><head></head><body>
  ${BOUTON('signup-prat-from-decouverte')}
  ${BOUTON('signup-rempla-from-decouverte')}
  ${BOUTON('signup-prat-stripe-customer', ' data-price="price_prat" data-coupon="C1"')}
  ${BOUTON('signup-rempla-stripe-customer', ' data-price="price_rempla" data-coupon="C2"')}
</body></html>`;

function page(gabarit, reponse, url) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(gabarit, { url, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.console.error = () => {};
  w.OrdoMemberstack = { stripeCustomerId: 'cus_test', memberId: 'mem_test', email: 'test@example.com' };
  w.STRIPE_CHECKOUT_CONFIG = { priceId: 'price_rempla', couponId: 'C2', paymentMethods: ['sepa_debit'] };
  w.OrdoErrorReporter = { report: () => {} };
  w.dataLayer = [];
  const clics = [];
  for (const a of w.document.querySelectorAll('a')) a.addEventListener('click', (e) => { e.preventDefault(); clics.push(a.id); });
  w.fetch = () => Promise.resolve({ ok: reponse.status < 300, status: reponse.status, json: () => Promise.resolve(reponse.body) });
  w.navigator.sendBeacon = () => true;
  return { w, clics };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const texte = (el) => el.textContent.trim();
const visible = (el) => el.style.display !== 'none';
const echecs = (w) => w.dataLayer.filter((e) => e.event === 'checkout_failed').map((e) => e.failure_reason);

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const OFFRE = 'https://www.ordotype.fr/inscription-offre-speciale/une-offre';

test('page d’offre, déjà abonné : lien « Mon offre actuelle » vers le compte, pas de bouton Memberstack', async () => {
  const { w, clics } = page(GABARIT_OFFRE, { status: 409, body: { error: 'already-subscribed' } }, OFFRE);
  w.ORDO_PENDING_CHECKOUT_CLICK = true;
  w.eval(SHARED);
  await tick();
  const stripe = w.document.getElementById('signup-rempla-stripe-customer');
  const ms = w.document.getElementById('signup-rempla-from-decouverte');
  assert.strictEqual(texte(stripe), 'Mon offre actuelle');
  assert.strictEqual(stripe.getAttribute('href'), '/membership/compte');
  assert.ok(visible(stripe));
  assert.ok(!visible(ms));
  assert.deepStrictEqual(clics, [], 'aucun clic rejoué, surtout pas sur le bouton Memberstack');
  assert.strictEqual(w.ORDO_PENDING_CHECKOUT_CLICK, false);
  assert.deepStrictEqual(echecs(w), ['already_subscribed']);
});

test('page d’offre, paiement en attente : « Régulariser mon paiement »', async () => {
  const { w } = page(GABARIT_OFFRE, { status: 409, body: { error: 'payment-pending' } }, OFFRE);
  w.eval(SHARED);
  await tick();
  const stripe = w.document.getElementById('signup-rempla-stripe-customer');
  assert.strictEqual(texte(stripe), 'Régulariser mon paiement');
  assert.strictEqual(stripe.getAttribute('href'), '/membership/compte');
  assert.deepStrictEqual(echecs(w), ['payment_pending']);
});

test('page d’offre, corps de 409 illisible : lien vers le compte quand même', async () => {
  const { w } = page(GABARIT_OFFRE, { status: 409, body: null }, OFFRE);
  w.eval(SHARED);
  await tick();
  assert.strictEqual(texte(w.document.getElementById('signup-rempla-stripe-customer')), 'Mon offre actuelle');
});

test('page d’offre, erreur 500 : le repli Memberstack d’avant, clic rejoué compris', async () => {
  const { w, clics } = page(GABARIT_OFFRE, { status: 500, body: { error: 'boom' } }, OFFRE);
  w.ORDO_PENDING_CHECKOUT_CLICK = true;
  w.eval(SHARED);
  await tick();
  assert.ok(visible(w.document.getElementById('signup-rempla-from-decouverte')));
  assert.ok(!visible(w.document.getElementById('signup-rempla-stripe-customer')));
  assert.deepStrictEqual(clics, ['signup-rempla-from-decouverte']);
  assert.deepStrictEqual(echecs(w), ['api_500']);
});

test('page d’offre, session créée : le bouton reste « En profiter »', async () => {
  const { w } = page(GABARIT_OFFRE, { status: 200, body: { sessionId: 'cs', url: 'https://checkout.stripe.com/cs' } }, OFFRE);
  w.eval(SHARED);
  await tick();
  const stripe = w.document.getElementById('signup-rempla-stripe-customer');
  assert.strictEqual(texte(stripe), 'En profiter');
  assert.strictEqual(stripe.getAttribute('href'), '#');
  assert.deepStrictEqual(echecs(w), []);
});

for (const [nom, code] of Object.entries(PRICING)) {
  test(`${nom}, déjà abonné : les deux boutons mènent au compte, aucun bouton Memberstack`, async () => {
    const { w, clics } = page(GABARIT_PRICING, { status: 409, body: { error: 'already-subscribed' } }, `https://www.ordotype.fr/${nom === 'pricing' ? 'nos-offres' : 'nos-offres-v2'}`);
    w.eval(code);
    await tick();
    for (const id of ['signup-prat-stripe-customer', 'signup-rempla-stripe-customer']) {
      const b = w.document.getElementById(id);
      assert.strictEqual(texte(b), 'Mon offre actuelle', id);
      assert.strictEqual(b.getAttribute('href'), '/membership/compte', id);
      assert.ok(visible(b), id);
    }
    for (const id of ['signup-prat-from-decouverte', 'signup-rempla-from-decouverte']) {
      assert.ok(!visible(w.document.getElementById(id)), id);
    }
    assert.deepStrictEqual(clics, []);
    assert.deepStrictEqual(echecs(w), ['already_subscribed']);
  });

  test(`${nom}, paiement en attente : « Régulariser mon paiement »`, async () => {
    const { w } = page(GABARIT_PRICING, { status: 409, body: { error: 'payment-pending' } }, 'https://www.ordotype.fr/nos-offres');
    w.eval(code);
    await tick();
    assert.strictEqual(texte(w.document.getElementById('signup-prat-stripe-customer')), 'Régulariser mon paiement');
    assert.deepStrictEqual(echecs(w), ['payment_pending']);
  });

  test(`${nom}, erreur 500 : repli Memberstack d’avant`, async () => {
    const { w } = page(GABARIT_PRICING, { status: 500, body: {} }, 'https://www.ordotype.fr/nos-offres');
    w.eval(code);
    await tick();
    assert.ok(visible(w.document.getElementById('signup-prat-from-decouverte')));
    assert.ok(!visible(w.document.getElementById('signup-prat-stripe-customer')));
    assert.deepStrictEqual(echecs(w), ['api_500']);
  });
}

(async () => {
  let ko = 0;
  for (const { nom, fn } of cas) {
    try {
      await fn();
      console.log(`ok   ${nom}`);
    } catch (e) {
      ko += 1;
      console.log(`FAIL ${nom}\n     ${e.message}`);
    }
  }
  console.log(`\n${cas.length - ko}/${cas.length} cas passent`);
  process.exit(ko ? 1 : 0);
})();
