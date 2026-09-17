/**
 * Ordotype Mes Informations - Loader
 * Loads all mes-informations scripts in the correct order.
 * Reads window.MES_INFOS_CONFIG (set inline per Webflow page) for conditional loading.
 *
 * Usage in Webflow:
 * <script>
 * window.MES_INFOS_CONFIG = { rppsText: 'Pas de RPPS', showStatutSelectors: true, ... };
 * </script>
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/loader.js"></script>
 *
 * Scripts are loaded from the same version as this loader: pinning its URL to a commit
 * (…/ordotype-scripts@<sha>/mes-informations/loader.js) pins every script it loads.
 */
(function() {
  'use strict';

  var DEFAULT_ROOT = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

  function getRoot() {
    var src = document.currentScript && document.currentScript.src;
    var match = src && src.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/william-ordotype\/ordotype-scripts@[^\/]+)\/mes-informations\/loader\.js/);
    return match ? match[1] : DEFAULT_ROOT;
  }

  var ROOT = getRoot();
  var BASE = ROOT + '/mes-informations';
  var SHARED_BASE = ROOT + '/shared';

  // Core scripts loaded on every page
  var scripts = [
    'styles.js',
    'core.js',
    'rpps.js',
    'memberstack-sync.js',
    'statut-selectors.js',
    'required-if-visible.js',
    'phone-input.js',
    'ga4-events.js'
  ];

  // External dependencies for phone input
  var dependencies = [
    {
      type: 'css',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css'
    },
    {
      type: 'js',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js'
    }
  ];

  // Members linked to a country page are redirected to /mes-informations/{slug}.
  var COUNTRY_PAGE_BY_PLAN = {
    'pln_praticien-belgique-gratuit--eif0fox': 'assistant-belgique',
    'pln_module-m-decine-g-n-rale-mves--ayrm059e': 'mves-luxembourg'
  };
  var COUNTRY_PAGE_BY_STATUT = {
    'Assistant': 'assistant-belgique',
    'MEVS': 'mves-luxembourg',
    'Médecin assistant': 'medecin-assistant-suisse'
  };
  var INTERNE_PLAN_IDS = [
    'pln_compte-interne-sy4j0oft',
    'pln_compte-interne-img-nl410oxc',
    'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95',
    'pln_compte-interne-derni-re-ann-e-9f4o0oyy'
  ];
  var INTERNE_PAGE_BY_COUNTRY = {
    'Belgium': 'assistant-belgique',
    'Belgique': 'assistant-belgique',
    'Luxembourg': 'mves-luxembourg',
    'Switzerland': 'medecin-assistant-suisse',
    'Suisse': 'medecin-assistant-suisse'
  };
  var LIVE_PLAN_STATUSES = ['ACTIVE', 'TRIALING', 'REQUIRES_PAYMENT'];
  var MEMBER_TIMEOUT_MS = 3000;

  function countryPageFor(member) {
    if (!member) return null;
    var fields = member.customFields || {};
    var plans = (member.planConnections || []).filter(function(plan) {
      return plan && LIVE_PLAN_STATUSES.indexOf(plan.status) !== -1;
    });
    for (var i = 0; i < plans.length; i++) {
      if (COUNTRY_PAGE_BY_PLAN[plans[i].planId]) return COUNTRY_PAGE_BY_PLAN[plans[i].planId];
    }
    var statut = String(fields.statut || '').trim();
    if (COUNTRY_PAGE_BY_STATUT[statut]) return COUNTRY_PAGE_BY_STATUT[statut];
    var isInterne = plans.some(function(plan) { return INTERNE_PLAN_IDS.indexOf(plan.planId) !== -1; });
    return (isInterne && INTERNE_PAGE_BY_COUNTRY[String(fields.country || '').trim()]) || null;
  }

  // Pages that are never redirected.
  function redirectTarget(member, config) {
    if (config.enableCheckout || config.setJustPaidTs || config.enablePartnershipCity) return null;
    var slug = countryPageFor(member);
    return slug ? '/mes-informations/' + slug + window.location.search + window.location.hash : null;
  }

  // Without an answer from the SDK, the page loads as usual.
  function currentMember() {
    var sdk = window.$memberstackDom;
    if (!sdk || typeof sdk.getCurrentMember !== 'function') return Promise.resolve(null);
    return Promise.race([
      Promise.resolve()
        .then(function() { return sdk.getCurrentMember(); })
        .then(function(result) { return result && result.data ? result.data : null; }, function() { return null; }),
      new Promise(function(resolve) { setTimeout(function() { resolve(null); }, MEMBER_TIMEOUT_MS); })
    ]);
  }

  function loadScript(url) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = url;
      script.onload = resolve;
      script.onerror = function() { reject(new Error('Failed to load: ' + url)); };
      document.head.appendChild(script);
    });
  }

  function loadCSS(url) {
    return new Promise(function(resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  async function loadAll() {
    var target = null;
    try {
      target = redirectTarget(await currentMember(), window.MES_INFOS_CONFIG || {});
    } catch (err) {
      target = null;
    }
    if (target) {
      console.log('[OrdoMesInfos] Country page:', target);
      window.location.replace(target);
      return;
    }

    console.log('[OrdoMesInfos] Loading...');

    try {
      // Load shared utilities first
      await loadScript(SHARED_BASE + '/memberstack-utils.js');
      await loadScript(SHARED_BASE + '/error-reporter.js');
      await loadScript(SHARED_BASE + '/crisp-loader.js');

      // Load external dependencies (CSS + intl-tel-input)
      await Promise.all(dependencies.map(function(dep) {
        return dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url);
      }));

      // Load core scripts sequentially
      for (var i = 0; i < scripts.length; i++) {
        await loadScript(BASE + '/' + scripts[i]);
      }

      // Conditionally load page-specific scripts
      var config = window.MES_INFOS_CONFIG || {};

      if (config.enableCheckout) {
        await loadScript(BASE + '/checkout.js');
      }

      if (config.enablePartnershipCity) {
        await loadScript(BASE + '/partnership-city.js');
      }

      console.log('[OrdoMesInfos] All scripts loaded');
    } catch (err) {
      console.error('[OrdoMesInfos] Load error:', err);
    }
  }

  loadAll();
})();
