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
        body > .page-wrapper {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        body > .page-wrapper > .main-wrapper {
            flex: 1 0 auto;
        }
        body > .page-wrapper > .footer_component {
            flex-shrink: 0;
        }
    `;
    document.head.appendChild(style);
})();
