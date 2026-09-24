#!/usr/bin/env node
/**
 * Paiement automatique après inscription, offre perdue en route : la fiche ne fixe
 * ni prix ni retour et la page de l'offre n'a laissé aucune clé. Au lieu de partir
 * au prix par défaut sans coupon, le paiement signale la perte et renvoie, une seule
 * fois, à la page d'offre d'où vient l'inscription. Les parcours qui ont leurs clés,
 * même un prix vide, ne changent pas.
 *
 * Usage : node test/inscription-en-cours-offre-perdue.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'inscription-en-cours/auto-checkout.js'), 'utf8');
const ORIGIN = 'https://www.ordotype.fr';
const VALIDATION = ORIGIN + '/inscription-en-cours/validation';
const PAGE_OFFRE = ORIGIN + '/inscription-offre-speciale/3';
const MEMBRE = { stripeCustomerId: 'cus_nouveau', id: 'mem_nouveau', auth: { email: 'confrere@exemple.fr' } };
const SESSION_OK = () => ({ ok: true, status: 200, json: () => Promise.resolve({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/cs_test' }) });

const CLES_OFFRE = {
  'signup-price-id': 'price_praticien',
  'signup-coupon-id': 'COUPON_PAGE',
  'signup-cancel-url': PAGE_OFFRE,
  'signup-success-url': ORIGIN + '/membership/mes-informations',
  'signup-payment-methods': 'sepa_debit',
};

function page({ referrer = PAGE_OFFRE, cles = {}, cms = {}, reporter = true } = {}) {
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navigations.push(e.message); });
  const dom = new JSDOM('<!doctype html><html><body><a id="checkoutStripe" href="#" class="button hidden">Payer</a></body></html>',
    { url: VALIDATION, referrer: referrer || undefined, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.localStorage.setItem('_ms-mem', JSON.stringify(MEMBRE));
  for (const [k, v] of Object.entries(cles)) w.localStorage.setItem(k, v);
  w.CMS_CHECKOUT_CONFIG = Object.assign(
    { priceId: '', couponId: '', successUrl: '', cancelUrl: '', paymentMethods: ['sepa_debit', 'card'], option: '' }, cms);

  const rapports = [];
  if (reporter) {
    w.OrdoErrorReporter = {
      report: (ctx, err) => rapports.push(err),
      reportSideEffect: (ctx, err) => rapports.push(err),
      track: (payload) => { w.dataLayer = w.dataLayer || []; w.dataLayer.push(payload); },
    };
  } else {
    w.addEventListener('error', (e) => rapports.push(e.error || new Error(e.message)));
  }
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Promise.resolve(SESSION_OK());
  };
  // La destination se lit sur les URL construites par le script : jsdom ne laisse
  // ni lire ni intercepter la navigation elle-même.
  const urls = [];
  const RealURL = w.URL;
  w.URL = class extends RealURL { toString() { const s = super.toString(); urls.push(s); return s; } };
  w.navigator.sendBeacon = () => true;
  const events = () => (w.dataLayer || []);
  const pertes = () => rapports.filter((e) => e && e.name === 'OfferLostBeforeCheckout');
  return { w, calls, events, rapports, pertes, navigations, urls };
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test('clés absentes, venue d’une page d’offre : aucun paiement, perte signalée, retour à la page marquée (avec et sans OrdoErrorReporter)', async () => {
  for (const reporter of [true, false]) {
    const { w, calls, events, pertes, navigations, urls } = page({ reporter });
    w.eval(SCRIPT);
    await tick();
    assert.strictEqual(calls.length, 0, `aucune session au prix par défaut, reporter=${reporter}`);
    assert.strictEqual(pertes().length, 1, `perte signalée, reporter=${reporter}`);
    assert.ok(/retour à \/inscription-offre-speciale\/3/.test(pertes()[0].message), pertes()[0].message);
    if (reporter) assert.ok(events().some((e) => e.event === 'checkout_failed' && e.failure_reason === 'offer_lost'));
    assert.ok(urls.includes(PAGE_OFFRE + '?reprise-paiement=1'), urls.join(' | '));
    assert.strictEqual(navigations.length, 1, 'une seule navigation, vers la page de l’offre');
  }
});

test('la page de l’offre renvoie encore sans clés : pas de boucle, paiement comme avant, perte signalée', async () => {
  const { w, calls, pertes } = page({ referrer: PAGE_OFFRE + '?reprise-paiement=1' });
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.priceId, '');
  assert.strictEqual(pertes().length, 1);
  assert.ok(/pas de page d’offre/.test(pertes()[0].message), pertes()[0].message);
});

test('clés absentes sans page d’offre en provenance (autre page, autre site, aucune) : paiement comme avant, perte signalée', async () => {
  for (const referrer of [ORIGIN + '/nos-offres', 'https://mail.google.com/', null]) {
    const { w, calls, pertes } = page({ referrer });
    w.eval(SCRIPT);
    await tick();
    assert.strictEqual(calls.length, 1, String(referrer));
    assert.strictEqual(pertes().length, 1, String(referrer));
  }
});

test('clés présentes, même un prix vide (fiche sans stripepriceid) : requête inchangée, rien de signalé', async () => {
  for (const prix of ['price_praticien', '']) {
    const { w, calls, pertes } = page({ cles: Object.assign({}, CLES_OFFRE, { 'signup-price-id': prix }) });
    w.eval(SCRIPT);
    await tick();
    assert.strictEqual(calls.length, 1, `prix=${prix}`);
    assert.deepStrictEqual(calls[0].body, {
      stripeCustomerId: 'cus_nouveau',
      priceId: prix,
      couponId: 'COUPON_PAGE',
      successUrl: ORIGIN + '/membership/mes-informations',
      cancelUrl: PAGE_OFFRE,
      payment_method_types: ['sepa_debit'],
    }, `prix=${prix}`);
    assert.strictEqual(pertes().length, 0, `prix=${prix}`);
  }
});

test('clés écrites mais retour vide : la page a passé le relais, rien de signalé', async () => {
  const { w, calls, pertes } = page({ cles: Object.assign({}, CLES_OFFRE, { 'signup-cancel-url': '' }) });
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.couponId, 'COUPON_PAGE');
  assert.strictEqual(pertes().length, 0);
});

test('fiche qui fixe son prix ou son retour (variantes /inscription-en-cours/*) : requête inchangée, rien de signalé', async () => {
  for (const cms of [{ priceId: 'price_fiche' }, { cancelUrl: ORIGIN + '/inscription-non-terminee/praticien-sepa' }]) {
    const { w, calls, pertes } = page({ cms });
    w.eval(SCRIPT);
    await tick();
    assert.strictEqual(calls.length, 1, JSON.stringify(cms));
    assert.strictEqual(pertes().length, 0, JSON.stringify(cms));
  }
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
