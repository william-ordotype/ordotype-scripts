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
  var INTL_TEL_INPUT_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css';
  var INTL_TEL_INPUT_JS = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js';
  var PHONE_LIB_TIMEOUT_MS = 15000;

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

  // phone-input.js runs once `after` has settled and the library has loaded.
  function loadPhoneInput(phoneInputUrl, after) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = INTL_TEL_INPUT_CSS;
    link.onerror = function() { console.warn('[' + LOADER_NAME + '] Failed to load: ' + INTL_TEL_INPUT_CSS); };
    document.head.appendChild(link);

    var lib = addScript(INTL_TEL_INPUT_JS, false);
    var timer = setTimeout(function() {
      logFailure('Timed out: ' + INTL_TEL_INPUT_JS);
      after.then(function() { reportFailure('Timed out: ' + INTL_TEL_INPUT_JS); });
    }, PHONE_LIB_TIMEOUT_MS);
    lib.then(function() { clearTimeout(timer); }, function() { clearTimeout(timer); });

    return after.then(function() { return lib; }).then(function() {
      return addScript(phoneInputUrl, false).catch(function(err) {
        logFailure(err.message);
        reportFailure(err.message);
      });
    }, function(err) {
      logFailure(err.message);
      reportFailure(err.message);
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
