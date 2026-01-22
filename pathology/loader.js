/**
 * Ordotype Pathology - Loader
 * Loads all pathology page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URLs
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology';
  const SHARED = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared';

  // Configure opacity reveal for pathology selectors
  window.OPACITY_REVEAL_CONFIG = {
    selectors: [
      '.rc-html.opacity-0',
      '.redac-and-ref.patho',
      '.premium-content-component.new-paywall',
      '.rc_hidden_warning_wrapper',
      '.rappels-cliniques_row',
      '#update-clock'
    ]
  };

  // Scripts to load (in order) - use full URLs for shared scripts
  const scripts = [
    `${BASE}/core.js`,
    `${BASE}/countdown.js`,
    `${BASE}/member-redirects.js`,
    `${BASE}/clipboard.js`,
    `${BASE}/date-french.js`,
    `${BASE}/sources-list.js`,
    `${SHARED}/opacity-reveal.js`,
    `${BASE}/tabs-manager.js`,
    `${BASE}/scroll-anchor.js`,
    `${BASE}/iframe-handler.js`,
    `${BASE}/tooltips.js`
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
      for (const url of scripts) {
        await loadScript(url);
      }
      console.log('[OrdoPathology] All scripts loaded');
    } catch (err) {
      console.error('[OrdoPathology] Load error:', err);
    }
  }

  loadAll();
})();
