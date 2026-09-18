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

  var LOADER_NAME = 'OrdoMesInfosCMS';
  var ROOT = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';
  var BASE = ROOT + '/mes-informations-cms';
  var CRISP_URL = 'https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js';

  // Scripts to run, in order (phone-input.js fetches utils.js itself)
  var scripts = [
    'statut-options.js',
    'statut-selectors.js',
    'rpps-handler.js',
    'memberstack-sync.js',
    'required-if-visible.js',
    'location-store.js'
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

  // phone-input.js owns the third-party library: it fetches intl-tel-input,
  // its stylesheet and its formatting helpers only once a phone field is on
  // screen, so a page whose field stays hidden asks cdnjs for nothing.
  function loadPhoneInput(phoneInputUrl, after) {
    return after.then(function() {
      return addScript(phoneInputUrl, false).catch(function(err) {
        logFailure(err.message);
        reportFailure(err.message);
      });
    });
  }
  // --- End of loader queue ---

  function loadAll() {
    console.log('[' + LOADER_NAME + '] Loading...');
    var ordered = [ROOT + '/shared/error-reporter.js']
      .concat(scripts.map(function(file) { return BASE + '/' + file; }));

    addScript(CRISP_URL, false).catch(function(err) { logFailure(err.message); });
    var done = runInOrder(ordered);
    loadPhoneInput(ROOT + '/mes-informations/phone-input.js', done);
    done.then(function() { console.log('[' + LOADER_NAME + '] All scripts loaded'); });
  }

  loadAll();
})();
