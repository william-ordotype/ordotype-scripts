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
                // Fresh read from localStorage to avoid stale OrdoMemberstack snapshot
                // (Memberstack SDK may update _ms-mem after our initial parse)
                var member = {};
                try {
                    var raw = localStorage.getItem('_ms-mem');
                    if (raw) member = JSON.parse(raw) || {};
                } catch (e) { member = {}; }

                var payload = {
                    type: 'frontend-error',
                    context: context,
                    error: String(error),
                    page: window.location.href,
                    memberId: member.id || 'unknown',
                    stripeCustomerId: member.stripeCustomerId || 'unknown',
                    email: (member.auth && member.auth.email) || 'unknown',
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
