/**
 * Ordotype Inscription Offre Speciale - Loader
 * Loads countdown and stripe-checkout with config from Webflow CMS.
 * Holds clicks on the Memberstack checkout button for cached Stripe customers
 * until shared/stripe-checkout.js takes over the buttons.
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
    const HELD_CLICK_TIMEOUT_MS = 4000;
    const WAIT_LABEL = 'Patientez…';

    // Offre réservée aux désabonnés récents (champ CMS « Réservé aux désabonnés ? »).
    // Le gate remplace countdown.js et stripe-checkout.js : il vérifie l'éligibilité
    // côté serveur, puis charge lui-même le countdown avec la vraie date limite.
    const IS_WINBACK = window.WINBACK_GATE === true;

    // Scripts to load in order
    const scripts = IS_WINBACK ? [
        'shared/memberstack-utils.js',
        'shared/error-reporter.js',
        'inscription-offre-speciale/winback-gate.js'
    ] : [
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

    // OrdoErrorReporter (Discord + Sentry) when loaded, otherwise the auth-bundle
    // global handler, which is the only channel available before it loads
    function report(err) {
        try {
            if (window.OrdoErrorReporter) {
                window.OrdoErrorReporter.report('OffreSpecialeLoader', err);
                return;
            }
            window.dispatchEvent(new ErrorEvent('error', { message: err.message, error: err }));
        } catch (e) {
            // never throw from the reporting path
        }
    }

    // Deepest single-child descendant, when it holds only text
    function labelElement(btn) {
        let node = btn;
        while (node.children && node.children.length === 1) node = node.children[0];
        return (node.children && node.children.length === 0) ? node : null;
    }

    function holdMemberstackCheckout() {
        const btn = document.getElementById(BTN_NO_STRIPE_ID);
        if (!btn) return function() {};

        const tookOver = () => typeof window.initStripeCheckout === 'function';
        const label = labelElement(btn);
        let originalLabel = null;
        let done = false;

        function onClick(e) {
            if (done || tookOver()) return;
            const el = e.target;
            if (!el || typeof el.closest !== 'function' || !el.closest('#' + BTN_NO_STRIPE_ID)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (label && originalLabel === null) {
                originalLabel = label.textContent;
                label.textContent = WAIT_LABEL;
            }
            if (!window.ORDO_PENDING_CHECKOUT_CLICK) {
                window.ORDO_PENDING_CHECKOUT_CLICK = true;
                setTimeout(() => release('OffreSpecialeHeldClickTimeout', `held click not resumed within ${HELD_CLICK_TIMEOUT_MS}ms`), HELD_CLICK_TIMEOUT_MS);
            }
            console.log(PREFIX, 'Checkout click held until stripe-checkout.js takes over');
        }

        document.addEventListener('click', onClick, true);

        const release = (errorName, reason) => {
            if (done) return;
            done = true;
            document.removeEventListener('click', onClick, true);
            if (tookOver()) return;
            if (label && originalLabel !== null) label.textContent = originalLabel;
            const held = !!window.ORDO_PENDING_CHECKOUT_CLICK;
            const message = `Memberstack checkout released: ${reason}${held ? ' (held click carried through)' : ''}`;
            console.warn(PREFIX, message);
            const err = new Error(message);
            err.name = errorName;
            report(err);
            if (held) {
                window.ORDO_PENDING_CHECKOUT_CLICK = false;
                btn.click();
            }
        };

        setTimeout(() => release('OffreSpecialeCheckoutTimeout', `stripe-checkout.js did not take over within ${CHECKOUT_TAKEOVER_TIMEOUT_MS}ms`), CHECKOUT_TAKEOVER_TIMEOUT_MS);
        return release;
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
        const hasStripeCustomer = hasCachedStripeCustomer();
        // En mode winback c'est le gate qui pilote les deux boutons : pas de hold,
        // dont la libération finirait par cliquer le bouton Memberstack natif.
        const release = (hasStripeCustomer && !IS_WINBACK) ? holdMemberstackCheckout() : function() {};

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
                hasStripeCustomer
            });
        } catch (err) {
            console.error(PREFIX, 'Config error:', err);
            release('OffreSpecialeConfigError', err.message);
            return;
        }

        const loads = scripts.map((file) => loadScript(`${BASE}/${file}`));
        const checkoutIndex = scripts.indexOf(CHECKOUT_SCRIPT);
        if (checkoutIndex !== -1) {
            loads[checkoutIndex].then(
                () => release('OffreSpecialeCheckoutNotExecuted', 'stripe-checkout.js loaded but did not execute'),
                (err) => release('OffreSpecialeCheckoutLoadFailed', err.message)
            );
        }

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
