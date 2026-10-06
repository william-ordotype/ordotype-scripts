#!/usr/bin/env node
/**
 * Code d'en-tête de la page Mon compte (account/compte-head.html).
 *
 * Le Designer montre la nouvelle présentation et masque les anciens blocs (combos `is-on` et
 * `is-secours`). Ce code, que seul le site exécute, doit : ne rien montrer pendant le chargement,
 * montrer la nouvelle présentation une fois rendue, rendre les anciens blocs quand le script est
 * coupé par le chargeur, ne se télécharge pas, ou n'a rien rendu en 8 s, sans jamais réafficher un
 * bloc que Memberstack masque ; mesurer chaque secours et alerter quand le chargeur manque. Même
 * contrat pour la liste des abonnements (onglet facturation).
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
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-profil-securite.html'), 'utf8');
const HEAD = fs.readFileSync(path.join(ROOT, 'account/compte-head.html'), 'utf8');
const HEAD_STYLE = /<style>([\s\S]*?)<\/style>/.exec(HEAD)[1];
const HEAD_SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(HEAD)[1];

// Classes du Designer (feuille Webflow publiée) dont dépend l'affichage.
const SITE_CSS = '.compte-v2_wrap{display:none}.compte-v2_wrap.is-on{display:flex}.inner-block-wraper.is-secours{display:none}'
  + '.compte-v2_field.is-cache{display:none}';
// Ce que Memberstack pose pour un membre payant sans mot de passe (feuille #dynamic-css).
const MS_CSS = "[data-ms-content='!paid-plans'],[data-ms-content='has-password']{display: none !important;}";

// Fenêtres ouvertes : l'horloge étant figée, la garde attendrait sans fin ; on les ferme à la fin.
const fenetres = [];

/**
 * rollout : décisions publiées par le chargeur ; loader:false = chargeur jamais arrivé.
 * reporter : un OrdoErrorReporter factice (track) ; push : remplace dataLayer.push.
 */
function page({ head = true, memberstack = false, rollout = {}, loader = true, before = null, reporter = false, push = null, url = undefined, apres = '' } = {}) {
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
  const dom = new JSDOM(`<!doctype html><html><head>${styles}</head><body><div class="w-tabs">${FIXTURE}</div>${apres}${chargeur}</body></html>`, {
    url,
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
const anciens = (d, tab) => [...d.querySelectorAll(`[data-w-tab="${tab}"] .compte_form > .inner-block-wraper`)];
const v2 = (d) => [...d.querySelectorAll('[data-ordo-v2]')];

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
  await test('fixture : 2 nouvelles présentations, 3 + 4 + 3 anciens blocs', async () => {
    const { d } = page({ head: false });
    assert.strictEqual(v2(d).length, 2);
    assert.strictEqual(anciens(d, 'information').length, 3);
    assert.strictEqual(anciens(d, 'security').length, 4);
    assert.strictEqual(anciens(d, 'billing').length, 3);
  });

  await test('Designer (sans le code d\'en-tête) : nouvelle présentation visible, anciens blocs masqués, encart visible', async () => {
    const { w, d } = page({ head: false });
    for (const el of v2(d)) assert.ok(visible(w, el));
    for (const tab of ['information', 'security', 'billing']) for (const b of anciens(d, tab)) assert.ok(!visible(w, b), tab);
    assert.ok(visible(w, d.querySelector('.compte-v2_designer')));
    assert.ok(!visible(w, d.querySelector('[data-ordo-champ="vat-id"]').closest('.compte-v2_field')), 'ligne TVA (masquée à tous) masquée aussi ici');
  });

  await test('site, chargement : ni nouvelle présentation ni anciens blocs, pas d\'encart', async () => {
    const { w, d, h } = page();
    assert.ok(h.classList.contains('ordo-profil-pending'));
    assert.ok(h.classList.contains('ordo-subs-pending'));
    for (const el of v2(d)) assert.ok(!visible(w, el), 'pas de gabarit vide affiché');
    for (const tab of ['information', 'security', 'billing']) for (const b of anciens(d, tab)) assert.ok(!visible(w, b), tab);
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
    for (const b of anciens(d, 'information').concat(anciens(d, 'security'))) assert.ok(!visible(w, b));
  });

  await test('site, script coupé par le chargeur : anciens blocs tout de suite, sans attendre 8 s', async () => {
    const { w, d, h } = page({ rollout: { 'profile-overview.js': { enabled: false, reason: 'bucket' } } });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    for (const el of v2(d)) assert.ok(!visible(w, el));
    for (const b of anciens(d, 'information').concat(anciens(d, 'security'))) assert.ok(visible(w, b));
    assert.ok(!h.classList.contains('ordo-subs-fallback'), 'la facturation a sa propre décision');
    for (const b of anciens(d, 'billing')) assert.ok(!visible(w, b));
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

  await test('site, rien de rendu en 8 s : anciens blocs', async () => {
    const { w, d, h, avance } = page({ rollout: { 'profile-overview.js': { enabled: true } } });
    avance(7900);
    await tick(150);
    assert.ok(!h.classList.contains('ordo-profil-fallback'), 'pas avant 8 s');
    avance(200);
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    assert.ok(h.classList.contains('ordo-subs-fallback'));
    for (const b of anciens(d, 'information')) assert.ok(visible(w, b));
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

  await test('chargeur absent : anciens blocs dès DOMContentLoaded, les deux secours mesurés, UNE alerte', async () => {
    const { w, d, h, pushed, alertes } = page({ loader: false });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback') && h.classList.contains('ordo-subs-fallback'));
    for (const b of anciens(d, 'information')) assert.ok(visible(w, b));
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

  await test('secours : un bloc que Memberstack masque le reste (suppression pour un payant, e-mail sans mot de passe)', async () => {
    const { w, d, h } = page({ memberstack: true, rollout: { 'profile-overview.js': { enabled: false } } });
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    assert.ok(!visible(w, d.getElementById('delete-account')), '!paid-plans respecté');
    assert.ok(!visible(w, d.querySelector('[data-w-tab="security"] .inner-block-wraper[data-ms-content="has-password"]')), 'has-password respecté');
    const autres = anciens(d, 'security').filter((b) => !b.hasAttribute('data-ms-content'));
    assert.strictEqual(autres.length, 2);
    for (const b of autres) assert.ok(visible(w, b));
  });

  await test('secours jamais en !important (jsdom ne départage pas deux !important : contrôle sur le texte)', async () => {
    const regles = HEAD_STYLE.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^{}]*\}/g) || [];
    const secours = regles.filter((r) => /is-secours/.test(r.split('{')[0]));
    assert.ok(secours.length >= 2, 'règles de secours trouvées (ordinateur et mobile)');
    for (const r of secours) assert.ok(!/!important/.test(r.split('{')[1]), `sans !important : ${r.trim().slice(0, 80)}`);
  });

  await test('secours posé mais nouvelle présentation rendue ensuite : elle gagne', async () => {
    const { w, d, h } = page({ rollout: { 'profile-overview.js': { enabled: false } } });
    await tick(150);
    h.classList.add('ordo-profil-v2');
    for (const el of v2(d)) assert.ok(visible(w, el));
    for (const b of anciens(d, 'information')) assert.ok(!visible(w, b));
  });

  await test('facturation : liste rendue = anciens blocs masqués ; secours = les trois ; ordo-keep = un seul', async () => {
    let r = page({ rollout: { 'profile-overview.js': { enabled: true }, 'subscriptions-overview.js': { enabled: true } } });
    r.d.getElementById('ordotype-subscriptions').innerHTML = '<div class="ordo-subs"></div>';
    await tick(150);
    r.avance(9000);
    await tick(150);
    assert.ok(!r.h.classList.contains('ordo-subs-fallback'), 'liste rendue : pas de secours');
    for (const b of anciens(r.d, 'billing')) assert.ok(!visible(r.w, b));
    // subscriptions-overview.js garde un ancien bloc dont la liste a encore besoin.
    const inv = r.d.getElementById('invoices-block');
    inv.classList.add('ordo-keep');
    inv.style.display = '';
    assert.ok(visible(r.w, inv));
    inv.classList.remove('ordo-keep');
    inv.style.display = 'none';
    assert.ok(!visible(r.w, inv));

    r = page({ rollout: { 'subscriptions-overview.js': { enabled: false, reason: 'host' } } });
    await tick(150);
    assert.ok(r.h.classList.contains('ordo-subs-fallback'));
    for (const b of anciens(r.d, 'billing')) assert.ok(visible(r.w, b));
    assert.ok(!r.h.classList.contains('ordo-profil-fallback'), 'le profil a sa propre décision');
  });

  await test('facturation : secours posé par la liste elle-même (échec) = anciens blocs', async () => {
    const { w, d, h } = page({ rollout: { 'subscriptions-overview.js': { enabled: true } } });
    h.classList.add('ordo-subs-fallback'); // fallbackToPageBlocks()
    for (const b of anciens(d, 'billing')) assert.ok(visible(w, b));
    for (const b of anciens(d, 'information')) assert.ok(!visible(w, b), 'le profil n\'est pas concerné');
  });

  await test('retour après connexion : locat = Mon compte + onglet, sans UTM ; réécrit au clic ; stockage bloqué sans casse', async () => {
    const LIEN = '<a data-ordo-connexion-retour="1" href="/membership/login-ms">Se connecter</a>';
    let r = page({ url: 'https://www.ordotype.fr/membership/compte?utm_source=postmark#abonnements', apres: LIEN });
    await tick(0);
    assert.strictEqual(r.w.localStorage.getItem('locat'), '/membership/compte#abonnements', 'onglet gardé, UTM laissés de côté');
    assert.strictEqual(r.d.querySelector('[data-ordo-connexion-retour]').getAttribute('href'), '/membership/login-ms', 'lien inchangé');

    // Une autre page (autre onglet) a écrasé locat : le clic le remet.
    r.w.localStorage.setItem('locat', 'https://www.ordotype.fr/maladies/autre');
    r.d.querySelector('[data-ordo-connexion-retour]').addEventListener('click', (e) => e.preventDefault());
    r.d.querySelector('[data-ordo-connexion-retour]').click();
    assert.strictEqual(r.w.localStorage.getItem('locat'), '/membership/compte#abonnements', 'réécrit au clic');

    r = page({ url: 'https://www.ordotype.fr/membership/compte' });
    await tick(0);
    assert.strictEqual(r.w.localStorage.getItem('locat'), '/membership/compte', 'sans onglet');

    // Stockage bloqué (page sans origine : localStorage lève une SecurityError) : le reste de la page vit.
    const erreurs = [];
    r = page({ rollout: { 'profile-overview.js': { enabled: false, reason: 'host' } }, before: (w) => w.addEventListener('error', (e) => erreurs.push(e.message)) });
    await tick(150);
    assert.ok(r.h.classList.contains('ordo-profil-fallback'), 'la garde tourne malgré le stockage bloqué');
    assert.deepStrictEqual(erreurs, [], 'aucune erreur remontée (Sentry)');
  });

  for (const w of fenetres) w.close();
  console.log(`compte-head : ${passed} tests OK`);
})();
