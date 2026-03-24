/**
 * Ordotype Mes Informations CMS - Statut Selectors
 * Controls visibility of form fields based on user statut.
 * Handles: #semestre-selector, #mode-exercice-selector, #specialite-selector
 */
(function() {
  'use strict';

  function updateSelectors(statut) {
    var semestre = document.getElementById('semestre-selector');
    var modeExercice = document.getElementById('mode-exercice-selector');
    var specialite = document.getElementById('specialite-selector');

    if (statut === 'Interne') {
      if (semestre) semestre.style.display = 'flex';
      if (modeExercice) modeExercice.style.display = 'none';
      if (specialite) specialite.style.display = 'flex';
    } else if (statut === 'Autre professionnel de sante') {
      if (semestre) semestre.style.display = 'none';
      if (modeExercice) modeExercice.style.display = 'flex';
      if (specialite) specialite.style.display = 'none';
    } else {
      if (semestre) semestre.style.display = 'none';
      if (modeExercice) modeExercice.style.display = 'flex';
      if (specialite) specialite.style.display = 'flex';
    }
  }

  async function init() {
    try {
      var member = await window.$memberstackDom.getCurrentMember();
      var statut = member.data.customFields['statut'];
      updateSelectors(statut);
    } catch (err) {
      // No member logged in or error
    }

    var select = document.getElementById('mon-statut-2');
    if (select) {
      select.addEventListener('change', function() {
        updateSelectors(select.value);
      });
    }

    console.log('[StatutSelectors] Initialized');
  }

  init();
})();
