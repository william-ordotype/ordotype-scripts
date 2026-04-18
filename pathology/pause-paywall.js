/**
 * Ordotype Pathology - Pause Paywall
 * If the member has a paused subscription, replaces the inner content of
 * every .rc_hidden_warning_wrapper > .rc_premium_hidden_warning with a
 * pause-specific message and CTA to /membership/compte.
 *
 * Runs BEFORE iframe-handler.js so clones inherit the replaced content.
 *
 * Depends on: memberstack-utils.js (window.OrdoMemberstack)
 */
(function() {
    'use strict';

    var PREFIX = '[PausePaywall]';

    function init() {
        var ms = window.OrdoMemberstack;
        if (!ms || !ms.metaData) return;

        var pauseEndDate = ms.metaData['pause-end-date'];
        if (!pauseEndDate) return;

        var endDate = new Date(pauseEndDate);
        if (isNaN(endDate.getTime()) || endDate <= new Date()) return;

        var formattedDate = endDate.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        var html =
            '<div class="paywall_card">' +
              '<div class="w-layout-grid grid-1col-1rem left-align">' +
                '<h2 class="heading-h2-docs text-weight-medium">Votre abonnement est en pause</h2>' +
                '<div class="text-size-regular text-color-base-600">' +
                  'Reprise automatique le <span class="text-weight-semibold">' + formattedDate + '</span>.' +
                '</div>' +
                '<div class="text-size-small text-color-base-600">' +
                  'Pour retrouver l\'accès immédiatement, reprenez votre abonnement.' +
                '</div>' +
                '<div>' +
                  '<a href="/membership/compte" class="button is-gradient w-button">Reprendre mon abonnement</a>' +
                '</div>' +
              '</div>' +
            '</div>';

        var inners = document.querySelectorAll('.rc_hidden_warning_wrapper .rc_premium_hidden_warning');
        if (!inners.length) {
            console.warn(PREFIX, 'No paywall inner containers found');
            return;
        }
        inners.forEach(function(el) {
            el.innerHTML = html;
        });
        console.log(PREFIX, 'Replaced', inners.length, 'paywall(s) with pause message, resume date:', formattedDate);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
