/**
 * Ordotype - Current Offer on the cancellation page
 * While a discount still applies to the next invoice (free months, a running reduction), the -50 %
 * offer is not proposed: its block shows the member's current offer instead, with a link back to the
 * account. Pause and cancellation stay.
 *
 * The member-forms endpoint answers the preview action `apercu-redeem-mg` with the same checks as the
 * offer itself, without applying anything: 409 `remise_en_cours` with `remise`, or 200.
 * offre-annulation/loader.js hides the block (keeping its place) until this script decides, and shows
 * it again if this script does not load. No answer within ANSWER_TIMEOUT: the block is shown as before;
 * the endpoint still refuses the offer on submit, and redeem-cancel-forms.js then calls
 * OrdoCurrentOffer.show() with the refusal.
 *
 * Expected DOM elements:
 * - #redeem-form inside the offer block (.inscr-p_actions)
 * - .inscr-p_head .inscr-p_note (intro line)
 */
(function() {
    'use strict';

    var PREFIX = '[CurrentOffer]';
    var MEMBER_FORMS_URL = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
    var ANSWER_TIMEOUT = 3000;
    var ACCOUNT_URL = '/membership/compte#abonnements';
    var INTRO = 'Avant de confirmer la résiliation, voici votre offre en cours et une autre possibilité.';
    var ENDS = 'Cette offre prend fin si vous résiliez.';
    var UNIT = { month: 'mois', year: 'an' };

    var block = null;
    var decided = false;

    function report(name, detail) {
        try {
            var err = new Error(detail);
            err.name = name;
            if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('CurrentOffer', err);
            else console.error(PREFIX, name, detail);
        } catch (e) {
            // never throw from the reporting path
        }
    }

    function offerBlock() {
        var form = document.getElementById('redeem-form');
        return form && form.closest ? form.closest('.inscr-p_actions') : null;
    }

    function euros(cents) {
        return (cents / 100).toLocaleString('fr-FR', {
            minimumFractionDigits: cents % 100 ? 2 : 0,
            maximumFractionDigits: 2
        }) + ' €';
    }

    var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
        'septembre', 'octobre', 'novembre', 'décembre'];

    // « AAAA-MM-JJ » → « 25 avril 2027 », comme sur la page du compte.
    function longDate(ymd) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
        if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
        var d = Number(m[3]);
        return (d === 1 ? '1er' : String(d)) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
    }

    function isAmount(v) {
        return typeof v === 'number' && isFinite(v) && v >= 0;
    }

    function noteText(r) {
        var unit = UNIT[r.intervalle];
        var until = longDate(r.pleinTarif);
        var text;
        if (r.prixRemise === 0) {
            if (until) text = 'offert jusqu’au ' + until + ', puis ' + euros(r.prix) + (unit ? ' par ' + unit : '') + '.';
            else if (r.duree === 'forever') text = 'offert, sans limite de durée.';
            else text = 'offert.';
        } else {
            text = 'au lieu de ' + euros(r.prix);
            if (until) text += ', jusqu’au ' + until + '.';
            else if (r.duree === 'forever') text += ', sans limite de durée.';
            else text += '.';
        }
        return text + ' ' + ENDS;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function reveal() {
        if (block) block.style.visibility = '';
    }

    /**
     * Replaces the offer block with the member's current offer. Returns true when the block was
     * replaced. Fields of `remise` that are missing give a shorter card, never a wrong amount.
     */
    function show(remise) {
        var target = block || offerBlock();
        if (!target || !remise || typeof remise !== 'object') return false;
        try {
            var r = remise;
            var detailed = isAmount(r.prix) && isAmount(r.prixRemise) && r.prixRemise <= r.prix;
            var head = document.querySelector('.inscr-p_head .inscr-p_note:not([id])');
            if (head) head.textContent = INTRO;

            while (target.firstChild) target.removeChild(target.firstChild);
            target.appendChild(el('div', 'inscr-p_kicker', 'Votre offre en cours'));
            if (detailed) {
                var price = el('div', 'inscr-p_price');
                price.appendChild(el('div', 'inscr-p_price-num', euros(r.prixRemise)));
                if (UNIT[r.intervalle]) price.appendChild(el('div', 'text-size-regular', '/' + UNIT[r.intervalle]));
                target.appendChild(price);
                target.appendChild(el('p', 'inscr-p_note', noteText(r)));
            } else {
                target.appendChild(el('p', 'inscr-p_note', 'Votre abonnement bénéficie déjà d’une offre en cours. ' + ENDS));
            }
            var keep = el('a', 'button w-button', 'Garder mon abonnement');
            keep.href = ACCOUNT_URL;
            keep.style.width = '100%';
            keep.style.boxSizing = 'border-box';
            keep.style.textAlign = 'center';
            target.appendChild(keep);
            target.setAttribute('data-ordo-offer', 'current');
            target.style.visibility = '';
            decided = true;
            return true;
        } catch (e) {
            report('CurrentOfferRenderFailed', (e && e.message) || String(e));
            return false;
        }
    }

    function keepOffer() {
        if (decided) return;
        decided = true;
        if (block) block.setAttribute('data-ordo-offer', 'offer');
        reveal();
    }

    // The member's session token, or '' for a visitor: the cookie is only read once a member is logged in.
    function sessionToken(deadline) {
        return new Promise(function(resolve) {
            (function poll() {
                var ms = window.$memberstackDom;
                if (ms && typeof ms.getMemberCookie === 'function' && typeof ms.getCurrentMember === 'function') {
                    Promise.resolve(ms.getCurrentMember()).then(function(res) {
                        return res && res.data ? ms.getMemberCookie() : '';
                    }).then(resolve, function() { resolve(''); });
                    return;
                }
                if (Date.now() >= deadline) { resolve(''); return; }
                setTimeout(poll, 100);
            })();
        });
    }

    function check() {
        var deadline = Date.now() + ANSWER_TIMEOUT;
        var timer = setTimeout(keepOffer, ANSWER_TIMEOUT);
        sessionToken(deadline).then(function(token) {
            if (!token || decided) return null;
            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            if (controller) setTimeout(function() { controller.abort(); }, Math.max(0, deadline - Date.now()));
            return fetch(MEMBER_FORMS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + String(token) },
                body: JSON.stringify({ action: 'apercu-redeem-mg' }),
                signal: controller ? controller.signal : undefined
            }).then(function(response) {
                if (response.status !== 409) return null;
                return response.json().catch(function() { return null; });
            });
        }).then(function(body) {
            clearTimeout(timer);
            // A late refusal still replaces the offer: accepting it would be refused anyway.
            if (body && body.error === 'remise_en_cours' && show(body.remise)) {
                console.log(PREFIX, 'Current offer shown instead of the -50 % offer');
                return;
            }
            keepOffer();
        }).catch(function(err) {
            clearTimeout(timer);
            console.warn(PREFIX, 'Check failed, offer kept:', err && err.message);
            keepOffer();
        });
    }

    window.OrdoCurrentOffer = { show: show };

    block = offerBlock();
    if (!block) return;
    check();
})();
