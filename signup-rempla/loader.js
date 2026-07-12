/**
 * Ordotype Signup Rempla - Loader
 * Loads all signup rempla page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla/loader.js"></script>
 *
 * Note: ab-test.js, geo-redirect.js, and styles.js must be loaded
 * separately in the header (before page renders) for redirects and styles to work
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoSignupRempla]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Set config for V1: SEPA only
    window.STRIPE_CHECKOUT_CONFIG = {
        priceId: 'price_1REohrKEPftl7d7iemVKnl9Y',
        couponId: 'IJqN4FxB',
        paymentMethods: ['sepa_debit'],
        option: 'rempla'
    };

    const scripts = [
        'signup-rempla/core.js',
        'shared/stripe-checkout.js'
    ];

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
        const orderedJS = [
            `${BASE}/shared/memberstack-utils.js`,
            `${BASE}/shared/error-reporter.js`,
            ...scripts.map(f => `${BASE}/${f}`)
        ];

        try {
            await Promise.all(orderedJS.map(loadScript));
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    loadAll();
})();
