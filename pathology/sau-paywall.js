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
 *   2. The paywall card content is swapped for the SAU card. The card is a
 *      Webflow component (« Paywall SAU », hidden template at the end of the
 *      Pathologies template, `[data-ordo-gabarit="sau-paywall"]`), cloned
 *      here so its copy is edited in the Designer, not in this file. The
 *      script only fills the detected IP (`[data-ordo-sau-ip="main"]`) and
 *      wires the contacts: the mail link gets a prefilled subject and body
 *      (IP + member id), the chat link opens Crisp with a prefilled message
 *      and the same data attached to the session (mail when Crisp is not
 *      loaded). If the template is missing, a built-in copy of the card is
 *      used and the gap is reported once.
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
 * Module fiches (content gated by a module group such as `rhumatologie` or
 * `soins-palliatifs`, alone or combined with ordotype-plus) are never
 * paywalled: a module stays usable everywhere, only the MG content is
 * reserved to the hospital network (William, 13/10/2026).
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
    var GABARIT_SELECTOR = '[data-ordo-gabarit="sau-paywall"]';
    // Content groups of the add-on modules. A fiche gated by one of them (or by
    // its « -et-ordotype-plus » union) is module content: never paywalled.
    var MODULE_GROUPS = ['rhumatologie', 'soins-palliatifs'];
    var SUPPORT_EMAIL = 'support@ordotype.fr';
    var MAIL_SUBJECT = 'Acc\u00e8s Urgences depuis mon \u00e9tablissement';

    var applied = false;
    var ipv4 = '';
    var ipv4Failed = false;
    var reportedMissingTemplate = false;

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

    function memberIdFromStorage() {
        var raw = null;
        try { raw = localStorage.getItem('_ms-mem'); } catch (e) { return ''; }
        if (!raw) return '';
        try {
            var snap = JSON.parse(raw);
            return snap && typeof snap.id === 'string' ? snap.id : '';
        } catch (e) {
            return '';
        }
    }

    function report(message) {
        console.warn(PREFIX, message);
        if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('SauPaywall', message);
    }

    /**
     * Built-in copy of the Designer card, used only when the template is
     * missing from the page (then reported once). Keep it in step with the
     * « Paywall SAU » component.
     */
    function fallbackCard() {
        var wrap = document.createElement('div');
        wrap.innerHTML =
            '<div class="paywall_card is-sau">' +
              '<div class="grid-1col-1rem left-align">' +
                '<h2 class="heading-h2-docs text-weight-medium">Besoin d’Ordotype en dehors de l’hôpital ?</h2>' +
                '<p class="text-color-base-600 text-size-regular">' +
                  'Votre compte gratuit Urgences est réservé au réseau de votre établissement. ' +
                  'Passez au compte payant pour profiter d’Ordotype où que vous soyez.' +
                '</p>' +
                '<div class="action_btns_form std"><a href="/nos-offres" class="button w-button">Choisir mon offre</a></div>' +
                '<p class="text-size-small text-color-base-600">' +
                  'Vous êtes dans votre établissement et voyez ce message ? Écrivez-nous à ' +
                  '<a class="fs-cc-banner_text-link" data-ordo-sau-contact="mail" href="mailto:' + SUPPORT_EMAIL + '">' + SUPPORT_EMAIL + '</a>' +
                  ' en indiquant cette adresse :' +
                '</p>' +
                '<div class="text-size-small text-color-base-600" data-ordo-sau-ip="main"><strong></strong></div>' +
                '<p class="text-size-small text-color-base-600">' +
                  'Vous pouvez aussi <a class="fs-cc-banner_text-link" data-ordo-sau-contact="chat" href="#">nous écrire sur le chat</a>' +
                  ' ou nous appeler au <a class="fs-cc-banner_text-link" href="tel:+33744785503">07 44 78 55 03</a>.' +
                '</p>' +
              '</div>' +
            '</div>';
        return wrap.firstChild;
    }

    function buildCard() {
        var template = document.querySelector(GABARIT_SELECTOR);
        if (template) {
            var card = template.cloneNode(true);
            card.removeAttribute('data-ordo-gabarit');
            return card;
        }
        if (!reportedMissingTemplate) {
            reportedMissingTemplate = true;
            report('Paywall SAU template missing from the page, built-in card used');
        }
        return fallbackCard();
    }

    /**
     * The address shown to the member and sent by mail: IPv4 only (William,
     * 13/10/2026). When the enforced address is IPv6, the IPv4 comes from the
     * lookup below; the IPv6 is shown only if that lookup fails, and it always
     * travels in the Crisp session data for the whitelist.
     */
    function displayIp() {
        var ip = readIp();
        if (!ip) return '';
        if (ip.indexOf(':') === -1) return ip;
        if (ipv4) return ipv4;
        return ipv4Failed ? ip : '';
    }

    function mailHref() {
        var ip = readIp();
        var id = memberIdFromStorage();
        var lines = [
            'Bonjour,',
            '',
            'Je suis dans mon établissement et Ordotype m’indique que je suis en dehors du réseau de mon hôpital.',
            ''
        ];
        var shown = displayIp() || ip;
        if (shown) lines.push('Adresse IP : ' + shown);
        if (id) lines.push('Identifiant de compte : ' + id);
        lines.push('', 'Merci.');
        return 'mailto:' + SUPPORT_EMAIL +
            '?subject=' + encodeURIComponent(MAIL_SUBJECT) +
            '&body=' + encodeURIComponent(lines.join('\n'));
    }

    function chatMessage() {
        var text = displayIp();
        return 'Bonjour, je suis dans mon établissement et Ordotype m’indique que je suis en dehors du réseau de mon hôpital.' +
            (text ? ' Mon adresse IP : ' + text + '.' : '');
    }

    /**
     * Crisp is loaded by the consent-gated loader of the page footer; when it
     * is absent (cookies refused, blocker) the link keeps its mailto href.
     */
    function openChat(ev) {
        var crisp = window.$crisp;
        if (!crisp || typeof crisp.push !== 'function') return;
        if (ev) ev.preventDefault();
        var data = [['sau_ip', readIp()], ['sau_ipv4', ipv4], ['member_id', memberIdFromStorage()]]
            .filter(function(pair) { return pair[1]; });
        if (data.length) crisp.push(['set', 'session:data', [data]]);
        crisp.push(['set', 'message:text', [chatMessage()]]);
        crisp.push(['do', 'chat:open']);
    }

    /** IP shown with textContent only (never innerHTML). Safe to call again. */
    function fillCard(card) {
        var text = displayIp();
        card.querySelectorAll('[data-ordo-sau-ip="main"]').forEach(function(slot) {
            var target = slot.querySelector('strong') || slot;
            target.textContent = text;
            slot.style.display = text ? '' : 'none';
        });
        var href = mailHref();
        card.querySelectorAll('[data-ordo-sau-contact="mail"], a[href^="mailto:"]').forEach(function(a) {
            a.setAttribute('href', href);
        });
        card.querySelectorAll('[data-ordo-sau-contact="chat"]').forEach(function(a) {
            a.setAttribute('href', href);
            if (!a.__ordoChatWired) {
                a.__ordoChatWired = true;
                a.addEventListener('click', openChat);
            }
        });
    }

    function refreshCards() {
        document.querySelectorAll('.rc_hidden_warning_wrapper [data-ordo-sau-card]').forEach(fillCard);
    }

    /**
     * Discover the public IPv4 once; it replaces the enforced IPv6 on the card.
     * api.ipify.org publishes ONLY A records, so this request is guaranteed
     * to travel over IPv4 even on an IPv6-preferring network. On failure the
     * card falls back to the enforced address.
     */
    function fillIpv4() {
        var enforced = readIp();
        if (!enforced || enforced.indexOf(':') === -1) return; // already IPv4
        fetch('https://api.ipify.org?format=text')
            .then(function(r) { return r.text(); })
            .then(function(v4) {
                v4 = (v4 || '').trim();
                if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) throw new Error('not an IPv4');
                ipv4 = v4;
                refreshCards();
            })
            .catch(function() {
                ipv4Failed = true;
                refreshCards();
            });
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
            console.warn(PREFIX, 'No .rappels-cliniques-content host, cannot inject paywall');
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
        inners.forEach(function(el) {
            // Keep the original card so unapply() can restore it — otherwise a
            // logged-out/free visitor on this browser (for whom Memberstack
            // SHOWS the wrapper) would read the SAU message for one pageview
            // after a restricted member logs out.
            if (el.__ordoOriginalCard === undefined) {
                el.__ordoOriginalCard = el.innerHTML;
            }
            var card = buildCard();
            card.setAttribute('data-ordo-sau-card', '1');
            el.innerHTML = '';
            el.appendChild(card);
            fillCard(card);
        });
        console.log(PREFIX, 'Swapped', inners.length, 'paywall(s) to SAU card', readIp() ? '(ip shown)' : '(no ip)');
    }

    /**
     * FREE pathologies (e.g. HTA) carry NO data-ms-content gating attributes
     * (the CMS "gated content" field is empty, so Webflow renders the same
     * structure without the attributes — verified live 2026-06-10). Their
     * content is open to everyone, including logged-out visitors, so a
     * restricted member must see it too. Without this guard the stylesheet
     * force-shows the page's (ungated, normally hidden) #RC_hidden_warning
     * and iframe-handler then paywalls free ordonnances.
     *
     * The positive premium gate is the discriminator: present in the raw DOM
     * before Memberstack processes it, and KEPT by Memberstack for our
     * cohort (restricted members hold premium access) — so it's reliable at
     * any point in the load.
     */
    function pageHasGatedContent() {
        return !!document.querySelector('[data-ms-content="premium-pages"]');
    }

    function isModulePage() {
        return MODULE_GROUPS.some(function(group) {
            return !!document.querySelector('[data-ms-content^="' + group + '"]');
        });
    }

    function apply() {
        if (applied) return;
        if (!pageHasGatedContent()) {
            console.log(PREFIX, 'Free pathology (no gated content), paywall skipped');
            return;
        }
        if (isModulePage()) {
            console.log(PREFIX, 'Module fiche, paywall skipped (modules stay usable everywhere)');
            return;
        }
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
