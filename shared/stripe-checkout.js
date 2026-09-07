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

    // La mesure ne doit jamais casser la page. Le push du clic se trouve juste
    // avant la redirection vers Stripe : une erreur dedans empêcherait le
    // paiement. C'est exactement ce qui a tué le bouton de la page comeback
    // pendant dix semaines. Tout push passe par ici.
    const track = (payload) => {
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(payload);
        } catch (e) {}
    };

    // GA4: the checkout session could not be created, so the user never reaches
    // Stripe. Pairs with stripe_signup_click, which only fires once a session
    // exists — without this event a broken checkout leaves no trace in analytics.
    const checkoutFailureReason = (err) => {
        const msg = (err && err.message) || '';
        const status = /Session API error:?\s*\(?(\d{3})/.exec(msg);
        if (status) return 'api_' + status[1];
        if (/Invalid (session payload|checkout session response)/.test(msg)) return 'invalid_payload';
        // Only a genuine fetch failure. A TypeError raised while reading a
        // property off a malformed response is a server problem, not a
        // connectivity one, and must not be filed as 'network'.
        if (err && err.name === 'TypeError' && /fetch|network|load failed|connection/i.test(msg)) {
            return 'network';
        }
        return 'other';
    };

    // Same signature in every emitter, so the block can be copied between files
    // without silently changing what lands in `failure_reason`. `option`
    // defaults to the same value stripe_signup_click reports, so the failure
    // and the click land on the same GA4 dimension value.
    const trackCheckoutFailure = (reason, option) => {
        track({
            event: 'checkout_failed',
            checkout_source: config.checkoutSource || 'shared',
            failure_reason: reason,
            option: option || config.option || 'default'
        });
    };

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

    // A loader may have held a click on the fallback button while this script loaded
    function resumeHeldClick(btn) {
        if (!window.ORDO_PENDING_CHECKOUT_CLICK || !btn) return;
        window.ORDO_PENDING_CHECKOUT_CLICK = false;
        console.log(PREFIX, 'Resuming held checkout click');
        btn.click();
    }

    // Memberstack data (from shared utility)
    const ms = window.OrdoMemberstack || {};
    const stripeCustomerId = ms.stripeCustomerId;
    const memberstackUserId = ms.memberId;
    const memberstackEmail = ms.email;

    if (!stripeCustomerId) {
        console.log(PREFIX, 'No Stripe customer – showing non-Stripe flow');
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        resumeHeldClick(signupBtnNoStripe);
        return;
    }

    console.log(PREFIX, 'Stripe customer found');
    if (!signupBtnStripe) {
        console.warn(PREFIX, 'Stripe button not found, skipping checkout session');
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        resumeHeldClick(signupBtnNoStripe);
        return;
    }
    if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'none';
    signupBtnStripe.style.display = 'flex';

    // Configuration with defaults
    const priceId = config.priceId || 'price_1REohrKEPftl7d7iemVKnl9Y';
    const couponId = config.couponId || 'IJqN4FxB';
    const successUrl = resolveUrl(config.successUrl) || `${window.location.origin}/membership/mes-informations-praticien`;
    const cancelUrl = resolveUrl(config.cancelUrl) || window.location.href;
    const paymentMethods = config.paymentMethods || ['sepa_debit'];
    const option = config.option || 'default';

    const fnUrl = 'https://checkout.ordotype.fr/.netlify/functions/create-checkout-session';

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

        // fetchWithRetry only retries network errors, so a 4xx/5xx arrives here
        // as a readable Response whose JSON error body parses fine. Without this
        // check an HTTP failure was reported as `invalid_payload`, hiding the
        // status code that says which side broke.
        if (!resp.ok) throw new Error('Session API error: ' + resp.status);

        const data = await resp.json();

        if (!data || !data.sessionId || !data.url) {
            console.error(PREFIX, 'Invalid response');
            if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout', 'Invalid checkout session response');
            // Restore the Memberstack fallback first: the user must never wait
            // on a tag callback, and dataLayer.push runs GTM's callbacks
            // synchronously.
            if (signupBtnStripe) signupBtnStripe.style.display = 'none';
            if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
            resumeHeldClick(signupBtnNoStripe);
            trackCheckoutFailure('invalid_payload');
            return;
        }
        sessionId = data.sessionId;
        checkoutUrl = data.url;
        console.log(PREFIX, 'Checkout session ready');

    } catch (err) {
        console.error(PREFIX, 'Error creating checkout session:', err);
        if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout', err);
        // Restore the Memberstack fallback first: the user must never wait on a
        // tag callback, and dataLayer.push runs GTM's callbacks synchronously.
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        resumeHeldClick(signupBtnNoStripe);
        trackCheckoutFailure(checkoutFailureReason(err));
        return;
    }

    // Helper to send abandon-cart payload via proxy
    // Uses sendBeacon to survive page navigation (no CORS preflight with text/plain)
    function notifyAbandonCart(payload) {
        var url = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';
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
        track({
            event: 'stripe_signup_click',
            option,
            checkoutSessionId: sessionId
        });

        // Redirect to Stripe Checkout
        window.location.href = checkoutUrl;
    });

    resumeHeldClick(signupBtnStripe);
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStripeCheckout);
} else {
    initStripeCheckout();
}
