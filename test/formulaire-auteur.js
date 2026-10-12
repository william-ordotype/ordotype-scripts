#!/usr/bin/env node
/**
 * Formulaire des auteurs (auteurs/formulaire-auteur.js et auteurs/head.html).
 *
 * Ce qui doit tenir :
 *   - le lien personnel (#d=…) quitte la barre d'adresse dès le code d'en-tête et reste en session ;
 *   - il pré-remplit les champs, montre la page complète (expériences, diplômes, photo) ;
 *   - les blocs répétés sont des copies des gabarits du Designer, sans id en double ;
 *   - les contrôles bloquent l'envoi avec leurs messages, sans appel ;
 *   - l'envoi part en `text/plain`, sans que le gestionnaire de formulaires de Webflow le voie ;
 *   - « Merci » seulement sur 200 `ok` ; les refus du serveur donnent un message, et un 5xx est signalé ;
 *   - un texte piégé du lien ne s'injecte pas dans la page.
 *
 * Usage : node test/formulaire-auteur.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'auteurs/formulaire-auteur.js'), 'utf8');
const HEAD = fs.readFileSync(path.join(ROOT, 'auteurs/head.html'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'test/fixtures/formulaire-auteur.html'), 'utf8');
const SCRIPT_TETE = /<script>([\s\S]*?)<\/script>/.exec(HEAD)[1];

let echecs = 0;
function verifier(nom, ok, detail) {
  if (ok) console.log('ok   ' + nom);
  else { echecs++; console.log('ÉCHEC ' + nom + (detail === undefined ? '' : ' → ' + JSON.stringify(detail))); }
}
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const lien = (o) => '#d=' + Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function jouer({ hash = '', serveur = () => ({ status: 200, body: { ok: true } }), session = null, panne = false, sansMois = false } = {}) {
  const dom = new JSDOM(PAGE, { url: 'https://www.ordotype.fr/votre-page-auteur' + hash, runScripts: 'outside-only' });
  const w = dom.window;
  const appels = [];
  const evenements = [];
  const webflow = [];
  if (session) w.sessionStorage.setItem('ordo-auteur-brouillon', session);
  w.OrdoErrorReporter = { report: (a, b) => evenements.push({ report: a, msg: String(b && b.message || b) }) };
  w.console = { log() {}, warn() {}, error() {} };
  w.TextDecoder = TextDecoder;
  // Le gestionnaire de Webflow écoute les envois au niveau du document.
  w.document.addEventListener('submit', () => webflow.push(1));
  w.fetch = (url, opts) => {
    appels.push({ url, opts, corps: JSON.parse(opts.body) });
    if (panne) return Promise.reject(new TypeError('Failed to fetch'));
    const r = serveur(JSON.parse(opts.body));
    return Promise.resolve({ ok: r.status < 300, status: r.status, json: () => Promise.resolve(r.body) });
  };
  if (sansMois) {
    // Comme Safari sur ordinateur : un champ mois retombe en champ texte.
    const desc = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'type');
    Object.defineProperty(w.HTMLInputElement.prototype, 'type', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v === 'month' ? 'text' : v); },
    });
    const setAttr = w.Element.prototype.setAttribute;
    w.Element.prototype.setAttribute = function (n, v) { return setAttr.call(this, n, n === 'type' && v === 'month' ? 'text' : v); };
  }
  w.eval(SCRIPT_TETE);
  w.eval(SOURCE);
  await attendre(10); // le script démarre au DOMContentLoaded
  return { w, d: w.document, appels, evenements, webflow };
}
const $ = (r, id) => r.d.getElementById(id);
const visible = (el) => !el.hasAttribute('data-fa-cache');
const envoyer = (r) => $(r, 'fa-form').dispatchEvent(new r.w.Event('submit', { bubbles: true, cancelable: true }));
function remplirMinimum(r) {
  $(r, 'fa-prenom').value = 'Camille';
  $(r, 'fa-nom').value = 'Martin';
  $(r, 'fa-specialite').value = 'DES Médecine générale';
  $(r, 'fa-sansfiche').checked = true;
  $(r, 'fa-accord').checked = true;
}

const BROUILLON = {
  ref: 'A-012', type: 'complete', titre: 'Pr.', prenom: 'Zoé', nom: 'Lefèvre',
  specialite: 'DES de médecine générale (avant 2017)', sous_specialite: 'DU de gériatrie',
  description_equipe: 'Médecin généraliste', bio: 'Zoé est médecin.', bio_module: 'Zoé coordonne.',
  transparence: 'https://www.transparence.sante.gouv.fr/x', linkedin: '', site_perso: '',
  experiences: [
    { poste: 'Médecin', structure: 'Cabinet', debut: '2021-09', en_cours: true },
    { poste: 'Interne', structure: 'CHU', debut: '2017-11', fin: '2021-05', en_cours: false },
  ],
  diplomes: [{ titre: 'DES', universite: 'Lille', annee: '2021' }],
};

(async () => {
  // --- sans lien : page courte
  let r = await jouer();
  verifier('sans lien : 4 titres, 51 qualifications + la consigne',
    $(r, 'fa-titre').options.length === 4 && $(r, 'fa-specialite').options.length === 52, $(r, 'fa-specialite').options.length);
  verifier('sans lien : page complète cachée, pas de mention du pré-remplissage',
    [...r.d.querySelectorAll('[data-fa-complete]')].every((el) => !visible(el)) && !visible($(r, 'fa-prerempli')));
  verifier('sans lien : aucun bloc d\'expérience', $(r, 'fa-experiences').children.length === 0);
  verifier('formulaire sans bulles du navigateur', $(r, 'fa-form').noValidate === true);
  verifier('compteur cloné du gabarit', $(r, 'fa-prenom').nextElementSibling.getAttribute('data-fa-compteur') === ''
    && $(r, 'fa-prenom').nextElementSibling.className.includes('text-size-tiny') && $(r, 'fa-prenom').maxLength === 40);
  verifier('les gabarits ne reçoivent pas de compteur', !r.d.querySelector('[data-fa-gabarit] [data-fa-compteur]'));

  envoyer(r);
  await attendre();
  verifier('contrôles : aucun appel, messages affichés', r.appels.length === 0 && visible($(r, 'fa-erreurs'))
    && $(r, 'fa-erreurs').textContent.includes('Indiquez votre prénom.') && $(r, 'fa-erreurs').textContent.includes('Transparence Santé'));
  verifier('Webflow ne voit pas l\'envoi', r.webflow.length === 0);

  remplirMinimum(r);
  $(r, 'fa-linkedin').value = 'pas une adresse';
  envoyer(r);
  await attendre();
  verifier('contrôles : adresse LinkedIn refusée', r.appels.length === 0 && $(r, 'fa-erreurs').textContent.includes('LinkedIn'));
  $(r, 'fa-linkedin').value = '';
  r.d.querySelector('input[name="site_web_confirmation"]').value = 'robot';
  envoyer(r);
  await attendre();
  const premier = r.appels[0];
  verifier('envoi : requête simple text/plain vers la fonction', premier && premier.url === 'https://webhooks.ordotype.fr/.netlify/functions/auteur-formulaire'
    && /^text\/plain/.test(premier.opts.headers['Content-Type']) && premier.opts.method === 'POST' && premier.opts.credentials === 'omit');
  verifier('envoi : données de la page courte', premier && premier.corps.donnees.type === 'courte' && premier.corps.donnees.prenom === 'Camille'
    && premier.corps.donnees.transparence === 'https://www.transparence.sante.gouv.fr/' && premier.corps.donnees.transparence_aucune_fiche === true
    && premier.corps.donnees.experiences.length === 0 && !('photo' in premier.corps), premier && premier.corps);
  verifier('envoi : piège à robots transmis', premier && premier.corps.site_web_confirmation === 'robot');
  verifier('merci affiché, champs désactivés, erreurs cachées', visible($(r, 'fa-merci')) && $(r, 'fa-prenom').disabled && !visible($(r, 'fa-erreurs')));
  verifier('Webflow ne voit toujours rien', r.webflow.length === 0);

  // --- lien personnel : page complète pré-remplie
  r = await jouer({ hash: lien(BROUILLON) });
  verifier('lien : fragment effacé dès l\'en-tête, gardé en session',
    r.w.location.hash === '' && r.w.sessionStorage.getItem('ordo-auteur-brouillon') === lien(BROUILLON).slice(3), r.w.location.href);
  verifier('lien : pré-rempli', $(r, 'fa-titre').value === 'Pr.' && $(r, 'fa-prenom').value === 'Zoé' && $(r, 'fa-sous').value === 'DU de gériatrie'
    && $(r, 'fa-transparence').value === BROUILLON.transparence && visible($(r, 'fa-prerempli')));
  verifier('lien : qualification hors liste → intitulé libre', $(r, 'fa-specialite').value === '__autre'
    && $(r, 'fa-autre').value === BROUILLON.specialite && visible($(r, 'fa-autre-bloc')));
  verifier('lien : aperçu de la mention', $(r, 'fa-apercu-nom').textContent === 'Pr Zoé Lefèvre' && $(r, 'fa-apercu-bio').textContent === BROUILLON.specialite);
  verifier('lien : page complète visible', [...r.d.querySelectorAll('[data-fa-complete]')].every(visible));
  const blocs = r.d.querySelectorAll('[data-fa-bloc="experience"]');
  verifier('lien : 2 expériences et 1 diplôme copiés des gabarits', blocs.length === 2 && r.d.querySelectorAll('[data-fa-bloc="diplome"]').length === 1);
  verifier('blocs : ni id en double, ni attribut de gabarit', r.d.querySelectorAll('#gabarit-poste').length === 1
    && !$(r, 'fa-experiences').querySelector('[data-fa-gabarit],[data-fa-cache]'));
  verifier('blocs : fin retirée pour le poste actuel (pas de trou sur mobile)', blocs[0].querySelector('[data-fa-fin]').style.display === 'none'
    && blocs[1].querySelector('[data-fa-fin]').style.display === '');
  verifier('textes d\'exemple : « Example Text » du Designer retiré, exemples d\'adresse posés',
    !r.d.querySelector('[placeholder="Example Text"]') && $(r, 'fa-linkedin').placeholder === 'https://www.linkedin.com/in/...'
    && $(r, 'fa-transparence').placeholder.startsWith('https://www.transparence.sante.gouv.fr/'));
  verifier('blocs : compteurs branchés', blocs[0].querySelector('[data-cle="exp_poste"]').nextElementSibling.hasAttribute('data-fa-compteur'));
  blocs[1].querySelector('[data-fa-retirer]').dispatchEvent(new r.w.Event('click', { bubbles: true, cancelable: true }));
  verifier('blocs : retirer', r.d.querySelectorAll('[data-fa-bloc="experience"]').length === 1);
  $(r, 'fa-ajout-exp').dispatchEvent(new r.w.Event('click', { bubbles: true, cancelable: true }));
  verifier('blocs : ajouter', r.d.querySelectorAll('[data-fa-bloc="experience"]').length === 2);
  const nouveau = r.d.querySelectorAll('[data-fa-bloc="experience"]')[1];
  nouveau.querySelector('[data-cle="exp_poste"]').value = 'Remplaçant';
  nouveau.querySelector('[data-cle="exp_structure"]').value = 'Cabinets du Nord';
  verifier('blocs : champ mois là où le navigateur le connaît', nouveau.querySelector('[data-cle="debut"]').type === 'month');
  // Safari sur ordinateur : pas de champ mois, l'auteur tape dans un champ texte.
  nouveau.querySelector('[data-cle="debut"]').type = 'text';
  nouveau.querySelector('[data-cle="fin"]').type = 'text';
  nouveau.querySelector('[data-cle="debut"]').value = '2016';
  nouveau.querySelector('[data-cle="fin"]').value = '13/2017';

  $(r, 'fa-bio').value = Array(151).fill('mot').join(' ');
  $(r, 'fa-bio').dispatchEvent(new r.w.Event('input'));
  verifier('compteur de mots : dépassement signalé', $(r, 'fa-bio').nextElementSibling.hasAttribute('data-fa-trop')
    && $(r, 'fa-bio').nextElementSibling.textContent.startsWith('151 / 150 mots'));
  $(r, 'fa-accord').checked = true;
  envoyer(r);
  await attendre();
  verifier('contrôles : mots en trop et date de fin illisible', r.appels.length === 0 && $(r, 'fa-erreurs').textContent.includes('dépasse 150 mots')
    && $(r, 'fa-erreurs').textContent.includes('Expérience 2, indiquez la fin au format MM/AAAA.'), $(r, 'fa-erreurs').textContent);
  $(r, 'fa-bio').value = 'Zoé est médecin.';
  nouveau.querySelector('[data-cle="fin"]').value = '3/2017';
  envoyer(r);
  await attendre();
  const complet = r.appels[0] && r.appels[0].corps.donnees;
  verifier('envoi complet : ref, type, expériences et diplômes', complet && complet.ref === 'A-012' && complet.type === 'complete'
    && complet.experiences.length === 2 && complet.experiences[0].fin === '' && complet.diplomes[0].annee === '2021'
    && complet.bio_module === 'Zoé coordonne.' && complet.specialite_hors_liste === true, complet);
  verifier('envoi complet : « MM/AAAA » et année seule normalisés', complet && complet.experiences[1].fin === '2017-03' && complet.experiences[1].debut === '2016', complet && complet.experiences[1]);
  verifier('envoi complet : session vidée après le merci', r.w.sessionStorage.getItem('ordo-auteur-brouillon') === null && visible($(r, 'fa-merci')));

  // --- navigateur sans champ mois (Safari sur ordinateur, Firefox) : dates du lien affichées « MM/AAAA »
  r = await jouer({ hash: lien(BROUILLON), sansMois: true });
  const exps = r.d.querySelectorAll('[data-fa-bloc="experience"]');
  verifier('sans champ mois : date du lien affichée MM/AAAA, consigne en exemple',
    exps[0].querySelector('[data-cle="debut"]').value === '09/2021' && exps[1].querySelector('[data-cle="fin"]').value === '05/2021'
    && exps[0].querySelector('[data-cle="debut"]').getAttribute('placeholder') === 'MM/AAAA', exps[0] && exps[0].querySelector('[data-cle="debut"]').value);
  $(r, 'fa-accord').checked = true;
  envoyer(r);
  await attendre();
  verifier('sans champ mois : renvoyée au serveur en AAAA-MM', r.appels[0] && r.appels[0].corps.donnees.experiences[0].debut === '2021-09'
    && r.appels[0].corps.donnees.experiences[1].fin === '2021-05', r.appels[0] && r.appels[0].corps.donnees.experiences);

  // --- rechargement : le brouillon vient de la session
  r = await jouer({ session: lien({ type: 'courte', prenom: 'Léa' }).slice(3) });
  verifier('rechargement : brouillon repris de la session', $(r, 'fa-prenom').value === 'Léa');

  // --- texte piégé
  r = await jouer({ hash: lien({ prenom: '<img src=x onerror="window.__pwn=1">', nom: 'X', specialite: '<b>gras</b>' }) });
  await attendre();
  verifier('texte piégé : jamais interprété', !r.d.querySelector('#fa-racine img') && !r.w.__pwn
    && $(r, 'fa-apercu-bio').textContent === '<b>gras</b>' && !$(r, 'fa-apercu-bio').querySelector('b'));
  r = await jouer({ hash: '#d=pas-du-json' });
  verifier('lien illisible : page courte vide, sans erreur', $(r, 'fa-prenom').value === '' && !visible($(r, 'fa-prerempli')));

  // --- refus du serveur
  const cas = [
    [{ status: 400, body: { error: 'invalid_field', champ: 'nom' } }, 'Un champ n\'a pas été accepté', 'AuteurChampRefuse'],
    [{ status: 400, body: { error: 'invalid_photo' } }, 'La photo n\'a pas été acceptée', null],
    [{ status: 429, body: { error: 'rate_limited' } }, 'Trop d\'envois', null],
    [{ status: 502, body: { error: 'sheet_error' } }, 'L\'envoi n\'a pas abouti', 'AuteurEnvoiRefuse'],
  ];
  for (const [rep, message, rapport] of cas) {
    r = await jouer({ serveur: () => rep });
    remplirMinimum(r);
    envoyer(r);
    await attendre();
    verifier(`serveur ${rep.status} ${rep.body.error} : message, pas de merci, bouton rendu`, $(r, 'fa-erreurs').textContent.includes(message)
      && !visible($(r, 'fa-merci')) && !$(r, 'fa-envoyer').disabled && $(r, 'fa-envoyer').value === 'Envoyer');
    verifier(`serveur ${rep.status} : signalement ${rapport || 'aucun'}`, rapport ? r.evenements.some((e) => e.report === rapport) : r.evenements.length === 0, r.evenements);
  }
  r = await jouer({ panne: true });
  remplirMinimum(r);
  envoyer(r);
  await attendre();
  verifier('réseau coupé : message et signalement', $(r, 'fa-erreurs').textContent.includes('L\'envoi n\'a pas abouti')
    && r.evenements.some((e) => e.report === 'AuteurEnvoiReseau'));
  envoyer(r);
  await attendre();
  verifier('réseau coupé : on peut réessayer', r.appels.length === 2);

  // --- photo : type refusé avant tout appel
  r = await jouer({ hash: lien({ type: 'complete' }) });
  remplirMinimum(r);
  const fichier = new r.w.File(['GIF89a'], 'portrait.gif', { type: 'image/gif' });
  Object.defineProperty($(r, 'fa-photo'), 'files', { value: [fichier] });
  r.d.querySelectorAll('[data-fa-bloc]').forEach((b) => b.parentNode.removeChild(b));
  envoyer(r);
  await attendre();
  verifier('photo GIF : refusée sans appel', r.appels.length === 0 && $(r, 'fa-erreurs').textContent.includes('La photo n\'a pas été acceptée'));

  // --- photo JPEG : sans décodeur d'image (jsdom), part telle quelle
  r = await jouer({ hash: lien({ type: 'complete' }) });
  r.w.Image = function () { const i = this; setTimeout(() => i.onerror && i.onerror(), 0); };
  remplirMinimum(r);
  const jpeg = new r.w.File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'portrait.jpg', { type: 'image/jpeg' });
  Object.defineProperty($(r, 'fa-photo'), 'files', { value: [jpeg] });
  r.d.querySelectorAll('[data-fa-bloc]').forEach((b) => b.parentNode.removeChild(b));
  envoyer(r);
  await attendre(80);
  verifier('photo JPEG : envoyée en base64', r.appels.length === 1 && Buffer.from(r.appels[0].corps.photo.base64, 'base64')[0] === 0xff, r.appels[0] && r.appels[0].corps.photo);

  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
