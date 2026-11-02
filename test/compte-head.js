#!/usr/bin/env node
/**
 * Code d'en-tête de la page Mon compte (account/compte-head.html).
 *
 * Les trois onglets n'ont plus d'anciens blocs : leurs pièces Memberstack (valeurs, formulaires, portail
 * Stripe) sont posées dans la nouvelle présentation. Ce code, que seul le site exécute, doit : tout montrer
 * sans attendre les scripts, sauf ce qu'ils calculent (en-tête de Mon profil) et, en Facturation, les
 * exemples du Designer (jamais) et les cartes qui n'ont de sens qu'avec des données (jusqu'au rendu de la
 * liste) ; ne jamais réafficher un bloc que Memberstack masque ; mesurer chaque script coupé, absent, en
 * échec ou sans rendu en 8 s, et alerter quand le chargeur manque.
 *
 * L'en-tête s'exécute pendant l'analyse de la page, comme dans le navigateur ; le chargeur
 * (« defer ») est simulé par un script en fin de page, qui tourne avant DOMContentLoaded.
 *
 * Usage : node test/compte-head.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
// Page telle que servie : les trois onglets dessinés sans anciens blocs (pièces Memberstack posées dans la
// nouvelle présentation).
const FIXTURE = require('./fixtures/facturation-directe')(require('./fixtures/profil-directe')(require('./fixtures/securite-directe')(fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-profil-securite.html'), 'utf8'))));
const HEAD = fs.readFileSync(path.join(ROOT, 'account/compte-head.html'), 'utf8');
const HEAD_STYLE = /<style>([\s\S]*?)<\/style>/.exec(HEAD)[1];
const HEAD_SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(HEAD)[1];

// Classes du Designer (feuille Webflow publiée) dont dépend l'affichage.
const SITE_CSS = '.compte-v2_wrap{display:none}.compte-v2_wrap.is-on{display:flex}.inner-block-wraper.is-secours{display:none}'
  + '.compte-v2_field.is-cache{display:none}.compte-v2_photo{cursor:pointer}'
  + '.compte-v2_edit{display:none}.compte-v2_edit.is-open{display:block}.compte-v2_card.is-liste.is-2fa{display:none}.hidden{display:none}';
// Ce que Memberstack pose pour un membre payant sans mot de passe (feuille #dynamic-css).
const MS_CSS = "[data-ms-content='!paid-plans'],[data-ms-content='has-password']{display: none !important;}";

// Fenêtres ouvertes : l'horloge étant figée, la garde attendrait sans fin ; on les ferme à la fin.
const fenetres = [];

/**
 * rollout : décisions publiées par le chargeur ; loader:false = chargeur jamais arrivé.
 * reporter : un OrdoErrorReporter factice (track) ; push : remplace dataLayer.push.
 */
function page({ head = true, memberstack = false, rollout = {}, loader = true, before = null, reporter = false, push = null, fixture = FIXTURE } = {}) {
  const styles = `<style>${SITE_CSS}</style>` + (head ? `<style>${HEAD_STYLE}</style><script>${HEAD_SCRIPT}</script>` : '')
    + (memberstack ? `<style id="dynamic-css">${MS_CSS}</style>` : '');
  const chargeur = loader
    ? `<script>window.OrdoRollout = window.OrdoRollout || {}; Object.assign(window.OrdoRollout, ${JSON.stringify(rollout)});</script>`
    : '';
  let now = 1000;
  const pushed = [];
  const tracked = [];
  const alertes = [];
  const virtualConsole = new VirtualConsole(); // erreurs voulues (décision illisible) : pas de bruit
  const dom = new JSDOM(`<!doctype html><html><head>${styles}</head><body><div class="w-tabs">${fixture}</div>${chargeur}</body></html>`, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w) {
      // Horloge pilotée : les 8 s se franchissent sans attendre.
      w.Date.now = () => now;
      w.dataLayer = [];
      w.dataLayer.push = push || ((p) => { pushed.push(p); return 0; });
      if (reporter) w.OrdoErrorReporter = { track: (p) => tracked.push(p) };
      w.addEventListener('error', (e) => { if (e.error && /^Compte/.test(e.error.name)) alertes.push(e.error.name); });
      if (before) before(w);
    }
  });
  const w = dom.window;
  fenetres.push(w);
  return { w, d: w.document, h: w.document.documentElement, avance: (ms) => { now += ms; }, pushed, tracked, alertes };
}

/** Échec de téléchargement d'un script de la page (l'événement ne remonte pas : seule la capture le voit). */
function echec(w, url) {
  const s = w.document.createElement('script');
  s.setAttribute('data-test', '1');
  Object.defineProperty(s, 'src', { value: url });
  w.document.body.appendChild(s);
  s.dispatchEvent(new w.Event('error'));
}

const JSD = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@abc1234/account/';
const steps = (pushed) => pushed.map((p) => p.profile_step || p.subs_outcome);

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const visible = (w, el) => !!el && w.getComputedStyle(el).display !== 'none';
/** Vraiment à l'écran : ni l'élément ni un de ses parents masqué. */
const affiche = (w, el) => {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (w.getComputedStyle(n).display === 'none') return false;
  return !!el;
};
const securite = (d) => d.querySelector('[data-ordo-v2="securite"]');
const profil = (d) => d.querySelector('[data-ordo-v2="profil"]');
// En-tête de Mon profil calculé par le script : invisible tant qu'il n'est pas passé.
const ENTETE = ['[data-ordo-initiales]', '[data-ordo-nom-complet]', '[data-ordo-resume]', '[data-ordo-rpps-entete]'];
const anciens = (d, tab) => [...d.querySelectorAll(`[data-w-tab="${tab}"] .compte_form > .inner-block-wraper`)];
const v2 = (d) => [...d.querySelectorAll('[data-ordo-v2]')];
const facturation = (d) => d.querySelector('[data-ordo-facturation]');
const carte = (d, name) => facturation(d).querySelector(`[data-ordo-section="${name}"]`);
const DONNEES = ['moyen-de-paiement', 'adresse', 'factures'];
/** Facturation avant ou sans son script : « Mes abonnements » et son attente, l'aide ; ni exemple ni carte de données. */
function facturationAttente(w, d, nom) {
  assert.ok(affiche(w, facturation(d)), nom + ' : Facturation');
  assert.ok(affiche(w, d.querySelector('[data-ordo-attente]')), nom + ' : attente');
  assert.ok(affiche(w, facturation(d).querySelector('[data-ordo-aide-bloc]')), nom + ' : aide');
  for (const n of DONNEES) assert.ok(!affiche(w, carte(d, n)), nom + ' : ' + n);
  for (const ex of facturation(d).querySelectorAll('[data-ordo-gabarit]')) assert.ok(!affiche(w, ex), nom + ' : exemple ' + ex.getAttribute('data-ordo-gabarit'));
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.message}`);
    process.exit(1);
  }
}

(async () => {
  await test('fixture : 3 nouvelles présentations, aucun ancien bloc', async () => {
    const { d } = page({ head: false });
    assert.strictEqual(v2(d).length, 2);
    assert.ok(facturation(d));
    for (const tab of ['information', 'security', 'billing']) assert.strictEqual(anciens(d, tab).length, 0, tab);
    assert.strictEqual(d.querySelectorAll('.is-secours').length, 0);
  });

  await test('Designer (sans le code d\'en-tête) : nouvelle présentation visible, anciens blocs masqués, encart visible', async () => {
    const { w, d } = page({ head: false });
    for (const el of v2(d)) assert.ok(visible(w, el));
    for (const tab of ['information', 'security', 'billing']) for (const b of anciens(d, tab)) assert.ok(!visible(w, b), tab);
    assert.ok(visible(w, d.querySelector('.compte-v2_designer')));
    // Ligne TVA retirée du Designer le 29/09 ; si elle revient, elle reste masquée.
    const tva = d.querySelector('[data-ordo-champ="vat-id"]');
    assert.ok(!tva || !visible(w, tva.closest('.compte-v2_field')), 'ligne TVA (masquée à tous) masquée aussi ici');
  });

  await test('site, chargement : les trois onglets visibles, en-tête calculé invisible, pas d\'encart', async () => {
    const { w, d, h } = page();
    assert.ok(h.classList.contains('ordo-profil-pending'));
    assert.ok(h.classList.contains('ordo-subs-pending'));
    assert.ok(affiche(w, profil(d)), 'Mon profil sans attendre le script');
    assert.ok(affiche(w, securite(d)), 'Connexion et sécurité sans attendre le script');
    for (const sel of ENTETE) assert.strictEqual(w.getComputedStyle(profil(d).querySelector(sel)).visibility, 'hidden', 'en-tête invisible : ' + sel);
    for (const el of profil(d).querySelectorAll('[data-ordo-champ]')) assert.ok(el.hasAttribute('data-ms-member'), 'valeur écrite par Memberstack : ' + el.getAttribute('data-ordo-champ'));
    facturationAttente(w, d, 'chargement');
    assert.strictEqual(d.querySelector('[data-ordo-attente] a').getAttribute('data-ms-action'), 'customer-portal', 'portail Stripe natif');
    assert.ok(!visible(w, d.querySelector('.compte-v2_designer')));
  });

  await test('site, rendu réussi : nouvelle présentation seule, et pas de secours même après 8 s', async () => {
    const { w, d, h, avance } = page();
    h.classList.add('ordo-profil-v2'); // posé par profile-overview.js
    await tick(150);
    avance(9000);
    await tick(150);
    assert.ok(!h.classList.contains('ordo-profil-fallback'));
    for (const el of v2(d)) assert.ok(visible(w, el));
    for (const sel of ENTETE) assert.strictEqual(w.getComputedStyle(profil(d).querySelector(sel)).visibility, 'visible', 'en-tête visible : ' + sel);
    for (const b of anciens(d, 'information').concat(anciens(d, 'security'))) assert.ok(!visible(w, b));
  });

  await test('site, script coupé par le chargeur : secours posé tout de suite, rien ne change à l\'écran', async () => {
    const { w, d, h } = page({ rollout: { 'profile-overview.js': { enabled: false, reason: 'bucket' } } });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    assert.ok(affiche(w, profil(d)), 'Mon profil : sa carte, telle quelle');
    assert.ok(affiche(w, securite(d)), 'Connexion et sécurité : sa carte, telle quelle');
    assert.ok(!h.classList.contains('ordo-subs-fallback'), 'la facturation a sa propre décision');
    facturationAttente(w, d, 'profil coupé');
  });

  await test('coupure voulue par le chargeur : ni mesure ni alerte', async () => {
    const { h, pushed, alertes } = page({ rollout: { 'profile-overview.js': { enabled: false }, 'subscriptions-overview.js': { enabled: false } } });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback') && h.classList.contains('ordo-subs-fallback'));
    assert.deepStrictEqual(pushed, []);
    assert.deepStrictEqual(alertes, []);
  });

  await test('site, décision publiée APRÈS l\'en-tête (chargeur différé) : prise en compte', async () => {
    const { h, w } = page();
    await tick(150);
    assert.ok(!h.classList.contains('ordo-profil-fallback'));
    w.OrdoRollout = { 'profile-overview.js': { enabled: false, reason: 'host' } };
    await tick(250);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
  });

  await test('site, rien de rendu en 8 s : secours posé (mesure), Mon profil et la Facturation restent tels quels', async () => {
    const { w, d, h, avance } = page({ rollout: { 'profile-overview.js': { enabled: true } } });
    avance(7900);
    await tick(150);
    assert.ok(!h.classList.contains('ordo-profil-fallback'), 'pas avant 8 s');
    avance(200);
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    assert.ok(h.classList.contains('ordo-subs-fallback'));
    assert.ok(affiche(w, profil(d)));
    facturationAttente(w, d, '8 s');
  });

  await test('8 s : secours du profil mesuré ; celui de la liste non (elle mesure son propre délai) ; pas d\'alerte', async () => {
    const { h, avance, pushed, alertes } = page();
    avance(8100);
    await tick(150);
    assert.ok(h.classList.contains('ordo-subs-fallback'));
    assert.deepStrictEqual(steps(pushed), ['view:-:fallback-delai']);
    assert.strictEqual(pushed[0].event, 'profile_action');
    assert.deepStrictEqual(alertes, []);
  });

  await test('chargeur absent : secours dès DOMContentLoaded, les deux mesurés, UNE alerte ; Mon profil reste affiché', async () => {
    const { w, d, h, pushed, alertes } = page({ loader: false });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback') && h.classList.contains('ordo-subs-fallback'));
    assert.ok(affiche(w, profil(d)));
    assert.deepStrictEqual(steps(pushed).sort(), ['fallback-chargeur', 'view:-:fallback-chargeur']);
    assert.deepStrictEqual(alertes, ['CompteChargeurAbsent']);
  });

  await test('chargeur en échec de téléchargement : secours tout de suite, une seule alerte même avec DOMContentLoaded', async () => {
    const { h, pushed, alertes } = page({ loader: false, before: (w) => {
      w.document.addEventListener('readystatechange', () => { if (w.document.readyState === 'interactive') echec(w, JSD + 'loader.js'); });
    } });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    assert.deepStrictEqual(alertes, ['CompteChargeurAbsent']);
    assert.strictEqual(pushed.length, 2, 'une mesure par onglet, pas de doublon');
  });

  await test('profile-overview.js non téléchargé : secours du profil mesuré, sans alerte (le chargeur la fait), facturation intacte', async () => {
    const { w, h, pushed, alertes } = page({ rollout: { 'profile-overview.js': { enabled: true } } });
    await tick(150);
    echec(w, JSD + 'profile-overview.js');
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    assert.ok(!h.classList.contains('ordo-subs-fallback'));
    assert.deepStrictEqual(steps(pushed), ['view:-:fallback-script']);
    assert.deepStrictEqual(alertes, []);
  });

  await test('subscriptions-overview.js non téléchargé : secours de la facturation mesuré', async () => {
    const { w, h, pushed } = page({ rollout: { 'subscriptions-overview.js': { enabled: true } } });
    await tick(150);
    echec(w, JSD + 'subscriptions-overview.js');
    assert.ok(h.classList.contains('ordo-subs-fallback'));
    assert.ok(!h.classList.contains('ordo-profil-fallback'));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(pushed)), [{ event: 'subscriptions_list', subs_outcome: 'fallback-script' }], 'objet créé dans la page : comparé en JSON');
  });

  await test('autre script en échec (Crisp, image…) : sans effet', async () => {
    const { w, h, pushed } = page();
    await tick(150);
    echec(w, 'https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js');
    const img = w.document.createElement('img');
    w.document.body.appendChild(img);
    img.dispatchEvent(new w.Event('error'));
    assert.ok(!h.classList.contains('ordo-profil-fallback') && !h.classList.contains('ordo-subs-fallback'));
    assert.deepStrictEqual(pushed, []);
  });

  await test('mesure par OrdoErrorReporter.track quand il est chargé (pas de push direct)', async () => {
    const { h, avance, pushed, tracked } = page({ reporter: true });
    avance(8100);
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    assert.deepStrictEqual(pushed, []);
    assert.deepStrictEqual(tracked.map((p) => p.profile_step), ['view:-:fallback-delai']);
  });

  await test('mesure impossible (dataLayer qui jette) : le secours s\'applique quand même, et c\'est signalé', async () => {
    const { h, alertes } = page({ loader: false, push: () => { throw new Error('bloqué'); } });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback') && h.classList.contains('ordo-subs-fallback'));
    assert.ok(alertes.includes('CompteMesureImpossible'));
    assert.ok(alertes.includes('CompteChargeurAbsent'));
  });

  await test('site, décision illisible : la garde tient, secours à 8 s', async () => {
    const { h, avance } = page({ before: (w) => { Object.defineProperty(w, 'OrdoRollout', { get() { throw new Error('boom'); } }); } });
    await tick(150);
    avance(8100);
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
  });

  await test('secours : ce que Memberstack masque le reste (suppression pour un payant, e-mail sans mot de passe)', async () => {
    const { w, d, h } = page({ memberstack: true, rollout: { 'profile-overview.js': { enabled: false } } });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    const c = securite(d);
    assert.ok(affiche(w, c));
    assert.ok(!affiche(w, c.querySelector('[data-ordo-section="suppression"]')), '!paid-plans respecté');
    assert.ok(!affiche(w, c.querySelector('[data-ordo-champ="email"]')), 'has-password respecté');
    assert.ok(affiche(w, c.querySelector('[data-ms-auth-provider="google"]')));
  });

  await test('plus aucune règle d\'anciens blocs : rien à réafficher', async () => {
    assert.ok(!/is-secours|ordo-keep/.test(HEAD_STYLE.replace(/\/\*[\s\S]*?\*\//g, '')));
  });

  await test('secours posé puis rendu tardif : l\'en-tête calculé apparaît', async () => {
    const { w, d, h } = page({ rollout: { 'profile-overview.js': { enabled: false } } });
    await tick(150);
    h.classList.add('ordo-profil-v2');
    for (const el of v2(d)) assert.ok(visible(w, el));
    for (const sel of ENTETE) assert.strictEqual(w.getComputedStyle(profil(d).querySelector(sel)).visibility, 'visible', sel);
  });

  await test('facturation : liste rendue = cartes de données au script, exemples toujours cachés ; coupée = telle quelle', async () => {
    let r = page({ rollout: { 'profile-overview.js': { enabled: true }, 'subscriptions-overview.js': { enabled: true } } });
    r.h.classList.add('ordo-subs-v2'); // posé par subscriptions-overview.js une fois la Facturation remplie
    await tick(150);
    r.avance(9000);
    await tick(150);
    assert.ok(!r.h.classList.contains('ordo-subs-fallback'), 'liste rendue : pas de secours');
    for (const n of DONNEES) assert.ok(affiche(r.w, carte(r.d, n)), 'au script de la montrer ou non : ' + n);
    for (const ex of facturation(r.d).querySelectorAll('[data-ordo-gabarit]')) assert.ok(!affiche(r.w, ex), 'exemple caché');

    r = page({ rollout: { 'subscriptions-overview.js': { enabled: false, reason: 'host' } } });
    await tick(150);
    assert.ok(r.h.classList.contains('ordo-subs-fallback'));
    facturationAttente(r.w, r.d, 'liste coupée');
    assert.ok(!r.h.classList.contains('ordo-profil-fallback'), 'le profil a sa propre décision');
  });

  await test('facturation : secours posé (mesure seule) = rien ne change à l\'écran', async () => {
    const { w, d, h } = page({ rollout: { 'subscriptions-overview.js': { enabled: true } } });
    h.classList.add('ordo-subs-fallback');
    facturationAttente(w, d, 'secours');
    assert.ok(affiche(w, profil(d)), 'le profil n\'est pas concerné');
  });

  await test('photo dessinée : pastille, liens et message cachés tant que profile-photo.js ne l\'a pas activée ; rond toujours là', async () => {
    const pieces = (d) => ['pastille', 'actions', 'statut'].map((r) => d.querySelector(`[data-ordo-v2="profil"] [data-ordo-photo="${r}"]`));
    const designer = page({ head: false });
    for (const el of pieces(designer.d)) assert.ok(visible(designer.w, el), 'le Designer montre tout');
    const { w, d, h } = page();
    h.classList.add('ordo-profil-v2');
    const rond = d.querySelector('[data-ordo-photo="declencheur"]');
    assert.ok(rond && rond.querySelector('[data-ordo-initiales]'), 'initiales dans le rond');
    assert.ok(visible(w, rond), 'le rond reste : il porte les initiales');
    assert.strictEqual(w.getComputedStyle(rond).cursor, 'auto', 'pas de main sur un rond inerte');
    for (const el of pieces(d)) assert.ok(el && !visible(w, el), el && el.getAttribute('data-ordo-photo'));
    h.classList.add('ordo-photo-v2'); // posé par profile-photo.js
    for (const el of pieces(d)) assert.ok(visible(w, el), el.getAttribute('data-ordo-photo'));
    assert.strictEqual(w.getComputedStyle(rond).cursor, 'pointer', 'rond actif : la main du Designer');
  });

  await test('Connexion et sécurité : même carte pendant le chargement, une fois rendue, et en secours ; formulaires fermés', async () => {
    const cas = [
      ['chargement', page()],
      ['rien en 8 s', page({ rollout: { 'profile-overview.js': { enabled: true } } })],
      ['chargeur absent', page({ loader: false })]
    ];
    cas[1][1].avance(8100);
    await tick(150);
    assert.ok(cas[1][1].h.classList.contains('ordo-profil-fallback'));
    assert.ok(cas[2][1].h.classList.contains('ordo-profil-fallback'));
    for (const [nom, r] of cas) {
      const c = securite(r.d);
      assert.ok(affiche(r.w, c), nom + ' : carte');
      for (const slot of c.querySelectorAll('.compte-v2_edit')) assert.ok(!affiche(r.w, slot), nom + ' : formulaire fermé');
      for (const b of c.querySelectorAll('[data-ordo-edit]')) assert.ok(affiche(r.w, b), nom + ' : Modifier');
      assert.ok(affiche(r.w, c.querySelector('[data-ms-auth-provider="google"]')), nom + ' : Google');
      assert.ok(affiche(r.w, r.d.getElementById('delete-account-btn')), nom + ' : Supprimer');
    }
    // En secours, Mon profil reste affiché lui aussi.
    const s = cas[1][1];
    assert.ok(affiche(s.w, profil(s.d)));
    const r = cas[0][1];
    r.h.classList.add('ordo-profil-v2');
    await tick(0);
    assert.ok(affiche(r.w, securite(r.d)), 'rendu : carte');
  });

  await test('le code d\'en-tête ne réaffiche plus d\'anciens blocs ni ne cache Mon profil, Connexion et sécurité ou la Facturation', async () => {
    assert.ok(!/ordo-securite-directe/.test(HEAD), 'classe retirée');
    assert.ok(!/\[data-w-tab="(security|information)"\][^{]*is-secours/.test(HEAD_STYLE), 'plus d\'anciens blocs à réafficher dans ces onglets');
    assert.ok(!/\[data-ordo-v2\][^{]*\{[^}]*display:\s*none/.test(HEAD_STYLE), 'plus de nouvelle présentation cachée');
    assert.ok(!/\[data-ordo-facturation\]\s*\{[^}]*display:\s*none/.test(HEAD_STYLE), 'Facturation jamais cachée en bloc');
    assert.ok(!/anciens blocs affichés/.test(HEAD), 'l\'alerte ne promet plus d\'anciens blocs');
  });

  for (const w of fenetres) w.close();
  console.log(`compte-head : ${passed} tests OK`);
})();
