/**
 * Ordotype Pricing V2 - Loader
 * Loads all pricing-v2 page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing-v2/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URL
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing-v2';

  // Scripts to load (in order)
  // Note: geo-redirect.js, belgium-redirect.js must be loaded
  // separately in the header (before page renders) for redirects to work
  const scripts = [
    'core.js',
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
    console.log('[OrdoPricingV2] Loading...');

    try {
      for (const file of scripts) {
        await loadScript(`${BASE}/${file}`);
      }
      console.log('[OrdoPricingV2] All scripts loaded');
    } catch (err) {
      console.error('[OrdoPricingV2] Load error:', err);
    }
  }

  loadAll();
})();
