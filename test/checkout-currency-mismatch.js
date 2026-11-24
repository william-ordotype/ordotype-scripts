#!/usr/bin/env node
/**
 * Checkout : membre facturé dans une autre devise que la page.
 *
 * Un client Stripe ne peut pas avoir d'abonnements dans deux devises. Quand la
 * fonction de checkout le détecte, elle répond 200
 * `{ reason: 'currency_mismatch', redirectUrl }` vers la page d'offres du pays
 * (comme /nos-offres). Les pages d'offre (shared/stripe-checkout.js) et le paiement
 * après inscription (inscription-en-cours/auto-checkout.js) y vont tout de suite :
 * ni repli sur le bouton Memberstack (même refus de Stripe), ni clic rejoué.
 * Mesuré par `checkout_failed` / `failure_reason: currency_mismatch`.
 * Une adresse hors www.ordotype.fr n'est jamais suivie.
 *
 * Usage : node test/checkout-currency-mismatch.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const avecNavigationLue = (source, appel) => {
  assert.ok(source.includes(appel), `appel introuvable dans le script : ${appel}`);
  return source.split(appel).join('window.__navigate(data.redirectUrl);');
};
const SHARED = avecNavigationLue(lire('shared/stripe-checkout.js'), 'window.location.href = data.redirectUrl;');
const AUTO = avecNavigationLue(lire('inscription-en-cours/auto-checkout.js'), 'window.location.replace(data.redirectUrl);');

const PAYS = 'https://www.ordotype.fr/abonnement/maroc';
const MISMATCH = { reason: 'currency_mismatch', currency: 'mad', redirectUrl: PAYS, url: PAYS };

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// --- pages d'offre (shared/stripe-checkout.js)
const BOUTON = (id) => `<a id="${id}" class="button" href="#"><div class="button-content outer"><div>En profiter</div></div></a>`;
const GABARIT_OFFRE = `<!doctype html><html><head></head><body>
  ${BOUTON('signup-rempla-from-decouverte')}
  ${BOUTON('signup-rempla-stripe-customer')}
</body></html>`;

function pageOffre(reponse) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(GABARIT_OFFRE, { url: 'https://www.ordotype.fr/inscription-offre-speciale/une-offre', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.console.error = () => {};
  w.OrdoMemberstack = { stripeCustomerId: 'cus_test', memberId: 'mem_test', email: 'test@example.com' };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('jeton-de-test') };
  w.STRIPE_CHECKOUT_CONFIG = { priceId: 'price_rempla', couponId: 'C2', paymentMethods: ['sepa_debit'] };
  w.OrdoErrorReporter = { report: () => {} };
  w.dataLayer = [];
  const clics = [];
  for (const a of w.document.querySelectorAll('a')) a.addEventListener('click', (e) => { e.preventDefault(); clics.push(a.id); });
  w.fetch = () => Promise.resolve({ ok: reponse.status < 300, status: reponse.status, json: () => Promise.resolve(reponse.body) });
  w.navigator.sendBeacon = () => true;
  const navigations = [];
  w.__navigate = (u) => navigations.push(u);
  return { w, clics, navigations };
}
const echecs = (w) => w.dataLayer.filter((e) => e.event === 'checkout_failed').map((e) => e.failure_reason);

test('page d’offre, client en dirhams : direction la page du pays, aucun repli Memberstack, clic gardé abandonné', async () => {
  const { w, clics, navigations } = pageOffre({ status: 200, body: MISMATCH });
  w.ORDO_PENDING_CHECKOUT_CLICK = true;
  w.eval(SHARED);
  await tick();
  assert.deepStrictEqual(navigations, [PAYS]);
  assert.deepStrictEqual(clics, [], 'aucun clic rejoué, surtout pas sur le bouton Memberstack');
  assert.strictEqual(w.ORDO_PENDING_CHECKOUT_CLICK, false);
  assert.deepStrictEqual(echecs(w), ['currency_mismatch']);
});

test('page d’offre, adresse hors www.ordotype.fr : jamais suivie, repli d’avant', async () => {
  const { w, navigations } = pageOffre({ status: 200, body: { ...MISMATCH, redirectUrl: 'https://autre-site.example/', url: 'https://autre-site.example/' } });
  w.eval(SHARED);
  await tick();
  assert.deepStrictEqual(navigations, []);
  assert.deepStrictEqual(echecs(w), ['invalid_payload']);
  assert.notStrictEqual(w.document.getElementById('signup-rempla-from-decouverte').style.display, 'none');
});

test('page d’offre, témoin : session créée, rien ne change', async () => {
  const { w, navigations } = pageOffre({ status: 200, body: { sessionId: 'cs', url: 'https://checkout.stripe.com/cs' } });
  w.eval(SHARED);
  await tick();
  assert.deepStrictEqual(navigations, []);
  assert.deepStrictEqual(echecs(w), []);
});

// --- paiement après inscription (inscription-en-cours/auto-checkout.js)
const ORIGIN = 'https://www.ordotype.fr';
const PAGE_OFFRE = ORIGIN + '/inscription-offre-speciale/3';
const CLES = {
  'signup-price-id': 'price_praticien',
  'signup-coupon-id': 'COUPON_PAGE',
  'signup-cancel-url': PAGE_OFFRE,
  'signup-success-url': ORIGIN + '/membership/mes-informations',
  'signup-payment-methods': 'sepa_debit',
};

function pageInscription(corps) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM('<!doctype html><html><body><a id="checkoutStripe" href="#" class="button hidden">Payer</a></body></html>',
    { url: ORIGIN + '/inscription-en-cours/validation', referrer: PAGE_OFFRE, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.localStorage.setItem('_ms-mem', JSON.stringify({ stripeCustomerId: 'cus_maroc', id: 'mem_maroc', auth: { email: 'confrere@exemple.fr' } }));
  for (const [k, v] of Object.entries(CLES)) w.localStorage.setItem(k, v);
  w.CMS_CHECKOUT_CONFIG = { priceId: '', couponId: '', successUrl: '', cancelUrl: '', paymentMethods: ['sepa_debit', 'card'], option: '' };
  const rapports = [];
  w.OrdoErrorReporter = {
    report: (ctx, err) => rapports.push(err),
    reportSideEffect: (ctx, err) => rapports.push(err),
    track: (payload) => { w.dataLayer = w.dataLayer || []; w.dataLayer.push(payload); },
  };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps), text: () => Promise.resolve(JSON.stringify(corps)) });
  w.navigator.sendBeacon = () => true;
  const navigations = [];
  w.__navigate = (u) => navigations.push(u);
  return { w, rapports, navigations, events: () => (w.dataLayer || []) };
}

test('paiement après inscription, client en dirhams : direction la page du pays, mesuré, aucune erreur signalée', async () => {
  const { w, rapports, navigations, events } = pageInscription(MISMATCH);
  w.eval(AUTO);
  await tick();
  assert.deepStrictEqual(navigations, [PAYS]);
  assert.ok(events().some((e) => e.event === 'checkout_failed' && e.failure_reason === 'currency_mismatch'), JSON.stringify(events()));
  assert.deepStrictEqual(rapports.map((e) => String(e && e.message)), [], 'pas une panne');
});

test('paiement après inscription, adresse hors www.ordotype.fr : jamais suivie', async () => {
  const { w, navigations } = pageInscription({ ...MISMATCH, redirectUrl: 'https://autre-site.example/' });
  w.eval(AUTO);
  await tick();
  assert.deepStrictEqual(navigations, []);
});

(async () => {
  let echecsTotal = 0;
  for (const { nom, fn } of cas) {
    try {
      await fn();
      console.log(`  ok     ${nom}`);
    } catch (e) {
      echecsTotal += 1;
      console.log(`  ECHEC  ${nom} : ${e.message}`);
    }
  }
  if (echecsTotal) {
    console.error(`\n${echecsTotal} cas en échec sur ${cas.length}.`);
    process.exit(1);
  }
  console.log(`\n${cas.length} cas vérifiés.`);
})();
