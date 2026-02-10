/**
 * Ordotype Inscription - Loader
 * Loads all inscription page scripts in the correct order.
 *
 * Usage in Webflow:
 *
 * <script>
 * // CMS config for localStorage
 * window.INSCRIPTION_CONFIG = {
 *     comment: "{{wf commentaire}}",
 *     typeDeCompte: "{{wf type-de-compte}}",
 *     partnershipCity: "{{wf partnership-city}}",
 *     dureeOffre: "{{wf duree-de-l-offre-en-mois}}"
 * };
 * </script>
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription/loader.js"></script>
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoInscription]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Scripts to load in order
    const scripts = [
        'inscription/background-handler.js',
        'inscription/date-french.js'
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

    function init() {
        const config = window.INSCRIPTION_CONFIG || {};

        // Store in localStorage
        localStorage.setItem('locat', location.href);

        if (config.comment) {
            localStorage.setItem('signup-comment', config.comment);
        }
        if (config.typeDeCompte) {
            localStorage.setItem('signup-type-de-compte', config.typeDeCompte);
        }
        if (config.partnershipCity) {
            localStorage.setItem('signup-partnership-city', config.partnershipCity);
        }
        if (config.dureeOffre) {
            localStorage.setItem('signup-duree-offre', config.dureeOffre);
        }

        console.log(PREFIX, 'Config stored in localStorage');

        // Load scripts in order
        (async () => {
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
        })();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
