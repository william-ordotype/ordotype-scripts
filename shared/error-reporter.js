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
 *
 *   // Un accessoire (mesure, webhook, stash) qui a échoué sans empêcher
 *   // l'utilisateur d'agir. Part vers Discord ET vers le handler global, donc
 *   // Sentry, parce qu'une panne muette efface son propre témoin.
 *   OrdoErrorReporter.reportSideEffect('AutoCheckout', err);
 *
 *   // Le seul point d'entrée du dataLayer. Ne jette jamais, signale l'échec.
 *   OrdoErrorReporter.track({ event: 'stripe_signup_click', option: 'rempla' });
 *
 * Version: 1.1.0 (2026-09-07)
 *   1.0.0 — report() vers le webhook Discord.
 *   1.1.0 — reportSideEffect() et track() partagés, pour que la règle « une
 *           mesure ne doit jamais casser la page » vive à un seul endroit au
 *           lieu d'être recopiée dans chaque script.
 */
(function() {
    'use strict';

    var WEBHOOK_URL = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';

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

                // Fallback id: _ms-mem can be empty while ms_member_id is still set
                // (e.g. mid-auth on /connexion-2fa, or session lost on the
                // post-checkout return) — recover the member id so alerts aren't "unknown".
                var fallbackMemberId = null;
                try { fallbackMemberId = localStorage.getItem('ms_member_id'); } catch (e) {}

                var errorStr;
                if (error instanceof Error) {
                    errorStr = error.message || String(error);
                } else if (typeof error === 'object' && error !== null) {
                    try { errorStr = JSON.stringify(error); } catch (e) { errorStr = String(error); }
                } else {
                    errorStr = String(error);
                }

                var payload = {
                    type: 'frontend-error',
                    context: context,
                    error: errorStr,
                    page: window.location.href,
                    memberId: member.id || fallbackMemberId || 'unknown',
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
                // Fallback: report to Sentry via internal API (works even when *.netlify.app is blocked)
                var carrier = window.__SENTRY__ && window.__SENTRY__[window.__SENTRY__.version];
                if (carrier && carrier.defaultCurrentScope) {
                    var client = carrier.defaultCurrentScope.getClient();
                    if (client && client.captureException) {
                        var err = error instanceof Error ? error : new Error(String(error));
                        client.captureException(err, {
                            captureContext: {
                                tags: { reporter: 'OrdoErrorReporter', context: context },
                                extra: payload
                            }
                        });
                    }
                }
            } catch (e) {
                // Never throw from the error reporter itself
            }
        },

        /**
         * Un accessoire a échoué sans empêcher l'utilisateur d'agir.
         * Part vers Discord (report) ET vers le handler global d'erreurs de la
         * page, seul chemin par lequel Sentry voit une erreur front ici.
         * Normalise les throws non-Error : `throw 'oops'` ou `throw null`
         * arriveraient sinon avec un message vide et sans pile.
         */
        reportSideEffect: function(context, error) {
            try {
                window.OrdoErrorReporter.report(context, error);
            } catch (e) {}
            try {
                var err;
                if (error instanceof Error) {
                    err = error;
                } else if (typeof error === 'string') {
                    err = new Error(error);
                } else {
                    err = new Error((error && error.message) || String(error));
                }
                window.dispatchEvent(new ErrorEvent('error', {
                    message: context + ': ' + err.message,
                    error: err
                }));
            } catch (e) {}
        },

        /**
         * Seul point d'entrée du dataLayer. Ne jette jamais.
         *
         * ⚠️ Le payload est construit par l'appelant, donc AVANT d'entrer ici :
         * si un throw dans sa construction peut casser quelque chose (une
         * redirection, une résiliation, une connexion), c'est à l'appelant de
         * mettre cette construction dans son propre try.
         */
        track: function(payload) {
            try {
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push(payload);
            } catch (err) {
                window.OrdoErrorReporter.reportSideEffect('OrdoTrack', err);
            }
        }
    };
})();
