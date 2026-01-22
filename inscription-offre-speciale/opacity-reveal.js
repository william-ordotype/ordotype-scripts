/**
 * Ordotype Inscription Offre Speciale - Opacity Reveal
 * Reveals the countdown clock by setting opacity to 1.
 *
 * Required CSS (add to Webflow header):
 * <style>
 * #js-clock {
 *     opacity: 0;
 *     transition: opacity 450ms;
 * }
 * </style>
 */
(function() {
    'use strict';

    const PREFIX = '[OpacityReveal]';

    function init() {
        const clock = document.getElementById('js-clock');

        if (clock) {
            setTimeout(function() {
                clock.style.opacity = '1';
            }, 50);
            console.log(PREFIX, 'Revealed #js-clock');
        } else {
            console.warn(PREFIX, '#js-clock not found');
        }
    }

    window.addEventListener('load', init);
})();
