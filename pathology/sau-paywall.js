/**
 * Ordotype Pathology - SAU (IP-restricted) Paywall
 *
 * For accounts on the free ER plan (pln_sau-praticien) with the per-account
 * IP whitelist enabled, the backend flags every validate-session-status made
 * from an off-list desktop (X-Ordo-Ip-Restricted header). The auth proxy
 * (authentication.js >= 4.4) republishes that flag as:
 *
 *   localStorage  ord_ip_restricted     = "1"
 *   localStorage  ord_ip_restricted_ip  = "<detected client IP>"
 *   document event "ordo:ip-restriction"  detail: {restricted, ip}
 *
 * When the flag is set, this script renders the page as a non-premium member
 * would see it — WITHOUT logging the member out, so they can upgrade on the
 * spot:
 *
 *   1. A <style> keyed on body.ord-ip-restricted hides every
 *      data-ms-content="premium-pages" block (the inverse of Memberstack's
 *      gate) and force-shows #RC_hidden_warning. `!important` wins over the
 *      inline styles Memberstack's DOM package applies, whichever order they
 *      land in.
 *   2. The paywall card content is swapped for the SAU variant (same pattern
 *      as pause-paywall.js) with an upgrade CTA — the member is logged in, so
 *      checkout works directly — plus the detected IP for whitelist requests.
 *   3. iframe-handler.js keys its premium decision on the wrapper computing
 *      display:block, so the Ordonnances/Recommandations tabs gate themselves
 *      as long as this runs before its init — guaranteed by the pre-Tier-2
 *      slot in loader.js. If the flag instead arrives mid-page (first off-site
 *      load: the proxy's validate resolves after Tier 2), the CSS also hides
 *      already-created iframes as a stopgap; the next navigation gates fully.
 *
 * Client-side enforcement on purpose: same bar as Memberstack DOM gating and
 * the UA-based mobile exemption — anti-abuse, not a vault.
 *
 * Depends on: nothing (vanilla; reads localStorage only). Loaded pre-Tier-2
 * by loader.js, after pause-paywall.js (a restricted member can't be paused
 * in practice; if both ever apply, the SAU variant wins by running last).
 */
(function() {
    'use strict';

    var PREFIX = '[SauPaywall]';
    var FLAG_KEY = 'ord_ip_restricted';
    var IP_KEY = 'ord_ip_restricted_ip';
    var EVENT = 'ordo:ip-restriction';
    var BODY_CLASS = 'ord-ip-restricted';
    var STYLE_ID = 'ord-sau-paywall-style';

    var applied = false;

    function readFlag() {
        try {
            return localStorage.getItem(FLAG_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function readIp() {
        try {
            var ip = localStorage.getItem(IP_KEY) || '';
            // Defensive: only render something IP-shaped into the card.
            return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : '';
        } catch (e) {
            return '';
        }
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            'body.' + BODY_CLASS + ' [data-ms-content="premium-pages"]{display:none !important;}' +
            'body.' + BODY_CLASS + ' #RC_hidden_warning{display:block !important;opacity:1 !important;}' +
            // Stopgap for the flag-arrives-late case (first off-site load):
            // iframes opened before the flag landed go dark immediately.
            'body.' + BODY_CLASS + ' .pathology_tab-view-iframe,' +
            'body.' + BODY_CLASS + ' iframe.mobile-iframe{display:none !important;}';
        (document.head || document.documentElement).appendChild(style);
    }

    function cardHtml() {
        var ip = readIp();
        var ipLine = ip
            ? '<div class="text-size-small text-color-base-600">ou demandez à votre administrateur d’ajouter cette adresse à la liste autorisée : <code></code></div>'
            : '';
        return (
            '<div class="paywall_card">' +
              '<div class="w-layout-grid grid-1col-1rem left-align">' +
                '<h2 class="heading-h2-docs text-weight-medium">Vous êtes en dehors de votre établissement</h2>' +
                '<div class="text-size-regular text-color-base-600">' +
                  'Votre compte gratuit Urgences fonctionne uniquement depuis le réseau de votre hôpital.' +
                '</div>' +
                '<div>' +
                  '<a href="/nos-offres" class="button is-gradient w-button">Passer au compte payant — accès partout</a>' +
                '</div>' +
                ipLine +
              '</div>' +
            '</div>'
        );
    }

    function swapCard() {
        var inners = document.querySelectorAll('.rc_hidden_warning_wrapper .rc_premium_hidden_warning');
        if (!inners.length) {
            console.warn(PREFIX, 'No paywall inner containers found');
            return;
        }
        var html = cardHtml();
        var ip = readIp();
        inners.forEach(function(el) {
            el.innerHTML = html;
            // IP set via textContent (never innerHTML) — belt-and-braces on
            // top of the regex above.
            var code = el.querySelector('code');
            if (code && ip) code.textContent = ip;
        });
        console.log(PREFIX, 'Swapped', inners.length, 'paywall(s) to SAU variant', ip ? '(ip shown)' : '(no ip)');
    }

    function apply() {
        if (applied) return;
        applied = true;
        injectStyle();
        document.body.classList.add(BODY_CLASS);
        swapCard();
    }

    function unapply() {
        if (!applied) return;
        applied = false;
        document.body.classList.remove(BODY_CLASS);
        // The swapped card stays inside the (now re-hidden) wrapper — inert.
        console.log(PREFIX, 'Restriction lifted (upgrade or back on-site)');
    }

    function init() {
        if (readFlag()) apply();

        // Fresh signal from the proxy's validate-session-status (covers the
        // first-ever off-site load, and lifting after an upgrade).
        document.addEventListener(EVENT, function(ev) {
            var restricted = !!(ev && ev.detail && ev.detail.restricted);
            if (restricted) apply();
            else unapply();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
