#!/usr/bin/env node
/**
 * Paiement automatique après inscription : un confrère invité qui crée son compte
 * depuis la page parrainage paie avec son code d'invitation, jamais au plein tarif,
 * et les autres offres gardent exactement leur comportement.
 *
 * Usage : node test/inscription-en-cours-parrainage.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'inscription-en-cours/auto-checkout.js'), 'utf8');
const ORIGIN = 'https://www.ordotype.fr';
const PARRAINAGE = ORIGIN + '/inscription-offre-speciale/3-mois-50-parrainage';
const AUTRE_OFFRE = ORIGIN + '/inscription-offre-speciale/6-mois-offerts-reactivation-remplacants-septembre-2026';

function page({ cancelUrl = PARRAINAGE, code = 'CODE42', preflight = false, reply = null } = {}) {
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navigations.push(e.message); });
  const dom = new JSDOM('<!doctype html><html><body><a id="checkoutStripe" href="#">Payer</a></body></html>',
    { url: ORIGIN + '/inscription-en-cours/validation', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  const ls = w.localStorage;
  ls.setItem('_ms-mem', JSON.stringify({ stripeCustomerId: 'cus_nouveau', id: 'mem_nouveau', auth: { email: 'confrere@exemple.fr' } }));
  ls.setItem('signup-price-id', 'price_praticien');
  ls.setItem('signup-coupon-id', cancelUrl === PARRAINAGE ? '' : 'xOBC6UDL');
  ls.setItem('signup-cancel-url', cancelUrl);
  ls.setItem('signup-success-url', ORIGIN + '/membership/mes-informations');
  ls.setItem('signup-payment-methods', 'sepa_debit');
  if (code !== null) ls.setItem('ordo-parrainage-invitation', code);
  w.CMS_CHECKOUT_CONFIG = { priceId: '', couponId: '', successUrl: '', cancelUrl: '', paymentMethods: ['sepa_debit', 'card'], option: '' };

  const rapports = [];
  const events = [];
  w.OrdoErrorReporter = {
    report: (ctx, err) => rapports.push(String(err && err.message || err)),
    reportSideEffect: (ctx, err) => rapports.push(String(err && err.message || err)),
    track: (payload) => events.push(payload),
  };
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
  return { w, calls, events, rapports, navigations };
}

const tick = () => new Promise((r) => setTimeout(r, 30));
const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test('parrainage : le code part au serveur, jamais un coupon, et Stripe revient sur la page avec le code', async () => {
  const { w, calls, navigations } = page();
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].body, {
    offer: 'parrainage-3m',
    promotionCode: 'CODE42',
    memberId: 'mem_nouveau',
    stripeCustomerId: 'cus_nouveau',
    priceId: 'price_praticien',
    successUrl: ORIGIN + '/membership/mes-informations',
    cancelUrl: PARRAINAGE + '?invitation=CODE42',
    payment_method_types: ['sepa_debit'],
  });
  assert.ok(!('couponId' in calls[0].body));
  assert.strictEqual(navigations.length, 1, 'redirection vers Stripe');
});

test('parrainage : la session du pré-vol, créée sans le code, n’est jamais réutilisée', async () => {
  const { w, calls } = page({ preflight: true });
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 1, 'requête propre au parrainage');
  assert.strictEqual(calls[0].body.offer, 'parrainage-3m');
});

test('autre offre, code parrainage resté en mémoire : comportement inchangé', async () => {
  let { w, calls } = page({ cancelUrl: AUTRE_OFFRE });
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].body, {
    stripeCustomerId: 'cus_nouveau',
    priceId: 'price_praticien',
    couponId: 'xOBC6UDL',
    successUrl: ORIGIN + '/membership/mes-informations',
    cancelUrl: AUTRE_OFFRE,
    payment_method_types: ['sepa_debit'],
  });

  ({ w, calls } = page({ cancelUrl: AUTRE_OFFRE, preflight: true }));
  w.eval(SCRIPT);
  await tick();
  assert.strictEqual(calls.length, 0, 'le pré-vol reste réutilisé hors parrainage');
});

test('invitation refusée par le serveur : retour à la page de l’offre, jamais de repli au plein tarif', async () => {
  const { w, events, navigations } = page({
    reply: () => ({ ok: false, status: 403, json: () => Promise.resolve({ eligible: false, reason: 'already-paid' }) }),
  });
  w.eval(SCRIPT);
  await tick();
  assert.ok(events.some((e) => e.event === 'parrainage_refused' && e.reason === 'already-paid'));
  assert.ok(!events.some((e) => e.event === 'checkout_failed'));
  assert.strictEqual(w.document.getElementById('checkoutStripe').style.display, 'none', 'bouton de repli laissé masqué');
  assert.strictEqual(navigations.length, 1, 'retour à la page de l’offre');
});

test('page parrainage sans code en mémoire, ou code illisible : comportement inchangé, et signalé', async () => {
  for (const code of [null, '<script>', 'x']) {
    const { w, calls, rapports } = page({ code });
    w.eval(SCRIPT);
    await tick();
    assert.strictEqual(calls.length, 1, String(code));
    assert.ok(!('offer' in calls[0].body), String(code));
    assert.ok(rapports.some((r) => /parrainage sans code/.test(r)), String(code));
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
