/**
 * Ordotype Pathology - End of internship paywall
 *
 * Shows the paywall on gated content for members whose internship has ended
 * (OrdoMemberstack.getEndOfInternship().lockContent), with a link to the offer page.
 * Same mechanism as sau-paywall.js, whose card wins while its restriction applies.
 * Loaded pre-Tier-2 by loader.js.
 *
 * Depends on: memberstack-utils.js (window.OrdoMemberstack)
 */
(function() {
    'use strict';

    var PREFIX = '[FinInternatPaywall]';
    var BODY_CLASS = 'ord-fin-internat';
    var SAU_BODY_CLASS = 'ord-ip-restricted';
    var STYLE_ID = 'ord-fin-internat-paywall-style';
    var HOST_SELECTOR = '.rappels-cliniques-content';
    var INNER_SELECTOR = '.rc_hidden_warning_wrapper .rc_premium_hidden_warning';
    // Not sau-paywall.js's data-ordo-injected: its unapply() removes those wrappers.
    var INJECTED_ATTRIBUTE = 'data-ordo-fin-internat';
    var CARD_SELECTOR = '[data-ordo-card="fin-internat"]';
    var MAX_REATTACH = 20;
    var REPORTED_KEY = 'ordFinInternatPaywallReported';

    var wrapperNode = null;
    var reattachCount = 0;

    // Once per session: these states repeat on every page view.
    function report(message) {
        console.error(PREFIX, message);
        try {
            if (sessionStorage.getItem(REPORTED_KEY)) return;
            sessionStorage.setItem(REPORTED_KEY, '1');
        } catch (e) { /* report anyway */ }
        if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('FinInternatPaywall', message);
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
            '<div class="paywall_card" data-ordo-card="fin-internat" style="max-width:42rem">' +
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

    function createWrapper() {
        var wrapper = document.createElement('div');
        wrapper.id = 'RC_hidden_warning';
        wrapper.className = 'rc_hidden_warning_wrapper';
        wrapper.setAttribute(INJECTED_ATTRIBUTE, '1');
        var inner = document.createElement('div');
        inner.className = 'rc_premium_hidden_warning';
        wrapper.appendChild(inner);
        return wrapper;
    }

    // Memberstack removes the paywall wrapper for members with premium access,
    // possibly after this script ran. The same node is put back: iframe-handler.js
    // keeps the one it found at init. Without its data-ms-content attribute,
    // Memberstack leaves it alone.
    function ensureWrapper(host) {
        var current = host.querySelector('.rc_hidden_warning_wrapper');
        if (current) {
            if (!wrapperNode) wrapperNode = current;
            current.removeAttribute('data-ms-content');
            return;
        }
        if (reattachCount >= MAX_REATTACH) return;
        reattachCount++;
        if (reattachCount === MAX_REATTACH) report('Paywall wrapper removed ' + MAX_REATTACH + ' times');
        if (!wrapperNode) wrapperNode = createWrapper();
        host.appendChild(wrapperNode);
    }

    function render(host) {
        ensureWrapper(host);
        var sauActive = document.body.classList.contains(SAU_BODY_CLASS);
        document.querySelectorAll(INNER_SELECTOR).forEach(function(el) {
            if (el.querySelector(CARD_SELECTOR)) return;
            // sau-paywall.js's card wins while its restriction applies.
            if (sauActive && el.children.length) return;
            el.innerHTML = cardHtml();
        });
    }

    // Free pathologies carry no gated content. On module pages the only
    // premium-pages node is the upsell button inside the paywall card.
    function pageHasGatedContent() {
        var nodes = document.querySelectorAll('[data-ms-content="premium-pages"]');
        for (var i = 0; i < nodes.length; i++) {
            if (!nodes[i].closest('.rc_hidden_warning_wrapper')) return true;
        }
        return false;
    }

    function init() {
        var ms = window.OrdoMemberstack;
        if (!ms) return; // loader.js reports memberstack-utils.js failures
        if (typeof ms.getEndOfInternship !== 'function') {
            report('OrdoMemberstack.getEndOfInternship missing');
            return;
        }
        ms.refresh();
        if (!ms.member || !ms.member.id) return;
        if (!ms.getEndOfInternship().lockContent) return;
        if (!pageHasGatedContent()) return;

        var host = document.querySelector(HOST_SELECTOR);
        if (!host) {
            report('No ' + HOST_SELECTOR + ' host');
            return;
        }
        injectStyle();
        document.body.classList.add(BODY_CLASS);
        render(host);
        // Memberstack removing the wrapper, or sau-paywall.js lifting its restriction.
        var observer = new MutationObserver(function() { render(host); });
        observer.observe(host, { childList: true, subtree: true });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        console.log(PREFIX, 'Applied');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
