#!/usr/bin/env node
/**
 * Paiement automatique après inscription, offre dont la remise est accordée par le
 * serveur : quand la page de l'offre a laissé `signup-server-offer` lié à sa propre
 * adresse, le paiement présente l'offre et le code au lieu d'un coupon, et aucun
 * échec ne retombe sur un paiement au plein tarif. Sans relais valable, rien ne
 * change.
 *
 * La vraie page ne charge pas `OrdoErrorReporter` : les cas principaux tournent
 * aussi sans lui, sur le repli `dataLayer`.
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
const MEMBRE = { stripeCustomerId: 'cus_nouveau', id: 'mem_nouveau', auth: { email: 'confrere@exemple.fr' } };
const SESSION_OK = () => ({ ok: true, status: 200, json: () => Promise.resolve({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/cs_test' }) });

function page({ cancelUrl = PAGE_OFFRE, relais = RELAIS, preflight = null, reply = SESSION_OK,
                reporter = true, membre = MEMBRE, cmsCancelUrl = '' } = {}) {
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navigations.push(e.message); });
  const dom = new JSDOM('<!doctype html><html><body><a id="checkoutStripe" href="#" class="button hidden">Payer</a></body></html>',
    { url: ORIGIN + '/inscription-en-cours/validation', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  const ls = w.localStorage;
  ls.setItem('_ms-mem', JSON.stringify(membre));
  ls.setItem('signup-price-id', 'price_praticien');
  ls.setItem('signup-coupon-id', 'COUPON_PAGE');
  ls.setItem('signup-cancel-url', cancelUrl);
  ls.setItem('signup-success-url', ORIGIN + '/membership/mes-informations');
  ls.setItem('signup-payment-methods', 'sepa_debit');
  if (relais !== null) ls.setItem('signup-server-offer', typeof relais === 'string' ? relais : JSON.stringify(relais));
  w.CMS_CHECKOUT_CONFIG = { priceId: '', couponId: '', successUrl: '', cancelUrl: cmsCancelUrl, paymentMethods: ['sepa_debit', 'card'], option: '' };

  const rapports = [];
  if (reporter) {
    w.OrdoErrorReporter = {
      report: (ctx, err) => rapports.push(String((err && err.message) || err)),
      reportSideEffect: (ctx, err) => rapports.push(String((err && err.message) || err)),
      track: (payload) => { w.dataLayer = w.dataLayer || []; w.dataLayer.push(payload); },
    };
  } else {
    w.addEventListener('error', (e) => rapports.push(e.message));
  }
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Promise.resolve(reply());
  };
  if (preflight === 'ok') {
    w.__checkoutSessionPromise = Promise.resolve(SESSION_OK());
  } else if (preflight === 'rejet') {
    w.__checkoutSessionPromise = Promise.reject(new Error('pré-vol en échec'));
  }
  // L'adresse de retour se lit sur les URL construites par le script : jsdom ne
  // laisse ni lire ni intercepter la navigation elle-même.
  const urls = [];
  const RealURL = w.URL;
  w.URL = class extends RealURL { toString() { const s = super.toString(); urls.push(s); return s; } };
  w.navigator.sendBeacon = () => true;
  const events = () => (w.dataLayer || []);
  return { w, calls, events, rapports, navigations, urls };
}

const INCHANGEE = (cancelUrl) => ({
  stripeCustomerId: 'cus_nouveau',
  priceId: 'price_praticien',
  couponId: 'COUPON_PAGE',
  successUrl: ORIGIN + '/membership/mes-informations',
  cancelUrl,
  payment_method_types: ['sepa_debit'],
});
const bouton = (w) => w.document.getElementById('checkoutStripe').style.display;

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test('relais de la page : l’offre et le code partent au serveur, jamais un coupon (avec et sans OrdoErrorReporter)', async () => {
  for (const reporter of [true, false]) {
    const { w, calls, events, navigations } = page({ reporter });
    w.eval(SCRIPT);
    await tick();
    assert.strictEqual(calls.length, 1, `reporter=${reporter}`);
    assert.deepStrictEqual(calls[0].body, {
      offer: 'offre-serveur',
      promotionCode: 'CODE42',
      memberId: 'mem_nouveau',
      stripeCustomerId: 'cus_nouveau',
      priceId: 'price_praticien',
      successUrl: ORIGIN + '/membership/mes-informations',
      cancelUrl: PAGE_OFFRE,
      payment_method_types: ['sepa_debit'],
    }, `reporter=${reporter}`);
    assert.strictEqual(navigations.length, 1, 'redirection vers Stripe');
    const clic = events().find((e) => e.event === 'stripe_signup_click');
    assert.ok(clic && clic.offer === 'offre-serveur', `offre mesurée au clic, reporter=${reporter}`);
  }
});

test('relais de la page : le pré-vol n’est jamais réutilisé, et son rejet est absorbé', async () => {
  for (const preflight of ['ok', 'rejet']) {
    const { w, calls } = page({ preflight });
    w.eval(SCRIPT);
    await tick();
    assert.strictEqual(calls.length, 1, preflight);
    assert.strictEqual(calls[0].body.offer, 'offre-serveur', preflight);
  }
});

test('relais présent mais une autre offre a pris la main, ou adresse de retour fixée par le CMS : requête inchangée', async () => {
  let { w, calls } = page({ cancelUrl: AUTRE_OFFRE });
  w.eval(SCRIPT);
  await tick();
  assert.deepStrictEqual(calls[0].body, INCHANGEE(AUTRE_OFFRE));

  ({ w, calls } = page({ cancelUrl: AUTRE_OFFRE, preflight: 'ok' }));
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 0, 'le pré-vol reste réutilisé');

  const cms = ORIGIN + '/inscription-non-terminee/praticien-sepa';
  ({ w, calls } = page({ cmsCancelUrl: cms }));
  w.eval(SCRIPT);
  await tick();
  assert.deepStrictEqual(calls[0].body, INCHANGEE(cms), 'le cancelUrl du CMS prime sur le relais');
});

test('pas de relais, ou relais illisible ou incomplet : requête inchangée', async () => {
  for (const relais of [null, 'pas du json', JSON.stringify({ offer: 'offre-serveur', page: PAGE_OFFRE }), JSON.stringify({ promotionCode: 'X', page: PAGE_OFFRE })]) {
    const { w, calls } = page({ relais });
    w.eval(SCRIPT);
    await tick();
    assert.deepStrictEqual(calls[0].body, INCHANGEE(PAGE_OFFRE), String(relais));
  }
});

test('refus du serveur (eligible:false) : relais retiré, retour à la page de l’offre avec la raison, jamais de repli', async () => {
  const { w, events, navigations, urls } = page({
    reply: () => ({ ok: false, status: 403, json: () => Promise.resolve({ eligible: false, reason: 'used' }) }),
  });
  w.eval(SCRIPT);
  await tick();
  assert.ok(events().some((e) => e.event === 'offer_refused' && e.offer === 'offre-serveur' && e.reason === 'used'));
  assert.ok(!events().some((e) => e.event === 'checkout_failed'));
  assert.strictEqual(w.localStorage.getItem('signup-server-offer'), null, 'relais d’un code refusé retiré');
  assert.ok(urls.includes(PAGE_OFFRE + '&refus=used'), urls.join(' | '));
  assert.strictEqual(navigations.length, 1);
  assert.notStrictEqual(bouton(w), 'flex', 'bouton de repli jamais montré');
});

test('panne avec un relais (403 sans verdict, 500, réseau) : signalée, retour à la page de l’offre, jamais le bouton mort', async () => {
  const pannes = {
    '403 html': () => ({ ok: false, status: 403, json: () => Promise.reject(new Error('pas du JSON')), text: () => Promise.resolve('<html>') }),
    '403 json sans verdict': () => ({ ok: false, status: 403, json: () => Promise.resolve({ message: 'Forbidden' }), text: () => Promise.resolve('{}') }),
    '500': () => ({ ok: false, status: 500, json: () => Promise.resolve({ error: 'x' }), text: () => Promise.resolve('boom') }),
    'réseau': () => { throw new TypeError('Failed to fetch'); },
  };
  for (const [nom, reply] of Object.entries(pannes)) {
    const { w, events, rapports, navigations } = page({ reply, reporter: nom !== '500' });
    w.eval(SCRIPT);
    await tick();
    assert.ok(events().some((e) => e.event === 'checkout_failed'), nom);
    assert.ok(!events().some((e) => e.event === 'offer_refused'), nom);
    assert.ok(rapports.length >= 1, `panne signalée : ${nom}`);
    assert.strictEqual(w.localStorage.getItem('signup-server-offer') !== null, true, `relais conservé : ${nom}`);
    assert.strictEqual(navigations.length, 1, `retour à la page de l’offre : ${nom}`);
    assert.notStrictEqual(bouton(w), 'flex', `bouton mort jamais montré : ${nom}`);
  }
});

test('client Stripe pas encore écrit : avec un relais, le serveur le retrouve depuis le membre ; sans relais, abandon comme avant', async () => {
  const sansClient = { id: 'mem_nouveau', auth: { email: 'confrere@exemple.fr' } };
  let { w, calls, events } = page({ membre: sansClient });
  w.eval(SCRIPT);
  await tick(2300);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.stripeCustomerId, null);
  assert.strictEqual(calls[0].body.memberId, 'mem_nouveau');
  assert.ok(!events().some((e) => e.failure_reason === 'no_customer_id'));

  ({ w, calls, events } = page({ membre: sansClient, relais: null }));
  w.eval(SCRIPT);
  await tick(2300);
  assert.strictEqual(calls.length, 0);
  assert.ok(events().some((e) => e.failure_reason === 'no_customer_id'));
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
