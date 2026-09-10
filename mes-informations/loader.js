/**
 * Ordotype Mes Informations - Loader
 * Loads all mes-informations scripts in the correct order.
 * Reads window.MES_INFOS_CONFIG (set inline per Webflow page) for conditional loading.
 *
 * Usage in Webflow:
 * <script>
 * window.MES_INFOS_CONFIG = { rppsText: 'Pas de RPPS', showStatutSelectors: true, ... };
 * </script>
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/loader.js"></script>
 */
(function() {
  'use strict';

  var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations';
  var SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared';

  // Core scripts loaded on every page
  var scripts = [
    'styles.js',
    'core.js',
    'rpps.js',
    'memberstack-sync.js',
    'statut-selectors.js',
    'required-if-visible.js',
    'phone-input.js',
    'ga4-events.js'
  ];

  // Une feuille de style qui ne répond jamais ne doit pas retenir la page.
  var CSS_TIMEOUT_MS = 8000;

  // External dependencies for phone input
  var dependencies = [
    {
      type: 'css',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css'
    },
    {
      type: 'js',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js'
    }
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
    console.log('[OrdoMesInfos] Loading...');

    try {
      // Load shared utilities first
      await loadScript(SHARED_BASE + '/memberstack-utils.js');
      await loadScript(SHARED_BASE + '/error-reporter.js');
      await loadScript(SHARED_BASE + '/crisp-loader.js');

      // Le champ téléphone pend à un CDN tiers dont les défaillances sont
      // mesurées, pas hypothétiques. Son propre filet : un numéro non formaté
      // ne doit pas emporter la synchronisation Memberstack du profil ni le
      // reste de la page. `phone-input.js` reste chargé plus bas même quand
      // ses dépendances ont manqué, parce que c'est LUI qui sait le dire.
      try {
        await Promise.all(dependencies.map(function(dep) {
          return dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url);
        }));
      } catch (err) {
        console.error('[OrdoMesInfos] Phone dependencies unavailable:', err);
      }

      // Load core scripts sequentially
      for (var i = 0; i < scripts.length; i++) {
        await loadScript(BASE + '/' + scripts[i]);
      }

      // Conditionally load page-specific scripts
      var config = window.MES_INFOS_CONFIG || {};

      if (config.enableCheckout) {
        await loadScript(BASE + '/checkout.js');
      }

      if (config.enablePartnershipCity) {
        await loadScript(BASE + '/partnership-city.js');
      }

      console.log('[OrdoMesInfos] All scripts loaded');
    } catch (err) {
      console.error('[OrdoMesInfos] Load error:', err);
    }
  }

  loadAll();
})();
