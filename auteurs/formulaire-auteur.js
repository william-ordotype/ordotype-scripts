/**
 * Ordotype - Formulaire des auteurs (« Votre page sur Ordotype »)
 *
 * Page publique, sans compte : un auteur ou un relecteur relit les informations
 * de sa page auteur et les envoie à l'équipe. Nathalie lui envoie un lien
 * personnel pré-rempli à partir de son CV : `#d=<JSON en base64url>` (le JSON
 * porte `ref`, `type` « courte » ou « complete », et les champs du formulaire).
 * La réponse part à la fonction Netlify `auteur-formulaire`, qui l'écrit dans le
 * Sheet « Formulaires auteurs - réponses » et dépose la photo dans le Drive.
 *
 * Formulaire écrit par Guillaume le 12/10/2026 (chantier formulaire-auteurs/) :
 * textes, plafonds et contrôles repris tels quels. Le dessin est dans le
 * Designer Webflow (classes du site) ; ce fichier ne porte que la logique.
 *
 * Balisage attendu (Designer), repéré par les id de la version d'origine :
 *   #fa-racine                 conteneur de la page
 *   #fa-form                   le formulaire (bloc Form natif)
 *   #fa-titre, #fa-specialite  listes, remplies ici
 *   #fa-prenom, #fa-nom, #fa-autre, #fa-sous, #fa-equipe, #fa-bio, #fa-biomodule,
 *   #fa-transparence, #fa-linkedin, #fa-site           champs (data-max = plafond)
 *   #fa-sansfiche, #fa-accord  cases à cocher
 *   #fa-photo                  champ fichier (page complète)
 *   #fa-autre-bloc, #fa-prerempli, #fa-merci, [data-fa-complete]
 *                              blocs cachés au départ (attribut data-fa-cache,
 *                              caché par le code d'en-tête de la page)
 *   #fa-apercu-nom, #fa-apercu-bio   aperçu de la mention sur une fiche
 *   #fa-experiences, #fa-diplomes    zones des blocs répétés
 *   #fa-ajout-exp, #fa-ajout-dip     boutons d'ajout
 *   #fa-erreurs, #fa-envoyer         messages, bouton d'envoi
 *   [data-fa-gabarit="experience" | "diplome" | "compteur"]
 *                              gabarits (bloc caché) : le script les clone. Dans
 *                              un bloc, les champs portent data-cle, la fin d'une
 *                              expérience est dans [data-fa-fin], le bouton de
 *                              retrait porte data-fa-retirer.
 *   input[name=site_web_confirmation]   piège à robots, doit rester vide
 *
 * Le code d'en-tête de la page (auteurs/head.html) range le fragment `#d=` en
 * sessionStorage et le retire de la barre d'adresse avant les outils de mesure :
 * il contient le nom et la biographie de l'auteur. Ce fichier le relit là.
 *
 * Requête « simple » : corps JSON en `text/plain`, sans préflight CORS.
 *
 * Depends on: shared/error-reporter.js (facultatif)
 */
(function () {
  'use strict';

  var PREFIX = '[FormulaireAuteur]';
  var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/auteur-formulaire';
  var STORAGE_KEY = 'ordo-auteur-brouillon';
  var DELAI_MS = 30000;
  var PHOTO_COTE_MAX = 1600;
  var PHOTO_OCTETS_MAX = 3 * 1024 * 1024;

  var FA_CONFIG = {
    // Plafonds proposés par Claude le 12/10/2026, à valider par Guillaume (le CMS n'en impose aucun, sauf 256 sur Name).
    max: { prenom: 40, nom: 60, autre: 60, sous: 60, equipe: 50, bio: 1100, bio_module: 400,
      exp_poste: 60, exp_structure: 100, dip_titre: 70, dip_universite: 60, url: 300 },
    mots: { bio: 150, bio_module: 50 },
    maxBlocs: 8
  };
  var TITRES = [['Dr.', 'Dr'], ['Pr.', 'Pr'], ['M.', 'M.'], ['Mme.', 'Mme']];
  var DES = ['DES Chirurgie maxillo-faciale', 'DES Chirurgie orale', 'DES Chirurgie orthopédique et traumatologique', 'DES Chirurgie pédiatrique',
    'DES Chirurgie plastique, reconstructrice et esthétique', 'DES Chirurgie thoracique et cardiovasculaire', 'DES Chirurgie vasculaire',
    'DES Chirurgie viscérale et digestive', 'DES Gynécologie obstétrique', 'DES Neurochirurgie', 'DES Ophtalmologie',
    'DES Oto-rhino-laryngologie - chirurgie cervico-faciale', 'DES Urologie', 'DES Allergologie', 'DES Anatomie et cytologie pathologiques',
    'DES Anesthésie-réanimation', 'DES Dermatologie et vénéréologie', 'DES Endocrinologie-diabétologie-nutrition', 'DES Génétique médicale',
    'DES Gériatrie', 'DES Gynécologie médicale', 'DES Hématologie', 'DES Hépato-gastro-entérologie', 'DES Maladies infectieuses et tropicales',
    'DES Médecine cardiovasculaire', "DES Médecine d'urgence", 'DES Médecine et santé au travail', 'DES Médecine générale',
    'DES Médecine intensive-réanimation', 'DES Médecine interne et immunologie clinique', 'DES Médecine légale et expertises médicales',
    'DES Médecine nucléaire', 'DES Médecine physique et de réadaptation', 'DES Médecine vasculaire', 'DES Néphrologie', 'DES Neurologie',
    'DES Oncologie', 'DES Pédiatrie', 'DES Pneumologie', 'DES Psychiatrie', 'DES Radiologie et imagerie médicale', 'DES Rhumatologie',
    'DES Santé publique', 'DES Biologie médicale'];
  var AUTRES = ['Pharmacien', 'Pharmacienne', "Infirmier diplômé d'État", "Infirmière diplômée d'État", "Kinésithérapeute diplômé d'État", "Kinésithérapeute diplômée d'État"];
  var TRANSPARENCE_ACCUEIL = 'https://www.transparence.sante.gouv.fr/';
  var MESSAGES = {
    generique: "L'envoi n'a pas abouti. Réessayez dans un instant ou écrivez à l'équipe Ordotype.",
    trop: "Trop d'envois depuis cette connexion. Réessayez dans quelques minutes.",
    photo: "La photo n'a pas été acceptée. Choisissez une image JPG ou PNG de moins de 3 Mo.",
    champ: "Un champ n'a pas été accepté. Vérifiez-le ou écrivez à l'équipe Ordotype."
  };

  function $(id) { return document.getElementById(id); }
  function montrer(el, oui) {
    if (!el) return;
    if (oui) el.removeAttribute('data-fa-cache'); else el.setAttribute('data-fa-cache', '');
  }
  function signaler(nom, err) {
    var r = window.OrdoErrorReporter;
    try { if (r && r.report) r.report(nom, err); } catch (e) { /* rien */ }
  }

  function demarrer() {
    var racine = $('fa-racine');
    var form = $('fa-form');
    if (!racine || !form) return;
    // Les contrôles sont ceux de ce fichier, avec leurs messages : pas de bulle du navigateur.
    form.noValidate = true;
    var sel = $('fa-specialite');

    // ---- Listes ----
    function opt(parent, valeur, texte) { var o = document.createElement('option'); o.value = valeur; o.textContent = texte; parent.appendChild(o); }
    var titre = $('fa-titre');
    titre.innerHTML = '';
    TITRES.forEach(function (t) { opt(titre, t[0], t[1]); });
    sel.innerHTML = '';
    opt(sel, '', 'Choisir dans la liste');
    var g1 = document.createElement('optgroup'); g1.label = 'DES (liste officielle)'; DES.forEach(function (d) { opt(g1, d, d); }); sel.appendChild(g1);
    var g2 = document.createElement('optgroup'); g2.label = 'Autres professions'; AUTRES.forEach(function (d) { opt(g2, d, d); }); sel.appendChild(g2);
    var g3 = document.createElement('optgroup'); g3.label = 'Autre'; opt(g3, '__autre', 'Autre intitulé, à préciser'); sel.appendChild(g3);

    ['fa-transparence', 'fa-linkedin', 'fa-site'].forEach(function (id) {
      var c = $(id); if (c) { c.setAttribute('inputmode', 'url'); c.setAttribute('autocomplete', 'url'); }
    });
    // Le Designer pose « Example Text » sur chaque champ natif et l'API Webflow ne sait pas l'ôter :
    // ces textes d'exemple-là sont retirés, seuls restent ceux du formulaire d'origine.
    Array.prototype.forEach.call(racine.querySelectorAll('input[placeholder], textarea[placeholder]'), function (c) {
      if (c.getAttribute('placeholder') === 'Example Text') c.removeAttribute('placeholder');
    });
    var EXEMPLES = { 'fa-transparence': 'https://www.transparence.sante.gouv.fr/...', 'fa-linkedin': 'https://www.linkedin.com/in/...' };
    Object.keys(EXEMPLES).forEach(function (id) { var c = $(id); if (c) c.setAttribute('placeholder', EXEMPLES[id]); });

    // ---- Compteurs ----
    var gabaritCompteur = racine.querySelector('[data-fa-gabarit="compteur"]');
    function nbMots(t) { return (t.trim().match(/\S+/g) || []).length; }
    function brancherCompteur(champ) {
      var cle = champ.getAttribute('data-max'); if (!cle || champ.getAttribute('data-branche') || !FA_CONFIG.max[cle]) return;
      champ.setAttribute('data-branche', '1');
      champ.maxLength = FA_CONFIG.max[cle];
      var c;
      if (gabaritCompteur) { c = gabaritCompteur.cloneNode(true); c.removeAttribute('data-fa-gabarit'); c.removeAttribute('data-fa-cache'); }
      else c = document.createElement('div');
      c.setAttribute('data-fa-compteur', '');
      champ.insertAdjacentElement('afterend', c);
      function maj() {
        var v = champ.value, txt = v.length + ' / ' + FA_CONFIG.max[cle] + ' caractères', trop = false;
        if (FA_CONFIG.mots[cle]) { var m = nbMots(v); txt = m + ' / ' + FA_CONFIG.mots[cle] + ' mots, ' + txt; trop = m > FA_CONFIG.mots[cle]; }
        c.textContent = txt;
        if (trop) c.setAttribute('data-fa-trop', ''); else c.removeAttribute('data-fa-trop');
      }
      champ.addEventListener('input', maj); maj();
    }
    function brancherTout() {
      Array.prototype.forEach.call(racine.querySelectorAll('[data-max]'), function (c) {
        if (!c.closest('[data-fa-gabarit]')) brancherCompteur(c);
      });
    }

    // ---- Blocs répétés : expériences et diplômes ----
    // Safari sur ordinateur n'a pas de champ mois : il garde un champ texte, où « MM/AAAA » et « AAAA » sont acceptés.
    var champMois = (function () { var i = document.createElement('input'); i.setAttribute('type', 'month'); return i.type === 'month'; })();
    function normaliserMois(v) {
      v = String(v || '').trim();
      var m = /^(0?[1-9]|1[0-2])\s*[/.-]\s*(\d{4})$/.exec(v);
      if (m) return m[2] + '-' + (m[1].length === 1 ? '0' + m[1] : m[1]);
      return v;
    }
    function nouveauBloc(nom, zoneId, valeurs) {
      var zone = $(zoneId), gabarit = racine.querySelector('[data-fa-gabarit="' + nom + '"]');
      if (!zone || !gabarit || zone.children.length >= FA_CONFIG.maxBlocs) return null;
      var b = gabarit.cloneNode(true);
      b.removeAttribute('data-fa-gabarit'); b.removeAttribute('data-fa-cache'); b.removeAttribute('id');
      b.setAttribute('data-fa-bloc', nom);
      Array.prototype.forEach.call(b.querySelectorAll('[id]'), function (el) { el.removeAttribute('id'); });
      Array.prototype.forEach.call(b.querySelectorAll('[data-cle]'), function (c) {
        var cle = c.getAttribute('data-cle'), v = valeurs[cle];
        if (c.type === 'checkbox') c.checked = !!v;
        else c.value = v === undefined || v === null ? '' : String(v);
        if ((cle === 'debut' || cle === 'fin') && c.tagName === 'INPUT') {
          if (champMois) c.type = 'month';
          else {
            // Champ texte : la date du lien (« 2021-09 ») s'affiche comme la consigne la demande, « 09/2021 ».
            c.setAttribute('placeholder', 'MM/AAAA');
            var iso = /^(\d{4})-(\d{2})$/.exec(c.value);
            if (iso) c.value = iso[2] + '/' + iso[1];
          }
        }
        if (cle === 'annee' && c.tagName === 'INPUT') { c.setAttribute('inputmode', 'numeric'); c.setAttribute('maxlength', '4'); }
      });
      var retirer = b.querySelector('[data-fa-retirer]');
      if (retirer) retirer.addEventListener('click', function (e) { e.preventDefault(); b.parentNode.removeChild(b); });
      zone.appendChild(b);
      brancherTout();
      return b;
    }
    function ajouterExperience(e) {
      e = e || {};
      var b = nouveauBloc('experience', 'fa-experiences', { exp_poste: e.poste, exp_structure: e.structure, debut: e.debut, fin: e.fin, en_cours: e.en_cours });
      if (!b) return;
      var cb = b.querySelector('[data-cle="en_cours"]'), fin = b.querySelector('[data-fa-fin]');
      // Retirée et pas seulement masquée : sur mobile, les champs sont empilés et une fin masquée laissait un trou.
      function majFin() { if (fin) fin.style.display = cb && cb.checked ? 'none' : ''; }
      if (cb) cb.addEventListener('change', majFin);
      majFin();
    }
    function ajouterDiplome(d) {
      d = d || {};
      nouveauBloc('diplome', 'fa-diplomes', { dip_titre: d.titre, dip_universite: d.universite, annee: d.annee });
    }
    function surClic(id, f) { var el = $(id); if (el) el.addEventListener('click', function (e) { e.preventDefault(); f(); }); }
    surClic('fa-ajout-exp', function () { ajouterExperience(); });
    surClic('fa-ajout-dip', function () { ajouterDiplome(); });

    // ---- Qualification et aperçu : la mention des fiches (Bio fiche) est la qualification principale (Guillaume, 12/10/2026) ----
    function libelleQualif() { return sel.value === '__autre' ? $('fa-autre').value.trim() : sel.value; }
    function majApercu() {
      var t = titre.value.replace('.', ''), nom = [$('fa-prenom').value.trim(), $('fa-nom').value.trim()].filter(Boolean).join(' ');
      $('fa-apercu-nom').textContent = (t + ' ' + (nom || 'Prénom Nom')).trim();
      $('fa-apercu-bio').textContent = libelleQualif() || 'qualification';
    }
    function majQualif() { montrer($('fa-autre-bloc'), sel.value === '__autre'); majApercu(); }
    sel.addEventListener('change', majQualif); $('fa-autre').addEventListener('input', majQualif);
    ['fa-titre', 'fa-prenom', 'fa-nom'].forEach(function (id) { $(id).addEventListener('input', majApercu); $(id).addEventListener('change', majApercu); });

    $('fa-sansfiche').addEventListener('change', function () {
      var t = $('fa-transparence'); t.disabled = this.checked; if (this.checked) t.value = '';
    });

    // ---- Pré-remplissage par le lien personnel (#d=…, rangé en session par le code d'en-tête) ----
    function decoder(code) {
      try {
        var b64 = code.replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '=';
        var binaire = atob(b64), octets = new Uint8Array(binaire.length);
        for (var i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
        var o = JSON.parse(new TextDecoder('utf-8').decode(octets));
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (e) { return {}; }
    }
    function lireBrouillon() {
      var m = /[#&]d=([A-Za-z0-9_-]+)/.exec(location.hash), code = '';
      if (m) {
        code = m[1];
        try { sessionStorage.setItem(STORAGE_KEY, code); } catch (e) { /* navigation privée */ }
        try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* rien */ }
      } else {
        try { code = sessionStorage.getItem(STORAGE_KEY) || ''; } catch (e) { code = ''; }
      }
      return code ? decoder(code) : {};
    }
    var brouillon = lireBrouillon();
    var complete = brouillon.type === 'complete';
    Array.prototype.forEach.call(racine.querySelectorAll('[data-fa-complete]'), function (el) { montrer(el, complete); });
    function remplir(id, v) { var el = $(id); if (el && typeof v === 'string') el.value = v; }
    if (Object.keys(brouillon).length) {
      montrer($('fa-prerempli'), true);
      if (brouillon.titre && TITRES.some(function (t) { return t[0] === brouillon.titre; })) titre.value = brouillon.titre;
      remplir('fa-prenom', brouillon.prenom); remplir('fa-nom', brouillon.nom);
      if (typeof brouillon.specialite === 'string' && brouillon.specialite) {
        if (DES.indexOf(brouillon.specialite) >= 0 || AUTRES.indexOf(brouillon.specialite) >= 0) sel.value = brouillon.specialite;
        else { sel.value = '__autre'; $('fa-autre').value = brouillon.specialite; }
      }
      remplir('fa-sous', brouillon.sous_specialite);
      remplir('fa-equipe', brouillon.description_equipe);
      remplir('fa-bio', brouillon.bio); remplir('fa-biomodule', brouillon.bio_module);
      // La case « Aucune fiche » reste décochée par défaut, c'est à l'auteur de la cocher (Guillaume, 12/10/2026).
      if (brouillon.transparence && brouillon.transparence !== 'aucune') remplir('fa-transparence', brouillon.transparence);
      remplir('fa-linkedin', brouillon.linkedin); remplir('fa-site', brouillon.site_perso);
      if (complete) {
        (Array.isArray(brouillon.experiences) ? brouillon.experiences : []).forEach(function (e) { if (e && typeof e === 'object') ajouterExperience(e); });
        (Array.isArray(brouillon.diplomes) ? brouillon.diplomes : []).forEach(function (d) { if (d && typeof d === 'object') ajouterDiplome(d); });
      }
    }
    if (complete && !$('fa-experiences').children.length) ajouterExperience();
    if (complete && !$('fa-diplomes').children.length) ajouterDiplome();
    brancherTout(); majQualif();

    // ---- Contrôles ----
    function urlValide(v) { try { var u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch (e) { return false; } }
    function lireBlocs(nom) {
      return Array.prototype.map.call(racine.querySelectorAll('[data-fa-bloc="' + nom + '"]'), function (b) {
        var o = {};
        Array.prototype.forEach.call(b.querySelectorAll('[data-cle]'), function (c) {
          o[c.getAttribute('data-cle')] = c.type === 'checkbox' ? c.checked : c.value.trim();
        });
        return o;
      });
    }
    function collecter() {
      var exp = complete ? lireBlocs('experience').map(function (e) {
        return { poste: e.exp_poste, structure: e.exp_structure, debut: normaliserMois(e.debut), en_cours: !!e.en_cours, fin: e.en_cours ? '' : normaliserMois(e.fin) };
      }) : [];
      var dip = complete ? lireBlocs('diplome').map(function (d) { return { titre: d.dip_titre, universite: d.dip_universite, annee: d.annee }; }) : [];
      exp = exp.filter(function (e) { return e.poste || e.structure; });
      dip = dip.filter(function (d) { return d.titre || d.universite; });
      return {
        version: 1, ref: typeof brouillon.ref === 'string' ? brouillon.ref : '', type: complete ? 'complete' : 'courte', envoye_le: new Date().toISOString(),
        titre: titre.value, prenom: $('fa-prenom').value.trim(), nom: $('fa-nom').value.trim(),
        specialite: libelleQualif(), specialite_hors_liste: sel.value === '__autre', sous_specialite: $('fa-sous').value.trim(),
        description_equipe: $('fa-equipe').value.trim(),
        bio: $('fa-bio').value.trim(), bio_module: complete ? $('fa-biomodule').value.trim() : '',
        transparence: $('fa-sansfiche').checked ? TRANSPARENCE_ACCUEIL : $('fa-transparence').value.trim(),
        transparence_aucune_fiche: $('fa-sansfiche').checked,
        linkedin: $('fa-linkedin').value.trim(), site_perso: $('fa-site').value.trim(),
        experiences: exp, diplomes: dip
      };
    }
    var MOIS_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
    function controler(r) {
      var e = [];
      if (!r.prenom) e.push('Indiquez votre prénom.');
      if (!r.nom) e.push('Indiquez votre nom.');
      if (!r.specialite) e.push('Choisissez votre diplôme ou qualification principale.');
      Object.keys(FA_CONFIG.mots).forEach(function (k) { if (nbMots(r[k] || '') > FA_CONFIG.mots[k]) e.push((k === 'bio' ? 'La biographie' : 'La présentation du module') + ' dépasse ' + FA_CONFIG.mots[k] + ' mots.'); });
      if (!r.transparence_aucune_fiche) {
        if (!r.transparence) e.push("Collez l'adresse de votre fiche Transparence Santé, ou cochez « Aucune fiche à mon nom ».");
        else if (!urlValide(r.transparence) || !/(^|\.)transparence\.sante\.gouv\.fr$/.test(new URL(r.transparence).hostname)) e.push("L'adresse Transparence Santé doit être une page du site transparence.sante.gouv.fr.");
      }
      [['linkedin', 'LinkedIn'], ['site_perso', 'du site personnel']].forEach(function (p) { if (r[p[0]] && !urlValide(r[p[0]])) e.push("L'adresse " + p[1] + " n'est pas valide."); });
      r.experiences.forEach(function (x, i) {
        if (!x.poste || !x.structure || !x.debut) e.push('Expérience ' + (i + 1) + ', indiquez le poste, la structure et le début.');
        else if (!MOIS_RE.test(x.debut)) e.push('Expérience ' + (i + 1) + ', indiquez le début au format MM/AAAA.');
        if (!x.en_cours && !x.fin) e.push('Expérience ' + (i + 1) + ', indiquez la fin ou cochez « Poste actuel ».');
        else if (!x.en_cours && !MOIS_RE.test(x.fin)) e.push('Expérience ' + (i + 1) + ', indiquez la fin au format MM/AAAA.');
      });
      r.diplomes.forEach(function (x, i) {
        if (!x.titre || !x.universite || !x.annee) e.push('Diplôme ' + (i + 1) + ", indiquez l'intitulé, l'université et l'année.");
        else if (!/^\d{4}$/.test(x.annee)) e.push('Diplôme ' + (i + 1) + ", indiquez l'année sur quatre chiffres.");
      });
      if (!$('fa-accord').checked) e.push("Cochez la case d'accord pour la publication.");
      return e;
    }
    var zone = $('fa-erreurs');
    function afficherErreurs(liste) {
      zone.innerHTML = '';
      liste.forEach(function (x) { var d = document.createElement('div'); d.textContent = x; zone.appendChild(d); });
      montrer(zone, liste.length > 0);
      if (liste.length && zone.scrollIntoView) zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ---- Photo : réduite à 1 600 px en JPEG avant l'envoi ----
    function lireFichier(f) {
      return new Promise(function (ok, ko) {
        var lecteur = new FileReader();
        lecteur.onload = function () { ok(lecteur.result); };
        lecteur.onerror = function () { ko(lecteur.error || new Error('lecture')); };
        lecteur.readAsDataURL(f);
      });
    }
    function reduire(dataUrl) {
      return new Promise(function (ok, ko) {
        var img = new Image();
        // Sans réponse de l'image (navigateur qui ne la décode pas), la photo part telle quelle.
        setTimeout(function () { ko(new Error('délai')); }, 10000);
        img.onload = function () {
          try {
            var k = Math.min(1, PHOTO_COTE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ok(canvas.toDataURL('image/jpeg', 0.88));
          } catch (e) { ko(e); }
        };
        img.onerror = function () { ko(new Error('image illisible')); };
        img.src = dataUrl;
      });
    }
    function preparerPhoto() {
      var champ = $('fa-photo'), f = complete && champ && champ.files ? champ.files[0] : null;
      if (!f) return Promise.resolve(null);
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return Promise.reject(new Error('photo'));
      return lireFichier(f).then(function (original) {
        return reduire(original).catch(function () { return original; });
      }).then(function (dataUrl) {
        var base64 = String(dataUrl).split(',')[1] || '';
        if (!base64 || base64.length * 0.75 > PHOTO_OCTETS_MAX) throw new Error('photo');
        return { base64: base64 };
      });
    }

    // ---- Envoi ----
    var bouton = $('fa-envoyer');
    var libelle = bouton ? (bouton.value || bouton.textContent) : '';
    function etatBouton(enCours) {
      if (!bouton) return;
      bouton.disabled = enCours;
      var t = enCours ? 'Envoi en cours' : libelle;
      if (bouton.tagName === 'INPUT') bouton.value = t; else bouton.textContent = t;
    }
    var enCours = false;
    function envoyer(ev) {
      ev.preventDefault();
      // Le gestionnaire de formulaires de Webflow écoute plus haut : il ne doit rien envoyer.
      ev.stopPropagation();
      if (enCours) return;
      var pot = form.querySelector('input[name="site_web_confirmation"]');
      var r = collecter(), erreurs = controler(r);
      afficherErreurs(erreurs);
      if (erreurs.length) return;
      enCours = true; etatBouton(true);
      preparerPhoto().then(function (photo) {
        var corps = { donnees: r, site_web_confirmation: pot ? pot.value : '' };
        if (photo) corps.photo = photo;
        var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        var minuterie = ctrl ? setTimeout(function () { ctrl.abort(); }, DELAI_MS) : null;
        return fetch(API_URL, {
          method: 'POST', credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(corps),
          signal: ctrl ? ctrl.signal : undefined
        }).then(function (rep) {
          if (minuterie) clearTimeout(minuterie);
          return rep.json().catch(function () { return {}; }).then(function (p) { return { status: rep.status, p: p }; });
        });
      }, function () { return { status: 0, p: { error: 'invalid_photo' } }; }).then(function (res) {
        if (res.status === 200 && res.p && res.p.ok) {
          Array.prototype.forEach.call(form.querySelectorAll('input,select,textarea,button'), function (c) { c.disabled = true; });
          montrer($('fa-merci'), true);
          try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* rien */ }
          if ($('fa-merci').scrollIntoView) $('fa-merci').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        var code = res.p && res.p.error;
        if (code === 'invalid_photo') afficherErreurs([MESSAGES.photo]);
        else if (res.status === 429) afficherErreurs([MESSAGES.trop]);
        else if (code === 'invalid_field') {
          afficherErreurs([MESSAGES.champ]);
          signaler('AuteurChampRefuse', new Error(String(res.p.champ || '')));
        } else {
          afficherErreurs([MESSAGES.generique]);
          if (res.status >= 500) signaler('AuteurEnvoiRefuse', new Error('HTTP ' + res.status + ' ' + (code || '')));
        }
        enCours = false; etatBouton(false);
      }).catch(function (err) {
        afficherErreurs([MESSAGES.generique]);
        signaler('AuteurEnvoiReseau', err);
        enCours = false; etatBouton(false);
      });
    }
    form.addEventListener('submit', envoyer);
    console.log(PREFIX, 'prêt', complete ? '(page complète)' : '(page courte)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
