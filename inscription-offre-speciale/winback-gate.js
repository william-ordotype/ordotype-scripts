/**
 * Ordotype Inscription Offre Speciale - Winback Gate
 *
 * Page « 6 mois offerts » réservée aux personnes désabonnées depuis moins de
 * 31 jours. Chargé par loader.js à la place de countdown.js et de
 * shared/stripe-checkout.js quand window.WINBACK_GATE vaut true.
 *
 * Le coupon n'est PAS dans la page : le champ CMS Code_promo_ID reste vide et
 * c'est create-checkout-session qui applique l'offre après avoir revérifié
 * l'éligibilité côté serveur. Ce script ne fait donc que de l'affichage :
 * même contourné, il ne donne aucune réduction.
 *
 * Identification : ?m=mem_… porté par le lien du mail winback Brevo
 * ({{contact.EXT_ID}}), sinon le membre connecté. Aucun login n'est requis.
 *
 * Required DOM elements (déjà présents sur le gabarit d'offre) :
 * - #signup-rempla-from-decouverte - bouton Memberstack natif, masqué ici
 * - #signup-rempla-stripe-customer - bouton de l'offre
 */
(function() {
    'use strict';

    var PREFIX = '[WinbackGate]';
    var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';
    var FN_BASE = 'https://checkout.ordotype.fr/.netlify/functions';
    var OFFER_ID = 'winback-6m';
    var EXPIRED_URL = '/offre-expiree';
    var CHECKING_LABEL = 'Vérification…';
    var REDIRECT_LABEL = 'Patientez…';

    var BTN_MS_ID = 'signup-rempla-from-decouverte';
    var BTN_STRIPE_ID = 'signup-rempla-stripe-customer';

    function report(name, err) {
        try {
            if (window.OrdoErrorReporter) {
                window.OrdoErrorReporter.report(name, err);
                return;
            }
            var e = err instanceof Error ? err : new Error(String(err));
            window.dispatchEvent(new ErrorEvent('error', { message: e.message, error: e }));
        } catch (ignored) {
            // never throw from the reporting path
        }
    }

    // Deepest single-child descendant holding only text (même heuristique que loader.js)
    function labelElement(btn) {
        var node = btn;
        while (node && node.children && node.children.length === 1) node = node.children[0];
        return (node && node.children && node.children.length === 0) ? node : null;
    }

    function setLabel(btn, text) {
        var el = labelElement(btn);
        if (el) el.textContent = text;
    }

    function identity() {
        var params = new URLSearchParams(window.location.search);
        var fromUrl = params.get('m');
        if (fromUrl && fromUrl.indexOf('mem_') === 0) {
            return { memberId: fromUrl, source: 'url' };
        }
        var ms = window.OrdoMemberstack || {};
        if (ms.memberId) return { memberId: ms.memberId, source: 'session' };
        if (ms.stripeCustomerId) return { stripeCustomerId: ms.stripeCustomerId, source: 'session' };
        return { source: 'none' };
    }

    function loadScript(url) {
        return new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.crossOrigin = 'anonymous';
            script.async = false;
            script.src = url;
            script.onload = resolve;
            script.onerror = function() { reject(new Error('Failed to load: ' + url)); };
            document.head.appendChild(script);
        });
    }

    // countdown.js lit cette clé si elle existe. On l'écrase à chaque visite avec
    // la date renvoyée par le serveur : la deadline est propre au membre, une
    // valeur laissée par une visite précédente ne doit jamais gagner.
    function seedCountdown(deadline) {
        var slug = (window.COUNTDOWN_CONFIG || {}).slug || '';
        if (!slug || !deadline) return;
        try {
            localStorage.setItem('modifiedCountdownDateTimeISO-' + slug, deadline);
        } catch (e) {
            console.warn(PREFIX, 'localStorage unavailable:', e.message);
        }
    }

    function goExpired() {
        // replace : la page d'offre ne reste pas dans l'historique, donc pas de
        // boucle quand la personne fait retour.
        window.location.replace(EXPIRED_URL);
    }

    function bindCheckout(btn, who) {
        var config = window.STRIPE_CHECKOUT_CONFIG || {};
        var redirecting = false;

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            if (redirecting) return;
            redirecting = true;
            setLabel(btn, REDIRECT_LABEL);
            btn.disabled = true;

            var payload = {
                offer: OFFER_ID,
                memberId: who.memberId || null,
                stripeCustomerId: who.stripeCustomerId || null,
                priceId: config.priceId,
                payment_method_types: config.paymentMethods,
                successUrl: config.successUrl,
                cancelUrl: config.cancelUrl
            };

            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'stripe_signup_click', option: OFFER_ID });

            fetch(FN_BASE + '/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function(resp) {
                if (resp.status === 403) {
                    // L'éligibilité a changé entre l'affichage et le clic.
                    goExpired();
                    return null;
                }
                return resp.json();
            }).then(function(data) {
                if (!data) return;
                if (!data.url) throw new Error('Invalid checkout session response');
                window.location.href = data.url;
            }).catch(function(err) {
                redirecting = false;
                btn.disabled = false;
                setLabel(btn, 'Réessayer');
                console.error(PREFIX, 'Checkout failed:', err);
                report('WinbackCheckoutFailed', err);
            });
        });
    }

    function init() {
        var msBtn = document.getElementById(BTN_MS_ID);
        var stripeBtn = document.getElementById(BTN_STRIPE_ID);

        // Le bouton Memberstack natif ouvre un checkout entièrement côté client :
        // il ne doit jamais être cliquable sur une page gatée.
        if (msBtn) msBtn.style.display = 'none';

        if (!stripeBtn) {
            console.warn(PREFIX, 'Checkout button not found');
            report('WinbackButtonMissing', new Error('#' + BTN_STRIPE_ID + ' not found'));
            return;
        }

        // Visible mais inerte pendant la vérification : rien ne peut partir avant
        // le verdict, et la page ne clignote pas.
        var initialLabel = (labelElement(stripeBtn) || {}).textContent || '';
        stripeBtn.classList.remove('hidden');
        stripeBtn.style.display = 'flex';
        stripeBtn.style.pointerEvents = 'none';
        stripeBtn.style.opacity = '0.6';
        setLabel(stripeBtn, CHECKING_LABEL);

        var who = identity();
        console.log(PREFIX, 'Identity source:', who.source);

        if (who.source === 'none') {
            console.log(PREFIX, 'No identity, offer not available');
            goExpired();
            return;
        }

        var query = who.memberId ? 'm=' + encodeURIComponent(who.memberId)
                                 : 'c=' + encodeURIComponent(who.stripeCustomerId);

        fetch(FN_BASE + '/winback-eligibility?' + query, { method: 'GET' })
            .then(function(resp) { return resp.json(); })
            .then(function(data) {
                if (data && data.error) {
                    // Panne de l'endpoint : on n'éjecte pas un désabonné légitime.
                    // Le bouton reste actif, create-checkout-session tranchera.
                    console.warn(PREFIX, 'Eligibility check unavailable, deferring to checkout');
                    report('WinbackEligibilityUnavailable', new Error('eligibility endpoint returned error'));
                } else if (!data || !data.eligible) {
                    console.log(PREFIX, 'Not eligible');
                    goExpired();
                    return;
                } else {
                    console.log(PREFIX, 'Eligible,', data.daysLeft, 'day(s) left');
                    seedCountdown(data.deadline);
                }

                setLabel(stripeBtn, initialLabel);
                stripeBtn.style.pointerEvents = '';
                stripeBtn.style.opacity = '';
                bindCheckout(stripeBtn, who);

                return loadScript(BASE + '/inscription-offre-speciale/countdown.js')
                    .then(function() { return loadScript(BASE + '/shared/opacity-reveal.js'); });
            })
            .catch(function(err) {
                // Réseau injoignable : même raisonnement, on laisse le bouton vivre.
                console.error(PREFIX, 'Eligibility call failed:', err);
                report('WinbackEligibilityFailed', err);
                setLabel(stripeBtn, initialLabel);
                stripeBtn.style.pointerEvents = '';
                stripeBtn.style.opacity = '';
                bindCheckout(stripeBtn, who);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
