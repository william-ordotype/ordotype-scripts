/**
 * Ordotype Pathology - End of internship paywall
 *
 * Shows the paywall on gated content for members whose internship has ended
 * (OrdoMemberstack.getEndOfInternship), with a link to the offer page.
 * Same mechanism as sau-paywall.js. Loaded pre-Tier-2 by loader.js.
 *
 * Depends on: memberstack-utils.js (window.OrdoMemberstack)
 */
(function() {
    'use strict';

    var PREFIX = '[FinInternatPaywall]';
    var BODY_CLASS = 'ord-fin-internat';
    var STYLE_ID = 'ord-fin-internat-paywall-style';
    var GRACE_PERIOD = 24 * 60 * 60 * 1000;
    var SIGNUP_DAYS = 15;

    function justPaid() {
        try {
            var ts = parseInt(localStorage.getItem('justPaidTs') || '0', 10);
            return !!ts && (Date.now() - ts) < GRACE_PERIOD;
        } catch (e) {
            return false;
        }
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            'body.' + BODY_CLASS + ' [data-ms-content="premium-pages"]{display:none !important;}' +
            'body.' + BODY_CLASS + ' #RC_hidden_warning{display:block !important;opacity:1 !important;}' +
            'body.' + BODY_CLASS + ' .pathology_tab-view-iframe,' +
            'body.' + BODY_CLASS + ' iframe.mobile-iframe{display:none !important;}';
        (document.head || document.documentElement).appendChild(style);
    }

    function cardHtml() {
        return (
            '<div class="paywall_card" style="max-width:42rem">' +
              '<div class="w-layout-grid grid-1col-1rem left-align">' +
                '<h2 class="heading-h2-docs text-weight-medium">Votre offre interne est arrivée à sa fin</h2>' +
                '<div class="text-size-regular text-color-base-600">' +
                  'Pour continuer à consulter cette fiche, choisissez l’offre qui vous convient.' +
                '</div>' +
                '<div>' +
                  '<a href="/membership/fin-internat" class="button is-gradient w-button">Voir les offres</a>' +
                '</div>' +
              '</div>' +
            '</div>'
        );
    }

    // Memberstack removes the paywall wrapper for members with premium access:
    // inject one with the id/classes iframe-handler.js and the stylesheet key on.
    function ensureWrapper() {
        if (document.querySelector('.rappels-cliniques-content .rc_hidden_warning_wrapper')) return;
        var host = document.querySelector('.rappels-cliniques-content');
        if (!host) {
            console.warn(PREFIX, 'No .rappels-cliniques-content host');
            return;
        }
        var wrapper = document.createElement('div');
        wrapper.id = 'RC_hidden_warning';
        wrapper.className = 'rc_hidden_warning_wrapper';
        wrapper.setAttribute('data-ordo-injected', '1');
        var inner = document.createElement('div');
        inner.className = 'rc_premium_hidden_warning';
        wrapper.appendChild(inner);
        host.appendChild(wrapper);
    }

    function swapCard() {
        document.querySelectorAll('.rc_hidden_warning_wrapper .rc_premium_hidden_warning').forEach(function(el) {
            el.innerHTML = cardHtml();
        });
    }

    // Free pathologies carry no gated content.
    function pageHasGatedContent() {
        return !!document.querySelector('[data-ms-content="premium-pages"]');
    }

    function init() {
        var ms = window.OrdoMemberstack;
        if (!ms || typeof ms.getEndOfInternship !== 'function') return;
        if (typeof ms.refresh === 'function') ms.refresh();
        if (!ms.member || !ms.member.id) return;
        if (justPaid()) return;

        var daysSinceSignup = ms.daysSince(ms.safeDateFromValue(ms.member.createdAt));
        if (daysSinceSignup === null || daysSinceSignup <= SIGNUP_DAYS) return;
        if (!ms.getEndOfInternship().ended) return;
        if (!pageHasGatedContent()) return;

        injectStyle();
        document.body.classList.add(BODY_CLASS);
        ensureWrapper();
        swapCard();
        console.log(PREFIX, 'Applied');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
