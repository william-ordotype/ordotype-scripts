/**
 * Ordotype Homepage - Pause Banner
 * If the member has a paused subscription, hides the "canceled" banner
 * and shows a pause-specific banner with the resume date.
 *
 * Depends on: memberstack-utils.js (window.OrdoMemberstack)
 *
 * Expected DOM (Webflow):
 *   - #banner-to-hide-canceled (existing "Votre abonnement est terminé" banner)
 *   - #pause-banner (hidden by default, class="hidden")
 *   - #pause-banner-date (text span for formatted resume date)
 */
(function() {
    'use strict';

    var PREFIX = '[PauseBanner]';

    function init() {
        var ms = window.OrdoMemberstack;
        if (!ms || !ms.metaData) {
            return;
        }

        var pauseEndDate = ms.metaData['pause-end-date'];
        if (!pauseEndDate) {
            return;
        }

        var endDate = new Date(pauseEndDate);
        if (isNaN(endDate.getTime()) || endDate <= new Date()) {
            return;
        }

        var formattedDate = endDate.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        var canceledStyle = document.createElement('style');
        canceledStyle.textContent = '#banner-to-hide-canceled { display: none !important; }';
        document.head.appendChild(canceledStyle);
        var canceled = document.getElementById('banner-to-hide-canceled');
        if (canceled) canceled.remove();

        var banner = document.getElementById('pause-banner');
        var dateEl = document.getElementById('pause-banner-date');

        if (!banner) {
            console.warn(PREFIX, 'No #pause-banner found in DOM');
            return;
        }

        if (dateEl) dateEl.textContent = formattedDate;

        banner.classList.remove('hidden');
        banner.style.display = '';
        console.log(PREFIX, 'Showing pause banner, resume date:', formattedDate);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
