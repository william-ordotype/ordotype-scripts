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

  // Scripts split into 3 tiers by criticality.
  //
  // Tier 1: paint-critical, no jQuery dependency. Parallel + awaited so
  //         a failure here triggers fallbackReveal().
  // Tier 2: interactive UX. Most depend on jQuery; by the time T1 has
  //         resolved (~one parallel batch later), Webflow's jQuery tag
  //         has had ample time to execute. Fire-and-forget.
  // Tier 3: banners / redirects / paywall; deferred until idle so they
  //         don't compete with first paint. memberstack-utils loads
  //         first because the other 3 read window.OrdoMemberstack.
  //
  // core.js is in Tier 2 (not Tier 1) because it calls $(window).on()
  // at IIFE-time — keeping it out of the eager parallel batch avoids a
  // race with Webflow's jQuery script tag.
  //
  // clipboard.js is loaded on demand via installLazyClipboard() below.
  const TIER1 = [
    `${SHARED}/error-reporter.js`,
    `${SHARED}/opacity-reveal.js`
  ];
  const TIER2 = [
    `${BASE}/core.js`,
    `${BASE}/tabs-manager.js`,
    `${BASE}/iframe-handler.js`,
    `${BASE}/tooltips.js`,
    `${BASE}/scroll-anchor.js`,
    `${BASE}/date-french.js`,
    `${BASE}/sources-list.js`
  ];
  const TIER3_PREREQ = `${SHARED}/memberstack-utils.js`;
  const TIER3 = [
    `${BASE}/member-redirects.js`,
    `${BASE}/countdown.js`,
    `${BASE}/pause-paywall.js`
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

  // Schedule a callback for when the browser is idle. Falls back to a
  // setTimeout for browsers without requestIdleCallback (Safari < 17).
  function scheduleIdle(fn) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout: 2000 });
    } else {
      setTimeout(fn, 2000);
    }
  }

  // Wrap loadScript so a single failing script doesn't abort siblings in
  // a Promise.all (only T2/T3 use this; T1 failures still bubble up).
  function loadOrLog(url, tierName) {
    return loadScript(url).catch(function(err) {
      console.error('[OrdoPathology] ' + tierName + ' script failed:', url, err);
    });
  }

  async function loadAll() {
    console.log('[OrdoPathology] Loading...');

    try {
      // Tier 1: parallel, awaited. These must succeed for the page to
      // render correctly. If any fail, fall back to revealing content
      // via CSS so the user isn't stuck on a blank page.
      await Promise.all(TIER1.map(function(url) { return loadScript(url); }));
      console.log('[OrdoPathology] Tier 1 loaded');
    } catch (err) {
      console.error('[OrdoPathology] Tier 1 load error:', err);
      fallbackReveal();
      return;
    }

    // Tier 2: parallel, fire-and-forget. Doesn't block Tier 3 scheduling.
    Promise.all(TIER2.map(function(url) { return loadOrLog(url, 'Tier 2'); }))
      .then(function() { console.log('[OrdoPathology] Tier 2 loaded'); });

    // Tier 3: defer until the browser is idle. memberstack-utils must
    // resolve before its consumers in TIER3 — they read window.OrdoMemberstack.
    scheduleIdle(function() {
      loadScript(TIER3_PREREQ)
        .then(function() {
          return Promise.all(TIER3.map(function(url) { return loadOrLog(url, 'Tier 3'); }));
        })
        .then(function() { console.log('[OrdoPathology] Tier 3 loaded'); })
        .catch(function(err) {
          console.error('[OrdoPathology] Tier 3 prereq failed:', err);
        });
    });
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
