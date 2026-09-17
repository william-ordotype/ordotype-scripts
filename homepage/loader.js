/**
 * Ordotype Homepage - Loader
 * Loads all homepage scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js"></script>
 */
(function() {
  'use strict';

  var LOADER_NAME = 'OrdoHomepage';

  // Auto-detect loader's own commit/ref so sub-scripts load from the same
  // pinned version (sidesteps stale jsDelivr @main caches).
  function detectVersion() {
    var list = document.getElementsByTagName('script');
    for (var i = 0; i < list.length; i++) {
      var src = list[i].src || '';
      if (src.indexOf('/homepage/loader.js') === -1) continue;
      var m = src.match(/ordotype-scripts@([^\/]+)\//);
      if (m) return m[1];
    }
    return 'main';
  }
  var ROOT = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + detectVersion();

  // Scripts to run, in order
  var scripts = [
    ROOT + '/shared/memberstack-utils.js',
    ROOT + '/shared/error-reporter.js',
    ROOT + '/homepage/core.js',
    ROOT + '/homepage/countdown.js',
    ROOT + '/homepage/member-redirects.js',
    ROOT + '/homepage/cgu-modal.js'
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

  console.log('[' + LOADER_NAME + '] Loading...');
  var done = runInOrder(scripts);
  loadPhoneInput(ROOT + '/mes-informations/phone-input.js', done);
  done.then(function() { console.log('[' + LOADER_NAME + '] All scripts loaded'); });
})();
