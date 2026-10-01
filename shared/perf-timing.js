/**
 * Ordotype - Perf Timing (Shared)
 * Détaille le chargement d'une page d'ordonnance ou de conseil patient et
 * l'attache, sous forme de mesures, à la transaction « pageload » que Sentry
 * envoie déjà. Aucun événement supplémentaire n'est envoyé : seules les pages
 * déjà échantillonnées par le traçage portent ces mesures.
 *
 * Mesures (millisecondes depuis le début de la navigation, sauf indication) :
 *   ordo_embed              1 si la page est affichée dans le cadre d'une fiche, 0 sinon
 *   ordo_html_wait          attente du serveur pour le document (responseStart - requestStart)
 *   ordo_html_end           document entièrement reçu
 *   ordo_dom_interactive    HTML lu (scripts bloquants compris)
 *   ordo_blocking_end       arrivée du dernier fichier bloquant connu
 *   ordo_<fichier>_end      arrivée de chaque fichier bloquant connu
 *   ordo_<fichier>_dur      durée de son chargement (≈ 0 s'il vient du cache)
 *
 * Lues dans Sentry comme toute mesure : p50(measurements.ordo_html_wait), etc.
 *
 * La transaction active est lue par le point d'entrée global du SDK
 * (window.__SENTRY__), le SDK n'étant pas exposé sur window. Si sa forme change,
 * le script ne fait rien : il ne doit jamais casser la page.
 *
 * Usage dans Webflow (code de page du gabarit, pied de page) :
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@<commit>/shared/perf-timing.js"></script>
 */
(function() {
  'use strict';

  var BLOQUANTS = [
    ['css_webflow', /website-files\.com\/[^/]+\/css\/[^/]+\.css/],
    ['css_global', /\/shared\/global-styles\.css/],
    ['css_page', /\/(ordonnances|conseils-patients)\/styles\.css/],
    ['js_auth', /ordotype-auth-cdn@[^/]+\/auth-bundle\.js/],
    ['js_memberstack', /static\.memberstack\.com\/scripts\/v2\/memberstack\.js/]
  ];

  function transactionActive() {
    var sentry = window.__SENTRY__;
    var carrier = sentry && sentry[sentry.version];
    if (!carrier) return null;
    var scope = (carrier.stack && carrier.stack.getScope && carrier.stack.getScope()) || carrier.defaultCurrentScope;
    var span = scope && scope._sentrySpan;
    if (!span) return null;
    var racine = span._sentryRootSpan || span;
    if (typeof racine.addEvent !== 'function') return null;
    if (typeof racine.isRecording === 'function' && !racine.isRecording()) return null;
    return racine;
  }

  function dansLeCadre() {
    try {
      return window.self !== window.top ? 1 : 0;
    } catch (e) {
      return 1;
    }
  }

  function mesures() {
    var perf = window.performance;
    if (!perf || typeof perf.getEntriesByType !== 'function') return null;
    var nav = perf.getEntriesByType('navigation')[0];
    if (!nav) return null;
    var m = {
      ordo_embed: [dansLeCadre(), 'none'],
      ordo_html_wait: [nav.responseStart - nav.requestStart, 'millisecond'],
      ordo_html_end: [nav.responseEnd, 'millisecond'],
      ordo_dom_interactive: [nav.domInteractive, 'millisecond']
    };
    var ressources = perf.getEntriesByType('resource');
    var dernier = 0;
    BLOQUANTS.forEach(function(b) {
      for (var i = 0; i < ressources.length; i++) {
        if (!b[1].test(ressources[i].name)) continue;
        m['ordo_' + b[0] + '_end'] = [ressources[i].responseEnd, 'millisecond'];
        m['ordo_' + b[0] + '_dur'] = [ressources[i].duration, 'millisecond'];
        if (ressources[i].responseEnd > dernier) dernier = ressources[i].responseEnd;
        return;
      }
    });
    if (dernier > 0) m.ordo_blocking_end = [dernier, 'millisecond'];
    return m;
  }

  function enregistrer() {
    try {
      var span = transactionActive();
      if (!span) return;
      var m = mesures();
      if (!m) return;
      Object.keys(m).forEach(function(nom) {
        var valeur = m[nom][0];
        if (typeof valeur !== 'number' || !isFinite(valeur) || valeur < 0) return;
        var attributs = {};
        attributs['sentry.measurement_value'] = Math.round(valeur);
        attributs['sentry.measurement_unit'] = m[nom][1];
        span.addEvent(nom, attributs);
      });
    } catch (e) {
      // Une mesure ne doit jamais casser la page.
    }
  }

  // Les fichiers bloquants et le document sont terminés au DOMContentLoaded,
  // bien avant la fin de la transaction « pageload ».
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(enregistrer, 0); });
  } else {
    setTimeout(enregistrer, 0);
  }
})();
