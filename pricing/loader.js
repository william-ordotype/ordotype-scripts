/**
 * Ordotype Pricing - Loader
 * Loads all pricing page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URL
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing';

  // Scripts to load (in order)
  const scripts = [
    'core.js',
    'ab-test.js',
    'geo-redirect.js',
    'belgium-redirect.js',
    'hash-tabs.js',
    'stripe-checkout.js',
    'tabs-bg.js'
  ];

  // Load a single script
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${url}`));
      document.head.appendChild(script);
    });
  }

  // Load all scripts in order
  async function loadAll() {
    console.log('[OrdoPricing] Loading...');

    try {
      for (const file of scripts) {
        await loadScript(`${BASE}/${file}`);
      }
      console.log('[OrdoPricing] All scripts loaded');
    } catch (err) {
      console.error('[OrdoPricing] Load error:', err);
    }
  }

  loadAll();
})();
