/**
 * Ordotype Pathology - Loader
 * Loads all pathology page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/loader.js"></script>
 */
(function() {
  'use strict';

  // Detect own commit/ref from the loader's src so sub-scripts load from
  // the same pinned version (avoids stale jsDelivr @main caches).
  function detectVersion() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (src.indexOf('/pathology/loader.js') === -1) continue;
      var m = src.match(/ordotype-scripts@([^\/]+)\//);
      if (m) return m[1];
    }
    return 'main';
  }
  const VERSION = detectVersion();
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/pathology';
  const SHARED = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/shared';

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
  // clipboard.js is intentionally NOT here — #copy-drawer only appears on
  // custom ordonnances / conseils patients, so we lazy-load it on first
  // interaction via installLazyClipboard() below.
  const scripts = [
    `${SHARED}/memberstack-utils.js`,
    `${SHARED}/error-reporter.js`,
    `${BASE}/core.js`,
    `${BASE}/countdown.js`,
    `${BASE}/member-redirects.js`,
    `${BASE}/date-french.js`,
    `${BASE}/sources-list.js`,
    `${SHARED}/opacity-reveal.js`,
    `${BASE}/tabs-manager.js`,
    `${BASE}/scroll-anchor.js`,
    `${BASE}/pause-paywall.js`,
    `${BASE}/iframe-handler.js`,
    `${BASE}/tooltips.js`
  ];

  // Load a single script with retry
  function loadScript(url, retries, delay) {
    retries = retries || 3;
    delay = delay || 1000;

    return new Promise(function(resolve, reject) {
      var attempts = 0;

      function tryLoad() {
        attempts++;
        var script = document.createElement('script');
        script.src = url + (attempts > 1 ? '?retry=' + attempts : '');
        script.onload = resolve;
        script.onerror = function() {
          script.remove();
          if (attempts < retries) {
            console.warn('[OrdoPathology] Retry ' + attempts + '/' + retries + ' for:', url);
            setTimeout(tryLoad, delay);
          } else {
            reject(new Error('Failed after ' + retries + ' attempts: ' + url));
          }
        };
        document.head.appendChild(script);
      }

      tryLoad();
    });
  }

  // Fallback: reveal content if scripts fail
  function fallbackReveal() {
    var selectors = (window.OPACITY_REVEAL_CONFIG && window.OPACITY_REVEAL_CONFIG.selectors) || [];
    selectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(el) {
        el.style.opacity = '1';
      });
    });
    console.warn('[OrdoPathology] Fallback reveal triggered');
  }

  // Load all scripts in order
  async function loadAll() {
    console.log('[OrdoPathology] Loading...');

    try {
      for (var i = 0; i < scripts.length; i++) {
        await loadScript(scripts[i]);
      }
      console.log('[OrdoPathology] All scripts loaded');
    } catch (err) {
      console.error('[OrdoPathology] Load error:', err);
      fallbackReveal();
    }
  }

  // Lazy-load ClipboardJS + clipboard.js only when the (rare) custom copy
  // drawer is actually used. Preloads on mousedown/touchstart so the libs
  // are usually ready by the time the click event fires; if not, blocks the
  // click, loads, then replays it.
  //
  // ClipboardJS must execute BEFORE clipboard.js (which calls
  // `new ClipboardJS(...)` at IIFE-time), so sequence the two — Promise.all
  // would race them since dynamically-inserted scripts execute as they arrive.
  function installLazyClipboard() {
    var ready = false;
    var loadPromise = null;
    var CLIPBOARDJS_URL = 'https://cdn.jsdelivr.net/npm/clipboard@2.0.11/dist/clipboard.min.js';

    function loadLibs() {
      if (loadPromise) return loadPromise;
      console.log('[OrdoPathology] Lazy-loading ClipboardJS + clipboard.js');
      loadPromise = loadScript(CLIPBOARDJS_URL)
        .then(function() { return loadScript(BASE + '/clipboard.js'); })
        .then(function() { ready = true; })
        .catch(function(err) {
          console.error('[OrdoPathology] Lazy clipboard load failed:', err);
          loadPromise = null; // allow retry on next interaction
          throw err;          // propagate so click handler skips the replay
        });
      return loadPromise;
    }

    function inDrawer(e) {
      return e.target && e.target.closest && e.target.closest('#copy-drawer');
    }

    // Preload is best-effort — swallow rejection silently; the click
    // handler's .catch will surface the error if it fails there too.
    document.addEventListener('mousedown', function(e) {
      if (inDrawer(e)) loadLibs().catch(function() {});
    }, true);
    document.addEventListener('touchstart', function(e) {
      if (inDrawer(e)) loadLibs().catch(function() {});
    }, { capture: true, passive: true });
    document.addEventListener('click', function(e) {
      if (!inDrawer(e)) return;
      if (ready) return; // ClipboardJS already bound — let it handle this click
      e.preventDefault();
      e.stopPropagation();
      var original = e.target;
      loadLibs()
        .then(function() { original.click(); })
        .catch(function() { /* already logged in loadLibs */ });
    }, true);
  }

  installLazyClipboard();
  loadAll();
})();
