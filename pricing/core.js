/**
 * Ordotype Pricing - Core
 * Stores current URL for tracking.
 */
(function() {
  'use strict';

  // Store current URL for tracking
  localStorage.setItem('locat', location.href);

  console.log('[OrdoPricing] Core loaded');
})();
