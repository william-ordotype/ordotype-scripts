/**
 * Ordotype Homepage - Loader
 * Loads all homepage scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js"></script>
 */
(function() {
  'use strict';

  // Auto-detect loader's own commit/ref so sub-scripts load from the same
  // pinned version (sidesteps stale jsDelivr @main caches).
  function detectVersion() {
    const list = document.getElementsByTagName('script');
    for (let i = 0; i < list.length; i++) {
      const src = list[i].src || '';
      if (src.indexOf('/homepage/loader.js') === -1) continue;
      const m = src.match(/ordotype-scripts@([^\/]+)\//);
      if (m) return m[1];
    }
    return 'main';
  }
  const VERSION = detectVersion();
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/homepage';
  const MES_INFOS_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/mes-informations';
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/shared';

  // Scripts to load (in order)
  const scripts = [
    'core.js',
    'countdown.js',
    'member-redirects.js',
    'cgu-modal.js',
    'pause-banner.js'
  ];

  // External dependencies for phone input
  const phoneDeps = [
    { type: 'css', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css' },
    { type: 'js', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js' }
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

  function loadCSS(url) {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  // Load all scripts in order
  async function loadAll() {
    console.log('[OrdoHomepage] Loading...');

    try {
      // Load shared utilities first
      await loadScript(`${SHARED_BASE}/memberstack-utils.js`);
      await loadScript(`${SHARED_BASE}/error-reporter.js`);

      // Load phone input dependencies + script
      await Promise.all(phoneDeps.map(dep =>
        dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url)
      ));
      await loadScript(`${MES_INFOS_BASE}/phone-input.js`);

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
