#!/usr/bin/env node
/**
 * Liens « avis » du rappel clinique vers /avis-specialise.
 *
 * Le script transforme en lien une mention qui demande l'avis d'un
 * spécialiste : « avis spécialisé » (spécialités de la fiche) ou un avis qui
 * nomme la spécialité (« avis pneumologique »). Il ne touche pas :
 *
 *   - une phrase qui parle d'urgence (« avis spécialisé en urgence ») : la
 *     téléexpertise n'est pas adaptée, « sans urgence » ne compte pas ;
 *   - une fiche d'urgence (adresse contenant « urgences ») ;
 *   - un « avis » qui n'est pas une demande (« avis divergents », « avis
 *     favorable de la HAS ») ou vise une structure (« avis d'un centre ») ;
 *   - un texte déjà dans un lien ;
 *   - un mot qui contient « avis » (« préavis ») : `\b` de JavaScript ne
 *     connaît pas les lettres accentuées, d'où un test explicite.
 *
 * Tant que ENABLED vaut false, rien ne se passe sans l'aperçu (`?omnidoc=1`,
 * mémorisé ; `?omnidoc=0` l'efface).
 *
 * Usage : node test/omnidoc-links.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'pathology/omnidoc-links.js'), 'utf8');

let echecs = 0;
function verifier(nom, ok, detail) {
  if (ok) console.log('ok   ' + nom);
  else { echecs++; console.log('ÉCHEC ' + nom + (detail === undefined ? '' : ' → ' + JSON.stringify(detail))); }
}

function page(slug, corps, query) {
  const html = '<!doctype html><html><head></head><body><div class="rc-html w-richtext">' + corps + '</div></body></html>';
  const dom = new JSDOM(html, { url: 'https://www.ordotype.fr/pathologies/' + slug + (query === undefined ? '?omnidoc=1' : query), runScripts: 'outside-only' });
  const w = dom.window;
  const evenements = [];
  w.OrdoErrorReporter = { track: (p) => evenements.push(p), report: (a, b) => evenements.push({ report: a, msg: String(b) }) };
  return { w, d: w.document, evenements, async jouer() { w.eval(SOURCE); await new Promise((r) => setTimeout(r, 30)); return this; } };
}

function liens(d) {
  return [...d.querySelectorAll('.ordo-omnidoc-link')].map((a) => ({
    texte: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'),
  }));
}

(async () => {
  let p = page('asthme', '<ul><li>Chez l\'adolescent : avis spécialisé.</li></ul>', ''); await p.jouer();
  verifier('sans aperçu : aucun lien', liens(p.d).length === 0);

  p = page('asthme', '<ul><li>Chez l\'adolescent : avis spécialisé.</li></ul>'); await p.jouer();
  let l = liens(p.d);
  verifier('aperçu : un lien', l.length === 1, l);
  verifier('aperçu : texte lié', l[0] && l[0].texte === 'avis spécialisé', l);
  verifier('spécialités de la fiche, la plus large d\'abord', l[0] && l[0].href === '/avis-specialise?specialites=pneumo,allergo&fiche=asthme', l);
  verifier('aperçu mémorisé', p.w.localStorage.getItem('ordo_omnidoc_preview') === '1');

  p = page('asthme', '<p>Éviter les bêtabloquants (avis pneumologique en cas de nécessité).</p>'); await p.jouer();
  l = liens(p.d);
  verifier('avis nommé : spécialité du texte', l.length === 1 && l[0].texte === 'avis pneumologique' && l[0].href === '/avis-specialise?specialites=pneumo&fiche=asthme', l);

  p = page('acouphenes', '<ul><li>Signes otologiques : avis <abbr data-tooltip="Oto-rhino-laryngologie">ORL</abbr> (bilan).</li></ul>'); await p.jouer();
  l = liens(p.d);
  verifier('avis + abréviation : le lien englobe la balise', l.length === 1 && l[0].texte === 'avis ORL' && p.d.querySelector('.ordo-omnidoc-link abbr') !== null, l);

  p = page('cirrhose', '<p>Bilan : avis gastro-entérologique.</p>'); await p.jouer();
  l = liens(p.d);
  verifier('code gastro encodé', l.length === 1 && l[0].href === '/avis-specialise?specialites=gastro_h%C3%A9pato&fiche=cirrhose', l);

  p = page('fiche-sans-specialite', '<p>Suivi : avis spécialisé.</p>'); await p.jouer();
  l = liens(p.d);
  verifier('fiche sans spécialité : choix libre', l.length === 1 && l[0].href === '/avis-specialise?fiche=fiche-sans-specialite', l);

  p = page('asthme', [
    '<p>Signes de gravité : avis spécialisé en urgence.</p>',
    '<p>Hospitalisation ou avis spécialisé rapide.</p>',
    '<p>Échec du traitement : avis spécialisé sans urgence.</p>',
  ].join('')); await p.jouer();
  l = liens(p.d);
  verifier('urgence : pas de lien, « sans urgence » garde le sien', l.length === 1 && p.d.querySelectorAll('p')[2].querySelector('.ordo-omnidoc-link') !== null, l);

  p = page('asthme', [
    '<p>Les sociétés savantes ont des avis divergents.</p>',
    '<p>Molécule non remboursée (avis favorable de la HAS).</p>',
    '<p>Solliciter l\'avis d\'un centre de référence.</p>',
    '<p>Respecter le préavis de trois mois.</p>',
    '<p>Voir <a href="/x">avis spécialisé</a>.</p>',
  ].join('')); await p.jouer();
  verifier('pas une demande, structure, préavis, lien existant : rien', liens(p.d).length === 0, liens(p.d));

  p = page('traumatisme-cranien-urgences', '<p>Symptômes persistants : avis spécialisé.</p>'); await p.jouer();
  verifier('fiche d\'urgence : rien', liens(p.d).length === 0);

  p = page('asthme', '<ul><li>Palier 4 : avis spécialisé.<ul><li>Adolescent : avis spécialisé.</li></ul></li></ul>'); await p.jouer();
  verifier('listes imbriquées : un lien par mention, sans doublon', liens(p.d).length === 2 && p.d.querySelectorAll('.ordo-omnidoc-link .ordo-omnidoc-link').length === 0, liens(p.d));

  p = page('asthme', '<p>Deux mentions : avis spécialisé, puis avis pneumologique.</p>'); await p.jouer();
  l = liens(p.d);
  verifier('deux mentions dans le même texte', l.length === 2 && l[0].texte === 'avis spécialisé' && l[1].texte === 'avis pneumologique', l);
  verifier('texte intact autour des liens', p.d.querySelector('p').textContent === 'Deux mentions : avis spécialisé, puis avis pneumologique.');

  p = page('asthme', '<p>Suivi : avis spécialisé.</p>'); await p.jouer();
  p.w.eval(SOURCE);
  await new Promise((r) => setTimeout(r, 30));
  verifier('exécuté deux fois : un seul lien', liens(p.d).length === 1);
  p.w.addEventListener('click', (e) => e.preventDefault());
  p.d.querySelector('.ordo-omnidoc-link').dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const clic = p.evenements.find((e) => e.event === 'omnidoc_fiche_link_click');
  verifier('clic mesuré', clic && clic.omnidoc_fiche === 'asthme' && clic.omnidoc_type === 'generic' && clic.omnidoc_specialites === 'pneumo,allergo', p.evenements);

  p = page('asthme', '<p>&lt;strong&gt;Suivi&lt;/strong&gt; : avis spécialisé.</p>'); await p.jouer();
  verifier('contenu encore échappé : attend', liens(p.d).length === 0);
  const para = p.d.querySelector('p');
  para.innerHTML = para.textContent;
  await new Promise((r) => setTimeout(r, 400));
  verifier('contenu décodé : lien posé', liens(p.d).length === 1, liens(p.d));

  p = page('asthme', '<p>Suivi : avis spécialisé.</p>', '?omnidoc=1'); await p.jouer();
  p = page('asthme', '<p>Suivi : avis spécialisé.</p>', '?omnidoc=0');
  p.w.localStorage.setItem('ordo_omnidoc_preview', '1');
  await p.jouer();
  verifier('?omnidoc=0 coupe l\'aperçu', liens(p.d).length === 0 && p.w.localStorage.getItem('ordo_omnidoc_preview') === null);

  p = page('asthme', '<p>Suivi : avis spécialisé.</p>');
  delete p.w.OrdoErrorReporter;
  await p.jouer();
  p.w.addEventListener('click', (e) => e.preventDefault());
  p.d.querySelector('.ordo-omnidoc-link').dispatchEvent(new p.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  verifier('sans error-reporter : lien posé, clic sans erreur', liens(p.d).length === 1);

  console.log(echecs ? '\n' + echecs + ' échec(s)' : '\nTout passe');
  process.exit(echecs ? 1 : 0);
})();
