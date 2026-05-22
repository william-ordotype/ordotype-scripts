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

    // Reveal as soon as the DOM is parsed. By then the global-utils.js rich
    // text decoder (a defer script, guaranteed by spec to run before
    // DOMContentLoaded) has already prettified the content, so there's no
    // flash of escaped HTML. Previously this waited for window.load, which
    // held content invisible for several seconds on slow connections while it
    // waited on images/iframes the text doesn't need.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
