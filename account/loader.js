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

  // Progressive rollout, per host and per member. A file listed in GATES is
  // loaded only on the hosts listed for it (any other host: hard skip, before
  // any override) and, on a listed host, only for members whose bucket (stable
  // FNV-1a hash of the Memberstack member id, 0-99) is below the percentage:
  // 100 = everyone, 0 = nobody by bucket. The bucket is stable, so a member
  // enrolled at 10 % stays enrolled at 30 % and 100 %.
  //
  // Ramp = edit the number, merge, bump the pinned embed, publish the Webflow
  // site (staging domain first, then www). Kill switch = remove the host entry
  // or repoint the embed to a pre-rollout commit, then publish. A pin bump
  // ships every account script at that commit, so ramp from the current main.
  //
  // Override for testers (DevTools, origin-scoped, only on a listed host):
  //   localStorage.setItem('ordo_rollout', 'siren-finder.js:on')   // or ':off'
  //   localStorage.setItem('ordo_rollout', 'siren-finder.js:on,invoice-emails.js:on')
  //   localStorage.removeItem('ordo_rollout')                      // back to the bucket
  // Comma-separated, one entry per gated file: with more than one gate, a
  // single slot could no longer express what a member actually sees.
  // With 0 % on a host, the override is the way to verify a build there with
  // zero member exposure (that is what the prod staging domain is for).
  //
  // Every decision on a listed host is published in window.OrdoRollout[file]
  // and pushed to the dataLayer as 'siren_rollout' (control members included,
  // so GA4 has a denominator).
  const GATES = {
    'siren-finder.js': {
      'sandbox-ordotype.webflow.io': 100,
      'ordotype.webflow.io': 100, // prod staging domain: everyone, so a build can
                                  // be verified there without the localStorage override
      // 100 % depuis le 2026-09-07 : 13 jours à 10 % sans un seul incident
      // (82 recherches, 4 enregistrements réels, 0 saturation SIRENE, 0 échec
      // de projection Stripe, 0 erreur JS, 0 alerte). Les membres déjà enrôlés
      // le restent : le bucket est stable.
      'www.ordotype.fr': 100
    },
    // 🔴 Les deux domaines de recette font tourner Memberstack et Stripe en mode
    // TEST, et l'opt-in est adossé au registre LIVE : le serveur refuse les
    // membres du mode test plutôt que d'y écrire un identifiant client de test.
    // Ces hôtes ne peuvent donc PAS éprouver cette fonctionnalité, quel que soit
    // le pourcentage. La vérification se fait sur www avec l'override, qui
    // n'expose aucun autre membre.
    'invoice-emails.js': {
      // 10 % depuis le 2026-09-07. La chaîne entière a tourné en réel avant
      // d'ouvrir : consentement écrit des deux côtés, retrait honoré par le
      // programme d'envoi, rattrapage d'une projection perdue, et l'écran
      // d'administration qui lit la même et unique source.
      //
      // 🔴 Un membre enrôlé le reste : le bucket est stable, donc passer à 30 %
      // puis 100 % n'enlève l'interrupteur à personne. L'inverse — le retirer à
      // quelqu'un qui a déjà coché — laisserait un consentement actif que le
      // client ne peut plus retirer depuis sa page.
      'www.ordotype.fr': 10
    }
  };
  const HOST = window.location.hostname;

  // Identity for the bucket = the Memberstack snapshot the account scripts
  // themselves read (shared/memberstack-utils.js). Nothing else: a stale
  // ms_member_id from a previous 2FA challenge could belong to another member.
  function memberIdFromStorage() {
    let raw = null;
    try { raw = localStorage.getItem('_ms-mem'); } catch (e) { return ''; }
    if (!raw) return '';
    try {
      const snap = JSON.parse(raw);
      return snap && typeof snap.id === 'string' ? snap.id : '';
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

  // Un seul emplacement de stockage, mais plusieurs fichiers gatés : la valeur
  // accepte donc une LISTE séparée par des virgules, sinon deux fonctionnalités
  // gatées ne peuvent plus être essayées ensemble sur la même page, ce qui est
  // pourtant ce qu'un membre verrait.
  //   localStorage.setItem('ordo_rollout', 'siren-finder.js:on,invoice-emails.js:on')
  function readOverride() {
    let raw = '';
    try { raw = localStorage.getItem('ordo_rollout') || ''; } catch (e) { return []; }
    return raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  }

  function overrideFor(entries, file) {
    for (const entry of entries) {
      if (entry === file + ':on') return true;
      if (entry === file + ':off') return false;
    }
    return null;
  }

  window.OrdoRollout = window.OrdoRollout || {};

  // One decision per file: { enabled, reason } with reason = 'open' (not
  // gated), 'host' (hard skip), 'override', 'no-member' or 'bucket'.
  function decide(file) {
    const perHost = GATES[file];
    if (!perHost) return { enabled: true, reason: 'open' };
    if (!Object.prototype.hasOwnProperty.call(perHost, HOST)) return { enabled: false, reason: 'host' };
    const percent = perHost[HOST];
    const memberId = memberIdFromStorage();
    const bucket = memberId ? bucketOf(memberId) : null;
    const entries = readOverride();
    const forced = overrideFor(entries, file);
    let enabled;
    let reason;
    if (forced !== null) {
      enabled = forced;
      reason = 'override';
    } else if (bucket === null) {
      enabled = false;
      reason = 'no-member';
    } else {
      enabled = bucket < percent;
      reason = 'bucket';
    }
    // On n'avertit que pour une entrée qui ne désigne aucun fichier gaté : une
    // entrée destinée à un AUTRE fichier est honorée à son tour, l'annoncer
    // ignorée ici ferait mentir la console.
    const orphans = entries.filter(function(e) {
      const name = e.split(':')[0];
      return !Object.prototype.hasOwnProperty.call(GATES, name);
    });
    if (orphans.length) console.warn('[OrdoAccount] Ignored ordo_rollout entries:', orphans.join(', '));
    const decision = { enabled, bucket, percent, reason };
    window.OrdoRollout[file] = decision;
    console.log('[OrdoAccount] Rollout ' + file + ': ' + (enabled ? 'on' : 'off') + ' (' + reason + ', bucket=' + bucket + ', percent=' + percent + ')');
    // 🔴 `siren_rollout` reste RÉSERVÉ à siren-finder.js. GA4 s'en sert comme
    // dénominateur du déploiement SIREN, témoins compris : le pousser aussi
    // pour un second fichier gaté doublerait ce compte à partir de la mise en
    // ligne, en silence et sans erreur nulle part. Tout autre fichier émet
    // `ordo_rollout`, qui porte les mêmes champs.
    if (window.dataLayer && typeof window.dataLayer.push === 'function') {
      try {
        window.dataLayer.push({ event: file === 'siren-finder.js' ? 'siren_rollout' : 'ordo_rollout', rollout_file: file, rollout_enabled: enabled, rollout_bucket: bucket, rollout_percent: percent, rollout_reason: reason });
      } catch (e) { /* no-op */ }
    }
    return decision;
  }

  // Scripts to load (in order)
  const scripts = [
    'styles.js',         // Must be first - hides empty Memberstack divs
    'core.js',           // Exposes window.OrdoAccount
    'siren-finder.js',   // SIREN/SIRET self-service (facturation électronique), replaces the free-text #SIRET input. Gated by GATES.
    'subscriptions.js',
    'session-stats-prefetch.js',
    'pause-state.js',
    'tab-hash.js',
    'status-selectors.js',
    'delete-account.js',
    'billing-portal.js',
    'invoice-emails.js', // Opt-in « recevoir mes factures par e-mail ». Gated by GATES.
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

    // One evaluation per file (decide() logs and publishes its decision).
    const loaded = [];
    const skippedHost = [];
    const skippedRollout = [];
    for (const f of scripts) {
      const d = decide(f);
      if (d.enabled) loaded.push(f);
      else if (d.reason === 'host') skippedHost.push(f);
      else skippedRollout.push(f);
    }
    if (skippedHost.length) console.log('[OrdoAccount] Skipped on ' + HOST + ':', skippedHost.join(', '));
    if (skippedRollout.length) console.log('[OrdoAccount] Not in rollout:', skippedRollout.join(', '));

    const orderedJS = [
      `${SHARED_BASE}/memberstack-utils.js`,
      `${SHARED_BASE}/error-reporter.js`,
      INTL_TEL_INPUT_JS,
      ...loaded.map(f => `${BASE}/${f}`)
    ];

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
