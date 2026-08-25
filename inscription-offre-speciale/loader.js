/**
 * Ordotype Inscription Offre Speciale - Loader
 * Loads countdown and stripe-checkout with config from Webflow CMS.
 * Hides the Memberstack checkout button for cached Stripe customers until
 * shared/stripe-checkout.js takes over the buttons.
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

    const BTN_NO_STRIPE_ID = 'signup-rempla-from-decouverte';
    const BTN_STRIPE_ID = 'signup-rempla-stripe-customer';
    const CHECKOUT_SCRIPT = 'shared/stripe-checkout.js';
    const CHECKOUT_TAKEOVER_TIMEOUT_MS = 10000;

    // Scripts to load in order
    const scripts = [
        'shared/memberstack-utils.js',
        'shared/error-reporter.js',
        'inscription-offre-speciale/not-connected-handler.js',
        'shared/opacity-reveal.js',
        'inscription-offre-speciale/countdown.js',
        CHECKOUT_SCRIPT
    ];

    function hasCachedStripeCustomer() {
        const ms = window.OrdoMemberstack;
        if (ms) return !!ms.stripeCustomerId;
        try {
            const member = JSON.parse(localStorage.getItem('_ms-mem'));
            return !!(member && member.stripeCustomerId);
        } catch (e) {
            return false;
        }
    }

    // script.async = false → browser fetches in parallel but executes in
    // insertion order.
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.crossOrigin = 'anonymous';
            script.async = false;
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function init() {
        const cmsConfig = window.CMS_CHECKOUT_CONFIG || {};

        const hiddenMsBtn = hasCachedStripeCustomer() ? document.getElementById(BTN_NO_STRIPE_ID) : null;
        if (hiddenMsBtn) hiddenMsBtn.style.display = 'none';

        const checkoutTookOver = () => typeof window.initStripeCheckout === 'function';
        let restored = false;
        const restoreMsBtn = (reason) => {
            if (restored || !hiddenMsBtn || checkoutTookOver()) return;
            restored = true;
            hiddenMsBtn.style.display = '';
            console.warn(PREFIX, 'Memberstack button restored:', reason);
            if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('OffreSpecialeLoader', 'Memberstack button restored: ' + reason);
        };
        if (hiddenMsBtn) setTimeout(() => restoreMsBtn('timeout'), CHECKOUT_TAKEOVER_TIMEOUT_MS);

        try {
            // Helper to replace ${window.location.origin} placeholder with actual origin
            const resolveUrl = (url) => {
                if (!url) return url;
                return url.replace(/\$\{window\.location\.origin\}/g, window.location.origin);
            };

            // Use CMS config, with defaults
            window.STRIPE_CHECKOUT_CONFIG = {
                btnNoStripeId: BTN_NO_STRIPE_ID,
                btnStripeId: BTN_STRIPE_ID,
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
                option: window.STRIPE_CHECKOUT_CONFIG.option,
                hasStripeCustomer: !!hiddenMsBtn
            });
        } catch (err) {
            console.error(PREFIX, 'Config error:', err);
            restoreMsBtn('config error');
            return;
        }

        const loads = scripts.map((file) => loadScript(`${BASE}/${file}`));
        loads[scripts.indexOf(CHECKOUT_SCRIPT)].then(
            () => restoreMsBtn('stripe-checkout.js did not execute'),
            (err) => restoreMsBtn(err.message)
        );

        try {
            await Promise.all(loads);
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
