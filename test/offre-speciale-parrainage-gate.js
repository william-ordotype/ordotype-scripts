#!/usr/bin/env node
/**
 * Offre parrainage : la page n'accorde rien sans code d'invitation, transmet le code
 * au paiement sans coupon, et le chargeur remplace le checkout standard par le gate.
 *
 * Usage : node test/offre-speciale-parrainage-gate.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const GATE = fs.readFileSync(path.join(ROOT, 'inscription-offre-speciale/parrainage-gate.js'), 'utf8');
const LOADER = fs.readFileSync(path.join(ROOT, 'inscription-offre-speciale/loader.js'), 'utf8');
const PAGE = 'https://www.ordotype.fr/inscription-offre-speciale/3-mois-50-parrainage';
const FN = 'https://checkout.ordotype.fr/.netlify/functions/create-checkout-session';

const GABARIT = `<!doctype html><html><head></head><body>
  <div id="page-wrapper-connected"><div class="main-wrapper">
    <h2>3 mois à -50%</h2>
    <a id="not-connected-animation" class="button"><div>En profiter</div></a>
    <a id="signup-rempla-from-decouverte" class="button" href="#"><div>En profiter</div></a>
    <a id="signup-rempla-stripe-customer" class="button hidden" href="#"><div>En profiter</div></a>
  </div></div>
  <div id="page-wrapper-not-connected" class="hidden"></div>
</body></html>`;

function page({ query = '', stored = null, member = { stripeCustomerId: 'cus_filleul', memberId: 'mem_filleul' } } = {}) {
  const erreurs = [];
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (/navigation/i.test(e.message)) navigations.push(e.message);
    else erreurs.push(e.message);
  });
  const dom = new JSDOM(GABARIT, { url: PAGE + query, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  if (stored !== null) w.localStorage.setItem('ordo-parrainage-invitation', stored);
  if (member) w.OrdoMemberstack = member;
  w.STRIPE_CHECKOUT_CONFIG = {
    priceId: 'price_praticien',
    couponId: 'IJqN4FxB',
    paymentMethods: ['sepa_debit'],
    successUrl: 'https://www.ordotype.fr/membership/mes-informations',
  };
  w.scrollTo = () => {};
  const rapports = [];
  w.OrdoErrorReporter = { report: (name) => rapports.push(name) };
  return { w, erreurs, navigations, rapports };
}

function installFetch(w, respond) {
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return Promise.resolve(respond());
  };
  return calls;
}

const reply = (status, body) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
const tick = () => new Promise((r) => setTimeout(r, 20));
const $ = (w, id) => w.document.getElementById(id);
const screen = (w) => w.document.querySelector('[data-parrainage-screen]');
const events = (w) => (w.dataLayer || []).map((e) => e.event);
const click = (w, id) => $(w, id).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test("sans code d'invitation : écran réservé aux invités, aucun bouton de paiement", async () => {
  for (const options of [{}, { query: '?invitation=%3Cscript%3E' }, { query: '?invitation=ab' }, { stored: 'pas un code !' }]) {
    const { w } = page(options);
    const calls = installFetch(w, () => reply(200, {}));
    w.eval(GATE);
    await tick();
    assert.ok(screen(w), JSON.stringify(options));
    assert.ok(/réservée aux confrères invités/.test(screen(w).textContent), JSON.stringify(options));
    assert.strictEqual($(w, 'signup-rempla-stripe-customer'), null, JSON.stringify(options));
    assert.strictEqual(calls.length, 0);
    assert.ok(events(w).includes('parrainage_missing_invitation'));
  }
});

test('écran affiché : le fond va sur le conteneur de la page, pas seulement sur l’écran', async () => {
  const { w } = page();
  installFetch(w, () => reply(200, {}));
  w.eval(GATE);
  await tick();
  const style = w.document.getElementById('ordo-parrainage-css');
  assert.ok(/\.ordo-parrainage-ground\{background-color:/.test(style.textContent));
  assert.ok($(w, 'page-wrapper-connected').classList.contains('ordo-parrainage-ground'));

  const sansWrapper = page();
  sansWrapper.w.document.querySelector('.main-wrapper').remove();
  installFetch(sansWrapper.w, () => reply(200, {}));
  sansWrapper.w.eval(GATE);
  await tick();
  assert.ok(sansWrapper.w.document.body.classList.contains('ordo-parrainage-ground'), 'repli sans .main-wrapper');

  const avecCode = page({ query: '?invitation=CODE42' });
  installFetch(avecCode.w, () => reply(200, {}));
  avecCode.w.eval(GATE);
  await tick();
  assert.strictEqual($(avecCode.w, 'page-wrapper-connected').classList.contains('ordo-parrainage-ground'), false, 'aucun fond quand la page reste celle de l’offre');
});

test("code dans l'URL : gardé pour l'inscription, bouton Memberstack natif masqué, bouton de l'offre visible", async () => {
  const { w } = page({ query: '?invitation=CODE42' });
  installFetch(w, () => reply(200, {}));
  w.eval(GATE);
  await tick();
  assert.strictEqual(screen(w), null);
  assert.strictEqual(w.localStorage.getItem('ordo-parrainage-invitation'), 'CODE42');
  assert.strictEqual($(w, 'signup-rempla-from-decouverte').style.display, 'none');
  const btn = $(w, 'signup-rempla-stripe-customer');
  assert.strictEqual(btn.classList.contains('hidden'), false);
  assert.strictEqual(btn.style.display, 'flex');
  assert.notStrictEqual($(w, 'not-connected-animation').style.display, 'none', "l'inscription du confrère reste possible");
});

test('paiement : le code part au serveur, jamais un coupon, et la page redirige vers Stripe', async () => {
  const { w, navigations, erreurs } = page({ query: '?invitation=CODE42&utm_source=sendinblue' });
  const calls = installFetch(w, () => reply(200, { url: 'https://checkout.stripe.com/c/pay/cs_test' }));
  w.eval(GATE);
  await tick();
  click(w, 'signup-rempla-stripe-customer');
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, FN);
  assert.deepStrictEqual(calls[0].body, {
    offer: 'parrainage-3m',
    promotionCode: 'CODE42',
    memberId: null,
    stripeCustomerId: 'cus_filleul',
    priceId: 'price_praticien',
    payment_method_types: ['sepa_debit'],
    successUrl: 'https://www.ordotype.fr/membership/mes-informations',
    cancelUrl: PAGE + '?invitation=CODE42&utm_source=sendinblue',
  });
  assert.ok(!('couponId' in calls[0].body), 'aucun coupon envoyé par la page');
  assert.strictEqual(navigations.length, 1, 'redirection vers Stripe tentée');
  assert.ok(events(w).includes('stripe_signup_click'));
  assert.deepStrictEqual(erreurs, []);
});

test("retour après inscription sans query string : le code gardé sert, membre sans client Stripe en cache", async () => {
  const { w } = page({ stored: 'CODE42', member: { memberId: 'mem_nouveau' } });
  const calls = installFetch(w, () => reply(200, { url: 'https://checkout.stripe.com/c/pay/cs_test' }));
  w.eval(GATE);
  await tick();
  click(w, 'signup-rempla-stripe-customer');
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.promotionCode, 'CODE42');
  assert.strictEqual(calls[0].body.memberId, 'mem_nouveau');
  assert.strictEqual(calls[0].body.stripeCustomerId, null);
});

test('invitation refusée par le serveur : écran « plus valable », code oublié', async () => {
  const { w } = page({ query: '?invitation=USED01' });
  installFetch(w, () => reply(403, { eligible: false, reason: 'used' }));
  w.eval(GATE);
  await tick();
  click(w, 'signup-rempla-stripe-customer');
  await tick();
  assert.ok(screen(w) && /n’est plus valable/.test(screen(w).textContent));
  assert.strictEqual(w.localStorage.getItem('ordo-parrainage-invitation'), null);
  const refus = (w.dataLayer || []).find((e) => e.event === 'parrainage_refused');
  assert.strictEqual(refus && refus.reason, 'used');
});

test('panne du serveur : bouton « Réessayer », erreur rapportée, pas d’écran de refus', async () => {
  const { w, rapports } = page({ query: '?invitation=CODE42' });
  const calls = installFetch(w, () => reply(500, {}));
  w.eval(GATE);
  await tick();
  click(w, 'signup-rempla-stripe-customer');
  await tick();
  const btn = $(w, 'signup-rempla-stripe-customer');
  assert.strictEqual(btn.textContent.trim(), 'Réessayer');
  assert.strictEqual(btn.disabled, false);
  assert.deepStrictEqual(rapports, ['ParrainageCheckoutFailed']);
  assert.strictEqual(screen(w), null);
  assert.strictEqual(w.localStorage.getItem('ordo-parrainage-invitation'), 'CODE42');
  click(w, 'signup-rempla-stripe-customer');
  await tick();
  assert.strictEqual(calls.length, 2, 'un nouvel essai repart');
});

test('double clic : un seul appel ; sans identité Memberstack : aucun appel', async () => {
  let { w } = page({ query: '?invitation=CODE42' });
  let calls = installFetch(w, () => new Promise(() => {}));
  w.eval(GATE);
  await tick();
  click(w, 'signup-rempla-stripe-customer');
  click(w, 'signup-rempla-stripe-customer');
  await tick();
  assert.strictEqual(calls.length, 1);

  ({ w } = page({ query: '?invitation=CODE42', member: null }));
  calls = installFetch(w, () => reply(200, {}));
  w.eval(GATE);
  await tick();
  click(w, 'signup-rempla-stripe-customer');
  await tick();
  assert.strictEqual(calls.length, 0);
});

function chargeur({ slug, winback = false, stripeCustomer = true }) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(GABARIT, { url: PAGE, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.COUNTDOWN_CONFIG = { slug, expiresAutomatically: false };
  w.WINBACK_GATE = winback;
  w.CMS_CHECKOUT_CONFIG = { priceId: 'price_praticien', couponId: '', paymentMethods: ['sepa_debit'], option: 'offre-speciale' };
  if (stripeCustomer) w.localStorage.setItem('_ms-mem', JSON.stringify({ id: 'mem_x', stripeCustomerId: 'cus_x' }));
  w.eval(LOADER);
  const scripts = () => Array.from(w.document.querySelectorAll('script[src]')).map((s) => s.src.split('@main/')[1]);
  return { w, scripts };
}

test('chargeur : sur la page parrainage, le gate remplace le checkout standard et le compteur', async () => {
  let { w, scripts } = chargeur({ slug: '3-mois-50-parrainage' });
  await tick();
  assert.ok(scripts().includes('inscription-offre-speciale/parrainage-gate.js'), scripts().join(','));
  assert.ok(!scripts().includes('shared/stripe-checkout.js'));
  assert.ok(!scripts().includes('inscription-offre-speciale/countdown.js'));
  const evt = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  $(w, 'signup-rempla-from-decouverte').dispatchEvent(evt);
  assert.strictEqual(evt.defaultPrevented, false, 'aucun clic retenu en attendant stripe-checkout.js');

  ({ scripts } = chargeur({ slug: '6-mois-offerts-reactivation-remplacants-septembre-2026' }));
  await tick();
  assert.ok(scripts().includes('shared/stripe-checkout.js'));
  assert.ok(!scripts().includes('inscription-offre-speciale/parrainage-gate.js'));

  ({ scripts } = chargeur({ slug: '3-mois-50-parrainage', winback: true }));
  await tick();
  assert.ok(scripts().includes('inscription-offre-speciale/winback-gate.js'));
  assert.ok(!scripts().includes('inscription-offre-speciale/parrainage-gate.js'));
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
