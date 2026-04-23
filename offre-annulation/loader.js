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

    // Auto-detect loader's own commit/ref so sub-scripts load from the same
    // pinned version (sidesteps stale jsDelivr @main caches).
    function detectVersion() {
        const list = document.getElementsByTagName('script');
        for (let i = 0; i < list.length; i++) {
            const src = list[i].src || '';
            if (src.indexOf('/offre-annulation/loader.js') === -1) continue;
            const m = src.match(/ordotype-scripts@([^\/]+)\//);
            if (m) return m[1];
        }
        return 'main';
    }
    const VERSION = detectVersion();
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION;

    // Scripts to load in order
    const scripts = [
        'shared/opacity-reveal.js',
        'shared/countdown.js',
        'offre-annulation/session-stats.js',
        'offre-annulation/pause-form.js',
        'shared/redeem-cancel-forms.js',
        'shared/tracking-churn-offers.js'
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

        // Set countdown storage key (preserve existing key for this page)
        window.COUNTDOWN_CONFIG = { storageKey: 'countdownDateTime' };

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
