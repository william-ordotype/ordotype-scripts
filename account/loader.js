/**
 * Ordotype Account - Loader
 * Loads all account scripts in the correct order.
 * 
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/YOUR_USER/YOUR_REPO@main/account/loader.js"></script>
 * 
 * To bust cache after updates, use a version tag:
 * <script defer src="https://cdn.jsdelivr.net/gh/YOUR_USER/YOUR_REPO@v1.0.1/account/loader.js"></script>
 */
(function() {
  'use strict';

  // Auto-detect loader's own commit/ref so sub-scripts load from the same
  // pinned version (sidesteps stale jsDelivr @main caches).
  function detectVersion() {
    const list = document.getElementsByTagName('script');
    for (let i = 0; i < list.length; i++) {
      const src = list[i].src || '';
      if (src.indexOf('/account/loader.js') === -1) continue;
      const m = src.match(/ordotype-scripts@([^\/]+)\//);
      if (m) return m[1];
    }
    return 'main';
  }
  const VERSION = detectVersion();
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/account';
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/shared';

  // Scripts to load (in order)
  const scripts = [
    'styles.js',         // Must be first - hides empty Memberstack divs
    'core.js',           // Exposes window.OrdoAccount
    'subscriptions.js',
    'session-stats-prefetch.js',
    'pause-state.js',
    'tab-hash.js',
    'status-selectors.js',
    'delete-account.js',
    'billing-portal.js',
    'phone-input.js'
  ];

  const INTL_TEL_INPUT_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css';
  const INTL_TEL_INPUT_JS = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js';

  // script.async = false → browser fetches in parallel but executes in
  // insertion order. Preserves the dependency chain (memberstack-utils →
  // core → consumers) without serializing downloads.
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = url;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${url}`));
      document.head.appendChild(script);
    });
  }

  function loadCSS(url) {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  async function loadAll() {
    console.log('[OrdoAccount] Loading...');

    const orderedJS = [
      `${SHARED_BASE}/memberstack-utils.js`,
      `${SHARED_BASE}/error-reporter.js`,
      INTL_TEL_INPUT_JS,
      ...scripts.map(f => `${BASE}/${f}`)
    ];

    try {
      await Promise.all([
        loadCSS(INTL_TEL_INPUT_CSS),
        ...orderedJS.map(loadScript)
      ]);
      console.log('[OrdoAccount] All scripts loaded');
    } catch (err) {
      console.error('[OrdoAccount] Load error:', err);
    }
  }

  loadAll();
})();
