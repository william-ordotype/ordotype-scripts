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
 *     dureeOffre: "{{wf duree-de-l-offre-en-mois}}",
 *     modeDexercice: "{{wf mode-dexercice}}",
 *     statut: "{{wf statut}}",
 *     specialite: "{{wf specialite > memberstack-custom-field-specialite}}"
 * };
 * </script>
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription/loader.js"></script>
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoInscription]';
    const DEFAULT_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Scripts are loaded from the same version as this loader: pinning its URL to a commit
    // (…/ordotype-scripts@<sha>/inscription/loader.js) pins every script it loads.
    function getBase() {
        const src = document.currentScript && document.currentScript.src;
        const match = src && src.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/william-ordotype\/ordotype-scripts@[^\/]+)\/inscription\/loader\.js/);
        return match ? match[1] : DEFAULT_BASE;
    }

    const BASE = getBase();

    // Scripts to load in order
    const scripts = [
        'inscription/background-handler.js',
        'inscription/date-french.js',
        'inscription/upgrade-fields.js'
    ];

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.crossOrigin = 'anonymous';
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    function init() {
        const config = window.INSCRIPTION_CONFIG;

        // Store in localStorage
        localStorage.setItem('locat', location.href);

        // Each key belongs to the offer on screen only: an offer without a value clears it,
        // so a value from a previously viewed offer page is never reused.
        if (config) {
            [
                ['signup-comment', config.comment],
                ['signup-type-de-compte', config.typeDeCompte],
                ['signup-partnership-city', config.partnershipCity],
                ['signup-duree-offre', config.dureeOffre],
                ['signup-mode-dexercice', config.modeDexercice],
                ['signup-statut', config.statut],
                ['signup-specialite', config.specialite]
            ].forEach(([key, value]) => {
                if (value) {
                    localStorage.setItem(key, value);
                } else {
                    localStorage.removeItem(key);
                }
            });
            console.log(PREFIX, 'Config stored in localStorage');
        }

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
