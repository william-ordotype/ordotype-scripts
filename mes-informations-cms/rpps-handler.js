/**
 * Ordotype Mes Informations CMS - RPPS Handler
 * Sets RPPS value to "Pas de {equivalent}" when notRPPS checkbox is checked.
 * Expects window.OrdoMesInfosCMS.rppsEquivalentName to be set by loader.
 */
(function() {
  'use strict';

  var rpps = document.getElementById('RPPS');
  var notRPPS = document.getElementById('notRPPS');

  if (!rpps || !notRPPS) return;

  var equivalentName = (window.OrdoMesInfosCMS && window.OrdoMesInfosCMS.rppsEquivalentName) || 'RPPS';

  notRPPS.addEventListener('change', function() {
    if (notRPPS.checked) {
      rpps.value = 'Pas de ' + equivalentName;
    }
  });

  console.log('[RPPSHandler] Initialized');
})();
