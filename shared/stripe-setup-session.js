/**
 * Shared Stripe Setup Session Script
 * Handles Stripe setup session for adding payment methods.
 *
 * Requires: shared/memberstack-utils.js, shared/error-reporter.js
 *
 * Configure via window.STRIPE_SETUP_CONFIG before loading:
 *
 * <script>
 * window.STRIPE_SETUP_CONFIG = {
 *   // Button IDs (optional, these are the defaults)
 *   btnNoStripeId: 'setupBtnNoStripeId',
 *   btnStripeId: 'setupBtnStripeId',
 *
 *   // Setup config
 *   successUrl: '/membership/moyen-de-paiement-ajoute',
 *   cancelUrl: window.location.href,  // optional, defaults to current page
 *   paymentMethods: ['sepa_debit'],   // or ['card'] or ['card', 'sepa_debit']
 *   option: 'setup'                   // for webhook tracking
 * };
 * </script>
 */
(function() {
    'use strict';

    const PREFIX = '[StripeSetup]';

    function init() {
        const config = window.STRIPE_SETUP_CONFIG || {};

        console.log(PREFIX, 'Initializing...', config.option || 'default');

        // Button IDs with defaults
        const btnNoStripeId = config.btnNoStripeId || 'setupBtnNoStripeId';
        const btnStripeId = config.btnStripeId || 'setupBtnStripeId';

        const btnNo = document.getElementById(btnNoStripeId);
        const btnYes = document.getElementById(btnStripeId);

        // Memberstack data (from shared utility)
        const ms = window.OrdoMemberstack || {};

        const fnUrl = 'https://ordotype-stripe-setup-session.netlify.app/.netlify/functions/create-checkout';
        const hookUrl = 'https://ordotype-stripe-setup-session.netlify.app/.netlify/functions/notify-webhook';

        // Configuration with defaults
        const successUrl = config.successUrl || `${window.location.origin}/membership/moyen-de-paiement-ajoute`;
        const cancelUrl = config.cancelUrl || window.location.href;
        const paymentMethods = config.paymentMethods || ['sepa_debit'];
        const option = config.option || 'setup';

        let checkoutUrl = null;
        let sessionId = null;
        let isPrefetching = false;

        function extractSessionIdFromUrl(url) {
            const m = url.match(/\/c\/pay\/([^?#]+)/);
            if (m && m[1]) {
                console.log(PREFIX, 'sessionId extracted');
                return m[1];
            }
            console.warn(PREFIX, 'could not extract sessionId from URL');
            return null;
        }

        // 1) Toggle button visibility
        if (ms.stripeCustomerId) {
            console.log(PREFIX, 'stripeCustomerId found');
            if (btnNo) btnNo.style.display = 'none';
            if (btnYes) btnYes.style.display = 'inline-flex';
        } else {
            console.log(PREFIX, 'no stripeCustomerId');
            if (btnYes) btnYes.style.display = 'none';
            if (btnNo) btnNo.style.display = 'inline-flex';
            return; // nothing more to do
        }

        // 2) Prefetch a Setup Session for faster checkout
        isPrefetching = true;
        fetch(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stripeCustomerId: ms.stripeCustomerId,
                cancelUrl: cancelUrl,
                successUrl: successUrl,
                payment_method_types: paymentMethods
            })
        })
        .then(r => {
            console.log(PREFIX, 'prefetch HTTP status:', r.status);
            return r.json();
        })
        .then(data => {
            if (data.url) {
                checkoutUrl = data.url;
                sessionId = data.id || extractSessionIdFromUrl(data.url);
                console.log(PREFIX, 'Setup session prefetched');
                if (btnYes && btnYes.tagName === 'A') btnYes.href = checkoutUrl;
            } else {
                console.error(PREFIX, 'prefetch did not return url');
                if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeSetup', 'Prefetch returned no URL');
            }
        })
        .catch(err => {
            console.error(PREFIX, 'prefetch error:', err);
            if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeSetup', err);
        })
        .finally(() => {
            isPrefetching = false;
        });

        // 3) On click: send payload, then redirect
        if (btnYes) {
            btnYes.addEventListener('click', async e => {
                console.log(PREFIX, 'Button clicked');
                e.preventDefault();
                btnYes.innerText = 'Patientez…';
                btnYes.disabled = true;

                // If prefetch is still in-flight, wait for it briefly
                if (isPrefetching) {
                    console.log(PREFIX, 'Waiting for prefetch to complete...');
                    await new Promise(resolve => {
                        const check = setInterval(() => {
                            if (!isPrefetching) { clearInterval(check); resolve(); }
                        }, 100);
                        // Timeout after 5 seconds
                        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
                    });
                }

                // Fallback fetch if prefetch failed
                if (!checkoutUrl || !sessionId) {
                    console.log(PREFIX, 'Missing prefetch data, doing fallback fetch');
                    try {
                        const resp = await fetch(fnUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                stripeCustomerId: ms.stripeCustomerId,
                                cancelUrl: cancelUrl,
                                successUrl: successUrl,
                                payment_method_types: paymentMethods
                            })
                        });
                        const data = await resp.json();
                        checkoutUrl = data.url;
                        sessionId = data.id || extractSessionIdFromUrl(data.url);
                        console.log(PREFIX, 'Fallback session ready');
                    } catch (err) {
                        console.error(PREFIX, 'fallback error:', err);
                        if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeSetup', err);
                        btnYes.innerText = 'Réessayer';
                        btnYes.disabled = false;
                        return;
                    }
                }

                // Prepare payload
                const payload = {
                    type: 'setup-tracking',
                    checkoutSessionId: sessionId,
                    stripeCustomerId: ms.stripeCustomerId,
                    memberstackUserId: ms.memberId,
                    memberstackEmail: ms.email,
                    option: option,
                    paymentMethods,
                    originPage: window.location.href
                };
                console.log(PREFIX, 'Sending tracking webhook');

                // Fire-and-forget POST via proxy
                // Uses sendBeacon to survive page navigation
                var webhookData = JSON.stringify(payload);
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(hookUrl, new Blob([webhookData], { type: 'text/plain' }));
                    console.log(PREFIX, 'webhook sent (beacon)');
                } else {
                    fetch(hookUrl, { method: 'POST', keepalive: true, body: webhookData })
                    .then(() => console.log(PREFIX, 'webhook sent'))
                    .catch(err => console.error(PREFIX, 'webhook fetch error:', err));
                }

                // Set justPaidTs for grace period (prevents redirect loop after payment)
                localStorage.setItem('justPaidTs', Date.now());
                console.log(PREFIX, 'Set justPaidTs for grace period');

                // Redirect to Stripe
                console.log(PREFIX, 'Redirecting to Stripe Checkout');
                window.location.href = checkoutUrl;
            });
        }
    }

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
