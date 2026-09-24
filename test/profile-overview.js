#!/usr/bin/env node
/**
 * Nouvelle présentation de « Mon profil » et « Connexion et Sécurité » (account/profile-overview.js).
 *
 * La page est la vraie structure servie (test/fixtures/compte-profil-securite.html) : anciens blocs
 * et nouveaux blocs du Designer. Couvre la lecture, les internes, les valeurs hors liste, le
 * déplacement des formulaires, la double authentification, Google, la suppression, le secours.
 *
 * Usage : node test/profile-overview.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'account/profile-overview.js'), 'utf8');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-profil-securite.html'), 'utf8');

const MEDECIN = {
  id: 'mem_test_1',
  auth: { email: 'claire.martin@exemple.fr' },
  customFields: {
    prnom: 'Claire', nom: 'Martin', statut: 'Medecin', 'mode-dexercice': 'Liberal', specialite: 'Médecine générale',
    'n-rpps': '10000668540', 'vat-id': '', phone: '+33612345678', country: 'France', siret: ''
  }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

async function page({ member = MEDECIN, fixture = FIXTURE, reporter = true, fresh = null, before = null } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  // Règles de la feuille Webflow publiée dont dépend l'affichage (le reste du CSS du site est sans effet ici).
  const SITE_CSS = '.compte-v2_wrap{display:none}.compte-v2_edit{display:none}.compte-v2_edit.is-open{display:block}'
    + '.compte-v2_card.is-liste.is-2fa{display:none}.w-form-done,.w-form-fail{display:none}';
  const dom = new JSDOM(`<!doctype html><html><head><style>${SITE_CSS}</style></head><body><div class="w-tabs">${fixture}</div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  const reports = [];
  const pushed = [];
  w.dataLayer = [];
  w.dataLayer.push = (p) => { pushed.push(p); return 0; };
  if (reporter) w.OrdoErrorReporter = { report: (ctx, err) => reports.push({ ctx, name: err && err.name, message: err && err.message }) };
  w.OrdoAccount = { member: clone(member) };
  w.$memberstackDom = { getCurrentMember: () => Promise.resolve({ data: fresh || clone(member) }) };
  w.console.log = () => {};
  w.console.warn = () => {};
  if (before) before(w);
  w.eval(SCRIPT);
  // Comme dans le navigateur, le script attend la fin de l'analyse de la page.
  if (w.document.readyState === 'loading') {
    await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  }
  await new Promise((r) => setTimeout(r, 0));
  return { w, d: w.document, erreurs, reports, pushed };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const txt = (d, sel) => (d.querySelector(sel) || {}).textContent;
const champ = (d, name) => txt(d, `[data-ordo-v2="profil"] [data-ordo-champ="${name}"]`);
const visible = (w, el) => !!el && w.getComputedStyle(el).display !== 'none';

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
  await test('lecture : valeurs, libellés accentués, initiales, téléphone, vide', async () => {
    const { w, d, erreurs } = await page();
    assert.deepStrictEqual(erreurs, []);
    assert.ok(d.documentElement.classList.contains('ordo-profil-v2'));
    assert.strictEqual(champ(d, 'prnom'), 'Claire');
    assert.strictEqual(champ(d, 'statut'), 'Médecin');
    assert.strictEqual(champ(d, 'mode-dexercice'), 'Libéral');
    assert.strictEqual(champ(d, 'phone'), '+33 6 12 34 56 78');
    assert.strictEqual(champ(d, 'email'), 'claire.martin@exemple.fr');
    assert.strictEqual(champ(d, 'vat-id'), 'Non renseigné');
    assert.strictEqual(txt(d, '[data-ordo-initiales]'), 'CM');
    assert.strictEqual(txt(d, '[data-ordo-nom-complet]'), 'Claire Martin');
    assert.strictEqual(txt(d, '[data-ordo-resume]'), 'Médecin · Médecine générale · Libéral');
    assert.strictEqual(txt(d, '[data-ordo-v2="securite"] [data-ordo-champ="email"]'), 'claire.martin@exemple.fr');
    assert.ok(visible(w, d.querySelector('[data-ordo-v2="profil"]')), 'bloc profil affiché');
  });

  await test('anciens blocs masqués dans les deux onglets, et seulement là', async () => {
    const { w, d } = await page();
    const info = d.querySelector('.w-tab-pane[data-w-tab="information"] .compte_form');
    const secu = d.querySelector('.w-tab-pane[data-w-tab="security"] .compte_form');
    const bill = d.querySelector('.w-tab-pane[data-w-tab="billing"] .compte_form');
    for (const b of info.querySelectorAll(':scope > .inner-block-wraper')) assert.ok(!visible(w, b), 'ancien bloc profil masqué');
    for (const b of secu.querySelectorAll(':scope > .inner-block-wraper')) assert.ok(!visible(w, b), 'ancien bloc sécurité masqué');
    const billing = bill.querySelectorAll(':scope > .inner-block-wraper');
    assert.ok(billing.length > 0);
    for (const b of billing) assert.ok(visible(w, b), 'bloc facturation intact');
  });

  await test('interne : mode d\'exercice, TVA et SIREN masqués, TVA masquée aussi dans le formulaire', async () => {
    const m = clone(MEDECIN);
    m.customFields.statut = 'Interne';
    m.customFields['vat-id'] = 'FR00000000000';
    const { w, d } = await page({ member: m });
    const pro = d.querySelectorAll('[data-ordo-v2="profil"] [data-ordo-si-pas-interne]');
    assert.strictEqual(pro.length, 3);
    for (const el of pro) assert.ok(!visible(w, el));
    assert.strictEqual(txt(d, '[data-ordo-resume]'), 'Interne · Médecine générale');
    d.querySelector('[data-ordo-edit="pro"]').click();
    const tva = d.querySelector('[data-ordo-form-slot="pro"] [data-ms-member="vat-id"]');
    assert.ok(tva, 'formulaire pro déplacé');
    assert.ok(!visible(w, tva.closest('.form-field-wrapper') || tva.parentNode), 'TVA masquée dans le formulaire');
    const statut = d.querySelector('[data-ordo-form-slot="pro"] select[data-ms-member="statut"]');
    statut.value = 'Medecin';
    statut.dispatchEvent(new w.Event('change'));
    assert.ok(visible(w, tva.closest('.form-field-wrapper') || tva.parentNode), 'TVA revient pour un médecin');
  });

  await test('valeur hors liste conservée : ajoutée comme option et sélectionnée', async () => {
    const m = clone(MEDECIN);
    m.customFields.statut = 'PADHUE';
    const { d } = await page({ member: m });
    assert.strictEqual(champ(d, 'statut'), 'PADHUE');
    d.querySelector('[data-ordo-edit="pro"]').click();
    const s = d.querySelector('[data-ordo-form-slot="pro"] select[data-ms-member="statut"]');
    assert.strictEqual(s.value, 'PADHUE');
  });

  await test('formulaire pro : la cellule SIRET n\'y apparaît plus (le SIREN a sa carte)', async () => {
    const { w, d } = await page();
    d.querySelector('[data-ordo-edit="pro"]').click();
    const siret = d.querySelector('[data-ordo-form-slot="pro"] #SIRET');
    assert.ok(siret, 'champ SIRET toujours dans le formulaire (valeur envoyée)');
    assert.ok(!visible(w, siret.closest('.form-field-wrapper') || siret.parentNode));
  });

  await test('modifier puis annuler : formulaire déplacé, lecture masquée, valeurs remises', async () => {
    const { w, d, pushed } = await page();
    const btn = d.querySelector('[data-ordo-edit="perso"]');
    btn.click();
    const slot = d.querySelector('[data-ordo-form-slot="perso"]');
    const input = slot.querySelector('#first-name');
    assert.ok(input, 'formulaire perso dans la carte');
    assert.ok(visible(w, slot));
    assert.ok(!visible(w, d.querySelector('[data-ordo-lecture="perso"]')));
    assert.ok(!visible(w, btn));
    input.value = 'Brouillon';
    const annuler = [...slot.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Annuler');
    annuler.click();
    assert.ok(!visible(w, slot));
    assert.ok(visible(w, d.querySelector('[data-ordo-lecture="perso"]')));
    assert.strictEqual(input.value, 'Claire');
    assert.ok(pushed.some((p) => p.event === 'profile_action' && p.profile_action === 'edit' && p.profile_outcome === 'open'));
    assert.ok(pushed.some((p) => p.profile_outcome === 'cancel'));
  });

  await test('contact : e-mail modifiable avec mot de passe, pas sans', async () => {
    let r = await page();
    r.d.querySelector('[data-ordo-edit="contact"]').click();
    assert.ok(r.d.querySelector('[data-ordo-form-slot="contact"] form[data-ms-form="email"]'), 'e-mail dans Contact');
    r = await page({ before: (w) => {
      // Memberstack traite tout ce qui porte la condition : ancien bloc et nouvelle ligne.
      for (const g of w.document.querySelectorAll('[data-ms-content="has-password"]')) g.style.display = 'none';
    } });
    r.d.querySelector('[data-ordo-edit="contact"]').click();
    assert.ok(!r.d.querySelector('[data-ordo-form-slot="contact"] form[data-ms-form="email"]'), 'pas d\'e-mail sans mot de passe');
    assert.ok(r.d.querySelector('[data-ordo-form-slot="contact"] #profile-tab-3'));
  });

  await test('une seule carte ouverte : l\'e-mail passe de Contact à Sécurité', async () => {
    const { w, d } = await page();
    d.querySelector('[data-ordo-edit="contact"]').click();
    d.querySelector('[data-ordo-edit="email"]').click();
    assert.ok(d.querySelector('[data-ordo-form-slot="email"] form[data-ms-form="email"]'));
    assert.ok(!visible(w, d.querySelector('[data-ordo-form-slot="contact"]')), 'Contact refermé');
  });

  await test('l\'e-mail repart de Sécurité vers Contact : la ligne Sécurité se referme', async () => {
    const { w, d } = await page();
    d.querySelector('[data-ordo-edit="email"]').click();
    d.querySelector('[data-ordo-edit="contact"]').click();
    assert.ok(!visible(w, d.querySelector('[data-ordo-form-slot="email"]')), 'carte vide refermée');
    assert.ok(visible(w, d.querySelector('[data-ordo-edit="email"]')), '« Modifier » de nouveau là');
  });

  await test('« Annuler » après un changement de statut prévient les autres scripts', async () => {
    const { w, d } = await page();
    d.querySelector('[data-ordo-edit="pro"]').click();
    const statut = d.querySelector('[data-ordo-form-slot="pro"] select[data-ms-member="statut"]');
    let vu = null;
    statut.addEventListener('change', (e) => { vu = e.target.value; });
    statut.value = 'Interne';
    const slot = d.querySelector('[data-ordo-form-slot="pro"]');
    [...slot.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Annuler').click();
    assert.strictEqual(vu, 'Medecin');
  });

  await test('enregistrement : relecture du membre puis retour à la lecture', async () => {
    const fresh = clone(MEDECIN);
    fresh.customFields.prnom = 'Clara';
    const { w, d } = await page({ fresh });
    d.querySelector('[data-ordo-edit="perso"]').click();
    const form = d.querySelector('[data-ordo-form-slot="perso"] form');
    form.querySelector('#first-name').value = 'Clara';
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await tick(1700);
    assert.strictEqual(champ(d, 'prnom'), 'Clara');
    assert.ok(!visible(w, d.querySelector('[data-ordo-form-slot="perso"]')));
  });

  await test('enregistrement non constaté : la carte reste ouverte, la saisie aussi', async () => {
    const { w, d, pushed } = await page();
    d.querySelector('[data-ordo-edit="perso"]').click();
    const form = d.querySelector('[data-ordo-form-slot="perso"] form');
    form.querySelector('#first-name').value = 'Clara'; // Memberstack renvoie toujours « Claire »
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await tick(1700);
    assert.ok(visible(w, d.querySelector('[data-ordo-form-slot="perso"]')), 'pas refermée sur une supposition');
    assert.strictEqual(form.querySelector('#first-name').value, 'Clara');
    assert.ok(!pushed.some((p) => p.profile_outcome === 'saved'));
  });

  await test('relecture : l\'objet membre partagé est mis à jour, pas remplacé ; le SIRET du finder survit', async () => {
    const fresh = clone(MEDECIN);
    fresh.customFields.siret = '11111111111111';
    const m = clone(MEDECIN);
    m.customFields.siret = '11111111111111';
    let ref = null; // référence tenue par les autres scripts, prise AVANT la relecture
    const { w, d } = await page({ member: m, fresh, before: (win) => { ref = win.OrdoAccount.member.customFields; } });
    await tick(10);
    assert.strictEqual(w.OrdoAccount.member.customFields, ref, 'même objet après relecture');
    // Le finder vient d'enregistrer un nouveau SIREN : il écrit le champ caché.
    d.getElementById('SIRET').value = '552100554';
    d.querySelector('[data-ordo-edit="pro"]').click();
    assert.strictEqual(d.getElementById('SIRET').value, '552100554', 'SIRET du finder conservé');
  });

  await test('après un enregistrement réussi, « Modifier » rouvre bien les champs', async () => {
    const { w, d } = await page();
    d.querySelector('[data-ordo-edit="perso"]').click();
    const wrap = d.querySelector('[data-ordo-form-slot="perso"] .w-form');
    // État de succès Webflow : formulaire masqué, message affiché.
    wrap.querySelector('form').style.display = 'none';
    wrap.querySelector('.w-form-done').style.display = 'block';
    [...wrap.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Annuler').click();
    d.querySelector('[data-ordo-edit="perso"]').click();
    assert.ok(visible(w, wrap.querySelector('form')), 'champs de nouveau visibles');
    assert.ok(!visible(w, wrap.querySelector('.w-form-done')), 'message de succès retiré');
  });

  await test('double authentification : cachée si non flaggé, affichée si flaggé', async () => {
    let r = await page({ before: (w) => { w.document.getElementById('ordotype-totp-section').style.display = 'none'; } });
    const block = r.d.querySelector('[data-ordo-2fa-block]');
    assert.ok(block.querySelector('[data-ordo-totp-slot] #ordotype-totp-section'), 'module déplacé');
    assert.ok(!visible(r.w, block));
    r = await page();
    const b2 = r.d.querySelector('[data-ordo-2fa-block]');
    assert.ok(!visible(r.w, b2), 'en attente : cachée');
    b2.setAttribute('data-ordo-2fa-state', 'required');
    await tick(0);
    assert.ok(visible(r.w, b2), 'flaggé : affichée');
    b2.setAttribute('data-ordo-2fa-state', 'not-required');
    await tick(0);
    assert.ok(!visible(r.w, b2));
    r = await page({ before: (w) => { w.document.getElementById('ordotype-totp-section').innerHTML = '<div class="ot-totp"><button data-ot-action="start-setup">Activer</button></div>'; } });
    assert.ok(visible(r.w, r.d.querySelector('[data-ordo-2fa-block]')), 'module déjà monté avant le script');
  });

  await test('Google : le bloc Memberstack d\'origine (état connecté, déliaison) prend la place du bouton', async () => {
    const { w, d } = await page();
    const providers = d.querySelector('[data-ordo-v2="securite"] [data-ms-auth="manage-providers"]');
    assert.ok(providers, 'conteneur déplacé dans la carte');
    assert.ok(providers.querySelector('[data-ms-auth-disconnect]'), 'déliaison conservée');
    assert.ok(!visible(w, d.querySelector('[data-ordo-google]')), 'bouton de la carte masqué');
  });

  await test('Google sans conteneur Memberstack : le bouton de la carte relaie le clic', async () => {
    let clicked = 0;
    const { d } = await page({ before: (w) => {
      const p = w.document.querySelector('[data-ms-auth="manage-providers"]');
      p.removeAttribute('data-ms-auth');
      w.document.querySelector('[data-ms-auth-provider="google"]').addEventListener('click', () => { clicked += 1; });
    } });
    d.querySelector('[data-ordo-google]').click();
    assert.strictEqual(clicked, 1);
  });

  await test('suppression : le formulaire existant s\'ouvre dans la carte', async () => {
    const { w, d } = await page();
    d.querySelector('[data-ordo-supprimer]').click();
    const form = d.querySelector('[data-ordo-form-slot="suppression"] #delete-account-form-v2');
    assert.ok(form);
    assert.strictEqual(form.style.display, 'block');
    assert.ok(!visible(w, d.querySelector('[data-ordo-supprimer]')));
  });

  await test('finder SIREN déplacé dans sa carte', async () => {
    const { d } = await page({ before: (w) => {
      const root = w.document.createElement('div');
      root.className = 'ordo-siren';
      w.document.getElementById('SIRET').parentNode.appendChild(root);
    } });
    assert.ok(d.querySelector('[data-ordo-siren-slot] .ordo-siren'));
  });

  await test('valeurs rendues comme du texte, jamais comme du HTML', async () => {
    const m = clone(MEDECIN);
    m.customFields.prnom = '<img src=x onerror=alert(1)>';
    const { d } = await page({ member: m });
    assert.ok(!d.querySelector('[data-ordo-v2] [data-ordo-champ] img, [data-ordo-v2] [data-ordo-nom-complet] img'));
    assert.strictEqual(champ(d, 'prnom'), '<img src=x onerror=alert(1)>');
  });

  await test('secours : sans bloc V2, rien ne change', async () => {
    const sans = FIXTURE.replace(/data-ordo-v2="[a-z]+"/g, 'data-ancien="1"');
    const { d, pushed } = await page({ fixture: sans });
    assert.ok(!d.documentElement.classList.contains('ordo-profil-v2'));
    assert.strictEqual(pushed.length, 0);
  });

  await test('secours : une erreur au rendu laisse l\'ancienne présentation et la signale', async () => {
    const m = clone(MEDECIN);
    const { w, d, reports, pushed } = await page({ member: m, before: (w) => {
      Object.defineProperty(w.OrdoAccount.member, 'customFields', { get() { throw new Error('boom'); } });
    } });
    assert.ok(!d.documentElement.classList.contains('ordo-profil-v2'));
    assert.ok(!visible(w, d.querySelector('[data-ordo-v2="profil"]')), 'nouveau bloc resté masqué');
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].name, 'ProfileOverviewInit');
    assert.ok(pushed.some((p) => p.profile_action === 'view' && p.profile_outcome === 'failed'));
  });

  await test('secours : une erreur après les déplacements remet finder et module TOTP à leur place', async () => {
    const { d } = await page({ before: (w) => {
      const root = w.document.createElement('div');
      root.className = 'ordo-siren';
      w.document.getElementById('SIRET').parentNode.appendChild(root);
      Object.defineProperty(w, 'OrdoRollout', { get() { throw new Error('boom'); } });
    } });
    assert.ok(!d.documentElement.classList.contains('ordo-profil-v2'));
    assert.ok(!d.querySelector('[data-ordo-v2] .ordo-siren'), 'finder revenu dans l\'ancien formulaire');
    assert.ok(!d.querySelector('[data-ordo-v2] #ordotype-totp-section'), 'module TOTP revenu');
    assert.ok(!d.querySelector('[data-ordo-v2] [data-ms-auth="manage-providers"]'), 'Google revenu');
  });

  await test('membre absent : aucun effet', async () => {
    const { d } = await page({ member: {} });
    assert.ok(!d.documentElement.classList.contains('ordo-profil-v2'));
  });

  console.log(`profile-overview : ${passed} tests OK`);
})();
