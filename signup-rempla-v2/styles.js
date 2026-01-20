/**
 * Custom Styles for Signup Rempla V2
 * Injects CSS to fix font-size inheritance for strong elements
 * Must be loaded in header to prevent FOUC
 */
(function() {
    const style = document.createElement('style');
    style.textContent = `
        .text-size-regular strong {
            font-size: inherit;
        }
        .text-size-body2 strong {
            font-size: inherit;
        }
    `;
    document.head.appendChild(style);
})();
