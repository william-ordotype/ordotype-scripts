#!/usr/bin/env node
/**
 * Bouton Stripe cliqué AVANT que sa session existe.
 *
 * Le bouton s'affiche dès que le client Stripe est connu, mais la session n'arrive
 * qu'avec la réponse du serveur (une à quelques secondes). Avant ce correctif, un
 * clic dans cet intervalle ne faisait rien du tout, sans un mot. Il est désormais
 * gardé : « Patientez… » tout de suite, puis :
 *   - session prête  → Stripe, sans second clic ;
 *   - échec          → le bouton Memberstack de la même offre, cliqué pour lui ;
 *   - 409 abonné     → aucun départ (il ouvrirait un second abonnement), le bouton
 *                      devient le lien « Mon offre actuelle », qui doit rester cliquable.
 * Un double clic pendant l'attente ne part qu'une fois. Au retour arrière depuis
 * Stripe (page ressortie du cache), le bouton n'est plus figé sur « Patientez… ».
 * Chaque clic gardé pousse `checkout_click_held` (option, issue, attente).
 *
 * Couvre pricing/ et pricing-v2/ (/nos-offres, deux boutons) et
 * shared/stripe-checkout.js (fin d'internat, remplaçant 6 mois).
 *
 * Usage : node test/stripe-checkout-clic-avant-session.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const BOUTON = (id, extra = '') => `<a id="${id}" class="button" href="#"${extra}><div class="button-content outer"><div>Essayer gratuitement</div></div></a>`;
const GABARIT_PRICING = `<!doctype html><html><head></head><body>
  ${BOUTON('signup-prat-from-decouverte')}
  ${BOUTON('signup-rempla-from-decouverte')}
  ${BOUTON('signup-prat-stripe-customer', ' data-price="price_prat" data-coupon="C1"')}
  ${BOUTON('signup-rempla-stripe-customer', ' data-price="price_rempla" data-coupon="C2"')}
</body></html>`;
const GABARIT_OFFRE = `<!doctype html><html><head></head><body>
  ${BOUTON('signup-rempla-from-decouverte')}
  ${BOUTON('signup-rempla-stripe-customer')}
</body></html>`;

const SESSIONS_PRICING = { sessionId1: 'cs_prat', url1: 'https://checkout.stripe.com/c/cs_prat', sessionId2: 'cs_rempla', url2: 'https://checkout.stripe.com/c/cs_rempla' };
const SESSION_OFFRE = { sessionId: 'cs_offre', url: 'https://checkout.stripe.com/c/cs_offre' };

// Une page par script. `stripe` et `repli` : identifiants des boutons de l'offre
// testée ; `session` : l'identifiant de session que cette offre doit ouvrir.
const PAGES = [
  { nom: 'pricing', code: lire('pricing/stripe-checkout.js'), gabarit: GABARIT_PRICING, url: 'https://www.ordotype.fr/nos-offres',
    reponse: SESSIONS_PRICING, stripe: 'signup-rempla-stripe-customer', repli: 'signup-rempla-from-decouverte', option: 'rempla', session: 'cs_rempla', source: 'pricing' },
  { nom: 'pricing (praticien)', code: lire('pricing/stripe-checkout.js'), gabarit: GABARIT_PRICING, url: 'https://www.ordotype.fr/nos-offres',
    reponse: SESSIONS_PRICING, stripe: 'signup-prat-stripe-customer', repli: 'signup-prat-from-decouverte', option: 'praticien', session: 'cs_prat', source: 'pricing' },
  { nom: 'pricing-v2', code: lire('pricing-v2/stripe-checkout.js'), gabarit: GABARIT_PRICING, url: 'https://www.ordotype.fr/nos-offres-v2',
    reponse: SESSIONS_PRICING, stripe: 'signup-rempla-stripe-customer', repli: 'signup-rempla-from-decouverte', option: 'rempla', session: 'cs_rempla', source: 'pricing-v2' },
  { nom: 'shared', code: lire('shared/stripe-checkout.js'), gabarit: GABARIT_OFFRE, url: 'https://www.ordotype.fr/membership/fin-internat',
    reponse: SESSION_OFFRE, stripe: 'signup-rempla-stripe-customer', repli: 'signup-rempla-from-decouverte', option: 'fin-internat', session: 'cs_offre', source: 'shared' },
];

// La réponse du serveur est retenue jusqu'à `repondre()` : c'est la fenêtre
// pendant laquelle le bouton est visible sans session.
function page(p) {
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (/navigation/i.test(e.message)) navigations.push(e.message);
  });
  const dom = new JSDOM(p.gabarit, { url: p.url, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.console.error = () => {};
  w.OrdoMemberstack = { stripeCustomerId: 'cus_test', memberId: 'mem_test', email: 'test@example.com' };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('jeton-de-test') };
  w.STRIPE_CHECKOUT_CONFIG = { priceId: 'price_rempla', couponId: 'C2', paymentMethods: ['sepa_debit'], option: 'fin-internat' };
  w.OrdoErrorReporter = { report: () => {} };
  w.dataLayer = [];
  // Le corps des balises abandon-cart dit vers quelle session le membre part.
  const balises = [];
  w.Blob = function(parts) { this.parts = parts; };
  w.navigator.sendBeacon = (u, blob) => { balises.push(JSON.parse(blob.parts.join(''))); return true; };
  // Les clics réellement reçus par chaque bouton (repli compris).
  const clics = [];
  for (const a of w.document.querySelectorAll('a')) a.addEventListener('click', () => clics.push(a.id));
  let repondre;
  const reponseRetenue = new Promise((r) => { repondre = r; });
  w.fetch = () => reponseRetenue;
  return {
    w, clics, balises, navigations,
    repondre: (status, body) => repondre({ ok: status < 300, status, json: () => Promise.resolve(body) }),
    bouton: (id) => w.document.getElementById(id),
  };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const texte = (el) => el.textContent.trim();
const visible = (el) => el.style.display !== 'none';
const evts = (w, nom) => w.dataLayer.filter((e) => e.event === nom);
function cliquer(w, el) {
  const e = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

for (const p of PAGES) {
  test(`${p.nom} : clic avant la session → « Patientez… », puis Stripe sans second clic`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    await attendre(20);
    const btn = t.bouton(p.stripe);
    assert.ok(visible(btn), 'bouton Stripe visible avant la session');
    const e = cliquer(t.w, btn);
    assert.ok(e.defaultPrevented, 'le clic est pris en charge, pas laissé au lien « # »');
    assert.strictEqual(texte(btn), 'Patientez…');
    assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 0, 'rien ne part avant la session');
    assert.strictEqual(t.navigations.length, 0);
    await attendre(50);
    t.repondre(200, p.reponse);
    await attendre(20);
    const depart = evts(t.w, 'stripe_signup_click');
    assert.strictEqual(depart.length, 1);
    assert.strictEqual(depart[0].checkoutSessionId, p.session);
    assert.strictEqual(t.balises.length, 1);
    assert.strictEqual(t.balises[0].checkoutSessionId, p.session);
    assert.strictEqual(t.navigations.length, 1, 'une navigation vers Stripe');
    const garde = evts(t.w, 'checkout_click_held');
    assert.strictEqual(garde.length, 1);
    assert.strictEqual(garde[0].outcome, 'redirect');
    assert.strictEqual(garde[0].option, p.option);
    assert.strictEqual(garde[0].checkout_source, p.source);
    assert.ok(garde[0].wait_ms >= 40, `attente mesurée (${garde[0].wait_ms} ms)`);
    assert.ok(btn.querySelector('.button-content'), 'la structure du bouton est conservée');
  });

  test(`${p.nom} : double clic pendant l'attente → un seul départ`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    await attendre(20);
    const btn = t.bouton(p.stripe);
    cliquer(t.w, btn);
    cliquer(t.w, btn);
    cliquer(t.w, btn);
    t.repondre(200, p.reponse);
    await attendre(20);
    cliquer(t.w, btn);
    assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 1);
    assert.strictEqual(evts(t.w, 'checkout_click_held').length, 1);
    assert.strictEqual(t.navigations.length, 1);
  });

  test(`${p.nom} : clic après la session → départ direct, pas d'événement de clic gardé`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    t.repondre(200, p.reponse);
    await attendre(20);
    cliquer(t.w, t.bouton(p.stripe));
    assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 1);
    assert.strictEqual(evts(t.w, 'stripe_signup_click')[0].checkoutSessionId, p.session);
    assert.strictEqual(evts(t.w, 'checkout_click_held').length, 0);
    assert.strictEqual(t.navigations.length, 1);
  });

  test(`${p.nom} : clic avant la session, puis échec (500) → bouton Memberstack de la même offre`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    await attendre(20);
    const btn = t.bouton(p.stripe);
    cliquer(t.w, btn);
    t.repondre(500, { error: 'internal_error' });
    await attendre(20);
    assert.ok(!visible(btn), 'bouton Stripe masqué');
    assert.ok(visible(t.bouton(p.repli)), 'bouton Memberstack affiché');
    assert.strictEqual(texte(btn), 'Essayer gratuitement', 'libellé rendu');
    assert.deepStrictEqual(t.clics.filter((id) => id !== p.stripe), [p.repli], 'le clic suit le membre sur le repli de SON offre, une fois');
    assert.strictEqual(t.navigations.length, 0);
    assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 0);
    assert.deepStrictEqual(evts(t.w, 'checkout_failed').map((e) => e.failure_reason), ['api_500']);
    assert.deepStrictEqual(evts(t.w, 'checkout_click_held').map((e) => e.outcome), ['fallback']);
  });

  test(`${p.nom} : échec SANS clic gardé → aucun clic rejoué sur le repli`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    t.repondre(500, { error: 'internal_error' });
    await attendre(20);
    assert.deepStrictEqual(t.clics, []);
    assert.strictEqual(evts(t.w, 'checkout_click_held').length, 0);
  });

  test(`${p.nom} : clic avant la session, puis 409 déjà abonné → aucun départ, le lien vers le compte reste cliquable`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    await attendre(20);
    const btn = t.bouton(p.stripe);
    cliquer(t.w, btn);
    t.repondre(409, { error: 'already-subscribed' });
    await attendre(20);
    assert.strictEqual(texte(btn), 'Mon offre actuelle');
    assert.strictEqual(btn.getAttribute('href'), '/membership/compte');
    assert.deepStrictEqual(t.clics.filter((id) => id !== p.stripe), [], 'surtout pas le bouton Memberstack');
    assert.strictEqual(t.navigations.length, 0);
    assert.deepStrictEqual(evts(t.w, 'checkout_click_held').map((e) => e.outcome), ['current_offer']);
    const suite = cliquer(t.w, btn);
    assert.ok(!suite.defaultPrevented, 'le lien « Mon offre actuelle » n\'est plus intercepté');
  });

  test(`${p.nom} : retour arrière depuis Stripe (page en cache) → bouton rendu, nouveau départ possible`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    t.repondre(200, p.reponse);
    await attendre(20);
    const btn = t.bouton(p.stripe);
    cliquer(t.w, btn);
    assert.strictEqual(texte(btn), 'Patientez…');
    cliquer(t.w, btn);
    assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 1, 'verrouillé pendant le départ');
    t.w.dispatchEvent(new t.w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.strictEqual(texte(btn), 'Essayer gratuitement');
    cliquer(t.w, btn);
    assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 2);
    assert.strictEqual(evts(t.w, 'stripe_signup_click')[1].checkoutSessionId, p.session);
  });

  test(`${p.nom} : pageshow d'un premier chargement (persisted: false) → rien ne change`, async () => {
    const t = page(p);
    t.w.eval(p.code);
    t.repondre(200, p.reponse);
    await attendre(20);
    const btn = t.bouton(p.stripe);
    cliquer(t.w, btn);
    t.w.dispatchEvent(new t.w.PageTransitionEvent('pageshow', { persisted: false }));
    assert.strictEqual(texte(btn), 'Patientez…');
    cliquer(t.w, btn);
    assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 1);
  });
}

test('pricing : clic gardé sur une offre, clic sur l\'autre pendant l\'attente → seule la première part', async () => {
  const p = PAGES[0];
  const t = page(p);
  t.w.eval(p.code);
  await attendre(20);
  cliquer(t.w, t.bouton('signup-rempla-stripe-customer'));
  cliquer(t.w, t.bouton('signup-prat-stripe-customer'));
  assert.strictEqual(texte(t.bouton('signup-prat-stripe-customer')), 'Essayer gratuitement');
  t.repondre(200, SESSIONS_PRICING);
  await attendre(20);
  const depart = evts(t.w, 'stripe_signup_click');
  assert.strictEqual(depart.length, 1);
  assert.strictEqual(depart[0].option, 'rempla');
  assert.strictEqual(depart[0].checkoutSessionId, 'cs_rempla');
});

test('shared : clic gardé par le chargeur ET clic du membre → un seul départ', async () => {
  const p = PAGES[3];
  const t = page(p);
  t.w.ORDO_PENDING_CHECKOUT_CLICK = true;
  t.w.eval(p.code);
  await attendre(20);
  cliquer(t.w, t.bouton(p.stripe));
  t.repondre(200, SESSION_OFFRE);
  await attendre(20);
  assert.strictEqual(evts(t.w, 'stripe_signup_click').length, 1);
  assert.strictEqual(t.navigations.length, 1);
  assert.strictEqual(t.w.ORDO_PENDING_CHECKOUT_CLICK, false);
});

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
