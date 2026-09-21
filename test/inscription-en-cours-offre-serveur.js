#!/usr/bin/env node
/**
 * Paiement automatique après inscription, offre dont la remise est accordée par le
 * serveur : quand la page de l'offre a laissé `signup-server-offer` lié à sa propre
 * adresse, le paiement présente l'offre et le code au lieu d'un coupon. Sinon, ou
 * si une autre offre a pris la main depuis, rien ne change.
 *
 * Usage : node test/inscription-en-cours-offre-serveur.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'inscription-en-cours/auto-checkout.js'), 'utf8');
const ORIGIN = 'https://www.ordotype.fr';
const PAGE_OFFRE = ORIGIN + '/inscription-offre-speciale/offre-serveur?invitation=CODE42';
const AUTRE_OFFRE = ORIGIN + '/inscription-offre-speciale/autre-offre';
const RELAIS = { offer: 'offre-serveur', promotionCode: 'CODE42', page: PAGE_OFFRE };

function page({ cancelUrl = PAGE_OFFRE, relais = RELAIS, preflight = false, reply = null } = {}) {
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navigations.push(e.message); });
  const dom = new JSDOM('<!doctype html><html><body><a id="checkoutStripe" href="#">Payer</a></body></html>',
    { url: ORIGIN + '/inscription-en-cours/validation', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  const ls = w.localStorage;
  ls.setItem('_ms-mem', JSON.stringify({ stripeCustomerId: 'cus_nouveau', id: 'mem_nouveau', auth: { email: 'confrere@exemple.fr' } }));
  ls.setItem('signup-price-id', 'price_praticien');
  ls.setItem('signup-coupon-id', 'COUPON_PAGE');
  ls.setItem('signup-cancel-url', cancelUrl);
  ls.setItem('signup-success-url', ORIGIN + '/membership/mes-informations');
  ls.setItem('signup-payment-methods', 'sepa_debit');
  if (relais !== null) ls.setItem('signup-server-offer', typeof relais === 'string' ? relais : JSON.stringify(relais));
  w.CMS_CHECKOUT_CONFIG = { priceId: '', couponId: '', successUrl: '', cancelUrl: '', paymentMethods: ['sepa_debit', 'card'], option: '' };

  const events = [];
  w.OrdoErrorReporter = { report: () => {}, reportSideEffect: () => {}, track: (payload) => events.push(payload) };
  const calls = [];
  const repondre = reply || (() => ({ ok: true, status: 200, json: () => Promise.resolve({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/cs_test' }) }));
  w.fetch = (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Promise.resolve(repondre());
  };
  if (preflight) {
    w.__checkoutSessionPromise = Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ sessionId: 'cs_preflight', url: 'https://checkout.stripe.com/cs_preflight' }) });
  }
  w.navigator.sendBeacon = () => true;
  return { w, calls, events, navigations };
}

const INCHANGEE = (cancelUrl) => ({
  stripeCustomerId: 'cus_nouveau',
  priceId: 'price_praticien',
  couponId: 'COUPON_PAGE',
  successUrl: ORIGIN + '/membership/mes-informations',
  cancelUrl,
  payment_method_types: ['sepa_debit'],
});

const tick = () => new Promise((r) => setTimeout(r, 30));
const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test('relais de la page : l’offre et le code partent au serveur, jamais un coupon', async () => {
  const { w, calls, navigations } = page();
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].body, {
    offer: 'offre-serveur',
    promotionCode: 'CODE42',
    memberId: 'mem_nouveau',
    stripeCustomerId: 'cus_nouveau',
    priceId: 'price_praticien',
    successUrl: ORIGIN + '/membership/mes-informations',
    cancelUrl: PAGE_OFFRE,
    payment_method_types: ['sepa_debit'],
  });
  assert.strictEqual(navigations.length, 1, 'redirection vers Stripe');
});

test('relais de la page : le pré-vol, créé sans lui, n’est jamais réutilisé', async () => {
  const { w, calls } = page({ preflight: true });
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.offer, 'offre-serveur');
});

test('relais resté en mémoire mais une autre offre a pris la main : requête inchangée', async () => {
  let { w, calls } = page({ cancelUrl: AUTRE_OFFRE });
  w.eval(SCRIPT);
  await tick();
  assert.deepStrictEqual(calls[0].body, INCHANGEE(AUTRE_OFFRE));

  ({ w, calls } = page({ cancelUrl: AUTRE_OFFRE, preflight: true }));
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 0, 'le pré-vol reste réutilisé');
});

test('pas de relais, ou relais illisible ou incomplet : requête inchangée', async () => {
  for (const relais of [null, 'pas du json', JSON.stringify({ offer: 'offre-serveur', page: PAGE_OFFRE }), JSON.stringify({ promotionCode: 'X', page: PAGE_OFFRE })]) {
    const { w, calls } = page({ relais });
    w.eval(SCRIPT);
    await tick();
    assert.deepStrictEqual(calls[0].body, INCHANGEE(PAGE_OFFRE), String(relais));
  }
});

test('offre refusée par le serveur : retour à la page de l’offre, jamais de repli au plein tarif', async () => {
  const { w, events, navigations } = page({
    reply: () => ({ ok: false, status: 403, json: () => Promise.resolve({ eligible: false, reason: 'already-paid' }) }),
  });
  w.eval(SCRIPT);
  await tick();
  assert.ok(events.some((e) => e.event === 'offer_refused' && e.offer === 'offre-serveur' && e.reason === 'already-paid'));
  assert.ok(!events.some((e) => e.event === 'checkout_failed'));
  assert.strictEqual(w.document.getElementById('checkoutStripe').style.display, 'none', 'bouton de repli laissé masqué');
  assert.strictEqual(navigations.length, 1, 'retour à la page de l’offre');
});

(async () => {
  let echecs = 0;
  for (const { nom, fn } of cas) {
    try {
      await fn();
      console.log(`ok   ${nom}`);
    } catch (e) {
      echecs += 1;
      console.log(`FAIL ${nom}\n     ${e.message}`);
    }
  }
  console.log(`\n${cas.length - echecs}/${cas.length} cas passent`);
  process.exit(echecs ? 1 : 0);
})();
