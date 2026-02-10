/**
 * Ordotype Inscription Offre Speciale - Loader
 * Loads countdown and stripe-checkout with config from Webflow CMS.
 *
 * Usage in Webflow:
 *
 * <script>
 * // Countdown config
 * window.COUNTDOWN_CONFIG = {
 *     slug: "{{wf slug}}",
 *     expiresAutomatically: {{wf offre-qui-expire-automatiquement}}
 * };
 *
 * // Checkout config from CMS fields
 * window.CMS_CHECKOUT_CONFIG = {
 *     priceId: "{{wf stripepriceid}}",
 *     couponId: "{{wf code-promo}}",
 *     successUrl: window.location.origin + "/membership/mes-informations",
 *     cancelUrl: window.location.origin + "/inscription-offre-speciale/{{wf slug}}",
 *     paymentMethods: "{{wf payment-method-types}}".split(','),
 *     option: 'offre-speciale'
 * };
 *
 * // Store in localStorage for new user redirect flow
 * localStorage.setItem('signup-type-de-compte', "{{wf type-de-compte}}");
 * localStorage.setItem('signup-comment', "{{wf commentaire}}");
 * localStorage.setItem('signup-partnership-city', "{{wf partnership-city}}");
 * localStorage.setItem('signup-price-id', "{{wf stripepriceid}}");
 * localStorage.setItem('signup-coupon-id', "{{wf code-promo}}");
 * localStorage.setItem('signup-cancel-url', window.location.origin + "/inscription-offre-speciale/{{wf slug}}");
 * localStorage.setItem('signup-success-url', window.location.origin + "/membership/mes-informations");
 * localStorage.setItem('signup-payment-methods', "{{wf payment-method-types}}");
 * </script>
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-offre-speciale/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoOffreSpeciale]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Scripts to load in order
    const scripts = [
        'inscription-offre-speciale/not-connected-handler.js',
        'shared/opacity-reveal.js',
        'inscription-offre-speciale/countdown.js',
        'shared/stripe-checkout.js'
    ];

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function init() {
        const cmsConfig = window.CMS_CHECKOUT_CONFIG || {};

        // Helper to replace ${window.location.origin} placeholder with actual origin
        const resolveUrl = (url) => {
            if (!url) return url;
            return url.replace(/\$\{window\.location\.origin\}/g, window.location.origin);
        };

        // Use CMS config, with defaults
        window.STRIPE_CHECKOUT_CONFIG = {
            priceId: cmsConfig.priceId || '',
            couponId: cmsConfig.couponId || '',
            successUrl: resolveUrl(cmsConfig.successUrl) || `${window.location.origin}/membership/mes-informations`,
            cancelUrl: resolveUrl(cmsConfig.cancelUrl) || window.location.href,
            paymentMethods: cmsConfig.paymentMethods || ['card', 'sepa_debit'],
            option: cmsConfig.option || 'offre-speciale'
        };

        console.log(PREFIX, 'Config:', {
            priceId: window.STRIPE_CHECKOUT_CONFIG.priceId,
            hasCoupon: !!window.STRIPE_CHECKOUT_CONFIG.couponId,
            option: window.STRIPE_CHECKOUT_CONFIG.option
        });

        // Load scripts in order
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

    // Wait for DOMContentLoaded to ensure CMS script has run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
