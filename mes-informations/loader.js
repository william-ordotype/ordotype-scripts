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
 */
(function() {
  'use strict';

  var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations';
  var SHARED_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared';

  // Core scripts loaded on every page
  var scripts = [
    'styles.js',
    'core.js',
    'rpps.js',
    'memberstack-sync.js',
    'statut-selectors.js',
    'required-if-visible.js',
    'ga4-events.js'
  ];

  // Une feuille de style qui ne répond jamais ne doit pas retenir la page.
  var CSS_TIMEOUT_MS = 8000;

  // Délai réservé aux dépendances TIERCES, et volontairement large : sur une
  // connexion bridée un fichier légitime peut mettre dix secondes, donc un
  // délai serré punirait un visiteur lent plutôt qu'un visiteur bloqué. Rien
  // sur la page n'attend cette chaîne, donc être large ne coûte rien.
  var PHONE_DEPS_TIMEOUT_MS = 15000;

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

  /**
   * `timeoutMs` est optionnel et réservé à la chaîne tierce.
   *
   * 🔴 `onerror` seul ne borne RIEN : un filtrage réseau peut tenir la requête
   * ouverte sans jamais répondre NI échouer, ce qui ne déclenche aucun des deux
   * gestionnaires et laisse la promesse en suspens POUR TOUJOURS. Un try/catch
   * ne peut rien contre une promesse qui ne se dénoue jamais.
   *
   * Aucun délai sur les fichiers DU DÉPÔT, volontairement : rejeter un
   * chargement seulement lent casserait la page pour les visiteurs mêmes qu'on
   * cherche à protéger. C'est un arbitrage à prendre pour lui-même.
   */
  function loadScript(url, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var done = false;
      var timer = null;
      function finish(err) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (err) reject(err); else resolve();
      }
      if (timeoutMs) {
        timer = setTimeout(function() { finish(new Error('Timed out: ' + url)); }, timeoutMs);
      }
      var script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = url;
      script.onload = function() { finish(null); };
      script.onerror = function() { finish(new Error('Failed to load: ' + url)); };
      document.head.appendChild(script);
    });
  }

  // 🔴 A stylesheet must never reject and must never hang. Without `onerror`,
  // one that never arrives leaves this promise pending FOREVER, and everything
  // awaiting it is never loaded - no error, no trace, a silently inert page.
  // The deadline covers the other half: a filtering proxy can hold the request
  // open without ever answering or erroring, which fires neither handler.
  function loadCSS(url) {
    return new Promise(function(resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      }
      var timer = setTimeout(function() {
        console.warn('[OrdoMesInfos] Stylesheet timed out: ' + url);
        finish();
      }, CSS_TIMEOUT_MS);
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = finish;
      // Résolu, pas rejeté : une feuille de style est décorative. Mais tracé,
      // sinon l'absence serait parfaitement muette.
      link.onerror = function() {
        console.warn('[OrdoMesInfos] Stylesheet unavailable: ' + url);
        finish();
      };
      document.head.appendChild(link);
    });
  }

  /**
   * Le champ téléphone pend à un CDN tiers dont les défaillances sont mesurées,
   * pas hypothétiques. Ne rejette JAMAIS : un numéro non formaté ne doit pas
   * emporter la synchronisation Memberstack du profil ni le reste de la page.
   *
   * `phone-input.js` est chargé même quand ses dépendances ont manqué, parce
   * que c'est LUI qui sait le dire : l'écarter avec elles ferait de l'échec le
   * plus grave le plus silencieux. Après elles et non avec elles, parce qu'il
   * abandonne au bout de dix secondes s'il ne voit pas la bibliothèque : les
   * lancer ensemble transformerait une connexion lente en faux signalement.
   */
  async function loadPhoneInput() {
    try {
      await Promise.all(dependencies.map(function(dep) {
        return dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url, PHONE_DEPS_TIMEOUT_MS);
      }));
    } catch (err) {
      console.error('[OrdoMesInfos] Phone dependencies unavailable:', err);
    }
    try {
      await loadScript(BASE + '/phone-input.js');
    } catch (err) {
      console.error('[OrdoMesInfos] Phone input unavailable:', err);
    }
  }

  async function loadAll() {
    console.log('[OrdoMesInfos] Loading...');

    try {
      // Load shared utilities first
      await loadScript(SHARED_BASE + '/memberstack-utils.js');
      await loadScript(SHARED_BASE + '/error-reporter.js');
      // Crisp est une commodité de support : son échec ne doit pas emporter la
      // synchronisation du profil. Il était le seul `await` nu de la chaîne.
      try {
        await loadScript(SHARED_BASE + '/crisp-loader.js');
      } catch (err) {
        console.error('[OrdoMesInfos] Crisp unavailable:', err);
      }

      // 🔴 Lancé, PAS attendu. Rien sur cette page ne dépend du champ
      // téléphone, alors que memberstack-sync.js décide de ce qui est
      // enregistré. L'attendre derrière un CDN tiers, c'est accepter de
      // retarder le profil du temps que met ce tiers à ne pas répondre.
      // `.catch` malgré `loadPhoneInput` qui ne rejette pas : une promesse
      // lancée sans être attendue tout de suite produit un REJET NON GÉRÉ si
      // elle rejette un jour.
      var phone = loadPhoneInput().catch(function(err) {
        console.error('[OrdoMesInfos] Phone input unavailable:', err);
      });

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

      await phone;
      console.log('[OrdoMesInfos] All scripts loaded');
    } catch (err) {
      console.error('[OrdoMesInfos] Load error:', err);
    }
  }

  loadAll();
})();
