/**
 * Ordotype Ordonnances - Urgent Handler
 * Handles urgent prescriptions, stomach-empty/le-matin combinations,
 * and cleans up empty containers.
 * Depends on: jQuery
 */
(function() {
  'use strict';

  function init() {
    var urgentValue = $('#urgent-value').data('urgent');

    // Hide elements for urgent prescriptions
    if (urgentValue == "Oui") {
      $('.stomach-empty, .le-matin').css('display', 'none');
    }

    // Combine stomach-empty and le-matin if both visible
    if ($('.le-matin:visible').length > 0 && $('.stomach-empty:visible').length > 0) {
      $('.stomach-empty-le-matin').css('display', 'block');
      $('.le-matin, .stomach-empty').css('display', 'none');
    }

    // Hide .tr-contain elements that have no children in .tr-list
    var emptyTrContainers = $(".tr-contain").filter(function() {
      return $(this).find(".tr-list").children().length <= 0;
    });
    emptyTrContainers.hide();

    // Remove .cms-section .w-dyn-bind-empty:only-child:empty elements
    $(".cms-section .w-dyn-bind-empty:only-child:empty").closest(".cms-item").remove();

    // Remove hidden variants for ALL target classes BEFORE dedupe
    ["stomach-empty", "urine-24h", "le-matin", "consignes-patient", "selles"].forEach(function(c) {
      $('.' + c + '.w-condition-invisible').remove();
    });

    // Define a dictionary to hold seen content for each class
    var seenContent = {
      "stomach-empty": new Set(),
      "urine-24h": new Set(),
      "le-matin": new Set(),
      "consignes-patient": new Set(),
      "selles": new Set()
    };

    // For each class, remove duplicates and keep only the first instance
    ["stomach-empty", "urine-24h", "le-matin", "consignes-patient", "selles"].forEach(function(className) {
      $('.' + className).each(function() {
        var content = $(this).html().trim();
        if (seenContent[className].has(content)) {
          $(this).remove();
        } else {
          seenContent[className].add(content);
        }
      });
    });

    // Hide .cms-section if all .cms-item elements have no visible children
    $('.cms-section').each(function() {
      var totalItems = $(this).find('.cms-item').length;
      var visibleCount = $(this).find('.stomach-empty-le-matin:visible').length;
      var emptyItems = $(this).find('.cms-item').filter(function() {
        return $(this).children(':visible').length === 0;
      }).length;

      var shouldHide = emptyItems === totalItems && visibleCount === 0;

      if (shouldHide) {
        $(this).hide();
      } else {
        $(this).show();
      }
    });

    console.log('[UrgentHandler] Initialized');
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
