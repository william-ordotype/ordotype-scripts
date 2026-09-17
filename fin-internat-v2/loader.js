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

    // Scripts load from the same version as this loader: pinning its URL to a commit
    // (…/ordotype-scripts@<sha>/fin-internat-v2/loader.js) pins every script it loads.
    var DEFAULT_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    function getBase() {
        var src = document.currentScript && document.currentScript.src;
        var match = src && src.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/william-ordotype\/ordotype-scripts@[^\/]+)\/fin-internat-v2\/loader\.js/);
        return match ? match[1] : DEFAULT_BASE;
    }

    var BASE = getBase();

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

    // script.async = false → browser fetches in parallel but executes in
    // insertion order. Preserves the dependency chain (memberstack-utils →
    // core → stripe-checkout) without serializing downloads.
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.crossOrigin = 'anonymous';
            script.src = url;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function loadAll() {
        console.log(PREFIX, 'Loading...');

        const orderedJS = [
            `${BASE}/shared/memberstack-utils.js`,
            `${BASE}/shared/error-reporter.js`,
            ...scripts.map(f => `${BASE}/${f}`)
        ];

        try {
            await Promise.all(orderedJS.map(loadScript));
            console.log(PREFIX, 'All scripts loaded');
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    loadAll();
})();
