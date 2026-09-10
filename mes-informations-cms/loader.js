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

  // Une feuille de style qui ne répond jamais ne doit pas retenir la page.
  var CSS_TIMEOUT_MS = 8000;

  // External dependencies for phone input.
  //
  // 🔴 `utils.js` n'est PAS ici. Ce chargeur était le seul à le précharger,
  // et il annulait le différé de `phone-input.js` : le fichier étant déjà là,
  // `loadUtils()` court-circuitait, mais les 247 Ko avaient été payés. C'est
  // au script du champ de décider quand les chercher, à un endroit et un seul.
  var phoneDeps = [
    { type: 'css', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css' },
    { type: 'js', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js' }
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
      script.crossOrigin = 'anonymous';
      script.src = url;
      script.onload = resolve;
      script.onerror = function() { reject(new Error('Failed to load: ' + url)); };
      document.head.appendChild(script);
    });
  }

  // 🔴 A stylesheet must never reject and must never hang. Without `onerror`,
  // one that never arrives leaves this promise pending FOREVER, and everything
  // awaiting it is never loaded - no error, no trace, a silently inert page.
  // The deadline covers the other half: a filtering proxy can hold the request
  // open without ever answering or erroring, which fires neither handler.
  function loadCSS(url) {
    return new Promise(function(resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      }
      var timer = setTimeout(finish, CSS_TIMEOUT_MS);
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = finish;
      link.onerror = finish;
      document.head.appendChild(link);
    });
  }

  async function loadAll() {
    console.log('[OrdoMesInfosCMS] Loading...');

    try {
      // Load phone input dependencies
      // Le champ téléphone pend à un CDN tiers dont les défaillances sont
      // mesurées, pas hypothétiques. Son propre filet : un numéro non formaté
      // ne doit pas emporter Crisp, la synchronisation Memberstack et le reste
      // de la page. `phone-input.js` est chargé même quand ses dépendances ont
      // manqué, parce que c'est LUI qui sait le dire : l'écarter ferait de
      // l'échec le plus grave le plus silencieux.
      try {
        await Promise.all(phoneDeps.map(function(dep) {
          return dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url);
        }));
      } catch (err) {
        console.error('[OrdoMesInfosCMS] Phone dependencies unavailable:', err);
      }

      // Load phone-input script from mes-informations (reuse existing)
      try {
        await loadScript('https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/phone-input.js');
      } catch (err) {
        console.error('[OrdoMesInfosCMS] Load error:', err);
      }

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
