/**
 * Ordotype Mes Informations - Styles
 * Injects CSS fixes for intl-tel-input width and country list.
 */
(function() {
  'use strict';

  var css = '.iti { width: 100%; } .iti__country-list { max-width: 22rem; }';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  console.log('[OrdoMesInfos] Styles injected');
})();
