/**
 * Shared Stripe Setup Session Script
 * Handles Stripe setup session for adding payment methods.
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

        // Memberstack data
        const memData = JSON.parse(localStorage.getItem('_ms-mem') || '{}');

        const fnUrl = 'https://ordotype-stripe-setup-session.netlify.app/.netlify/functions/create-checkout';
        const hookUrl = 'https://hook.eu1.make.com/4zw66riuwuci4vpxf2td1f5vc3s4z7mk';

        // Configuration with defaults
        const successUrl = config.successUrl || `${window.location.origin}/membership/moyen-de-paiement-ajoute`;
        const cancelUrl = config.cancelUrl || window.location.href;
        const paymentMethods = config.paymentMethods || ['sepa_debit'];
        const option = config.option || 'setup';

        let checkoutUrl = null;
        let sessionId = null;

        function extractSessionIdFromUrl(url) {
            const m = url.match(/\/c\/pay\/([^?#]+)/);
            if (m?.[1]) {
                console.log(PREFIX, 'extracted sessionId from URL:', m[1]);
                return m[1];
            }
            console.warn(PREFIX, 'could not extract sessionId from URL');
            return null;
        }

        // 1) Toggle button visibility
        if (memData.stripeCustomerId) {
            console.log(PREFIX, 'stripeCustomerId found:', memData.stripeCustomerId);
            if (btnNo) btnNo.style.display = 'none';
            if (btnYes) btnYes.style.display = 'inline-flex';
        } else {
            console.log(PREFIX, 'no stripeCustomerId');
            if (btnYes) btnYes.style.display = 'none';
            if (btnNo) btnNo.style.display = 'inline-flex';
            return; // nothing more to do
        }

        // 2) Prefetch a Setup Session for faster checkout
        fetch(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stripeCustomerId: memData.stripeCustomerId,
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
            console.log(PREFIX, 'prefetch data:', data);
            if (data.url) {
                checkoutUrl = data.url;
                sessionId = data.id || extractSessionIdFromUrl(data.url);
                console.log(PREFIX, 'Stored checkoutUrl:', checkoutUrl);
                console.log(PREFIX, 'Stored sessionId:', sessionId);
                if (btnYes && btnYes.tagName === 'A') btnYes.href = checkoutUrl;
            } else {
                console.error(PREFIX, 'prefetch did not return url:', data);
            }
        })
        .catch(err => {
            console.error(PREFIX, 'prefetch error:', err);
        });

        // 3) On click: send payload, then redirect
        if (btnYes) {
            btnYes.addEventListener('click', async e => {
                console.log(PREFIX, 'Button clicked');
                e.preventDefault();
                btnYes.innerText = 'Patientez…';
                btnYes.disabled = true;

                // fallback fetch if prefetch failed
                if (!checkoutUrl || !sessionId) {
                    console.log(PREFIX, 'Missing prefetch data, doing fallback fetch');
                    try {
                        const resp = await fetch(fnUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                stripeCustomerId: memData.stripeCustomerId,
                                cancelUrl: cancelUrl,
                                successUrl: successUrl,
                                payment_method_types: paymentMethods
                            })
                        });
                        const data = await resp.json();
                        console.log(PREFIX, 'fallback data:', data);
                        checkoutUrl = data.url;
                        sessionId = data.id || extractSessionIdFromUrl(data.url);
                        console.log(PREFIX, 'fallback stored checkoutUrl:', checkoutUrl);
                        console.log(PREFIX, 'fallback stored sessionId:', sessionId);
                    } catch (err) {
                        console.error(PREFIX, 'fallback error:', err);
                    }
                }

                // prepare payload
                const payload = {
                    checkoutSessionId: sessionId,
                    stripeCustomerId: memData.stripeCustomerId,
                    memberstackUserId: memData.id,
                    memberstackEmail: memData.auth?.email || memData.email,
                    option: option,
                    paymentMethods,
                    originPage: window.location.href
                };
                console.log(PREFIX, 'Sending payload to Make:', payload);

                // fire-and-forget POST
                fetch(hookUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                .then(() => console.log(PREFIX, 'webhook fetch(no-cors) sent'))
                .catch(err => console.error(PREFIX, 'webhook fetch error:', err));

                // Set justPaidTs for grace period (prevents redirect loop after payment)
                localStorage.setItem('justPaidTs', Date.now());
                console.log(PREFIX, 'Set justPaidTs for grace period');

                // redirect to Stripe
                console.log(PREFIX, 'Redirecting to Stripe Checkout:', checkoutUrl);
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
