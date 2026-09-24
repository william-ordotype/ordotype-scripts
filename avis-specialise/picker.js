/**
 * Ordotype - Page /avis-specialise
 *
 * Page intermédiaire entre une fiche et l'annuaire de téléexpertise Omnidoc.
 * L'adresse porte le contexte : ?specialites=code1,code2&fiche=<slug>.
 *
 *   - aucune spécialité : liste déroulante seule, bouton inactif tant que rien n'est choisi ;
 *   - une spécialité    : elle est affichée, « Changer de spécialité » ouvre la liste ;
 *   - plusieurs         : un bouton radio par spécialité, la première cochée.
 *
 * Un code absent de LISTE est ignoré, un slug de fiche qui n'a pas la forme attendue aussi :
 * le bouton « Retour » retombe alors sur la page d'accueil plutôt que sur une adresse construite
 * à partir de l'URL. Les codes sont normalisés en NFC, un « é » décomposé venant de macOS étant
 * refusé par Omnidoc.
 *
 * Usage dans Webflow (Before </body>), après error-reporter.js :
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/avis-specialise/picker.js"></script>
 */
(function () {
  'use strict';

  var BASE = 'https://app.omnidoc.fr/discover/map?specialty=';

  // Spécialités proposées : celles vers lesquelles les fiches renvoient, libellés Omnidoc.
  var LISTE = [
    ['addicto', 'Addictologie'], ['allergo', 'Allergologie'], ['card_mal_vasc', 'Cardiologie'],
    ['chir_maxilo_stoma', 'Chirurgie maxillo-faciale'], ['chir_orale', 'Chirurgie orale'],
    ['chir_ortho_trauma', 'Chirurgie orthopédique'], ['chir_vasc', 'Chirurgie vasculaire'],
    ['chir_visce_dig', 'Chirurgie viscérale et digestive'], ['derm_venero', 'Dermatologie'],
    ['endo_diab_nutr', 'Endocrinologie, diabétologie, nutrition'],
    ['gastro_hépato', 'Gastro-entérologie et hépatologie'], ['gen_med', 'Génétique médicale'],
    ['geria', 'Gériatrie'], ['gyneco_med_obst', 'Gynécologie médicale et obstétrique'],
    ['hemato', 'Hématologie'], ['mal_inf_trop', 'Maladies infectieuses'],
    ['med_intern', 'Médecine interne'], ['med_sport', 'Médecine du sport'],
    ['med_trav', 'Médecine du travail'], ['med_vasc', 'Médecine vasculaire'],
    ['nephro', 'Néphrologie'], ['neuro', 'Neurologie'], ['neuro_chir', 'Neurochirurgie'],
    ['ophtalmo', 'Ophtalmologie'], ['orl_chir_cerv', 'ORL'], ['pedia', 'Pédiatrie'],
    ['pneumo', 'Pneumologie'], ['psy', 'Psychiatrie'], ['rhumato', 'Rhumatologie'],
    ['urolo', 'Urologie']
  ];
  var LIBELLE = {};
  LISTE.forEach(function (p) { p[0] = p[0].normalize('NFC'); LIBELLE[p[0]] = p[1]; });

  function byId(id) { return document.getElementById(id); }
  function track(payload) {
    if (window.OrdoErrorReporter && window.OrdoErrorReporter.track) window.OrdoErrorReporter.track(payload);
  }

  var params = new URLSearchParams(window.location.search);
  var fiche = (params.get('fiche') || '').toLowerCase();
  if (!/^[a-z0-9-]{1,150}$/.test(fiche)) fiche = '';
  var wanted = [];
  (params.get('specialites') || '').split(',').forEach(function (raw) {
    var code = raw.trim().normalize('NFC');
    if (LIBELLE[code] && wanted.indexOf(code) === -1) wanted.push(code);
  });
  var mode = wanted.length === 0 ? 'libre' : (wanted.length === 1 ? 'direct' : 'choix');
  var picked = wanted[0] || '';

  var backHref = '/';
  if (fiche) backHref = '/pathologies/' + fiche;
  else if (document.referrer && document.referrer.indexOf(window.location.origin + '/') === 0) backHref = document.referrer;
  ['omd-back', 'omd-back-top'].forEach(function (id) {
    var a = byId(id);
    if (a) a.setAttribute('href', backHref);
  });

  var opts = byId('omd-options');
  var other = byId('omd-other');
  var otherWrap = byId('omd-other-wrap');
  var otherLabel = byId('omd-other-label');
  var cont = byId('omd-continue');
  if (!opts || !other || !otherWrap || !otherLabel || !cont) {
    if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('OmnidocPage', 'Élément manquant sur /avis-specialise');
    return;
  }

  var chipName = null;

  function refresh() {
    if (picked) {
      cont.setAttribute('href', BASE + encodeURIComponent(picked));
      cont.removeAttribute('aria-disabled');
    } else {
      cont.setAttribute('href', '#');
      cont.setAttribute('aria-disabled', 'true');
    }
    Array.prototype.forEach.call(opts.querySelectorAll('.omd-option'), function (label) {
      var input = label.querySelector('input');
      label.classList.toggle('is-checked', !input || input.checked);
    });
    if (chipName) chipName.textContent = LIBELLE[picked] || '';
  }

  function addRadio(code) {
    var label = document.createElement('label');
    label.className = 'omd-option';
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = 'omd-specialite';
    input.value = code;
    input.checked = code === picked;
    input.addEventListener('change', function () {
      picked = code;
      other.value = '';
      refresh();
    });
    var name = document.createElement('span');
    name.className = 'omd-option-name';
    name.textContent = LIBELLE[code];
    var hint = document.createElement('span');
    hint.className = 'omd-option-hint';
    hint.textContent = 'Spécialité de la fiche';
    label.appendChild(input);
    label.appendChild(name);
    label.appendChild(hint);
    opts.appendChild(label);
  }

  LISTE.forEach(function (p) {
    if (mode === 'choix' && wanted.indexOf(p[0]) !== -1) return;
    var o = document.createElement('option');
    o.value = p[0];
    o.textContent = p[1];
    other.appendChild(o);
  });

  if (mode === 'choix') {
    wanted.forEach(addRadio);
  } else if (mode === 'direct') {
    var chip = document.createElement('div');
    chip.className = 'omd-option';
    chipName = document.createElement('span');
    chipName.className = 'omd-option-name';
    var change = document.createElement('button');
    change.type = 'button';
    change.className = 'omd-change';
    change.textContent = 'Changer de spécialité';
    change.setAttribute('aria-controls', 'omd-other-wrap');
    change.setAttribute('aria-expanded', 'false');
    change.addEventListener('click', function () {
      otherWrap.hidden = !otherWrap.hidden;
      change.setAttribute('aria-expanded', otherWrap.hidden ? 'false' : 'true');
      if (!otherWrap.hidden) other.focus();
    });
    chip.appendChild(chipName);
    chip.appendChild(change);
    opts.appendChild(chip);
    otherLabel.textContent = 'Autre spécialité';
    otherWrap.hidden = true;
    other.value = picked;
  } else {
    opts.hidden = true;
    otherLabel.textContent = 'Choisir une spécialité';
  }

  other.addEventListener('change', function () {
    if (other.value) {
      picked = other.value;
      Array.prototype.forEach.call(opts.querySelectorAll('input'), function (i) { i.checked = false; });
    } else if (mode === 'choix') {
      picked = wanted[0];
      var first = opts.querySelector('input');
      if (first) first.checked = true;
    } else if (mode === 'libre') {
      picked = '';
    }
    refresh();
  });

  cont.addEventListener('click', function (e) {
    if (!picked) {
      e.preventDefault();
      other.focus();
      return;
    }
    track({ event: 'omnidoc_continue_click', omnidoc_specialite: picked, omnidoc_fiche: fiche || '(inconnue)', omnidoc_mode: mode });
  });

  refresh();
  track({ event: 'omnidoc_page_view', omnidoc_fiche: fiche || '(inconnue)', omnidoc_mode: mode, omnidoc_specialites: wanted.join(',') });
})();
