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
  const scripts = [
    `${SHARED}/memberstack-utils.js`,
    `${SHARED}/error-reporter.js`,
    `${BASE}/core.js`,
    `${BASE}/countdown.js`,
    `${BASE}/member-redirects.js`,
    `${BASE}/clipboard.js`,
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

  loadAll();
})();
