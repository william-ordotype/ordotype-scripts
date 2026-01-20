/**
 * Probleme de Paiement CB - Loader
 * Loads shared stripe-setup-session.js with Card + SEPA config.
 * This is the CB (Card) variant offering both card and SEPA payment methods.
 *
 * Note: access-guard.js from probleme-de-paiement must be loaded separately
 * in the header (blocking) for access control to work before page renders.
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement-cb/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoProblemePaiementCB]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Store URL for tracking
    localStorage.setItem('locat', location.href);

    // Set config for shared stripe-setup-session.js
    window.STRIPE_SETUP_CONFIG = {
        btnNoStripeId: 'setupBtnNoStripeId',
        btnStripeId: 'setupBtnStripeId',
        successUrl: window.location.origin + '/membership/moyen-de-paiement-ajoute',
        cancelUrl: window.location.href,
        paymentMethods: ['card', 'sepa_debit'],
        option: 'setup-probleme-paiement-cb'
    };

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
        console.log(PREFIX, 'Loading...');

        try {
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
