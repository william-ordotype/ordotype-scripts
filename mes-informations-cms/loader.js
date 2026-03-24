/**
 * Ordotype Mes Informations CMS - Loader
 * Loads scripts for /mes-informations/{{slug}} CMS pages.
 *
 * Requires in Webflow before this script:
 * - window.OrdoMesInfosCMS = { rppsEquivalentName: '{{CMS field}}' }
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations-cms/loader.js"></script>
 */
(function() {
  'use strict';

  var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations-cms';
  var CRISP_URL = 'https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js';

  // External dependencies for phone input
  var phoneDeps = [
    { type: 'css', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css' },
    { type: 'js', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js' },
    { type: 'js', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js' }
  ];

  // Scripts to load (in order)
  var scripts = [
    'statut-options.js',
    'statut-selectors.js',
    'rpps-handler.js',
    'memberstack-sync.js',
    'required-if-visible.js',
    'location-store.js'
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

  function loadCSS(url) {
    return new Promise(function(resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  async function loadAll() {
    console.log('[OrdoMesInfosCMS] Loading...');

    try {
      // Load phone input dependencies
      await Promise.all(phoneDeps.map(function(dep) {
        return dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url);
      }));

      // Load phone-input script from mes-informations (reuse existing)
      await loadScript('https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/phone-input.js');

      // Load Crisp
      await loadScript(CRISP_URL);

      // Load core scripts sequentially
      for (var i = 0; i < scripts.length; i++) {
        await loadScript(BASE + '/' + scripts[i]);
      }

      console.log('[OrdoMesInfosCMS] All scripts loaded');
    } catch (err) {
      console.error('[OrdoMesInfosCMS] Load error:', err);
    }
  }

  loadAll();
})();
