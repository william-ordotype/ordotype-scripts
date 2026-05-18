/**
 * Ordotype Conseils Patients - Loader
 * Loads all conseils-patients page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URL
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients';
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared';

  // Scripts to load (in order). Built after embed-mode.js runs so we can
  // read window.OrdoEmbed.active (the canonical embed gate: ?embed=1 AND
  // inside an iframe).
  function buildScripts() {
    var isEmbed = window.OrdoEmbed && window.OrdoEmbed.active;
    return [
      'opacity-reveal.js',
      'html-cleaner.js'
    ].concat(isEmbed ? [] : ['tracking.js', 'print-handler.js'])
     .concat(['copy-handler.js']);
  }

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
    ['.qr-code-fcp-div-block-wrapper', '.rc-html-fcp'].forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.style.opacity = '1';
      });
    });
    console.warn('[OrdoConseils] Fallback reveal triggered');
  }

  // Load all scripts in order
  async function loadAll() {
    console.log('[OrdoConseils] Loading...');

    try {
      // Load shared utilities first — embed-mode must run before anything
      // that paints gated content so it can pre-reveal + strip skeletons.
      await loadScript(`${SHARED_BASE}/embed-mode.js`);
      await loadScript(`${SHARED_BASE}/memberstack-utils.js`);
      await loadScript(`${SHARED_BASE}/error-reporter.js`);

      for (const file of buildScripts()) {
        await loadScript(`${BASE}/${file}`);
      }
      console.log('[OrdoConseils] All scripts loaded');
    } catch (err) {
      console.error('[OrdoConseils] Load error:', err);
      fallbackReveal();
    }
  }

  loadAll();
})();
