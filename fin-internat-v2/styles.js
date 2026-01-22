/**
 * Ordotype Fin Internat V2 - Styles
 * Injects custom CSS for the page
 *
 * Can be loaded in header or footer
 */
(function() {
    'use strict';

    const css = `
.heading-style-h3 b {
    font-weight: 600;
}
`;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    console.log('[FinInternatV2Styles] Styles injected');
})();
