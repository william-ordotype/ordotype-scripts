/**
 * Ordotype Account - Status Selectors
 * Controls visibility of form fields based on user status.
 * Depends on: core.js
 */
(function() {
  'use strict';

  const member = window.OrdoAccount?.member;
  if (!member?.id) return;

  function init() {
    const statutSelector = document.getElementById('mon-statut-2');
    const currentStatut = member.customFields?.statut;

    // Apply initial visibility
    applyVisibilityRules(currentStatut);

    // Listen for changes
    if (statutSelector) {
      statutSelector.addEventListener('change', (e) => {
        applyVisibilityRules(e.target.value);
      });
    }

    console.log('[StatusSelectors] Initialized with status:', currentStatut);
  }

  function applyVisibilityRules(statut) {
    const modeExercice = document.getElementById('mode-exercice-selector');
    const specialite = document.getElementById('specialite-selector');

    if (!modeExercice || !specialite) return;

    switch (statut) {
      case 'Interne':
        modeExercice.style.display = 'none';
        specialite.style.display = 'block';
        break;

      case 'Autre professionnel de sante':
        modeExercice.style.display = 'block';
        specialite.style.display = 'none';
        break;

      default:
        // Praticien, etc. - show both
        modeExercice.style.display = 'block';
        specialite.style.display = 'block';
    }
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
