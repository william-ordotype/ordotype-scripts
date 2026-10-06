#!/usr/bin/env node
/**
 * Mon compte : la carte « E-mails » sous « Contact ».
 *
 * Ce qui doit tenir :
 *   - la carte arrive juste après la carte Contact du bloc « Mon profil », une seule fois ;
 *   - son bouton mène à /preferences-email ;
 *   - aucun appel réseau (l'état se lit sur la page des préférences) ;
 *   - sans bloc « Mon profil », rien n'est ajouté et rien ne casse.
 *
 * Usage : node test/email-preferences-card.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'account/email-preferences-card.js'), 'utf8');
const PROFIL = '<div data-ordo-v2="profil" class="compte-v2_wrap is-on">'
  + '<div data-ordo-section="perso" class="compte-v2_card"></div>'
  + '<div data-ordo-section="contact" class="compte-v2_card"><h3 class="compte-v2_card-title">Contact</h3></div>'
  + '<div class="compte-v2_help is-colonne"></div></div>';

let echecs = 0;
function verifier(nom, ok, detail) {
  if (ok) console.log('ok   ' + nom);
  else { echecs++; console.log('ÉCHEC ' + nom + (detail === undefined ? '' : ' → ' + JSON.stringify(detail))); }
}

function jouer(body) {
  const dom = new JSDOM('<!doctype html><html><body>' + body + '</body></html>', { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only' });
  const w = dom.window;
  const appels = [];
  const evenements = [];
  w.fetch = (u) => { appels.push(u); return Promise.reject(new Error('interdit')); };
  w.XMLHttpRequest = function() { appels.push('xhr'); };
  w.OrdoErrorReporter = { track: (p) => evenements.push(p), report() {}, reportNetwork() {} };
  w.console = { log() {}, warn() {}, error() {} };
  w.eval(SOURCE);
  return { w, d: w.document, appels, evenements };
}

(async () => {
  let r = jouer(PROFIL);
  const cartes = [...r.d.querySelectorAll('[data-ordo-v2="profil"] > .compte-v2_card')].map((c) => c.getAttribute('data-ordo-section'));
  verifier('carte placée juste après Contact', JSON.stringify(cartes) === JSON.stringify(['perso', 'contact', 'emails']), cartes);
  const lien = r.d.querySelector('[data-ordo-section="emails"] a.compte-v2_btn');
  verifier('bouton « Modifier » vers /preferences-email, comme les autres cartes', lien && lien.getAttribute('href') === '/preferences-email' && lien.textContent === 'Modifier');
  const champs = [...r.d.querySelectorAll('[data-ordo-section="emails"] .compte-v2_dl .compte-v2_field')]
    .map((f) => f.querySelector('.compte-v2_dt').textContent + ' = ' + f.querySelector('.compte-v2_dd').textContent);
  verifier('grille libellé / valeur comme « Contact »', JSON.stringify(champs) === JSON.stringify(['E-mails liés à votre compte = Toujours envoyés', 'Newsletter, conseils et offres = Selon vos préférences']), champs);
  verifier('titre « E-mails »', r.d.querySelector('[data-ordo-section="emails"] .compte-v2_card-title').textContent === 'E-mails');
  verifier('aucun appel réseau', r.appels.length === 0);
  lien.dispatchEvent(new r.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  verifier('clic mesuré', r.evenements.some((e) => e.event === 'email_preferences_open' && e.email_prefs_from === 'compte'));
  r.w.eval(SOURCE);
  verifier('rejoué : une seule carte', r.d.querySelectorAll('[data-ordo-section="emails"]').length === 1);

  r = jouer('<div data-ordo-section="contact" class="compte-v2_card"></div>');
  await new Promise((ok) => setTimeout(ok, 50));
  verifier('sans bloc « Mon profil » : rien d\'ajouté', !r.d.querySelector('[data-ordo-section="emails"]'));

  r = jouer('');
  r.d.body.innerHTML = PROFIL;
  await new Promise((ok) => setTimeout(ok, 450));
  verifier('bloc rendu plus tard : carte ajoutée au passage suivant', !!r.d.querySelector('[data-ordo-section="emails"]'));

  console.log(echecs ? `\n${echecs} échec(s)` : '\nemail-preferences-card : tout passe');
  process.exit(echecs ? 1 : 0);
})();
