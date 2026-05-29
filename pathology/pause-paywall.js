/**
 * Ordotype Pathology - Pause Paywall
 *
 * Swaps the generic paywall card to a pause-specific variant when the
 * Memberstack member is paused. Gating is delegated to Memberstack groups
 * (the source of truth Webflow's own conditional visibility uses), via the
 * localStorage `ms_groups` array:
 *
 *   - SHORT-CIRCUIT — if `premium-pages.activeMemberHasAccess` is true the
 *     member has access via SOME plan (resident plan, special offer,
 *     module-paid plan, …) even if another plan was paused. Bail with no
 *     DOM mutation; Webflow's conditional visibility correctly hides the
 *     paywall on its own.
 *
 *   - GATE — show the pause variant only if
 *     `paused-subscription.activeMemberHasAccess` is true (member holds
 *     `pln_abonnement-en-pause-1l4n0en2`, attached by Make scenario 5324511
 *     during the pause flow).
 *
 *   - FALLBACK — if `ms_groups` isn't yet in localStorage (auth in flight)
 *     fall back to `metaData['pause-end-date']`. Defensive only — Webflow's
 *     gate is the real source of truth for visibility.
 *
 * No more `.w-condition-invisible` class stripping. Paused members now lose
 * `premium-pages` access at the Memberstack-plan level, so Webflow shows
 * the paywall on its own. This script only swaps the inner card content.
 *
 * Must run BEFORE iframe-handler.js so its init clones the updated paywall
 * (with pause message) into .pathologies_tab_col-right. Loaded as a
 * pre-Tier-2 step by loader.js.
 *
 * Depends on: memberstack-utils.js (window.OrdoMemberstack)
 */
(function() {
    'use strict';

    var PREFIX = '[PausePaywall]';

    function readGroups() {
        try {
            var raw = localStorage.getItem('ms_groups');
            if (!raw) return [];
            var arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function findGroup(groups, key) {
        for (var i = 0; i < groups.length; i++) {
            if (groups[i] && groups[i].key === key) return groups[i];
        }
        return null;
    }

    function init() {
        var ms = window.OrdoMemberstack;
        if (!ms) return;

        var groups = readGroups();

        // Short-circuit: member has premium-pages access via ANOTHER plan
        // (resident, special offer, module-paid, …). Pause variant must not
        // appear — they keep full premium access.
        var premium = findGroup(groups, 'premium-pages');
        if (premium && premium.activeMemberHasAccess) return;

        // Gate: member is currently paused per Memberstack groups.
        var pausedGroup = findGroup(groups, 'paused-subscription');
        var isPaused = !!(pausedGroup && pausedGroup.activeMemberHasAccess);

        // Fallback for pre-auth / pre-backfill: rely on the existing
        // metaData signal. Once auth resolves and ms_groups populates, the
        // next page load uses the canonical signal.
        var endDate = null;
        var pauseEndDate = ms.metaData && ms.metaData['pause-end-date'];
        if (pauseEndDate) {
            var d = new Date(pauseEndDate);
            if (!isNaN(d.getTime()) && d > new Date()) endDate = d;
        }
        if (!isPaused && !endDate) return;

        var inners = document.querySelectorAll('.rc_hidden_warning_wrapper .rc_premium_hidden_warning');
        if (!inners.length) {
            console.warn(PREFIX, 'No paywall inner containers found');
            return;
        }

        // Render the pause card. Include the resume date only when a valid
        // future pause-end-date is in metaData; otherwise drop to a generic
        // line so a paused member without metaData still gets the message.
        var dateLine = endDate
            ? 'Reprise automatique le <span class="text-weight-semibold">' +
              endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) +
              '</span>.'
            : 'Reprenez votre abonnement pour retrouver l\'accès.';

        var html =
            '<div class="paywall_card">' +
              '<div class="w-layout-grid grid-1col-1rem left-align">' +
                '<h2 class="heading-h2-docs text-weight-medium">Votre abonnement est en pause</h2>' +
                '<div class="text-size-regular text-color-base-600">' + dateLine + '</div>' +
                '<div class="text-size-small text-color-base-600">' +
                  'Pour retrouver l\'accès immédiatement, reprenez votre abonnement.' +
                '</div>' +
                '<div>' +
                  '<a href="/membership/compte#abonnements" class="button is-gradient w-button">Reprendre mon abonnement</a>' +
                '</div>' +
              '</div>' +
            '</div>';

        inners.forEach(function(el) { el.innerHTML = html; });
        console.log(PREFIX, 'Swapped', inners.length, 'paywall(s) to pause variant — gate:',
            isPaused ? 'paused-subscription group' : 'pause-end-date fallback',
            endDate ? '(date: ' + endDate.toISOString().split('T')[0] + ')' : '(no date)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
