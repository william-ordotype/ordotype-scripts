/**
 * Ordotype Homepage - CGU Modal
 * Handles CGU acceptance modal with 90-day expiration.
 * Depends on: Memberstack ($memberstackDom)
 */
(function() {
  'use strict';

  function init() {
    var memberstack = window.$memberstackDom;
    var modalEls = document.querySelectorAll('[ms-code-element-temporary]');
    var acceptBtn = document.querySelector('#cgu-accepted');

    // 90-day cutoff
    var cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    // Simple check if user is connected
    function isUserConnected() {
      return localStorage.getItem('_ms-mem') !== null;
    }

    // On load: check localStorage, fallback to member.json['cgu-accepted-date']
    function checkCGUAcceptedDate() {
      var acceptedDate = localStorage.getItem('cgu-accepted-date');

      if (!acceptedDate) {
        var memString = localStorage.getItem('_ms-mem');
        if (memString) {
          try {
            var member = JSON.parse(memString);
            acceptedDate = member.json?.['cgu-accepted-date'] || null;
          } catch (e) {
            console.warn("[CGUModal] Could not parse _ms-mem JSON:", e);
          }
        }
      }

      if (!acceptedDate || new Date(acceptedDate) < cutoffDate) {
        showModal();
      } else {
        hideModal();
      }
    }

    function showModal() {
      modalEls.forEach(function(el) {
        el.classList.add('show');
      });
    }

    function hideModal() {
      modalEls.forEach(function(el) {
        el.classList.remove('show');
      });
    }

    // On "Accept" click: hide modal, save to localStorage, update Memberstack if connected
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function() {
        hideModal();

        var nowISO = new Date().toISOString();
        // Always save to localStorage (works for both connected and anonymous users)
        localStorage.setItem('cgu-accepted-date', nowISO);

        // Only update Memberstack if user is connected
        if (isUserConnected() && memberstack) {
          memberstack.updateMemberJSON({
            json: { 'cgu-accepted-date': nowISO }
          })
          .then(function() {
            console.log("[CGUModal] Member JSON updated successfully");
          })
          .catch(function(err) {
            console.error("[CGUModal] Failed to update member JSON:", err);
          });
        } else {
          console.log("[CGUModal] User not connected - saved to localStorage only");
        }
      });
    }

    // Run initial check
    checkCGUAcceptedDate();

    console.log('[CGUModal] Initialized');
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
