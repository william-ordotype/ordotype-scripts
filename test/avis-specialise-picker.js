#!/usr/bin/env node
/**
 * Page /avis-specialise : le choix de la spécialité avant de partir vers Omnidoc.
 *
 * Trois écrans selon l'adresse : liste seule, une spécialité affichée, ou un choix entre
 * plusieurs. Les cas surveillés ici sont ceux qui cassent sans erreur visible :
 *
 *   - un code accentué envoyé décomposé (macOS) doit rester reconnu, Omnidoc refusant l'autre ;
 *   - un code inconnu ou un slug de fiche trafiqué doivent être ignorés, jamais recopiés ;
 *   - le bouton reste inactif tant qu'aucune spécialité n'est choisie ;
 *   - la page fonctionne même si error-reporter.js est bloqué.
 *
 * Usage : node test/avis-specialise-picker.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'avis-specialise/picker.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(__dirname, 'fixtures/avis-specialise.html'), 'utf8');
const OMNIDOC = 'https://app.omnidoc.fr/discover/map?specialty=';

let echecs = 0;
function verifier(nom, ok, detail) {
  if (ok) console.log('ok   ' + nom);
  else { echecs++; console.log('ÉCHEC ' + nom + (detail === undefined ? '' : ' → ' + JSON.stringify(detail))); }
}

function jouer(query, opts = {}) {
  const dom = new JSDOM(PAGE, {
    url: 'https://www.ordotype.fr/avis-specialise' + query,
    referrer: opts.referrer,
    runScripts: 'outside-only',
  });
  const w = dom.window;
  const evenements = [];
  if (!opts.sansReporter) {
    w.OrdoErrorReporter = { track: (p) => evenements.push(p), report: (a, b) => evenements.push({ report: a, msg: String(b) }) };
  }
  w.eval(SOURCE);
  return { w, d: w.document, evenements };
}

const lien = (r) => r.d.getElementById('omd-continue').href;
const retour = (r) => r.d.getElementById('omd-back').getAttribute('href');

// Plusieurs spécialités : un bouton radio par spécialité, la première cochée.
let r = jouer('?specialites=pneumo,allergo&fiche=asthme');
let radios = r.d.querySelectorAll('#omd-options input[type=radio]');
verifier('choix : deux boutons radio', radios.length === 2, radios.length);
verifier('choix : la première cochée', radios[0].checked && radios[0].value === 'pneumo');
verifier('choix : lien vers pneumologie', lien(r) === OMNIDOC + 'pneumo', lien(r));
verifier('choix : les deux retirées de la liste déroulante',
  !r.d.querySelector('#omd-other option[value=pneumo]') && !r.d.querySelector('#omd-other option[value=allergo]'));
verifier('choix : retour vers la fiche',
  retour(r) === '/pathologies/asthme' && r.d.getElementById('omd-back-top').getAttribute('href') === '/pathologies/asthme');

radios[1].checked = true;
radios[1].dispatchEvent(new r.w.Event('change'));
verifier('choix : cocher la seconde change le lien', lien(r).endsWith('specialty=allergo'), lien(r));
verifier('choix : une seule ligne surlignée',
  r.d.querySelectorAll('.omd-option.is-checked').length === 1 && r.d.querySelector('.omd-option.is-checked input').value === 'allergo');

let select = r.d.getElementById('omd-other');
select.value = 'gastro_hépato';
select.dispatchEvent(new r.w.Event('change'));
verifier('choix : une autre spécialité, accent encodé', lien(r) === OMNIDOC + 'gastro_h%C3%A9pato', lien(r));
verifier('choix : les radios se décochent', [...radios].every((x) => !x.checked));
select.value = '';
select.dispatchEvent(new r.w.Event('change'));
verifier('choix : revenir à vide reprend la première', lien(r).endsWith('specialty=pneumo') && radios[0].checked);

r.d.getElementById('omd-continue').dispatchEvent(new r.w.MouseEvent('click', { cancelable: true }));
verifier('mesure : vue de page et clic',
  r.evenements.some((e) => e.event === 'omnidoc_page_view')
  && r.evenements.some((e) => e.event === 'omnidoc_continue_click' && e.omnidoc_specialite === 'pneumo' && e.omnidoc_fiche === 'asthme'),
  r.evenements);

// Une seule spécialité : elle est affichée, « Changer » ouvre la liste.
r = jouer('?specialites=gastro_h%C3%A9pato&fiche=cirrhose');
verifier('une seule : pas de bouton radio', r.d.querySelectorAll('#omd-options input').length === 0);
verifier('une seule : spécialité affichée',
  r.d.querySelector('.omd-option.is-checked .omd-option-name').textContent === 'Gastro-entérologie et hépatologie');
verifier('une seule : liste repliée', r.d.getElementById('omd-other-wrap').hidden === true);
verifier('une seule : lien vers gastro', lien(r).endsWith('specialty=gastro_h%C3%A9pato'), lien(r));
r.d.querySelector('.omd-change').click();
verifier('une seule : « Changer » déplie la liste', r.d.getElementById('omd-other-wrap').hidden === false);
select = r.d.getElementById('omd-other');
select.value = 'hemato';
select.dispatchEvent(new r.w.Event('change'));
verifier('une seule : le nom affiché suit le changement',
  r.d.querySelector('.omd-option-name').textContent === 'Hématologie' && lien(r).endsWith('specialty=hemato'));

// Le même code accentué, envoyé décomposé (NFD) : doit rester reconnu.
r = jouer('?specialites=' + encodeURIComponent('gastro_hépato'.normalize('NFD')));
verifier('accent décomposé reconnu', lien(r) === OMNIDOC + 'gastro_h%C3%A9pato', lien(r));

// Aucune spécialité : liste seule, bouton inactif tant que rien n'est choisi.
r = jouer('');
verifier('libre : pas de liste de spécialités de fiche', r.d.getElementById('omd-options').hidden === true);
verifier('libre : bouton inactif', r.d.getElementById('omd-continue').getAttribute('aria-disabled') === 'true');
const clic = new r.w.MouseEvent('click', { cancelable: true });
r.d.getElementById('omd-continue').dispatchEvent(clic);
verifier('libre : clic sans choix bloqué', clic.defaultPrevented === true);
select = r.d.getElementById('omd-other');
select.value = 'derm_venero';
select.dispatchEvent(new r.w.Event('change'));
verifier('libre : un choix active le bouton',
  !r.d.getElementById('omd-continue').hasAttribute('aria-disabled') && lien(r).endsWith('specialty=derm_venero'));
verifier('libre : 31 spécialités proposées', r.d.querySelectorAll('#omd-other option').length === 32,
  r.d.querySelectorAll('#omd-other option').length);
verifier('libre : douleur et soins palliatifs proposés', !!r.d.querySelector('#omd-other option[value=doul_soins_pal]'));
verifier('libre : chirurgie orale et neurochirurgie proposées',
  !!r.d.querySelector('#omd-other option[value=chir_orale]') && !!r.d.querySelector('#omd-other option[value=neuro_chir]'));
verifier('libre : biologie médicale absente', !r.d.querySelector('#omd-other option[value=bio_med]'));

// Adresses trafiquées.
r = jouer('?specialites=xxx,https://evil.example,pneumo&fiche=../../evil');
verifier('piège : codes inconnus ignorés', lien(r) === OMNIDOC + 'pneumo', lien(r));
verifier('piège : slug de fiche invalide ignoré', retour(r) === '/');
r = jouer('?specialites=bio_med');
verifier('piège : code retiré de la liste refusé', r.d.getElementById('omd-continue').getAttribute('aria-disabled') === 'true');
r = jouer('?fiche=asthme%22%3E%3Cscript%3E');
verifier('piège : tentative d\'injection dans le retour', retour(r) === '/');
r = jouer('?specialites=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
verifier('piège : rien d\'injecté dans la page', !r.d.querySelector('img'));
r = jouer('', { referrer: 'https://www.ordotype.fr/pathologies/acne' });
verifier('retour : page précédente interne', retour(r) === 'https://www.ordotype.fr/pathologies/acne');
r = jouer('', { referrer: 'https://evil.example/x' });
verifier('retour : page précédente externe ignorée', retour(r) === '/');

// error-reporter.js bloqué (extension, réseau) : la page marche quand même.
r = jouer('?specialites=pneumo,allergo', { sansReporter: true });
verifier('sans error-reporter : la page fonctionne', lien(r).endsWith('specialty=pneumo'));
r.d.getElementById('omd-continue').dispatchEvent(new r.w.MouseEvent('click', { cancelable: true }));
verifier('sans error-reporter : le clic ne lève rien', true);

console.log(echecs ? '\n' + echecs + ' échec(s)' : '\nTout passe');
process.exit(echecs ? 1 : 0);
