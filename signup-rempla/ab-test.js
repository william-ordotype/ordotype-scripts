/**
 * A/B Test Redirect for Signup Rempla 6 Months
 * Redirects 10% of users (variant B) to the new signup page
 * Must be loaded in header (blocking) to prevent flash
 */
(function() {
    const PREFIX = '[ABTestRempla]';
    const AB_TEST_KEY = "AB_test_variant";
    const ORIGINAL_URL = "/membership/signup-rempla-6months";
    const REDIRECT_URL = "/membership/signup-rempla-6months-new-v2";

    // Only run on the specified signup page
    if (window.location.pathname !== ORIGINAL_URL) {
        return;
    }

    console.log(PREFIX, 'Running on signup-rempla-6months page');

    // Attempt to read an existing A/B variant
    let variant = localStorage.getItem(AB_TEST_KEY);

    // If no variant yet, pick A or B at random and store it
    if (!variant) {
        variant = Math.random() < 0.9 ? "A" : "B";
        localStorage.setItem(AB_TEST_KEY, variant);
        console.log(PREFIX, 'Assigned new variant:', variant);
    } else {
        console.log(PREFIX, 'Existing variant:', variant);
    }

    // If the user is in variant "B", redirect to the new signup-v2 URL
    if (variant === "B") {
        console.log(PREFIX, 'Redirecting to:', REDIRECT_URL);
        window.location.href = REDIRECT_URL;
    }
})();
