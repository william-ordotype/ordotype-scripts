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
 *
 * Scripts are loaded from the same version as this loader: pinning its URL to a commit
 * (…/ordotype-scripts@<sha>/mes-informations/loader.js) pins every script it loads.
 */
(function() {
  'use strict';

  var LOADER_NAME = 'OrdoMesInfos';

  var DEFAULT_ROOT = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

  function getRoot() {
    var src = document.currentScript && document.currentScript.src;
    var match = src && src.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/william-ordotype\/ordotype-scripts@[^\/]+)\/mes-informations\/loader\.js/);
    return match ? match[1] : DEFAULT_ROOT;
  }

  var ROOT = getRoot();
  var BASE = ROOT + '/mes-informations';
  var SHARED_BASE = ROOT + '/shared';

  // Core scripts, in order
  var scripts = [
    'styles.js',
    'core.js',
    'rpps.js',
    'memberstack-sync.js',
    'statut-selectors.js',
    'required-if-visible.js',
    'ga4-events.js'
  ];

  // --- Loader queue: identical in every loader (test/loader-resilience.js) ---

  function logFailure(message) {
    console.error('[' + LOADER_NAME + ']', message);
  }

  function reportFailure(message) {
    var reporter = window.OrdoErrorReporter;
    if (reporter && typeof reporter.reportNetwork === 'function') {
      reporter.reportNetwork(LOADER_NAME, new Error(message));
    }
  }

  function addScript(url, ordered) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = url;
      script.async = !ordered;
      script.onload = resolve;
      script.onerror = function() { reject(new Error('Failed to load: ' + url)); };
      document.head.appendChild(script);
    });
  }

  // Fetched in parallel, run in order; a script that fails is skipped. Never rejects.
  function runInOrder(urls) {
    var failures = [];
    return Promise.all(urls.map(function(url) {
      return addScript(url, true).catch(function(err) {
        logFailure(err.message);
        failures.push(err.message);
      });
    })).then(function() {
      failures.forEach(reportFailure);
    });
  }

  // --- End of loader queue ---

  function loadAll() {
    console.log('[' + LOADER_NAME + '] Loading...');
    var config = window.MES_INFOS_CONFIG || {};

    var ordered = [SHARED_BASE + '/memberstack-utils.js', SHARED_BASE + '/error-reporter.js']
      .concat(scripts.map(function(file) { return BASE + '/' + file; }));
    if (config.enableCheckout) ordered.push(BASE + '/checkout.js');
    if (config.enablePartnershipCity) ordered.push(BASE + '/partnership-city.js');

    addScript(SHARED_BASE + '/crisp-loader.js', false).catch(function(err) { logFailure(err.message); });
    var done = runInOrder(ordered.concat([BASE + '/phone-input.js']));
    done.then(function() { console.log('[' + LOADER_NAME + '] All scripts loaded'); });
  }

  loadAll();
})();
