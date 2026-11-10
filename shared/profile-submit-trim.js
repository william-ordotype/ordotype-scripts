/**
 * Ordotype - Profile Submit Trim
 * Spécialité, prénom et nom partent sans espace de bord dans les formulaires
 * Memberstack (`form[data-ms-form]`) : `trim()`, et seulement si la valeur
 * rognée n'est pas vide. La casse n'est pas touchée.
 *
 * Liste déroulante : les options restent telles quelles au chargement, pour
 * que Memberstack y pré-remplisse la valeur enregistrée. Seule l'option
 * choisie est rognée, à l'envoi.
 *
 * Écouteur en CAPTURE sur le document : Memberstack (script v2) lit le
 * formulaire dans son écouteur `submit` posé sur le formulaire, avant toute
 * attente, puis arrête la propagation. La capture sur le document passe avant
 * lui. L'envoi n'est jamais bloqué.
 *
 * Loaded by mes-informations/loader.js, mes-informations-cms/loader.js and
 * account/loader.js. Test: node test/profile-submit-trim.js
 */
(function() {
  'use strict';

  var PREFIX = '[ProfileSubmitTrim]';
  var FIELDS = ['specialite', 'prnom', 'nom'];
  var reported = false;

  // La valeur rognée, ou null s'il n'y a rien à changer (déjà propre, ou
  // rien que des espaces).
  function trimmed(value) {
    if (typeof value !== 'string') return null;
    var t = value.trim();
    return t && t !== value ? t : null;
  }

  function trimField(el) {
    if (el.tagName === 'SELECT') {
      var option = el.options[el.selectedIndex];
      var v = option ? trimmed(option.value) : null;
      if (v !== null) option.value = v;
      return;
    }
    if (el.type === 'checkbox' || el.type === 'radio') return;
    var t = trimmed(el.value);
    if (t !== null) el.value = t;
  }

  function onSubmit(event) {
    var form = event.target;
    if (!form || typeof form.hasAttribute !== 'function' || !form.hasAttribute('data-ms-form')) return;
    try {
      FIELDS.forEach(function(key) {
        var els = form.querySelectorAll('[data-ms-member="' + key + '"]');
        for (var i = 0; i < els.length; i++) {
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(els[i].tagName)) trimField(els[i]);
        }
      });
    } catch (e) {
      if (reported) return;
      reported = true;
      console.warn(PREFIX, 'Values not trimmed on submit:', e && e.message);
      if (window.OrdoErrorReporter && typeof window.OrdoErrorReporter.report === 'function') {
        window.OrdoErrorReporter.report('ProfileSubmitTrim', e);
      }
    }
  }

  document.addEventListener('submit', onSubmit, true);
})();
