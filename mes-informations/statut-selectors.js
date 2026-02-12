/**
 * Ordotype Mes Informations - Statut Selectors
 * Controls visibility of form fields based on user statut.
 * Handles: #semestre-selector, #mode-exercice-selector, #specialite-selector
 * Skips if config.showStatutSelectors is false.
 *
 * Depends on: core.js
 */
(function() {
  'use strict';

  var config = window.OrdoMesInfos && window.OrdoMesInfos.config;
  if (!config || !config.showStatutSelectors) return;

  var member = window.OrdoMesInfos.member;

  function init() {
    var statutSelector = document.getElementById('mon-statut-2');
    var currentStatut = member.customFields ? member.customFields.statut : null;

    applyVisibilityRules(currentStatut);

    if (statutSelector) {
      statutSelector.addEventListener('change', function(e) {
        applyVisibilityRules(e.target.value);
      });
    }

    console.log('[StatutSelectors] Initialized with status:', currentStatut);
  }

  function applyVisibilityRules(statut) {
    var semestre = document.getElementById('semestre-selector');
    var modeExercice = document.getElementById('mode-exercice-selector');
    var specialite = document.getElementById('specialite-selector');

    switch (statut) {
      case 'Interne':
        if (semestre) semestre.style.display = 'flex';
        if (modeExercice) modeExercice.style.display = 'none';
        if (specialite) specialite.style.display = 'flex';
        break;

      case 'Autre professionnel de sante':
        if (semestre) semestre.style.display = 'none';
        if (modeExercice) modeExercice.style.display = 'flex';
        if (specialite) specialite.style.display = 'none';
        break;

      default:
        // Praticien, etc.
        if (semestre) semestre.style.display = 'none';
        if (modeExercice) modeExercice.style.display = 'flex';
        if (specialite) specialite.style.display = 'flex';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
