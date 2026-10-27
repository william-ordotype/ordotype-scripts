/**
 * Ordotype Pricing - Core
 * Stores current URL for tracking.
 */
(function() {
  'use strict';

  // Offer pages. Same list in the footer of /membership/successful-login.
  var OFFER_PATH = /^\/(nos-offres|abonnement\/|inscription\/)/;

  // This page becomes the post-login return (locat). Keep the page it replaces,
  // so that /membership/successful-login sends a member who already subscribes
  // back there (usually the fiche they were reading) instead of to the prices.
  try {
    var previous = localStorage.getItem('locat');
    if (previous && !OFFER_PATH.test(new URL(previous, location.origin).pathname)) {
      localStorage.setItem('locatBeforeOffers', previous);
    }
  } catch (e) {}

  // Store current URL for tracking
  try {
    localStorage.setItem('locat', location.href);
  } catch (e) {}

  console.log('[OrdoPricing] Core loaded');
})();
