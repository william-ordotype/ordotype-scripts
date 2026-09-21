/**
 * Ordotype Fin Internat - A/B Test
 * Redirects 10% of users to /membership/fin-internat-v2 (B variant)
 *
 * IMPORTANT: Load this script in the header (before page renders)
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/ab-test.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[ABTestFinInternat]';
    const AB_TEST_KEY = 'AB_test_variant';
    const ORIGINAL_URL = '/membership/fin-internat';
    const REDIRECT_URL = '/membership/fin-internat-v2';

    // The browser keeps showing this page until the next one arrives. Hide it
    // meanwhile, and show it again if the navigation never happens or the
    // page is restored from the back/forward cache.
    function hideWhileLeaving() {
        const root = document.documentElement;
        root.style.setProperty('opacity', '0', 'important');
        function show() {
            root.style.removeProperty('opacity');
        }
        setTimeout(show, 5000);
        window.addEventListener('pageshow', function(event) {
            if (event.persisted) show();
        });
    }

    // Only run on the specified page
    if (window.location.pathname !== ORIGINAL_URL) {
        return;
    }

    // Attempt to read an existing A/B variant
    let variant = localStorage.getItem(AB_TEST_KEY);

    // If no variant yet, pick A or B at random (90% A, 10% B)
    if (!variant) {
        variant = Math.random() < 0.9 ? 'A' : 'B';
        localStorage.setItem(AB_TEST_KEY, variant);
        console.log(PREFIX, 'Assigned variant:', variant);
    } else {
        console.log(PREFIX, 'Existing variant:', variant);
    }

    // If the user is in variant "B", redirect to the V2 URL
    if (variant === 'B') {
        console.log(PREFIX, 'Redirecting to B variant');
        hideWhileLeaving();
        window.location.href = REDIRECT_URL;
    }
})();
