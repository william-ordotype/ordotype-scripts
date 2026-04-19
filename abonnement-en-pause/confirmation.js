/**
 * Ordotype - Pause Confirmation
 * Runs on /membership/abonnement-en-pause after a successful pause.
 *
 * - Sets justPaidTs (2-min grace period) so homepage member-redirects.js
 *   doesn't react to the just-canceled Stripe sub.
 * - Injects the pause end date into any element with [data-pause-end-date].
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/abonnement-en-pause/confirmation.js"></script>
 */
(function() {
    'use strict';

    var PREFIX = '[PauseConfirm]';

    try { localStorage.setItem('justPaidTs', Date.now()); } catch (e) {}

    function init() {
        try {
            var raw = localStorage.getItem('_ms-mem');
            if (!raw) return;
            var member = JSON.parse(raw) || {};
            var meta = member.metaData || {};
            var endDate = meta['pause-end-date'];
            if (!endDate) return;
            var d = new Date(endDate);
            if (isNaN(d.getTime())) return;
            var formatted = d.toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
            var targets = document.querySelectorAll('[data-pause-end-date]');
            for (var i = 0; i < targets.length; i++) {
                targets[i].textContent = formatted;
            }
            console.log(PREFIX, 'Pause end date:', formatted);
        } catch (e) {
            console.warn(PREFIX, e.message);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
