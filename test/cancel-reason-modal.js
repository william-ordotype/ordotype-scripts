#!/usr/bin/env node
/**
 * Motif de départ : la fenêtre s'intercale au clic sur « annuler mon abonnement », porte les
 * classes du site (aucune couleur propre), exige un motif, envoie une seule fois puis relance
 * la résiliation ; refermée sans réponse, elle ne résilie rien.
 *
 * Usage : node test/cancel-reason-modal.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'offre-annulation/cancel-reason-modal.js'), 'utf8');

const GABARIT = `<!doctype html><html><head></head><body>
  <form id="redeem-form" action="https://webhooks.ordotype.fr/.netlify/functions/member-forms"><button type="submit">Offre</button></form>
  <form id="pause-form" action="https://webhooks.ordotype.fr/.netlify/functions/member-forms"><button type="submit">Pause</button></form>
  <form id="cancel-form" action="https://webhooks.ordotype.fr/.netlify/functions/member-forms">
    <button class="form_link" type="submit">Non merci, annuler mon abonnement</button>
  </form>
</body></html>`;

function page() {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (!/navigation|not implemented/i.test(e.message)) erreurs.push(e.message); });
  const dom = new JSDOM(GABARIT, { url: 'https://www.ordotype.fr/membership/offre-annulation', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.OrdoMemberstack = { memberId: 'mem_1', email: 'membre@example.com', stripeCustomerId: 'cus_1', planConnections: [{ status: 'ACTIVE', planId: 'pln_mg' }] };
  const envois = [];
  w.navigator.sendBeacon = (url, blob) => { envois.push({ url, blob }); return true; };
  w.fetch = () => { throw new Error('fetch ne doit pas servir quand sendBeacon accepte'); };
  w.dataLayer = [];
  const rapports = [];
  w.OrdoErrorReporter = { report: (name, err) => rapports.push(err.name) };
  // La vraie résiliation (redeem-cancel-forms.js) : on compte les soumissions qui passent.
  const resiliations = [];
  w.document.getElementById('cancel-form').addEventListener('submit', (e) => { e.preventDefault(); resiliations.push(1); });
  w.eval(SCRIPT);
  if (w.document.readyState === 'loading') w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d: w.document, envois, resiliations, rapports, erreurs };
}

function clicResilier(d) {
  d.querySelector('#cancel-form button').click();
}

function cocher(d, code) {
  const input = d.getElementById('ordo-reason-' + code);
  input.click();
  return input;
}

// 1. Le clic sur « annuler » ouvre la fenêtre, sans résilier.
{
  const { d, resiliations, envois, erreurs } = page();
  clicResilier(d);
  assert.strictEqual(resiliations.length, 0, 'la résiliation attend le motif');
  assert.strictEqual(envois.length, 0);
  const fond = d.querySelector('.ordo-reason-backdrop');
  assert.ok(fond, 'fenêtre ouverte');
  // Composants du site : fond de la fenêtre de résiliation de Mon compte, fenêtre de Mes documents.
  assert.ok(fond.classList.contains('section_view') && fond.classList.contains('compte-modal'));
  const fenetre = fond.querySelector('[role="dialog"]');
  assert.ok(fenetre.classList.contains('view_wrapper') && fenetre.classList.contains('sauvegarder-ordonnance'));
  assert.ok(fenetre.querySelector('.header_holder .inner_header #ordo-reason-title'));
  assert.ok(fenetre.querySelector('img.close_icon.is_corner[role="button"][tabindex="0"]'));
  assert.strictEqual(fenetre.querySelectorAll('label.w-checkbox.checkbox_form .checkbox-ins').length, 6);
  assert.ok(fenetre.querySelector('textarea.form_input.is-champ'));
  assert.ok(fenetre.querySelector('button.button'), 'bouton du site');
  assert.ok(fenetre.querySelector('button.form_link'), 'lien du site');
  // Aucune couleur, ombre ni rayon propre au script.
  const css = d.getElementById('ordo-reason-styles').textContent;
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|box-shadow|border-radius|color:|var\(--/i.test(css), css);
  assert.ok(!/background:(?!none)/.test(css), 'pas de fond propre');
  assert.ok(d.documentElement.classList.contains('ordo-reason-lock'), 'page figée derrière');
  assert.deepStrictEqual(erreurs, []);
}

// 2. Sans motif : alerte, rien n'est envoyé ni résilié.
{
  const { d, resiliations, envois } = page();
  clicResilier(d);
  const valider = d.querySelector('.ordo-reason-dialog button.button');
  assert.strictEqual(valider.getAttribute('aria-disabled'), 'true');
  valider.click();
  const alerte = d.querySelector('[role="alert"]');
  assert.strictEqual(alerte.style.display, 'block');
  assert.ok(/au moins un motif/.test(alerte.textContent));
  assert.strictEqual(envois.length, 0);
  assert.strictEqual(resiliations.length, 0);
  assert.ok(d.querySelector('.ordo-reason-backdrop'), 'la fenêtre reste ouverte');
}

// 3. La case dessinée suit la vraie case, dans les deux sens.
{
  const { d } = page();
  clicResilier(d);
  const input = cocher(d, 'prix');
  const boite = input.parentNode.querySelector('.checkbox-ins');
  assert.ok(boite.classList.contains('w--redirected-checked'));
  assert.strictEqual(d.querySelector('.ordo-reason-dialog button.button').getAttribute('aria-disabled'), 'false');
  input.click();
  assert.ok(!boite.classList.contains('w--redirected-checked'));
  assert.ok(boite.classList.contains('checkbox-ins'), 'les autres classes restent');
}

// 4. « Autre » seul exige une précision.
{
  const { d, envois } = page();
  clicResilier(d);
  cocher(d, 'autre');
  const champ = d.getElementById('ordo-reason-other-text');
  assert.strictEqual(champ.parentNode.style.display, 'block', 'champ « Autre » visible');
  d.querySelector('.ordo-reason-dialog button.button').click();
  assert.ok(/précision/.test(d.querySelector('[role="alert"]').textContent));
  assert.strictEqual(envois.length, 0);
}

// 5. Motif donné : un seul envoi, formulaires marqués, fenêtre fermée, résiliation relancée.
{
  const { w, d, envois, resiliations, rapports } = page();
  clicResilier(d);
  cocher(d, 'usage');
  cocher(d, 'autre');
  const champ = d.getElementById('ordo-reason-other-text');
  champ.value = 'Je change de logiciel';
  champ.dispatchEvent(new w.Event('input'));
  const valider = d.querySelector('.ordo-reason-dialog button.button');
  valider.click();
  valider.click();
  assert.strictEqual(envois.length, 1, 'une seule livraison');
  assert.ok(/cancel-reason$/.test(envois[0].url));
  assert.ok(!d.querySelector('.ordo-reason-backdrop'), 'fenêtre retirée');
  assert.ok(!d.documentElement.classList.contains('ordo-reason-lock'));
  ['cancel-form', 'redeem-form', 'pause-form'].forEach((id) => {
    const f = d.getElementById(id);
    assert.strictEqual(f.querySelector('input[name="cancelReasonCodes"]').value, 'usage,autre');
    assert.strictEqual(f.querySelector('input[name="cancelReasonOther"]').value, 'Je change de logiciel');
  });
  const evt = w.dataLayer.find((e) => e.event === 'churn_reason_submitted');
  assert.strictEqual(evt.reason_codes, 'usage,autre');
  setTimeout(() => {
    assert.strictEqual(resiliations.length, 1, 'la résiliation repart une fois');
    assert.deepStrictEqual(rapports, []);
    // 6. Fermer sans répondre (Échap, croix au clavier) : rien n'est envoyé ni résilié.
    for (const fermer of [
      (dd, ww) => dd.dispatchEvent(new ww.KeyboardEvent('keydown', { key: 'Escape' })),
      (dd, ww) => dd.querySelector('img.close_icon').dispatchEvent(new ww.KeyboardEvent('keydown', { key: 'Enter' })),
      (dd) => dd.querySelector('button.ordo-reason-escape').click(),
    ]) {
      const p = page();
      clicResilier(p.d);
      cocher(p.d, 'prix');
      fermer(p.d, p.w);
      assert.ok(!p.d.querySelector('.ordo-reason-backdrop'), 'fenêtre fermée');
      assert.strictEqual(p.envois.length, 0);
      assert.strictEqual(p.resiliations.length, 0);
    }
    console.log('cancel-reason-modal : OK');
  }, 400);
}
