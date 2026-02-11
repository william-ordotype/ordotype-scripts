/**
 * Ordotype - Error Reporter (Shared)
 * Reports frontend errors to Discord via the existing notify-webhook proxy.
 * Fire-and-forget: never blocks or throws.
 *
 * Exposes: window.OrdoErrorReporter
 *
 * Usage:
 *   OrdoErrorReporter.report('StripeCheckout', 'Checkout session creation failed');
 *   OrdoErrorReporter.report('StripeSetup', err);
 */
(function() {
    'use strict';

    var WEBHOOK_URL = 'https://ordotype-stripe-double-checkout.netlify.app/.netlify/functions/notify-webhook';

    window.OrdoErrorReporter = {
        report: function(context, error) {
            try {
                var ms = window.OrdoMemberstack || {};
                var payload = {
                    type: 'frontend-error',
                    context: context,
                    error: String(error),
                    page: window.location.href,
                    memberId: ms.memberId || 'unknown',
                    stripeCustomerId: ms.stripeCustomerId || 'unknown',
                    email: ms.email || 'unknown',
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                };
                fetch(WEBHOOK_URL, {
                    method: 'POST',
                    keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(function() {});
            } catch (e) {
                // Never throw from the error reporter itself
            }
        }
    };
})();
