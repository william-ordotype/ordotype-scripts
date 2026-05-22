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

    // Choose when to reveal. Default 'load' preserves the original behavior
    // for pages whose revealed elements are filled by a later script (e.g.
    // the inscription-offre-speciale countdown), which need the element
    // populated before it appears. Pages can opt into 'domcontentloaded' via
    // OPACITY_REVEAL_CONFIG.trigger to reveal as soon as the DOM is parsed.
    const trigger = (window.OPACITY_REVEAL_CONFIG || {}).trigger === 'domcontentloaded'
        ? 'domcontentloaded'
        : 'load';

    if (trigger === 'domcontentloaded') {
        // Reveal as soon as the DOM is parsed. Used by the pathology page,
        // where the content masked by opacity:0 is decoded by global-utils.js
        // — a defer script guaranteed by spec to run before DOMContentLoaded —
        // so there's no flash of escaped HTML. Waiting for window.load held
        // content invisible for several seconds on slow connections while it
        // waited on images/iframes the text doesn't need.
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    } else {
        if (document.readyState === 'complete') {
            init();
        } else {
            window.addEventListener('load', init);
        }
    }
})();
