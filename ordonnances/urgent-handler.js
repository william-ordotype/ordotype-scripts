/**
 * Ordotype Ordonnances - Urgent Handler
 * Handles urgent prescriptions, stomach-empty/le-matin combinations,
 * and cleans up empty containers.
 * Vanilla DOM — must not depend on jQuery: this runs on every ordonnance
 * pageview and has to survive Webflow's jQuery CDN being blocked.
 */
(function() {
  'use strict';

  // jQuery's :visible definition, without jQuery.
  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function init() {
    var urgentEl = document.getElementById('urgent-value');
    var urgentValue = urgentEl ? urgentEl.getAttribute('data-urgent') : null;

    // Hide elements for urgent prescriptions
    if (urgentValue == 'Oui') {
      qsa('.stomach-empty, .le-matin').forEach(function(el) {
        el.style.display = 'none';
      });
    }

    // Combine stomach-empty and le-matin if both visible
    if (qsa('.le-matin').some(isVisible) && qsa('.stomach-empty').some(isVisible)) {
      qsa('.stomach-empty-le-matin').forEach(function(el) {
        el.style.display = 'block';
      });
      qsa('.le-matin, .stomach-empty').forEach(function(el) {
        el.style.display = 'none';
      });
    }

    // Hide .tr-contain elements that have no children in .tr-list
    qsa('.tr-contain').forEach(function(container) {
      var childCount = qsa('.tr-list', container).reduce(function(n, list) {
        return n + list.children.length;
      }, 0);
      if (childCount <= 0) container.style.display = 'none';
    });

    // Remove .cms-section .w-dyn-bind-empty:only-child:empty elements
    qsa('.cms-section .w-dyn-bind-empty:only-child:empty').forEach(function(el) {
      var item = el.closest('.cms-item');
      if (item && item.parentNode) item.parentNode.removeChild(item);
    });

    var targetClasses = ['stomach-empty', 'urine-24h', 'le-matin', 'consignes-patient', 'selles'];

    // Remove hidden variants for ALL target classes BEFORE dedupe
    targetClasses.forEach(function(c) {
      qsa('.' + c + '.w-condition-invisible').forEach(function(el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    });

    // For each class, remove duplicates and keep only the first instance
    targetClasses.forEach(function(className) {
      var seenContent = new Set();
      qsa('.' + className).forEach(function(el) {
        var content = el.innerHTML.trim();
        if (seenContent.has(content)) {
          if (el.parentNode) el.parentNode.removeChild(el);
        } else {
          seenContent.add(content);
        }
      });
    });

    // Hide .cms-section if all .cms-item elements have no visible children
    qsa('.cms-section').forEach(function(section) {
      var items = qsa('.cms-item', section);
      var visibleCount = qsa('.stomach-empty-le-matin', section).filter(isVisible).length;
      var emptyItems = items.filter(function(item) {
        return Array.prototype.slice.call(item.children).filter(isVisible).length === 0;
      }).length;

      var shouldHide = emptyItems === items.length && visibleCount === 0;
      if (shouldHide) {
        section.style.display = 'none';
      } else if (section.style.display === 'none') {
        // Only clear an inline "none" — jQuery's .show() left any other
        // inline display (e.g. flex set by a Webflow interaction) untouched.
        section.style.display = '';
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
