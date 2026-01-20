/**
 * Ordotype Inscription Offre Speciale - Loader
 * Loads stripe-checkout with config from CMS fields stored in localStorage
 *
 * IMPORTANT: Place this script AFTER the CMS script that stores values in localStorage
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-offre-speciale/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoOffreSpeciale]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    function init() {
        // Read config from localStorage (set by CMS script)
        window.STRIPE_CHECKOUT_CONFIG = {
            priceId: localStorage.getItem('signup-price-id') || '',
            couponId: localStorage.getItem('signup-coupon-id') || '',
            successUrl: localStorage.getItem('signup-success-url') || `${window.location.origin}/membership/mes-informations`,
            cancelUrl: localStorage.getItem('signup-cancel-url') || window.location.href,
            paymentMethods: ['card', 'sepa_debit'],
            option: 'offre-speciale'
        };

        console.log(PREFIX, 'Config from CMS:', {
            priceId: window.STRIPE_CHECKOUT_CONFIG.priceId,
            couponId: window.STRIPE_CHECKOUT_CONFIG.couponId ? '***' : '',
            option: window.STRIPE_CHECKOUT_CONFIG.option
        });

        loadScript(`${BASE}/shared/stripe-checkout.js`).catch(err => {
            console.error(PREFIX, 'Load error:', err);
        });
    }

    // Wait for DOMContentLoaded to ensure CMS script has run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
