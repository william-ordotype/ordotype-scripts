/**
 * Ordotype - Pause Confirmation
 * Runs on /membership/abonnement-en-pause after a successful pause.
 *
 * - Sets justPaidTs (2-min grace period) so homepage member-redirects.js
 *   doesn't react to the just-canceled Stripe sub.
 * - Runs the #countdown UI then redirects to homepage.
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/abonnement-en-pause/confirmation.js"></script>
 */
(function() {
    'use strict';

    var PREFIX = '[PauseConfirm]';
    var COUNTDOWN_SECONDS = 2;
    var REDIRECT_URL = '/';

    try { localStorage.setItem('justPaidTs', Date.now()); } catch (e) {}

    function startCountdown(seconds, redirectUrl) {
        var countdownEl = document.getElementById('countdown');
        var labelEl = document.getElementById('label');

        function updateDisplay(sec) {
            if (countdownEl) countdownEl.textContent = sec;
            if (labelEl) labelEl.textContent = sec <= 1 ? 'seconde' : 'secondes';
        }

        updateDisplay(seconds);

        var interval = setInterval(function() {
            seconds -= 1;
            if (seconds >= 0) updateDisplay(seconds);
            if (seconds === 0) {
                clearInterval(interval);
                console.log(PREFIX, 'Redirecting to:', redirectUrl);
                window.location.href = redirectUrl;
            }
        }, 1000);
    }

    function init() {
        startCountdown(COUNTDOWN_SECONDS, REDIRECT_URL);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
