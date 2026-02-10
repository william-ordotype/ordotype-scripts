/**
 * Ordotype Account - Core
 * Exposes window.OrdoAccount globally for account page scripts.
 * Delegates to shared/memberstack-utils.js for member data parsing.
 *
 * Requires: shared/memberstack-utils.js
 * Must load before: billing-portal.js, subscriptions.js, etc.
 */
(function() {
  'use strict';

  // Helper to safely access localStorage (may fail in private browsing)
  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('[OrdoAccount] localStorage not available:', e.message);
    }
  }

  // Store current URL for tracking
  safeSetItem('locat', location.href);

  // Use shared memberstack utility
  var ms = window.OrdoMemberstack || {};
  var memberData = ms.member || {};

  // Configuration
  var config = {
    baseUrl: window.location.hostname === "ordotype.webflow.io"
      ? "https://ordotype.webflow.io"
      : "https://www.ordotype.fr",
    isLoggedIn: Boolean(memberData.id)
  };

  // Expose globally for other scripts
  window.OrdoAccount = {
    member: memberData,
    config: config,

    // Helper to check if member has a specific plan
    hasPlan: function(planId) {
      return ms.hasPlan ? ms.hasPlan(planId) : false;
    },

    // Helper to get plan connection
    getPlan: function(planId) {
      return ms.getPlan ? ms.getPlan(planId) : null;
    }
  };

  console.log('[OrdoAccount] Core loaded', config.isLoggedIn ? '(logged in)' : '(not logged in)');
})();
