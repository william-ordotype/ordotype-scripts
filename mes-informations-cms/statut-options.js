/**
 * Ordotype Mes Informations CMS - Statut Options
 * Populates #mon-statut-2 select from CMS plain text field.
 * Expects a hidden element .statut-options-data with format: value:label,value:label,...
 */
(function() {
  'use strict';

  function init() {
    var select = document.getElementById('mon-statut-2');
    var dataEl = document.querySelector('.statut-options-data');

    if (!select || !dataEl || !dataEl.textContent.trim()) {
      console.log('[StatutOptions] No select or .statut-options-data found');
      return;
    }

    var pairs = dataEl.textContent.trim().split(',');

    // Keep the first placeholder option, remove the rest
    while (select.options.length > 1) {
      select.remove(1);
    }

    pairs.forEach(function(pair) {
      var parts = pair.split(':');
      if (parts.length === 2) {
        var option = document.createElement('option');
        option.value = parts[0].trim();
        option.textContent = parts[1].trim();
        select.appendChild(option);
      }
    });

    console.log('[StatutOptions] Populated', pairs.length, 'options from CMS');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
