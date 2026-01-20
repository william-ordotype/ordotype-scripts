/**
 * Ordotype Signup Rempla V2 - Loader
 * Loads all signup rempla v2 page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla-v2/loader.js"></script>
 *
 * Note: geo-redirect.js and styles.js must be loaded
 * separately in the header (before page renders) for redirects and styles to work
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoSignupRemplaV2]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla-v2';

    const scripts = [
        'core.js',
        'stripe-checkout.js'
    ];

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function loadAll() {
        try {
            for (const file of scripts) {
                await loadScript(`${BASE}/${file}`);
            }
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    loadAll();
})();
