/**
 * Ordotype Conseils Patients - Loader
 * Loads all conseils-patients page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients/loader.js"></script>
 */
(function() {
  'use strict';

  // Detect own commit/ref from the loader's src so sub-scripts load from
  // the same pinned version. Avoids jsDelivr @main alias staleness (where
  // edge nodes cache the alias→commit mapping separately from file
  // content, so purging files doesn't always force a fresh resolution).
  function detectVersion() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (src.indexOf('/conseils-patients/loader.js') === -1) continue;
      var m = src.match(/ordotype-scripts@([^\/]+)\//);
      if (m) return m[1];
    }
    return 'main';
  }
  const VERSION = detectVersion();
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/conseils-patients';
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/shared';

  // Scripts to load (in order). Built after embed-mode.js loads so we
  // can read window.OrdoEmbed.active and skip print-handler.js when
  // embedded (lazy-loaded on click instead).
  function buildScripts(isEmbed) {
    return [
      'opacity-reveal.js',
      'html-cleaner.js',
      'tracking.js'
    ].concat(isEmbed ? [] : ['print-handler.js'])
     .concat(['copy-handler.js']);
  }

  // Embed mode: lazy-load print-handler.js on first click of any print
  // button (#print-button-fr / #print-button-fr2 / #print-button-ar).
  // Saves ~1s on Fast 3G iframe loads; costs ~500ms on the first print
  // click (rare action).
  function installLazyPrint() {
    var buttonIds = ['print-button-fr', 'print-button-fr2', 'print-button-ar'];
    var lazyPrint = function(e) {
      e.preventDefault();
      var clickedBtn = e.currentTarget;
      buttonIds.forEach(function(id) {
        var b = document.getElementById(id);
        if (b) b.removeEventListener('click', lazyPrint);
      });
      var s = document.createElement('script');
      s.src = `${BASE}/print-handler.js`;
      s.onload = function() { clickedBtn.click(); };
      document.head.appendChild(s);
    };
    var attach = function() {
      buttonIds.forEach(function(id) {
        var b = document.getElementById(id);
        if (b) b.addEventListener('click', lazyPrint);
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach);
    } else {
      attach();
    }
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

      const isEmbed = !!(window.OrdoEmbed && window.OrdoEmbed.active);
      for (const file of buildScripts(isEmbed)) {
        await loadScript(`${BASE}/${file}`);
      }
      if (isEmbed) installLazyPrint();
      console.log('[OrdoConseils] All scripts loaded');
    } catch (err) {
      console.error('[OrdoConseils] Load error:', err);
      fallbackReveal();
    }
  }

  loadAll();
})();
