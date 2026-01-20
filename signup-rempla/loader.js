/**
 * Ordotype Signup Rempla - Loader
 * Loads all signup rempla page scripts in the correct order.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla/loader.js"></script>
 *
 * Note: ab-test.js, geo-redirect.js, and styles.js must be loaded
 * separately in the header (before page renders) for redirects and styles to work
 */
(function() {
    'use strict';

    // Base URL
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla';

    // Scripts to load (in order)
    const scripts = [
        'core.js',
        'stripe-checkout.js'
    ];

    // Load a single script
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    // Load all scripts in order
    async function loadAll() {
        console.log('[OrdoSignupRempla] Loading...');

        try {
            for (const file of scripts) {
                await loadScript(`${BASE}/${file}`);
            }
            console.log('[OrdoSignupRempla] All scripts loaded');
        } catch (err) {
            console.error('[OrdoSignupRempla] Load error:', err);
        }
    }

    loadAll();
})();
