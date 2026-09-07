/**
 * Ordotype Ordonnances - Duplicates Cleaner
 * Removes duplicate search items and handles custom prescription tracking.
 * Vanilla DOM — must not depend on jQuery: this runs on every ordonnance
 * pageview and has to survive Webflow's jQuery CDN being blocked.
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
            track(payload);
    } catch (err) {
      try {
        if (window.OrdoErrorReporter && window.OrdoErrorReporter.reportSideEffect) {
          window.OrdoErrorReporter.reportSideEffect('DuplicatesCleaner', err);
        }
      } catch (ignored) {}
    }
  }


  // Opens modal with ordonnance personalized information if in iframe
  function attachEditorTracking() {
    var editorBtn = document.getElementById('txt-editor-redirect');
    if (!editorBtn) return;
    editorBtn.addEventListener('click', function(ev) {
      ev.preventDefault();

            track({
        'event': 'CustomPrescriptionClick',
        'eventCategory': 'Button Click',
        'eventAction': 'Click',
        'eventLabel': 'Custom Prescription Click',
        'eventValue': ''
      });
    });
  }

  // Remove duplicate search items
  function removeDuplicates() {
    var seen = new Set();
    var items = document.querySelectorAll(".search-item");

    items.forEach(function(div) {
      var content = div.textContent.trim();
      if (seen.has(content)) {
        div.parentNode.removeChild(div);
      }
      seen.add(content);
    });

    if (items.length > 0) {
      console.log('[DuplicatesCleaner] Processed', items.length, 'search items');
    }
  }

  function init() {
    attachEditorTracking();
    removeDuplicates();
    console.log('[DuplicatesCleaner] Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
