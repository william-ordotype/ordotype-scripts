/**
 * Ordotype Mes Informations - RPPS Checkbox
 * When #notRPPS checkbox is checked, sets #RPPS input to configured text.
 * Skips entirely if config.rppsText is null.
 *
 * Depends on: core.js
 */
(function() {
  'use strict';

  var config = window.OrdoMesInfos && window.OrdoMesInfos.config;
  if (!config || config.rppsText === null) return;

  function init() {
    var checkbox = document.getElementById('notRPPS');
    var rppsInput = document.getElementById('RPPS');

    if (!checkbox || !rppsInput) {
      console.log('[RPPS] Elements not found, skipping');
      return;
    }

    checkbox.addEventListener('change', function() {
      if (checkbox.checked) {
        rppsInput.value = config.rppsText;
      }
    });

    // Apply initial state if checkbox is already checked
    if (checkbox.checked) {
      rppsInput.value = config.rppsText;
    }

    console.log('[RPPS] Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
