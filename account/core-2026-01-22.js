/**
 * Ordotype Account - Core
 * Parses Memberstack data once and exposes it globally.
 * Must load first - other scripts depend on window.OrdoAccount.
 */
(function() {
  'use strict';

  // Helper to safely access localStorage (may fail in private browsing)
  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('[OrdoAccount] localStorage not available:', e.message);
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('[OrdoAccount] localStorage not available:', e.message);
    }
  }

  // Store current URL for tracking
  safeSetItem('locat', location.href);

  // Parse member data once
  const memberData = JSON.parse(safeGetItem('_ms-mem') || '{}');

  // Configuration
  const config = {
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
      if (!memberData.planConnections) return false;
      return memberData.planConnections.some(c => c.planId === planId);
    },
    
    // Helper to get plan connection
    getPlan: function(planId) {
      if (!memberData.planConnections) return null;
      return memberData.planConnections.find(c => c.planId === planId);
    }
  };

  console.log('[OrdoAccount] Core loaded', config.isLoggedIn ? '(logged in)' : '(not logged in)');
})();
