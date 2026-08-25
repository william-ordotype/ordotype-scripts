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

  // Scripts restricted to some hostnames (progressive rollout). A file listed
  // here is only loaded when window.location.hostname is in its allowlist;
  // everywhere else it is skipped and the page keeps its default behaviour.
  const HOST_GATED = {
    // SIREN finder: sandbox (recette done 2026-08-25) + production under the
    // percentage rollout below.
    'siren-finder.js': ['sandbox-ordotype.webflow.io', 'www.ordotype.fr']
  };
  const HOST = window.location.hostname;

  // Progressive rollout per member. For a file listed here, the script is only
  // loaded when the member's bucket (stable hash of the Memberstack member id,
  // 0-99) is below the percentage for the current host; a host not listed gets
  // 100 %. Ramp = edit the number, merge, bump the pinned embed. The bucket is
  // stable, so a member enrolled at 10 % stays enrolled at 30 % and 100 %.
  // Kill switch = 0 here, or repoint the embed to a pre-rollout commit.
  // Manual override for testing (DevTools):
  //   localStorage.setItem('ordo_rollout', 'siren-finder.js:on')   // or ':off'
  //   localStorage.removeItem('ordo_rollout')                      // back to the bucket
  const ROLLOUT = {
    'siren-finder.js': { 'www.ordotype.fr': 10 }
  };

  function memberIdFromStorage() {
    try {
      const raw = localStorage.getItem('_ms-mem');
      if (raw) {
        const snap = JSON.parse(raw);
        if (snap && typeof snap.id === 'string' && snap.id) return snap.id;
      }
      return localStorage.getItem('ms_member_id') || '';
    } catch (e) {
      return '';
    }
  }

  // FNV-1a 32-bit → 0-99. Deterministic per member id, uniform enough for a gate.
  function bucketOf(id) {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % 100;
  }

  const MEMBER_ID = memberIdFromStorage();
  window.OrdoRollout = window.OrdoRollout || {};

  function rolloutAllows(file) {
    const perHost = ROLLOUT[file];
    if (!perHost || !(HOST in perHost)) return true;
    const percent = perHost[HOST];
    let override = '';
    try { override = localStorage.getItem('ordo_rollout') || ''; } catch (e) { /* no-op */ }
    const bucket = MEMBER_ID ? bucketOf(MEMBER_ID) : null;
    let enabled;
    let reason;
    if (override === file + ':on' || override === file + ':off') {
      enabled = override.slice(-3) === ':on';
      reason = 'override';
    } else if (bucket === null) {
      enabled = false;
      reason = 'no-member';
    } else {
      enabled = bucket < percent;
      reason = 'bucket';
    }
    window.OrdoRollout[file] = { enabled, bucket, percent, reason };
    console.log('[OrdoAccount] Rollout ' + file + ': ' + (enabled ? 'on' : 'off') + ' (' + reason + ', bucket=' + bucket + ', percent=' + percent + ')');
    return enabled;
  }

  function allowedHere(file) {
    const hosts = HOST_GATED[file];
    if (hosts && hosts.indexOf(HOST) === -1) return false;
    return rolloutAllows(file);
  }

  // Scripts to load (in order)
  const scripts = [
    'styles.js',         // Must be first - hides empty Memberstack divs
    'core.js',           // Exposes window.OrdoAccount
    'siren-finder.js',   // SIREN/SIRET self-service (facturation électronique), replaces the free-text #SIRET input. HOST_GATED.
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
      ...scripts.filter(allowedHere).map(f => `${BASE}/${f}`)
    ];
    const skipped = scripts.filter(f => !allowedHere(f));
    if (skipped.length) console.log('[OrdoAccount] Skipped on ' + HOST + ':', skipped.join(', '));

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
