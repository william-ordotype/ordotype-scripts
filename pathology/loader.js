/**
 * Ordotype Pathology - Loader
 * Loads all pathology page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URL
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology';

  // Scripts to load (in order)
  const scripts = [
    'core.js',
    'countdown.js',
    'member-redirects.js',
    'clipboard.js',
    'date-french.js',
    'sources-list.js',
    'opacity-reveal.js',
    'tabs-manager.js',
    'scroll-anchor.js',
    'iframe-handler.js',
    'tooltips.js'
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
    console.log('[OrdoPathology] Loading...');

    try {
      for (const file of scripts) {
        await loadScript(`${BASE}/${file}`);
      }
      console.log('[OrdoPathology] All scripts loaded');
    } catch (err) {
      console.error('[OrdoPathology] Load error:', err);
    }
  }

  loadAll();
})();
