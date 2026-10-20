/**
 * Moyen de Paiement - Loader
 * Loads shared stripe-setup-session.js with SEPA config.
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
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Store URL for tracking
    localStorage.setItem('locat', location.href);

    // Page vue : l'accueil et les fiches ne renvoient plus ici pendant 24 h. Repère
    // « id du membre:horodatage », lu par isPaymentPageSeenRecently
    // (shared/memberstack-utils.js) : sur un poste partagé, un autre membre n'en
    // hérite pas. Plus de `justPaidTs` à l'affichage (20/10/2026) : afficher cette
    // page n'est pas un paiement, et il masquait le bandeau « paiement échoué »
    // pendant 24 h. La page de succès (moyen-de-paiement-ajoute) le pose.
    try {
        var cachedMember = JSON.parse(localStorage.getItem('_ms-mem') || 'null');
        var cachedMemberId = cachedMember && (cachedMember.id || cachedMember.userId);
        if (cachedMemberId) localStorage.setItem('paymentPageSeenTs', cachedMemberId + ':' + Date.now());
    } catch (e) {}

    // Set config for shared stripe-setup-session.js
    window.STRIPE_SETUP_CONFIG = {
        btnNoStripeId: 'setupBtnNoStripeId',
        btnStripeId: 'setupBtnStripeId',
        successUrl: window.location.origin + '/membership/moyen-de-paiement-ajoute',
        cancelUrl: window.location.href,
        paymentMethods: ['sepa_debit'],
        option: 'setup-sepa'
    };

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

    async function init() {
        console.log(PREFIX, 'Loading...');

        try {
            // Load shared utilities first
            await loadScript(`${BASE}/shared/memberstack-utils.js`);
            await loadScript(`${BASE}/shared/error-reporter.js`);

            await loadScript(`${BASE}/shared/stripe-setup-session.js`);
            console.log(PREFIX, 'All scripts loaded');
        } catch (err) {
            console.error(PREFIX, 'Load error:', err);
        }
    }

    // Wait for DOMContentLoaded to ensure config is set
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
