/**
 * Ordotype Mes Informations CMS - Required If Visible
 * Toggles required attribute on inputs based on visibility.
 * Targets inputs with ms-code="required-if-visible".
 */
(function() {
  'use strict';

  function isElementVisible(el) {
    return el.offsetParent !== null;
  }

  document.addEventListener('click', function() {
    var inputs = document.querySelectorAll('[ms-code="required-if-visible"]');
    inputs.forEach(function(input) {
      input.required = isElementVisible(input);
    });
  });

  console.log('[RequiredIfVisible] Initialized');
})();
