/**
 * Ordotype Inscription Offre Speciale - Loader
 * Loads stripe-checkout with config from window.CMS_CHECKOUT_CONFIG (set by Webflow)
 *
 * Usage in Webflow:
 *
 * <script>
 * // Set config from CMS fields (only Webflow can access these)
 * window.CMS_CHECKOUT_CONFIG = {
 *     priceId: "{{wf stripepriceid}}",
 *     couponId: "{{wf code-promo}}",
 *     successUrl: window.location.origin + "/membership/mes-informations",
 *     cancelUrl: window.location.href,
 *     paymentMethods: ['card', 'sepa_debit'],
 *     option: 'offre-speciale'
 * };
 *
 * // Also store in localStorage for new user redirect flow
 * localStorage.setItem('signup-price-id', "{{wf stripepriceid}}");
 * localStorage.setItem('signup-coupon-id', "{{wf code-promo}}");
 * localStorage.setItem('signup-success-url', window.location.origin + "/membership/mes-informations");
 * localStorage.setItem('signup-cancel-url', window.location.href);
 * </script>
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
        const cmsConfig = window.CMS_CHECKOUT_CONFIG || {};

        // Use CMS config, with defaults
        window.STRIPE_CHECKOUT_CONFIG = {
            priceId: cmsConfig.priceId || '',
            couponId: cmsConfig.couponId || '',
            successUrl: cmsConfig.successUrl || `${window.location.origin}/membership/mes-informations`,
            cancelUrl: cmsConfig.cancelUrl || window.location.href,
            paymentMethods: cmsConfig.paymentMethods || ['card', 'sepa_debit'],
            option: cmsConfig.option || 'offre-speciale'
        };

        console.log(PREFIX, 'Config:', {
            priceId: window.STRIPE_CHECKOUT_CONFIG.priceId,
            hasCooupon: !!window.STRIPE_CHECKOUT_CONFIG.couponId,
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
