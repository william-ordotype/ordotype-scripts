/**
 * Ordotype Offre Annulation - Loader
 * Loads all scripts in correct order for the cancellation retention offer page.
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/offre-annulation/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoOffreAnnulation]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Scripts to load in order
    const scripts = [
        'shared/opacity-reveal.js',
        'offre-annulation/countdown.js',
        'shared/redeem-cancel-forms.js'
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

    async function init() {
        console.log(PREFIX, 'Loading scripts...');

        try {
            // Load shared utilities first
            await loadScript(`${BASE}/shared/memberstack-utils.js`);
            await loadScript(`${BASE}/shared/error-reporter.js`);

            for (const file of scripts) {
                await loadScript(`${BASE}/${file}`);
            }
            console.log(PREFIX, 'All scripts loaded');
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    // Wait for DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
