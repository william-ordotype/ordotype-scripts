/**
 * Moyen de Paiement - A/B Test
 * 10% of users redirected to /membership/ajouter-un-moyen-de-paiement-cb
 *
 * Must be loaded in header (blocking) for redirect to work before page renders.
 *
 * Usage in Webflow header:
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/ab-test.js"></script>
 */
(function() {
    const AB_TEST_KEY = "AB_test_variant";
    const ORIGINAL_URL = "/membership/moyen-de-paiement";
    const REDIRECT_URL = "/membership/ajouter-un-moyen-de-paiement-cb";

    // Only run on the specified page
    if (window.location.pathname !== ORIGINAL_URL) {
        return;
    }

    // Otherwise, attempt to read an existing A/B variant
    let variant = localStorage.getItem(AB_TEST_KEY);

    // If no variant yet, pick A or B at random and store it
    if (!variant) {
        variant = Math.random() < 0.9 ? "A" : "B";
        localStorage.setItem(AB_TEST_KEY, variant);
    }

    // If the user is in variant "B", redirect to the new URL
    if (variant === "B") {
        window.location.href = REDIRECT_URL;
    }
})();
