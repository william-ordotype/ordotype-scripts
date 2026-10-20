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

  // Bandeau « paiement échoué », que Memberstack affiche seul : masqué ici, avant
  // que Memberstack ne l'affiche (plus tard, dans member-redirects.js, il
  // apparaissait quelques secondes puis disparaissait), dans deux cas :
  //   - délai de grâce après un vrai paiement (`justPaidTs`, 24 h : même durée
  //     que GRACE_PERIOD de member-redirects.js) ;
  //   - prélèvement SEPA en route (plan sepa-temporary, lu dans le membre que
  //     Memberstack garde en cache, `_ms-mem`), comme le bloc `!sepa-temp` des
  //     fiches. member-redirects.js repose la même règle si le cache manquait.
  (function hidePaymentFailedEarly() {
    try {
      var ts = parseInt(localStorage.getItem('justPaidTs') || '0', 10);
      var justPaid = !!ts && Date.now() - ts < 24 * 60 * 60 * 1000;
      var cached = JSON.parse(localStorage.getItem('_ms-mem') || 'null');
      var plans = cached && Array.isArray(cached.planConnections) ? cached.planConnections : [];
      var sepaEnRoute = plans.some(function(plan) {
        return plan && plan.planId === 'pln_sepa-temporary-lj4w0oky';
      });
      if (!justPaid && !sepaEnRoute) return;
      if (document.getElementById('ordo-hide-payment-failed')) return;
      var style = document.createElement('style');
      style.id = 'ordo-hide-payment-failed';
      style.textContent = '#banner-to-hide-payment-failed{display:none!important}';
      document.head.appendChild(style);
    } catch (e) {}
  })();

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

  console.log('[' + LOADER_NAME + '] Loading...');
  var done = runInOrder(scripts.concat([ROOT + '/mes-informations/phone-input.js']));
  done.then(function() { console.log('[' + LOADER_NAME + '] All scripts loaded'); });
})();
