/**
 * Shared Stripe Checkout Script
 *
 * Requires: shared/memberstack-utils.js, shared/error-reporter.js
 *
 * Configure via window.STRIPE_CHECKOUT_CONFIG before loading:
 *
 * <script>
 * window.STRIPE_CHECKOUT_CONFIG = {
 *   // Button IDs
 *   btnNoStripeId: 'signup-rempla-from-decouverte',
 *   btnStripeId: 'signup-rempla-stripe-customer',
 *
 *   // Checkout config
 *   priceId: 'price_xxx',
 *   couponId: 'xxx',
 *   successUrl: '/membership/success',
 *   cancelUrl: window.location.href,  // optional, defaults to current page
 *   paymentMethods: ['card', 'sepa_debit'],  // or just ['sepa_debit']
 *   option: 'rempla'  // for GTM tracking
 * };
 * </script>
 */
async function initStripeCheckout() {
    const PREFIX = '[StripeCheckout]';
    const config = window.STRIPE_CHECKOUT_CONFIG || {};

    // Helper to replace ${window.location.origin} placeholder with actual origin
    const resolveUrl = (url) => {
        if (!url) return url;
        return url.replace(/\$\{window\.location\.origin\}/g, window.location.origin);
    };

    console.log(PREFIX, 'Initializing...', config.option || 'default');

    // Button IDs with defaults
    const btnNoStripeId = config.btnNoStripeId || 'signup-rempla-from-decouverte';
    const btnStripeId = config.btnStripeId || 'signup-rempla-stripe-customer';

    const signupBtnNoStripe = document.getElementById(btnNoStripeId);
    const signupBtnStripe = document.getElementById(btnStripeId);

    // Memberstack data (from shared utility)
    const ms = window.OrdoMemberstack || {};
    const stripeCustomerId = ms.stripeCustomerId;
    const memberstackUserId = ms.memberId;
    const memberstackEmail = ms.email;

    if (!stripeCustomerId) {
        console.log(PREFIX, 'No Stripe customer – showing non-Stripe flow');
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        return;
    }

    console.log(PREFIX, 'Stripe customer found');
    if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'none';
    if (signupBtnStripe) signupBtnStripe.style.display = 'flex';

    // Configuration with defaults
    const priceId = config.priceId || 'price_1REohrKEPftl7d7iemVKnl9Y';
    const couponId = config.couponId || 'IJqN4FxB';
    const successUrl = resolveUrl(config.successUrl) || `${window.location.origin}/membership/mes-informations-praticien`;
    const cancelUrl = resolveUrl(config.cancelUrl) || window.location.href;
    const paymentMethods = config.paymentMethods || ['sepa_debit'];
    const option = config.option || 'default';

    const fnUrl = 'https://ordotype-stripe-checkout-sessions.netlify.app/.netlify/functions/create-checkout-session';

    // Retry fetch on network errors (TypeError) — transient mobile failures
    function fetchWithRetry(url, options, retries, delay) {
        return fetch(url, options).catch(function(err) {
            if (retries > 0 && err instanceof TypeError) {
                console.log(PREFIX, 'Network error, retrying... (' + retries + ' left)');
                return new Promise(function(resolve) {
                    setTimeout(resolve, delay || 1000);
                }).then(function() {
                    return fetchWithRetry(url, options, retries - 1, delay);
                });
            }
            throw err;
        });
    }

    // Fetch sessionId + URL
    let sessionId, checkoutUrl;
    try {
        const payload = {
            stripeCustomerId,
            cancelUrl,
            successUrl,
            payment_method_types: paymentMethods,
            priceId,
            couponId
        };

        const resp = await fetchWithRetry(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 2, 1000);

        const data = await resp.json();

        if (!data.sessionId || !data.url) {
            console.error(PREFIX, 'Invalid response');
            if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout', 'Invalid checkout session response');
            // Show fallback button so user can still proceed via Memberstack
            if (signupBtnStripe) signupBtnStripe.style.display = 'none';
            if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
            return;
        }
        sessionId = data.sessionId;
        checkoutUrl = data.url;
        console.log(PREFIX, 'Checkout session ready');

    } catch (err) {
        console.error(PREFIX, 'Error creating checkout session:', err);
        if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout', err);
        // Show fallback button so user can still proceed via Memberstack
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        return;
    }

    // Helper to send abandon-cart payload via proxy
    // Uses sendBeacon to survive page navigation (no CORS preflight with text/plain)
    function notifyAbandonCart(payload) {
        var url = 'https://ordotype-stripe-double-checkout.netlify.app/.netlify/functions/notify-webhook';
        var data = JSON.stringify({ type: 'abandon-cart', ...payload });
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }));
        } else {
            fetch(url, { method: 'POST', keepalive: true, body: data }).catch(() => {});
        }
    }

    // Double-click prevention
    let isRedirecting = false;

    signupBtnStripe.addEventListener('click', e => {
        e.preventDefault();

        if (isRedirecting) return;
        isRedirecting = true;
        signupBtnStripe.innerText = 'Patientez…';
        signupBtnStripe.disabled = true;

        const timestamp = new Date().toISOString();
        const originPage = window.location.href;

        // Build abandon-cart payload
        const abandonPayload = {
            timestamp,
            checkoutSessionId: sessionId,
            url: checkoutUrl,
            stripeCustomerId,
            memberstackUserId,
            memberstackEmail,
            option,
            priceId,
            couponId,
            successUrl,
            cancelUrl,
            originPage,
            paymentMethods
        };

        notifyAbandonCart(abandonPayload);

        // Push GTM event
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: 'stripe_signup_click',
            option,
            checkoutSessionId: sessionId
        });

        // Redirect to Stripe Checkout
        window.location.href = checkoutUrl;
    });
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStripeCheckout);
} else {
    initStripeCheckout();
}
