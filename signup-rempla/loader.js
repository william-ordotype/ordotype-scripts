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

    const PREFIX = '[OrdoSignupRempla]';
    console.log(PREFIX, 'Loader script executing...');

    // Base URL
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla';

    // Scripts to load (in order)
    const scripts = [
        'core.js',
        'stripe-checkout.js'
    ];

    // Load a single script
    function loadScript(url) {
        console.log(PREFIX, 'Loading script:', url);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                console.log(PREFIX, 'Successfully loaded:', url);
                resolve();
            };
            script.onerror = () => {
                console.error(PREFIX, 'Failed to load:', url);
                reject(new Error(`Failed to load: ${url}`));
            };
            document.head.appendChild(script);
        });
    }

    // Load all scripts in order
    async function loadAll() {
        console.log(PREFIX, 'Starting to load all scripts...');

        try {
            for (const file of scripts) {
                await loadScript(`${BASE}/${file}`);
            }
            console.log(PREFIX, 'All scripts loaded successfully');
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    loadAll();
})();
