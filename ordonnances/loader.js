/**
 * Ordotype Ordonnances - Loader
 * Loads all ordonnances page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URL
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances';

  // Scripts to load (in order)
  const scripts = [
    'opacity-reveal.js',
    'urgent-handler.js',
    'duplicates-cleaner.js',
    'print-handler.js',
    'copy-handler.js'
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
    console.log('[OrdoOrdonnances] Loading...');

    try {
      for (const file of scripts) {
        await loadScript(`${BASE}/${file}`);
      }
      console.log('[OrdoOrdonnances] All scripts loaded');
    } catch (err) {
      console.error('[OrdoOrdonnances] Load error:', err);
    }
  }

  loadAll();
})();
