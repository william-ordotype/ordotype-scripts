/**
 * Ordotype Mes Informations - Required If Visible
 * Sets required attribute on inputs with [ms-code="required-if-visible"]
 * based on whether the input is visible.
 * Skips if config.showRequiredIfVisible is false.
 *
 * Depends on: core.js
 */
(function() {
  'use strict';

  var config = window.OrdoMesInfos && window.OrdoMesInfos.config;
  if (!config || !config.showRequiredIfVisible) return;

  function updateRequiredState() {
    var inputs = document.querySelectorAll('[ms-code="required-if-visible"]');

    inputs.forEach(function(input) {
      var isVisible = input.offsetParent !== null;
      input.required = isVisible;
    });
  }

  function init() {
    document.addEventListener('click', updateRequiredState);
    updateRequiredState();

    console.log('[RequiredIfVisible] Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
