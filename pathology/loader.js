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

  // Configure opacity reveal for pathology selectors. Reveal on
  // DOMContentLoaded (not window.load): the content is decoded by
  // global-utils.js (a defer script, done before DCL), so waiting for full
  // load just kept it invisible for seconds while images/iframes loaded.
  window.OPACITY_REVEAL_CONFIG = {
    trigger: 'domcontentloaded',
    selectors: [
      '.rc-html.opacity-0',
      '.redac-and-ref.patho',
      '.premium-content-component.new-paywall',
      '.rc_hidden_warning_wrapper',
      '.rappels-cliniques_row',
      '#update-clock'
    ]
  };

  // Scripts split into tiers by criticality.
  //
  // Tier 1: paint-critical, no jQuery dependency. Parallel + awaited so
  //         a failure here triggers fallbackReveal().
  // Pause-paywall: memberstack-utils + pause-paywall loaded sequentially
  //         BEFORE Tier 2 so pause-paywall mutates the DOM (replaces paywall
  //         innerHTML + strips .w-condition-invisible) before iframe-handler's
  //         init reads the paywall state and clones it into col-right.
  //         Awaited so Tier 2 doesn't race ahead.
  // Tier 2: interactive UX. Split on a hard load-time dependency: the
  //         TIER2_JQUERY scripts reference `$` at IIFE-time, and Webflow's
  //         jQuery tag can lose that race — a blocked CDN means the page's
  //         fallback loader injects jQuery seconds later, or never on fully
  //         filtered networks. Loading them without jQuery threw one
  //         module-scope ReferenceError per script per pageview (the Sentry
  //         "$ is not defined" family) and lost the features even when the
  //         fallback recovered jQuery moments later. So: vanilla scripts
  //         load immediately, jQuery-dependent ones wait for jQuery (up to
  //         JQUERY_WAIT_MS) and are skipped with ONE structured report if
  //         it never arrives. Fire-and-forget either way.
  //         core/date-french/sources-list were rewritten vanilla so they
  //         moved to TIER2_VANILLA and keep working without jQuery. The two
  //         left in TIER2_JQUERY genuinely need the jQuery+webflow.js
  //         runtime (tabs, animate) — without jQuery, webflow.js is dead
  //         and the interactions they enhance don't exist anyway.
  // Tier 3: banners / redirects; deferred until idle so they don't compete
  //         with first paint. memberstack-utils is already loaded from the
  //         pre-T2 step, but reloading is a cache hit and idempotent.
  const TIER1 = [
    `${SHARED}/error-reporter.js`,
    `${SHARED}/opacity-reveal.js`
  ];
  const MEMBERSTACK_UTILS = `${SHARED}/memberstack-utils.js`;
  const PAUSE_PAYWALL = `${BASE}/pause-paywall.js`;
  // SAU paywall: same pre-Tier-2 contract as pause-paywall (must mutate the
  // paywall state BEFORE iframe-handler's init reads it). Runs after
  // pause-paywall so the SAU variant wins if both ever apply.
  const SAU_PAYWALL = `${BASE}/sau-paywall.js`;
  const TIER2_VANILLA = [
    `${BASE}/tabs-manager.js`,
    `${BASE}/tooltips.js`,
    `${BASE}/clipboard.js`,
    `${BASE}/core.js`,
    `${BASE}/date-french.js`,
    `${BASE}/sources-list.js`
  ];
  const TIER2_JQUERY = [
    `${BASE}/iframe-handler.js`,
    `${BASE}/scroll-anchor.js`
  ];
  // Generous ceiling: the jQuery CDN fallback needs to detect the primary
  // failure, inject its script tag and download jQuery - normally well under
  // 5s. Past this, treat jQuery as gone for this pageview.
  const JQUERY_WAIT_MS = 20000;
  const TIER3 = [
    `${BASE}/member-redirects.js`,
    `${BASE}/countdown.js`
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
        script.crossOrigin = 'anonymous';
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

  // The gated scripts call `$`, not `jQuery` — and jQuery.noConflict()
  // (any third-party embed can call it) deletes window.$ while keeping
  // window.jQuery. Gating on jQuery alone would then pass and reintroduce
  // the exact "$ is not defined" crash this gate exists to prevent.
  function jQueryUsable() {
    return !!(window.jQuery && window.$);
  }

  // Calls back with true as soon as jQuery is usable, or false once
  // maxWaitMs has elapsed without it. Polling (vs. hooking the script tag)
  // stays correct no matter where jQuery comes from: Webflow's tag, the
  // CDN-fallback loader, or a browser extension.
  function whenJQueryReady(maxWaitMs, callback) {
    if (jQueryUsable()) {
      callback(true);
      return;
    }
    var waited = 0;
    var timer = setInterval(function() {
      if (jQueryUsable()) {
        clearInterval(timer);
        callback(true);
      } else if ((waited += 200) >= maxWaitMs) {
        clearInterval(timer);
        callback(false);
      }
    }, 200);
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
      // error-reporter.js is Tier 1, so it is available by the time a
      // T2/T3 failure can happen (reports to Discord + Sentry). Matters
      // doubly since the tab items became real links: a missing
      // iframe-handler means plain clicks navigate instead of opening
      // the iframe, and we want to know it is happening.
      if (window.OrdoErrorReporter) {
        window.OrdoErrorReporter.report('PathologyLoader', tierName + ' script failed after retries: ' + url);
      }
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

    // Pre-T2: load memberstack-utils + pause-paywall sequentially BEFORE
    // Tier 2 so iframe-handler.js sees the paywall state pause-paywall
    // sets up (replaces innerHTML, strips .w-condition-invisible).
    // Wrapped in try/catch so a CDN miss here doesn't prevent the rest
    // of the page from working.
    try {
      await loadScript(MEMBERSTACK_UTILS);
      await loadScript(PAUSE_PAYWALL);
      await loadScript(SAU_PAYWALL);
    } catch (err) {
      console.error('[OrdoPathology] Paywall pre-load failed:', err);
      if (window.OrdoErrorReporter) {
        window.OrdoErrorReporter.report('PathologyLoader', 'Paywall pre-load failed: ' + (err && err.message));
      }
    }

    // Tier 2: parallel, fire-and-forget. Doesn't block Tier 3 scheduling.
    Promise.all(TIER2_VANILLA.map(function(url) { return loadOrLog(url, 'Tier 2'); }))
      .then(function() { console.log('[OrdoPathology] Tier 2 (vanilla) loaded'); });

    whenJQueryReady(JQUERY_WAIT_MS, function(hasJQuery) {
      if (!hasJQuery) {
        console.warn('[OrdoPathology] jQuery never arrived, skipping ' + TIER2_JQUERY.length + ' jQuery-dependent script(s)');
        if (window.OrdoErrorReporter) {
          window.OrdoErrorReporter.report('PathologyLoader', 'jQuery unavailable after ' + JQUERY_WAIT_MS + 'ms: skipped jQuery-dependent Tier 2 scripts');
        }
        return;
      }
      Promise.all(TIER2_JQUERY.map(function(url) { return loadOrLog(url, 'Tier 2'); }))
        .then(function() { console.log('[OrdoPathology] Tier 2 (jQuery) loaded'); });
    });

    // Tier 3: defer until the browser is idle. memberstack-utils was
    // loaded pre-T2 (cache hit here, idempotent IIFE), so consumers in
    // TIER3 can rely on window.OrdoMemberstack.
    scheduleIdle(function() {
      loadScript(MEMBERSTACK_UTILS)
        .then(function() {
          return Promise.all(TIER3.map(function(url) { return loadOrLog(url, 'Tier 3'); }));
        })
        .then(function() { console.log('[OrdoPathology] Tier 3 loaded'); })
        .catch(function(err) {
          console.error('[OrdoPathology] Tier 3 prereq failed:', err);
        });
    });
  }

  loadAll();
})();
