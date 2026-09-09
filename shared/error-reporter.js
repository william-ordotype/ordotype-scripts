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
 *   // l'utilisateur d'agir. Passe par report(), donc Discord + Sentry : une
 *   // panne muette efface son propre témoin.
 *   OrdoErrorReporter.reportSideEffect('AutoCheckout', err);
 *
 *   // Le seul point d'entrée du dataLayer. Ne jette jamais, signale l'échec.
 *   OrdoErrorReporter.track({ event: 'stripe_signup_click', option: 'rempla' });
 *
 * Version: 1.2.0 (2026-09-09)
 *   1.0.0 — report() vers le webhook Discord.
 *   1.1.0 — reportSideEffect() et track() partagés, pour que la règle « une
 *           mesure ne doit jamais casser la page » vive à un seul endroit au
 *           lieu d'être recopiée dans chaque script.
 *   1.2.0 — reportNetwork(), pour ne plus signaler une requête morte avec sa
 *           page. Mesuré : ces échecs-là sont sans statut, le serveur les a
 *           souvent servis normalement, et ce sont les seuls que `keepalive`
 *           laisse encore remonter.
 */
(function() {
    'use strict';

    var WEBHOOK_URL = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';

    /**
     * La page est-elle en train de partir, ou déjà hors de vue ?
     *
     * `pagehide` couvre la fermeture et la navigation, `visibilitychange` le
     * passage en arrière-plan, que les navigateurs mobiles traitent comme une
     * fin de vie. `pageshow` réarme, sans quoi un simple changement d'onglet
     * rendrait la page définitivement muette pour le reste de sa vie.
     *
     * Aucun de ces écouteurs n'est indispensable : s'ils ne peuvent pas être
     * posés, le drapeau reste faux et tout est signalé, comme avant.
     */
    var pagePartie = false;
    try {
        window.addEventListener('pagehide', function() { pagePartie = true; });
        window.addEventListener('pageshow', function() { pagePartie = false; });
        document.addEventListener('visibilitychange', function() {
            pagePartie = document.visibilityState === 'hidden';
        });
    } catch (e) { /* pas d'écouteur : on signale tout */ }

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
         * Une requête qui n'a produit AUCUNE réponse HTTP : pas de statut, rien
         * à lire. Deux situations mènent là, et une seule mérite d'être
         * signalée.
         *
         * Quand la page s'en va, le navigateur abandonne ce qui est en vol : la
         * requête meurt avec elle, à l'étape où elle se trouvait. Ce n'est pas
         * une panne. Et comme ce module poste avec `keepalive`, c'est justement
         * le seul type d'échec qui sache encore se signaler : le remonter
         * donnerait une image faite de navigations plutôt que d'incidents.
         *
         * 🔴 Réservé aux échecs SANS statut. Une vraie erreur survenue pendant
         * un déchargement doit continuer de passer par report().
         *
         * ⚠️ La mesure n'est pas concernée : l'appelant pousse son événement
         * dans tous les cas. On choisit ce qui alerte, pas ce qui est compté.
         *
         * Rend true si l'incident a été signalé, false s'il a été écarté.
         */
        reportNetwork: function(context, error) {
            try {
                if (pagePartie) return false;
                window.OrdoErrorReporter.report(context, error);
                return true;
            } catch (e) {
                return false;
            }
        },

        /**
         * Un accessoire a échoué sans empêcher l'utilisateur d'agir.
         * report() normalise déjà les throws non-Error (`throw 'oops'`,
         * `throw null`) et couvre Discord + Sentry.
         */
        reportSideEffect: function(context, error) {
            // report() fait DÉJÀ Discord + captureException Sentry. Y ajouter un
            // ErrorEvent créerait un second ticket Sentry pour la même cause, avec
            // une empreinte différente. Le repli par ErrorEvent appartient aux
            // scripts qui n'ont pas ce fichier sur la page, pas à ce fichier.
            try {
                window.OrdoErrorReporter.report(context, error);
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
