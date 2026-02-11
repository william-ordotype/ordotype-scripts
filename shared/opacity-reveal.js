/**
 * Ordotype Shared - Opacity Reveal
 * Reveals elements by setting opacity to 1 on page load.
 *
 * Configuration via window.OPACITY_REVEAL_CONFIG (optional):
 * - selectors: Array of CSS selectors to reveal (default: ['#js-clock'])
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
    const DEFAULT_SELECTORS = ['#js-clock'];

    function init() {
        const config = window.OPACITY_REVEAL_CONFIG || {};
        const selectors = config.selectors || DEFAULT_SELECTORS;

        const elements = document.querySelectorAll(selectors.join(', '));

        if (elements.length > 0) {
            elements.forEach(function(el) {
                setTimeout(function() {
                    el.style.opacity = '1';
                }, 50);
            });
            console.log(PREFIX, 'Revealed', elements.length, 'element(s)');
        } else {
            console.warn(PREFIX, 'No elements found for selectors:', selectors);
        }
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
