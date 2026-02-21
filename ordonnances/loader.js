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
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared';

  // Scripts to load (in order) — absolute URLs bypass BASE prefix
  const scripts = [
    'opacity-reveal.js',
    'urgent-handler.js',
    'duplicates-cleaner.js',
    'print-handler.js',
    // TODO: revert to 'copy-handler.js' once jsDelivr @main cache has propagated (pinned 2026-02-21)
    'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@01923f5/ordonnances/copy-handler.js'
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

  // Fallback: reveal content if scripts fail
  function fallbackReveal() {
    ['.ordo-for-members', '.reco-rich-text', '.qr-codes-wrapper'].forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.style.opacity = '1';
      });
    });
    console.warn('[OrdoOrdonnances] Fallback reveal triggered');
  }

  // Load all scripts in order
  async function loadAll() {
    console.log('[OrdoOrdonnances] Loading...');

    try {
      // Load shared utilities first
      await loadScript(`${SHARED_BASE}/memberstack-utils.js`);
      await loadScript(`${SHARED_BASE}/error-reporter.js`);

      for (const file of scripts) {
        const url = file.startsWith('http') ? file : `${BASE}/${file}`;
        await loadScript(url);
      }
      console.log('[OrdoOrdonnances] All scripts loaded');
    } catch (err) {
      console.error('[OrdoOrdonnances] Load error:', err);
      fallbackReveal();
    }
  }

  loadAll();
})();
