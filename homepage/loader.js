/**
 * Ordotype Homepage - Loader
 * Loads all homepage scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URL
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage';
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared';

  // Scripts to load (in order)
  const scripts = [
    'core.js',
    'countdown.js',
    'member-redirects.js',
    'cgu-modal.js'
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
    console.log('[OrdoHomepage] Loading...');

    try {
      // Load shared utilities first
      await loadScript(`${SHARED_BASE}/memberstack-utils.js`);
      await loadScript(`${SHARED_BASE}/error-reporter.js`);

      for (const file of scripts) {
        await loadScript(`${BASE}/${file}`);
      }
      console.log('[OrdoHomepage] All scripts loaded');
    } catch (err) {
      console.error('[OrdoHomepage] Load error:', err);
    }
  }

  loadAll();
})();
