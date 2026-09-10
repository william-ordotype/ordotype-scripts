/**
 * Ordotype Mes Informations CMS - Loader
 * Loads scripts for /mes-informations/{{slug}} CMS pages.
 *
 * Requires in Webflow before this script:
 * - window.OrdoMesInfosCMS = { rppsEquivalentName: '{{CMS field}}' }
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations-cms/loader.js"></script>
 */
(function() {
  'use strict';

  var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations-cms';
  var CRISP_URL = 'https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js';

  // Une feuille de style qui ne répond jamais ne doit pas retenir la page.
  var CSS_TIMEOUT_MS = 8000;

  // Délai réservé aux dépendances TIERCES, et volontairement large : sur une
  // connexion bridée un fichier légitime peut mettre dix secondes, donc un
  // délai serré punirait un visiteur lent plutôt qu'un visiteur bloqué. Rien
  // sur la page n'attend cette chaîne, donc être large ne coûte rien.
  var PHONE_DEPS_TIMEOUT_MS = 15000;

  // 🔴 Sans lui, le signalement de `phone-input.js` retombe sur un
  // `console.warn` que personne ne lit : ce chargeur était le seul des quatre
  // à ne pas le charger, donc le seul dont les pannes restaient invisibles.
  var REPORTER_URL = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/error-reporter.js';

  // External dependencies for phone input.
  //
  // 🔴 `utils.js` n'est PAS ici. Ce chargeur était le seul à le précharger,
  // et il annulait le différé de `phone-input.js` : le fichier étant déjà là,
  // `loadUtils()` court-circuitait, mais les 247 Ko avaient été payés. C'est
  // au script du champ de décider quand les chercher, à un endroit et un seul.
  var phoneDeps = [
    { type: 'css', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css' },
    { type: 'js', url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js' }
  ];

  // Scripts to load (in order)
  var scripts = [
    'statut-options.js',
    'statut-selectors.js',
    'rpps-handler.js',
    'memberstack-sync.js',
    'required-if-visible.js',
    'location-store.js'
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
   * cherche à protéger.
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
        console.warn('[OrdoMesInfosCMS] Stylesheet timed out: ' + url);
        finish();
      }, CSS_TIMEOUT_MS);
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = finish;
      // Résolu, pas rejeté : une feuille de style est décorative. Mais tracé,
      // sinon l'absence serait parfaitement muette.
      link.onerror = function() {
        console.warn('[OrdoMesInfosCMS] Stylesheet unavailable: ' + url);
        finish();
      };
      document.head.appendChild(link);
    });
  }

  /**
   * Ne rejette JAMAIS : un numéro non formaté ne doit pas emporter Crisp, la
   * synchronisation Memberstack et le reste de la page.
   *
   * `phone-input.js` est chargé même quand ses dépendances ont manqué, parce
   * que c'est LUI qui sait le dire. Après elles et non avec elles, parce qu'il
   * abandonne au bout de dix secondes s'il ne voit pas la bibliothèque.
   */
  async function loadPhoneInput() {
    try {
      await Promise.all(phoneDeps.map(function(dep) {
        return dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url, PHONE_DEPS_TIMEOUT_MS);
      }));
    } catch (err) {
      console.error('[OrdoMesInfosCMS] Phone dependencies unavailable:', err);
    }
    try {
      await loadScript('https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/phone-input.js');
    } catch (err) {
      console.error('[OrdoMesInfosCMS] Phone input unavailable:', err);
    }
  }

  async function loadAll() {
    console.log('[OrdoMesInfosCMS] Loading...');

    try {
      // Load phone input dependencies
      // Le canal de signalement d'abord : sans lui, tout ce qui suit échoue
      // en silence. Il vient d'un autre dépôt que le reste, donc son propre
      // filet.
      try {
        await loadScript(REPORTER_URL);
      } catch (err) {
        console.error('[OrdoMesInfosCMS] Error reporter unavailable:', err);
      }

      // 🔴 Lancé, PAS attendu. Rien sur cette page ne dépend du champ
      // téléphone, alors que memberstack-sync.js et location-store.js
      // décident de ce qui est enregistré.
      // `.catch` malgré `loadPhoneInput` qui ne rejette pas : une promesse
      // lancée sans être attendue tout de suite produit un REJET NON GÉRÉ si
      // elle rejette un jour.
      var phone = loadPhoneInput().catch(function(err) {
        console.error('[OrdoMesInfosCMS] Phone input unavailable:', err);
      });

      // Crisp vient d'un AUTRE dépôt, servi @main : son échec ne doit pas plus
      // emporter la page que celui d'un CDN tiers. Il était pourtant le seul
      // await nu entre les deux blocs protégés.
      try {
        await loadScript(CRISP_URL);
      } catch (err) {
        console.error('[OrdoMesInfosCMS] Crisp unavailable:', err);
      }

      // Load core scripts sequentially
      for (var i = 0; i < scripts.length; i++) {
        await loadScript(BASE + '/' + scripts[i]);
      }

      await phone;
      console.log('[OrdoMesInfosCMS] All scripts loaded');
    } catch (err) {
      console.error('[OrdoMesInfosCMS] Load error:', err);
    }
  }

  loadAll();
})();
