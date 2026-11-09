/**
 * Ordotype Pricing V2 - Loader
 * Loads the pricing-v2 page scripts.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing-v2/loader.js"></script>
 *
 * Header scripts (geo-redirect.js, belgium-redirect.js) stay separate:
 * they must run before the page renders for their redirects to work.
 */
(function() {
  'use strict';

  var LOADER_NAME = 'OrdoPricingV2';
  var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

  // Tout est demandé en même temps et s'exécute dans cet ordre. Le paiement passe
  // en tête : il lit le membre (memberstack-utils) et signale ses échecs
  // (error-reporter), puis demande les sessions Stripe au serveur. Avant, il
  // attendait aussi le téléchargement de scripts qui n'ont rien à voir avec lui
  // (onglets, page de retour après connexion), un par un.
  var SCRIPTS = [
    'shared/memberstack-utils.js',
    'shared/error-reporter.js',
    'pricing-v2/stripe-checkout.js',
    'pricing-v2/core.js',
    'pricing-v2/tabs-bg.js'
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

  console.log('[OrdoPricingV2] Loading...');
  runInOrder(SCRIPTS.map(function(file) { return BASE + '/' + file; })).then(function() {
    console.log('[OrdoPricingV2] All scripts loaded');
  });
})();
