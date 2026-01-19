/**
 * Ordotype Conseils Patients - Tracking
 * Handles DataLayer tracking for custom recommendation clicks.
 * Depends on: jQuery
 */
(function() {
  'use strict';

  // Opens modal with ordonnance personalized information if in iframe
  $("#txt-editor-redirect").on("click", function(ev) {
    ev.preventDefault();

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'event': 'CustomRecommandationClick',
      'eventCategory': 'Button Click',
      'eventAction': 'Click',
      'eventLabel': 'Custom Recommandation Click',
      'eventValue': ''
    });

    console.log('[Tracking] CustomRecommandationClick event pushed');
  });

  console.log('[Tracking] Initialized');
})();
