/**
 * Ordotype Homepage - Loader
 * Loads all homepage scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js"></script>
 */
(function() {
  'use strict';

  // Auto-detect loader's own commit/ref so sub-scripts load from the same
  // pinned version (sidesteps stale jsDelivr @main caches).
  function detectVersion() {
    const list = document.getElementsByTagName('script');
    for (let i = 0; i < list.length; i++) {
      const src = list[i].src || '';
      if (src.indexOf('/homepage/loader.js') === -1) continue;
      const m = src.match(/ordotype-scripts@([^\/]+)\//);
      if (m) return m[1];
    }
    return 'main';
  }
  const VERSION = detectVersion();
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/homepage';
  const MES_INFOS_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/mes-informations';
  const SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION + '/shared';

  // Scripts to load (in order)
  const scripts = [
    'core.js',
    'countdown.js',
    'member-redirects.js',
    'cgu-modal.js'
  ];

  // A stylesheet that never answers must not hold the page hostage.
  const CSS_TIMEOUT_MS = 8000;

  // Deadline for the third-party dependencies only, and deliberately generous:
  // on a throttled connection a legitimate file can take ten seconds, so a
  // tight deadline would punish a slow visitor rather than a blocked one.
  // Nothing on the page waits on this chain, so being generous costs nothing.
  const PHONE_DEPS_TIMEOUT_MS = 15000;

  // External dependencies for phone input
  const phoneDeps = [
    { type: 'css', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css' },
    { type: 'js', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js' }
  ];

  /**
   * Load a single script. `timeoutMs` is optional and reserved for the
   * third-party chain.
   *
   * 🔴 `onerror` alone does not bound this: a filtering proxy can hold the
   * request open without ever answering NOR erroring, which fires neither
   * handler and leaves the promise pending FOREVER. A `try/catch` is no help
   * against a promise that never settles.
   *
   * No deadline is applied to the repo's own files on purpose. Rejecting a
   * merely slow load would abort the chain for the very visitors this whole
   * effort is about, and that is a trade to make on its own terms, not as a
   * side effect of hardening the third-party path.
   */
  function loadScript(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      let timer = null;
      const finish = (err) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (err) reject(err); else resolve();
      };
      if (timeoutMs) {
        timer = setTimeout(() => finish(new Error(`Timed out: ${url}`)), timeoutMs);
      }
      const script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = url;
      script.onload = () => finish(null);
      script.onerror = () => finish(new Error(`Failed to load: ${url}`));
      document.head.appendChild(script);
    });
  }

  // 🔴 A stylesheet must never reject and must never hang. Without `onerror`,
  // one that never arrives leaves this promise pending FOREVER, and everything
  // awaiting it is never loaded - no error, no trace, a silently inert page.
  // The deadline covers the other half: a filtering proxy can hold the request
  // open without ever answering or erroring, which fires neither handler.
  function loadCSS(url) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        console.warn(`[OrdoHomepage] Stylesheet timed out: ${url}`);
        finish();
      }, CSS_TIMEOUT_MS);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = finish;
      // Résolu, pas rejeté : une feuille de style est décorative. Mais tracé,
      // sinon l'absence serait parfaitement muette et le sélecteur de pays
      // s'afficherait cassé sans que rien nulle part ne le dise.
      link.onerror = () => {
        console.warn(`[OrdoHomepage] Stylesheet unavailable: ${url}`);
        finish();
      };
      document.head.appendChild(link);
    });
  }

  /**
   * The phone field hangs off a third-party CDN whose failures are measured,
   * not hypothetical. Never rejects: an unformatted phone number must not take
   * down the banners and redirects this page also carries.
   *
   * `phone-input.js` is loaded even when its dependencies did not arrive,
   * because it is the one that knows how to say so. Skipping it would make the
   * worst failure the quietest one. It is loaded after them and not alongside,
   * because it gives up on a missing library after ten seconds: starting both
   * together would turn a slow connection into a false report.
   */
  async function loadPhoneInput() {
    try {
      await Promise.all(phoneDeps.map(dep =>
        dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url, PHONE_DEPS_TIMEOUT_MS)
      ));
    } catch (err) {
      console.error('[OrdoHomepage] Phone dependencies unavailable:', err);
    }
    try {
      await loadScript(`${MES_INFOS_BASE}/phone-input.js`);
    } catch (err) {
      console.error('[OrdoHomepage] Phone input unavailable:', err);
    }
  }

  // Load all scripts in order
  async function loadAll() {
    console.log('[OrdoHomepage] Loading...');

    try {
      // Load shared utilities first
      await loadScript(`${SHARED_BASE}/memberstack-utils.js`);
      await loadScript(`${SHARED_BASE}/error-reporter.js`);

      // 🔴 Lancé, PAS attendu. Rien sur cette page ne dépend du champ
      // téléphone, alors que les bandeaux et les redirections de
      // member-redirects.js, eux, décident de ce que le membre voit. Les
      // attendre derrière un CDN tiers, c'est accepter de retarder une
      // redirection du temps que met ce tiers à ne pas répondre.
      // `.catch` malgré `loadPhoneInput` qui ne rejette pas : une promesse
      // lancée sans être attendue tout de suite produit un REJET NON GÉRÉ si
      // elle rejette un jour. Ne pas dépendre d'une garantie interne pour une
      // panne dont le symptôme serait, une fois de plus, un silence.
      const phone = loadPhoneInput().catch((err) => {
        console.error('[OrdoHomepage] Phone input unavailable:', err);
      });

      for (const file of scripts) {
        await loadScript(`${BASE}/${file}`);
      }
      await phone;
      console.log('[OrdoHomepage] All scripts loaded');
    } catch (err) {
      console.error('[OrdoHomepage] Load error:', err);
    }
  }

  loadAll();
})();
