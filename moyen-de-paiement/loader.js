/**
 * Moyen de Paiement - Loader
 * Loads all scripts for the payment method page.
 *
 * Note: ab-test.js must be loaded separately in the header (blocking)
 * for redirects to work before page renders.
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoMoyenPaiement]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement';

    // Store URL for tracking
    localStorage.setItem('locat', location.href);

    const scripts = [
        'setup-session.js'
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
        console.log(PREFIX, 'Loading...');

        try {
            for (const file of scripts) {
                await loadScript(`${BASE}/${file}`);
            }
            console.log(PREFIX, 'All scripts loaded');
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    loadAll();
})();
