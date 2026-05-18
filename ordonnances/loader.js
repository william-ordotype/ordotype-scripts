/**
 * Ordotype Ordonnances - Loader
 * Loads all ordonnances page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances/loader.js"></script>
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
      if (src.indexOf('/ordonnances/loader.js') === -1) continue;
      var m = src.match(/ordotype-scripts@([^\/]+)\//);
      if (m) return m[1];
    }
    return 'main';
  }
  const VERSION = detectVersion();
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/ordonnances';
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/shared';

  // Scripts to load (in order) — absolute URLs bypass BASE prefix.
  // Built after embed-mode.js loads so we can read window.OrdoEmbed.active.
  // In embed mode, print-handler.js and copy-handler.js are skipped from
  // the initial load and lazy-loaded on first click of their buttons.
  function buildScripts(isEmbed) {
    var s = ['qr-code-aggregator.js', 'opacity-reveal.js', 'urgent-handler.js', 'duplicates-cleaner.js'];
    if (!isEmbed) {
      s.push('print-handler.js');
      s.push('copy-handler.js');
    }
    return s;
  }

  // Embed mode: most prescriptions use #print-cp-ordo (direct PDF link).
  // The rare PDF-less ones expose #print-button-cp and need print-handler.js.
  // Skip the eager load (~1s on Fast 3G); fetch on first click instead.
  function installLazyPrint() {
    var attach = function() {
      var btn = document.getElementById('print-button-cp');
      if (!btn) return;
      var lazyPrint = function(e) {
        e.preventDefault();
        btn.removeEventListener('click', lazyPrint);
        var s = document.createElement('script');
        s.src = `${BASE}/print-handler.js`;
        s.onload = function() { btn.click(); };
        document.head.appendChild(s);
      };
      btn.addEventListener('click', lazyPrint);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach);
    } else {
      attach();
    }
  }

  // Embed mode: copy-handler.js is ~15KB and only does real work on click.
  // Skip eager load and fetch on first click of any copy trigger. After
  // load, re-fire the click so copy-handler's listener runs normally.
  // Possible copy triggers: #copy-button, #copy-button-fcp, [data-ordo-copy="trigger"].
  function installLazyCopy() {
    var attach = function() {
      var nodes = []
        .concat(Array.prototype.slice.call(document.querySelectorAll('#copy-button')))
        .concat(Array.prototype.slice.call(document.querySelectorAll('#copy-button-fcp')))
        .concat(Array.prototype.slice.call(document.querySelectorAll('[data-ordo-copy="trigger"]')));
      if (nodes.length === 0) return;
      var lazyCopy = function(e) {
        e.preventDefault();
        var clickedBtn = e.currentTarget;
        nodes.forEach(function(n) { n.removeEventListener('click', lazyCopy); });
        var s = document.createElement('script');
        s.src = `${BASE}/copy-handler.js`;
        s.onload = function() { clickedBtn.click(); };
        document.head.appendChild(s);
      };
      nodes.forEach(function(n) { n.addEventListener('click', lazyCopy); });
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
      // Load shared utilities first — embed-mode must run before anything
      // that paints gated content so it can pre-reveal + strip skeletons.
      await loadScript(`${SHARED_BASE}/embed-mode.js`);
      await loadScript(`${SHARED_BASE}/memberstack-utils.js`);
      await loadScript(`${SHARED_BASE}/error-reporter.js`);

      const isEmbed = !!(window.OrdoEmbed && window.OrdoEmbed.active);
      for (const file of buildScripts(isEmbed)) {
        const url = file.startsWith('http') ? file : `${BASE}/${file}`;
        await loadScript(url);
      }
      if (isEmbed) {
        installLazyPrint();
        installLazyCopy();
      }
      console.log('[OrdoOrdonnances] All scripts loaded');
    } catch (err) {
      console.error('[OrdoOrdonnances] Load error:', err);
      fallbackReveal();
    }
  }

  loadAll();
})();
