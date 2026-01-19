/**
 * Ordotype Pricing - A/B Test
 * Redirects 10% of users to /nos-offres-v2 variant.
 * Only runs on /nos-offres page.
 */
(function() {
  'use strict';

  var AB_TEST_KEY = "AB_test_variant";
  var ORIGINAL_URL = "/nos-offres";
  var REDIRECT_URL = "/nos-offres-v2";

  // Only run on the specified signup page
  if (window.location.pathname !== ORIGINAL_URL) {
    return;
  }

  // Attempt to read an existing A/B variant
  var variant = localStorage.getItem(AB_TEST_KEY);

  // If no variant yet, pick A or B at random and store it
  if (!variant) {
    variant = Math.random() < 0.9 ? "A" : "B";
    localStorage.setItem(AB_TEST_KEY, variant);
  }

  // If the user is in variant "B", redirect to the new signup-v2 URL
  if (variant === "B") {
    console.log('[ABTest] Redirecting to variant B');
    window.location.href = REDIRECT_URL;
  } else {
    console.log('[ABTest] User is in variant A');
  }
})();
