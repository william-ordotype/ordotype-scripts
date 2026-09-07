/**
 * Ordotype Conseils Patients - Tracking
 * Handles DataLayer tracking for custom recommendation clicks.
 * Depends on: jQuery
 */
(function() {
  'use strict';

  // La mesure ne doit jamais casser la page. L'implémentation vit dans
  // shared/error-reporter.js ; ce repli couvre le cas où il n'est pas chargé.
  function track(payload) {
    try {
      if (window.OrdoErrorReporter && window.OrdoErrorReporter.track) {
        window.OrdoErrorReporter.track(payload);
        return;
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (err) {
      // Signaler même sans le reporter : une mesure qui échoue en silence
      // efface la preuve qu'il s'est passé quelque chose.
      try {
        if (window.OrdoErrorReporter && window.OrdoErrorReporter.reportSideEffect) {
          window.OrdoErrorReporter.reportSideEffect('ConseilsPatientsTracking', err);
          return;
        }
        var e = err instanceof Error ? err : new Error(String(err));
        window.dispatchEvent(new ErrorEvent('error', { message: 'ConseilsPatientsTracking: ' + e.message, error: e }));
      } catch (ignored) {}
    }
  }


  // Opens modal with ordonnance personalized information if in iframe
  $("#txt-editor-redirect").on("click", function(ev) {
    ev.preventDefault();

        track({
      'event': 'CustomRecommandationClick',
      'eventCategory': 'Button Click',
      'eventAction': 'Click',
      'eventLabel': 'Custom Recommandation Click',
      'eventValue': ''
    });

    // Ne pas affirmer que l'événement est parti : track() avale un échec de
    // push, et un log « pushed » ferait écarter le client au diagnostic.
    console.log('[Tracking] CustomRecommandationClick');
  });

  console.log('[Tracking] Initialized');
})();
