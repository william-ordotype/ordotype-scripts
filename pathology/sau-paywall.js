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
        // The enforced address is whatever the API connection used (often
        // IPv6 at home). Admins think in IPv4, so a hidden slot is appended
        // and revealed once the IPv4 lookup (fillIpv4) resolves — BOTH may
        // need whitelisting since the browser can use either toward the API.
        var ipLine = ip
            ? '<div class="text-size-small text-color-base-600">' +
                'Si vous \u00eates actuellement dans votre \u00e9tablissement, demandez \u00e0 votre ' +
                'administrateur d\u2019ajouter cette adresse \u00e0 la liste autoris\u00e9e\u00a0: ' +
                '<code data-ordo-ip="main"></code>' +
                '<span data-ordo-ip4-slot style="display:none"> \u00b7 <code data-ordo-ip="v4"></code></span>' +
              '</div>'
            : '';
        return (
            '<div class="paywall_card" style="max-width:42rem">' +
              '<div class="w-layout-grid grid-1col-1rem left-align">' +
                '<h2 class="heading-h2-docs text-weight-medium">Besoin d\u2019Ordotype en dehors de l\u2019h\u00f4pital\u00a0?</h2>' +
                '<div class="text-size-regular text-color-base-600">' +
                  'Votre compte gratuit Urgences est r\u00e9serv\u00e9 au r\u00e9seau de votre \u00e9tablissement. ' +
                  'Passez au compte payant pour profiter d\u2019Ordotype o\u00f9 que vous soyez.' +
                '</div>' +
                '<div>' +
                  '<a href="/nos-offres" class="button is-gradient w-button">Passer au compte payant \u2014 acc\u00e8s partout</a>' +
                '</div>' +
                ipLine +
              '</div>' +
            '</div>'
        );
    }

    /**
     * Discover the public IPv4 once and reveal it next to the enforced
     * address. api.ipify.org publishes ONLY A records, so this request is
     * guaranteed to travel over IPv4 even on an IPv6-preferring network.
     * Best-effort: on failure the card simply keeps the enforced address.
     */
    function fillIpv4() {
        var enforced = readIp();
        if (!enforced || enforced.indexOf(':') === -1) return; // already IPv4
        fetch('https://api.ipify.org?format=text')
            .then(function(r) { return r.text(); })
            .then(function(v4) {
                v4 = (v4 || '').trim();
                if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return;
                document.querySelectorAll('code[data-ordo-ip="v4"]').forEach(function(code) {
                    code.textContent = v4;
                });
                document.querySelectorAll('[data-ordo-ip4-slot]').forEach(function(slot) {
                    slot.style.display = '';
                });
            })
            .catch(function() { /* best-effort */ });
    }

    /**
     * Memberstack DOM doesn't merely hide `data-ms-content="!premium-pages"`
     * elements for members WITH premium access — it REMOVES them (verified
     * live 2026-06-10: restricted member, content hidden, wrapper gone). So
     * for the SAU cohort the Webflow paywall wrapper usually doesn't exist;
     * inject our own. The injected node reuses the exact id/classes because
     * iframe-handler keys its premium gating on
     * `.rappels-cliniques-content .rc_hidden_warning_wrapper` computing
     * display:block, and our stylesheet keys on #RC_hidden_warning.
     */
    function ensureWrapper() {
        if (document.querySelector('.rappels-cliniques-content .rc_hidden_warning_wrapper')) {
            return;
        }
        var host = document.querySelector('.rappels-cliniques-content');
        if (!host) {
            console.warn(PREFIX, 'No .rappels-cliniques-content host — cannot inject paywall');
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
        console.log(PREFIX, 'Injected paywall wrapper (Memberstack removed the original)');
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
            // Keep the original card so unapply() can restore it — otherwise a
            // logged-out/free visitor on this browser (for whom Memberstack
            // SHOWS the wrapper) would read the SAU message for one pageview
            // after a restricted member logs out.
            if (el.__ordoOriginalCard === undefined) {
                el.__ordoOriginalCard = el.innerHTML;
            }
            el.innerHTML = html;
            // IP set via textContent (never innerHTML) — belt-and-braces on
            // top of the regex above.
            var code = el.querySelector('code[data-ordo-ip="main"]');
            if (code && ip) code.textContent = ip;
        });
        console.log(PREFIX, 'Swapped', inners.length, 'paywall(s) to SAU variant', ip ? '(ip shown)' : '(no ip)');
    }

    function apply() {
        if (applied) return;
        applied = true;
        injectStyle();
        document.body.classList.add(BODY_CLASS);
        ensureWrapper();
        swapCard();
        fillIpv4();
    }

    function unapply() {
        if (!applied) return;
        applied = false;
        document.body.classList.remove(BODY_CLASS);
        // Wrappers WE injected (incl. any clones iframe-handler made of them)
        // have no business existing once the restriction lifts — remove them.
        document.querySelectorAll('.rc_hidden_warning_wrapper[data-ordo-injected="1"]')
            .forEach(function(el) { el.remove(); });
        // Restore the original card content (signup/upgrade variant) in any
        // genuine Webflow wrapper so a visitor for whom Memberstack shows it
        // never reads the SAU message after the restriction lifted.
        document.querySelectorAll('.rc_hidden_warning_wrapper .rc_premium_hidden_warning')
            .forEach(function(el) {
                if (el.__ordoOriginalCard !== undefined) {
                    el.innerHTML = el.__ordoOriginalCard;
                }
            });
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
