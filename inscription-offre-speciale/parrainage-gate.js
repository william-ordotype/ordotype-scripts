/**
 * Ordotype Inscription Offre Speciale - Parrainage Gate
 *
 * Offre réservée aux confrères invités. Chargé par loader.js à la place de
 * countdown.js et de shared/stripe-checkout.js sur la page de l'offre parrainage.
 *
 * La page ne porte aucun coupon : le lien d'invitation porte un code
 * (?invitation=CODE), et create-checkout-session n'accorde la remise qu'après
 * avoir vérifié ce code côté serveur. Ce script ne fait que de l'affichage et
 * transmet le code : contourné, il ne donne aucune réduction.
 *
 * Le code est gardé dans localStorage le temps de l'inscription : le confrère
 * invité n'a pas encore de compte, et le retour après inscription peut perdre la
 * query string.
 *
 * Required DOM elements (gabarit d'offre) :
 * - #signup-rempla-from-decouverte - bouton Memberstack natif, masqué ici
 * - #signup-rempla-stripe-customer - bouton de l'offre
 *
 * ES2019 max (cf. eslint.config.js).
 */
(function() {
    'use strict';

    var PREFIX = '[ParrainageGate]';
    var FN_BASE = 'https://checkout.ordotype.fr/.netlify/functions';
    var OFFER_ID = 'parrainage-3m';
    var PARAM = 'invitation';
    var STORAGE_KEY = 'ordo-parrainage-invitation';
    var CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
    var REDIRECT_LABEL = 'Patientez…';
    var RETRY_LABEL = 'Réessayer';
    var OFFERS_URL = '/nos-offres';

    var BTN_MS_ID = 'signup-rempla-from-decouverte';
    var BTN_STRIPE_ID = 'signup-rempla-stripe-customer';

    var CSS = [
        '.ordo-expired{display:flex;align-items:center;justify-content:center;',
        'min-height:60vh;padding:80px 24px;background:var(--neutral-100,#f7f7fb);}',
        '.ordo-expired-card{width:100%;max-width:560px;padding:48px 40px;text-align:center;',
        'background:#fff;border:1px solid var(--gris300,#ecedef);border-radius:16px;',
        'box-shadow:0 1px 2px rgba(12,14,22,.04),0 12px 32px rgba(12,14,22,.06);}',
        '.ordo-expired-title{margin:0 0 12px;font-size:28px;line-height:1.25;font-weight:600;',
        'color:var(--base-900,#0c0e16);}',
        '.ordo-expired-text{margin:0 auto 8px;max-width:44ch;font-size:16px;line-height:1.6;',
        'color:var(--neutral-500,#47505c);}',
        '.ordo-expired-actions{display:flex;flex-direction:column;align-items:center;margin-top:32px;}',
        '.ordo-expired-actions .button{padding:.75rem 1.5rem;}',
        '@media (max-width:479px){.ordo-expired{padding:48px 16px;}',
        '.ordo-expired-card{padding:36px 24px;}.ordo-expired-title{font-size:24px;}}'
    ].join('');

    function param(name) {
        try {
            return new URLSearchParams(window.location.search).get(name);
        } catch (e) {
            return null;
        }
    }

    function invitationCode() {
        var fromUrl = (param(PARAM) || '').trim();
        if (CODE_PATTERN.test(fromUrl)) {
            try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch (e) { /* stockage indisponible */ }
            return fromUrl;
        }
        try {
            var stored = (localStorage.getItem(STORAGE_KEY) || '').trim();
            return CODE_PATTERN.test(stored) ? stored : null;
        } catch (e) {
            return null;
        }
    }

    function track(eventName, extra) {
        try {
            var payload = { event: eventName, page_location: window.location.href, option: OFFER_ID };
            if (extra) {
                for (var k in extra) {
                    if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
                }
            }
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(payload);
        } catch (e) {
            // la mesure ne doit jamais casser la page
        }
    }

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

    function labelElement(btn) {
        var node = btn;
        while (node && node.children && node.children.length === 1) node = node.children[0];
        return (node && node.children && node.children.length === 0) ? node : null;
    }

    function setLabel(btn, text) {
        var el = labelElement(btn);
        if (el) el.textContent = text;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.appendChild(document.createTextNode(text));
        return node;
    }

    function card(title, paragraphs) {
        var wrap = el('div', 'ordo-expired');
        wrap.setAttribute('data-parrainage-screen', '');
        var box = el('div', 'ordo-expired-card');
        box.appendChild(el('h1', 'ordo-expired-title', title));
        paragraphs.forEach(function(text) {
            box.appendChild(el('p', 'ordo-expired-text', text));
        });
        var row = el('div', 'ordo-expired-actions');
        var btn = el('a', 'button is-gradient w-inline-block');
        btn.href = OFFERS_URL;
        var content = el('div', 'button-content outer');
        content.appendChild(el('div', null, 'Voir les offres Ordotype'));
        btn.appendChild(content);
        row.appendChild(btn);
        box.appendChild(row);
        wrap.appendChild(box);
        return wrap;
    }

    function missingInvitationScreen() {
        return card('Cette offre est réservée aux confrères invités', [
            'Elle s’ouvre depuis le lien reçu par e-mail. Si vous avez reçu une invitation, '
                + 'utilisez le lien de ce message.',
            'Vous pouvez aussi découvrir nos offres, sans engagement.'
        ]);
    }

    function invalidInvitationScreen() {
        return card('Cette invitation n’est plus valable', [
            'Elle a déjà été utilisée, ou son délai est passé.',
            'Vous pouvez découvrir nos offres, sans engagement.'
        ]);
    }

    function showScreen(screen) {
        if (!document.getElementById('ordo-parrainage-css')) {
            var style = document.createElement('style');
            style.id = 'ordo-parrainage-css';
            style.appendChild(document.createTextNode(CSS));
            (document.head || document.documentElement).appendChild(style);
        }
        var connected = document.getElementById('page-wrapper-connected');
        var notConnected = document.getElementById('page-wrapper-not-connected');
        var main = connected ? connected.querySelector('.main-wrapper') : null;
        if (main) {
            while (main.firstChild) main.removeChild(main.firstChild);
            main.appendChild(screen);
        } else {
            if (connected) connected.style.display = 'none';
            document.body.insertBefore(screen, document.body.firstChild);
        }
        if (notConnected) notConnected.style.display = 'none';
        window.scrollTo(0, 0);
    }

    function identity() {
        var ms = window.OrdoMemberstack || {};
        if (ms.stripeCustomerId) return { stripeCustomerId: ms.stripeCustomerId };
        if (ms.memberId) return { memberId: ms.memberId };
        return null;
    }

    function redirect(url) {
        window.location.href = url;
    }

    function bindCheckout(btn, code) {
        var redirecting = false;

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            if (redirecting) return;
            var who = identity();
            if (!who) {
                // Le bouton n'est visible qu'une fois connecté ; sans identité, on ne
                // part pas vers un paiement qui serait refusé.
                report('ParrainageIdentityMissing', new Error('no Memberstack identity at checkout'));
                return;
            }
            redirecting = true;
            setLabel(btn, REDIRECT_LABEL);
            btn.disabled = true;

            var config = window.STRIPE_CHECKOUT_CONFIG || {};
            var payload = {
                offer: OFFER_ID,
                promotionCode: code,
                memberId: who.memberId || null,
                stripeCustomerId: who.stripeCustomerId || null,
                priceId: config.priceId,
                payment_method_types: config.paymentMethods,
                successUrl: config.successUrl,
                cancelUrl: window.location.href
            };

            track('stripe_signup_click');

            fetch(FN_BASE + '/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function(resp) {
                if (resp.status === 403) {
                    return resp.json().catch(function() { return {}; }).then(function(data) {
                        track('parrainage_refused', { reason: (data && data.reason) || 'unknown' });
                        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* stockage indisponible */ }
                        showScreen(invalidInvitationScreen());
                        return null;
                    });
                }
                if (!resp.ok) throw new Error('Session API error: ' + resp.status);
                return resp.json();
            }).then(function(data) {
                if (!data) return;
                if (!data.url) throw new Error('Invalid checkout session response');
                redirect(data.url);
            }).catch(function(err) {
                redirecting = false;
                btn.disabled = false;
                setLabel(btn, RETRY_LABEL);
                console.error(PREFIX, 'Checkout failed:', err);
                report('ParrainageCheckoutFailed', err);
                track('checkout_failed', { checkout_source: 'parrainage' });
            });
        });
    }

    function init() {
        var code = invitationCode();
        if (!code) {
            showScreen(missingInvitationScreen());
            track('parrainage_missing_invitation');
            return;
        }

        var msBtn = document.getElementById(BTN_MS_ID);
        if (msBtn) msBtn.style.display = 'none';

        var stripeBtn = document.getElementById(BTN_STRIPE_ID);
        if (!stripeBtn) {
            report('ParrainageButtonMissing', new Error('#' + BTN_STRIPE_ID + ' not found'));
            return;
        }
        stripeBtn.classList.remove('hidden');
        stripeBtn.style.display = 'flex';
        bindCheckout(stripeBtn, code);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
