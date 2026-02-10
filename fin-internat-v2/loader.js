/**
 * Ordotype Fin Internat V2 - Loader
 * Loads all fin-internat-v2 page scripts in the correct order.
 * This is the B variant of the A/B test - includes Card + SEPA payment methods.
 *
 * Usage in Webflow:
 *
 * Header (for redirects - must run early):
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/geo-redirect.js"></script>
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/styles.js"></script>
 *
 * Footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoFinInternatV2]';

    // Base URL
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Scripts to load (in order)
    const scripts = [
        'fin-internat-v2/core.js',
        'shared/stripe-checkout.js'
    ];

    // Set configuration for shared stripe-checkout.js
    // V2 includes both SEPA and Card payment methods
    window.STRIPE_CHECKOUT_CONFIG = {
        // Button IDs
        btnNoStripeId: 'signup-rempla-from-decouverte',
        btnStripeId: 'signup-rempla-stripe-customer',

        // Checkout config
        priceId: 'price_1REohrKEPftl7d7iemVKnl9Y',
        couponId: 'IJqN4FxB',
        successUrl: `${window.location.origin}/membership/mes-informations-praticien`,
        cancelUrl: window.location.href,
        paymentMethods: ['sepa_debit', 'card'],
        option: 'fin-internat-v2'
    };

    // Load a single script
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    // Load all scripts in order
    async function loadAll() {
        console.log(PREFIX, 'Loading...');

        try {
            // Load shared utilities first
            await loadScript(`${BASE}/shared/memberstack-utils.js`);
            await loadScript(`${BASE}/shared/error-reporter.js`);

            for (const file of scripts) {
                await loadScript(`${BASE}/${file}`);
            }
            console.log(PREFIX, 'All scripts loaded');
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    loadAll();
})();
