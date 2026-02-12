/**
 * Ordotype Offre Stockage - Loader
 * Loads all scripts for the storage offer management page.
 *
 * Page: /membership/gerer-son-offre-de-stockage
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/offre-stockage/loader.js"></script>
 */
(function() {
  'use strict';

  var PREFIX = '[OrdoOffreStockage]';
  var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

  var scripts = [
    'shared/countdown.js',
    'shared/redeem-cancel-forms.js'
  ];

  function loadScript(url) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = function() { reject(new Error('Failed to load: ' + url)); };
      document.head.appendChild(script);
    });
  }

  async function init() {
    console.log(PREFIX, 'Loading scripts...');

    try {
      // Load shared utilities first
      await loadScript(BASE + '/shared/memberstack-utils.js');
      await loadScript(BASE + '/shared/error-reporter.js');

      // Load page scripts sequentially
      for (var i = 0; i < scripts.length; i++) {
        await loadScript(BASE + '/' + scripts[i]);
      }

      console.log(PREFIX, 'All scripts loaded');
    } catch (err) {
      console.error(PREFIX, 'Load error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
