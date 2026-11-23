#!/usr/bin/env node
/**
 * Offre réservée aux désabonnés (winback-gate.js) : l'écran de refus dépend du motif
 * du serveur. Un abonné en cours lit que l'offre est réservée aux médecins qui ont
 * résilié ; les autres refus gardent l'écran « plus disponible ». Aucun écran ne
 * nomme la remise (elle vit dans le CMS et le coupon du serveur).
 *
 * Usage : node test/offre-speciale-winback-gate.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const GATE = fs.readFileSync(path.join(ROOT, 'inscription-offre-speciale/winback-gate.js'), 'utf8');
const PAGE = 'https://www.ordotype.fr/inscription-offre-speciale/6-mois-offerts-reactivation';
const ELIGIBILITE = 'https://checkout.ordotype.fr/.netlify/functions/winback-eligibility';

const GABARIT = `<!doctype html><html><head></head><body>
  <div id="page-wrapper-connected"><div class="main-wrapper">
    <h2>Ordotype - 6 mois à -50 %</h2>
    <a id="not-connected-animation" class="button"><div>En profiter</div></a>
    <a id="signup-rempla-from-decouverte" class="button" href="#"><div>En profiter</div></a>
    <a id="signup-rempla-stripe-customer" class="button hidden" href="#"><div>En profiter</div></a>
  </div></div>
  <div id="page-wrapper-not-connected" class="hidden"></div>
</body></html>`;

function page({ query = '', member = { stripeCustomerId: 'cus_ancien', memberId: 'mem_ancien' } } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (!/navigation/i.test(e.message)) erreurs.push(e.message); });
  const dom = new JSDOM(GABARIT, { url: PAGE + query, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  if (member) w.OrdoMemberstack = member;
  w.STRIPE_CHECKOUT_CONFIG = { priceId: 'price_praticien', paymentMethods: ['sepa_debit'] };
  w.scrollTo = () => {};
  w.OrdoErrorReporter = { report: () => {} };
  return { w, erreurs };
}

// L'éligibilité est un GET sans corps ; le reste (paiement) n'est pas appelé ici.
function installFetch(w, verdict) {
  const calls = [];
  w.fetch = (url) => {
    calls.push(url);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(verdict) });
  };
  return calls;
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const $ = (w, id) => w.document.getElementById(id);
const titre = (w) => (w.document.querySelector('.ordo-expired-title') || {}).textContent || null;
const texte = (w) => (w.document.querySelector('.ordo-expired') || {}).textContent || '';
const liens = (w) => [...w.document.querySelectorAll('.ordo-expired a')].map((a) => a.getAttribute('href'));
// Array.from : le dataLayer vient du domaine de jsdom, deepStrictEqual compare aussi le prototype.
const refus = (w) => Array.from(w.dataLayer || []).filter((e) => e.event === 'winback_refused').map((e) => e.reason);

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test("abonné en cours : l'offre est réservée aux médecins qui ont résilié, rien sur un délai ou une reprise", async () => {
  const { w, erreurs } = page();
  const calls = installFetch(w, { eligible: false, reason: 'active_subscription', windowDays: 33 });
  w.eval(GATE);
  await tick();
  assert.ok(calls[0].startsWith(ELIGIBILITE + '?c=cus_ancien'), calls[0]);
  assert.strictEqual(titre(w), 'Votre abonnement est en cours');
  assert.ok(/réservée aux médecins qui ont résilié leur abonnement/.test(texte(w)));
  assert.ok(!/délai|reprendre|plus disponible/i.test(texte(w)), texte(w));
  assert.deepStrictEqual(liens(w), ['/membership/compte', '/']);
  assert.strictEqual($(w, 'signup-rempla-from-decouverte'), null, 'le bloc de l’offre est remplacé');
  assert.deepStrictEqual(refus(w), ['active_subscription'], 'la mesure garde le motif du serveur');
  assert.deepStrictEqual(erreurs, []);
});

test('autres refus : écran « plus disponible », avec la fenêtre du serveur, sans nommer la remise', async () => {
  for (const reason of ['window_expired', 'already_redeemed', 'never_subscribed_in_scope', 'price_out_of_scope', 'no_customer', undefined]) {
    const { w } = page();
    installFetch(w, { eligible: false, reason, windowDays: 40 });
    w.eval(GATE);
    await tick();
    assert.strictEqual(titre(w), 'Cette offre n’est plus disponible', String(reason));
    assert.ok(/Cette offre était réservée aux médecins ayant résilié leur abonnement, pendant les 40 jours/.test(texte(w)), String(reason));
    assert.ok(/reprendre votre abonnement/.test(texte(w)), String(reason));
    assert.deepStrictEqual(liens(w), ['/nos-offres', '/'], String(reason));
    assert.deepStrictEqual(refus(w), [reason || 'unknown'], String(reason));
  }
});

test('éligible : pas d’écran de refus, le bouton de l’offre s’active et le bouton Memberstack reste masqué', async () => {
  const { w } = page();
  installFetch(w, { eligible: true, reason: 'eligible', windowDays: 33, daysLeft: 13, deadline: new Date(Date.now() + 13 * 86400000).toISOString() });
  w.eval(GATE);
  await tick();
  assert.strictEqual(titre(w), null);
  assert.strictEqual($(w, 'signup-rempla-from-decouverte').style.display, 'none');
  const btn = $(w, 'signup-rempla-stripe-customer');
  assert.strictEqual(btn.classList.contains('hidden'), false);
  assert.strictEqual(btn.style.pointerEvents, '', 'actif après le verdict');
});

test('aperçus : ?winback_preview=active et =expired affichent leur écran sans appeler le serveur ni mesurer', async () => {
  for (const [preview, attendu] of [['active', 'Votre abonnement est en cours'], ['expired', 'Cette offre n’est plus disponible']]) {
    const { w } = page({ query: '?winback_preview=' + preview, member: null });
    const calls = installFetch(w, {});
    w.eval(GATE);
    await tick();
    assert.strictEqual(titre(w), attendu, preview);
    assert.strictEqual(calls.length, 0, preview);
    assert.deepStrictEqual(Array.from(w.dataLayer || []), [], preview);
  }
});

test('déconnecté : l’écran de connexion ne nomme pas la remise non plus', async () => {
  const { w } = page({ member: null });
  const calls = installFetch(w, {});
  w.eval(GATE);
  await tick();
  assert.strictEqual(titre(w), 'Connectez-vous pour récupérer votre offre');
  assert.ok(/^Cette offre est réservée à votre compte Ordotype/.test(w.document.querySelector('.ordo-expired-text').textContent));
  assert.strictEqual(calls.length, 0);
});

test('le script ne nomme jamais la remise', () => {
  assert.ok(!/mois offerts|-50|−50|50 ?%/.test(GATE.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    'la remise vit dans le CMS et le coupon du serveur, pas dans les textes du script');
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
