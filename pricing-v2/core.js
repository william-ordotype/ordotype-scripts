/**
 * Ordotype Pricing V2 - Core
 * Stores current URL for tracking.
 */
(function() {
  'use strict';

  // Store current URL for tracking
  localStorage.setItem('locat', location.href);

  console.log('[OrdoPricingV2] Core loaded');
})();
