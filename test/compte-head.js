#!/usr/bin/env node
/**
 * Code d'en-tête de la page Mon compte (account/compte-head.html).
 *
 * Le Designer montre la nouvelle présentation et masque les anciens blocs (combos `is-on` et
 * `is-secours`). Ce code, que seul le site exécute, doit : ne rien montrer pendant le chargement,
 * montrer la nouvelle présentation une fois rendue, rendre les anciens blocs quand le script est
 * coupé par le chargeur ou n'a rien rendu en 8 s, sans jamais réafficher un bloc que Memberstack
 * masque. Même contrat pour la liste des abonnements (onglet facturation).
 *
 * Usage : node test/compte-head.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-profil-securite.html'), 'utf8');
const HEAD = fs.readFileSync(path.join(ROOT, 'account/compte-head.html'), 'utf8');
const HEAD_STYLE = /<style>([\s\S]*?)<\/style>/.exec(HEAD)[1];
const HEAD_SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(HEAD)[1];

// Classes du Designer (feuille Webflow publiée) dont dépend l'affichage.
const SITE_CSS = '.compte-v2_wrap{display:none}.compte-v2_wrap.is-on{display:flex}.inner-block-wraper.is-secours{display:none}';
// Ce que Memberstack pose pour un membre payant sans mot de passe (feuille #dynamic-css).
const MS_CSS = "[data-ms-content='!paid-plans'],[data-ms-content='has-password']{display: none !important;}";

// Fenêtres ouvertes : l'horloge étant figée, la garde attendrait sans fin ; on les ferme à la fin.
const fenetres = [];

function page({ head = true, memberstack = false, rollout = undefined, before = null } = {}) {
  const styles = `<style>${SITE_CSS}</style>` + (head ? `<style>${HEAD_STYLE}</style>` : '') + (memberstack ? `<style id="dynamic-css">${MS_CSS}</style>` : '');
  const dom = new JSDOM(`<!doctype html><html><head>${styles}</head><body><div class="w-tabs">${FIXTURE}</div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  fenetres.push(w);
  // Horloge pilotée : les 8 s se franchissent sans attendre.
  let now = 1000;
  w.Date.now = () => now;
  if (rollout !== undefined) w.OrdoRollout = rollout;
  if (before) before(w);
  if (head) w.eval(HEAD_SCRIPT);
  return { w, d: w.document, h: w.document.documentElement, avance: (ms) => { now += ms; } };
}

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
    await tick(0);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
    for (const el of v2(d)) assert.ok(!visible(w, el));
    for (const b of anciens(d, 'information').concat(anciens(d, 'security'))) assert.ok(visible(w, b));
    assert.ok(!h.classList.contains('ordo-subs-fallback'), 'la facturation a sa propre décision');
    for (const b of anciens(d, 'billing')) assert.ok(!visible(w, b));
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

  await test('site, décision illisible : la garde tient, secours à 8 s', async () => {
    const { h, avance } = page({ before: (w) => { Object.defineProperty(w, 'OrdoRollout', { get() { throw new Error('boom'); } }); } });
    await tick(150);
    avance(8100);
    await tick(150);
    assert.ok(h.classList.contains('ordo-profil-fallback'));
  });

  await test('secours : un bloc que Memberstack masque le reste (suppression pour un payant, e-mail sans mot de passe)', async () => {
    const { w, d, h } = page({ memberstack: true, rollout: { 'profile-overview.js': { enabled: false } } });
    await tick(0);
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
    await tick(0);
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
    await tick(0);
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

  for (const w of fenetres) w.close();
  console.log(`compte-head : ${passed} tests OK`);
})();
