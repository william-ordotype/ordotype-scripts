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

  // Scripts to load (in order). print-handler.js and copy-handler.js are
  // intentionally absent — they're lazy-loaded on first button click via
  // installLazyPrint() / installLazyCopy() regardless of embed mode.
  var SCRIPTS = ['opacity-reveal.js', 'html-cleaner.js', 'tracking.js'];

  // copy-handler.js only does real work on click. Skip eager load; fetch
  // on first click of #copy-button, then re-fire the click.
  function installLazyCopy() {
    var attach = function() {
      var btn = document.getElementById('copy-button');
      if (!btn) return;
      var lazyCopy = function(e) {
        e.preventDefault();
        btn.removeEventListener('click', lazyCopy);
        var s = document.createElement('script');
        s.src = `${BASE}/copy-handler.js`;
        s.onload = function() { btn.click(); };
        document.head.appendChild(s);
      };
      btn.addEventListener('click', lazyCopy);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach);
    } else {
      attach();
    }
  }

  // Lazy-load print-handler.js on first click of any print button
  // (#print-button-fr / #print-button-fr2 / #print-button-ar). Saves the
  // eager fetch on every pageview; costs a small one-time delay on first
  // print click.
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

      for (const file of SCRIPTS) {
        await loadScript(`${BASE}/${file}`);
      }
      installLazyPrint();
      installLazyCopy();
      console.log('[OrdoConseils] All scripts loaded');
    } catch (err) {
      console.error('[OrdoConseils] Load error:', err);
      fallbackReveal();
    }
  }

  loadAll();
})();
