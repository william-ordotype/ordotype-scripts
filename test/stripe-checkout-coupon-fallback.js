#!/usr/bin/env node
/**
 * Checkout partagé : le coupon de repli sert encore quand la page n'en donne pas,
 * mais il le signale, et il ne signale rien quand la page porte son coupon.
 *
 * Usage : node test/stripe-checkout-coupon-fallback.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CHECKOUT = fs.readFileSync(path.join(ROOT, 'shared/stripe-checkout.js'), 'utf8');
const PAGE = 'https://www.ordotype.fr/inscription-offre-speciale/6-mois-offerts-reactivation';
const REPLI = 'IJqN4FxB';

const GABARIT = `<!doctype html><html><head></head><body>
  <a id="signup-rempla-from-decouverte" class="button" href="#"><div>En profiter</div></a>
  <a id="signup-rempla-stripe-customer" class="button" href="#"><div>En profiter</div></a>
</body></html>`;

function page({ config = {}, member = { stripeCustomerId: 'cus_test', memberId: 'mem_test', email: 'test@ordotype.fr' } } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(GABARIT, { url: PAGE, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  if (member) w.OrdoMemberstack = member;
  w.STRIPE_CHECKOUT_CONFIG = Object.assign({
    priceId: 'price_praticien',
    paymentMethods: ['sepa_debit'],
    successUrl: 'https://www.ordotype.fr/membership/mes-informations',
  }, config);
  const rapports = [];
  w.OrdoErrorReporter = { report: (contexte, erreur) => rapports.push(String(erreur && erreur.message || erreur)) };
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/cs_test' }) });
  };
  w.navigator.sendBeacon = () => true;
  return { w, rapports, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test('champ coupon vide : le repli sert et il le signale', async () => {
  for (const config of [{}, { couponId: '' }]) {
    const { w, rapports, calls } = page({ config });
    w.eval(CHECKOUT);
    await tick();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].body.couponId, REPLI);
    assert.strictEqual(rapports.length, 1);
    assert.ok(rapports[0].includes(REPLI), rapports[0]);
    assert.ok(rapports[0].includes('/inscription-offre-speciale/6-mois-offerts-reactivation'), rapports[0]);
  }
});

test('coupon de la page : aucun signalement', async () => {
  const { w, rapports, calls } = page({ config: { couponId: 'y9oEPETj' } });
  w.eval(CHECKOUT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.couponId, 'y9oEPETj');
  assert.deepStrictEqual(rapports, []);
});

test('sans client Stripe : ni session ni signalement', async () => {
  const { w, rapports, calls } = page({ member: { memberId: 'mem_test' } });
  w.eval(CHECKOUT);
  await tick();
  assert.deepStrictEqual(calls, []);
  assert.deepStrictEqual(rapports, []);
});

test('le repli reste signalé si le canal d erreurs manque', async () => {
  const { w, calls } = page();
  const erreurs = [];
  delete w.OrdoErrorReporter;
  w.addEventListener('error', (e) => erreurs.push(e.message));
  w.eval(CHECKOUT);
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(erreurs.length, 1);
  assert.ok(erreurs[0].includes(REPLI), erreurs[0]);
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
