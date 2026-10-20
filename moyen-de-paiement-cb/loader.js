/**
 * Moyen de Paiement CB - Loader
 * Loads shared stripe-setup-session.js with Card config.
 *
 * This is the B variant of the A/B test (card instead of SEPA).
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement-cb/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoMoyenPaiementCB]';
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';

    // Store URL for tracking
    localStorage.setItem('locat', location.href);

    // Page vue : l'accueil et les fiches ne renvoient plus ici pendant 24 h
    // (repère paymentPageSeenTs, voir homepage/member-redirects.js). Plus de
    // `justPaidTs` à l'affichage (20/10/2026) : afficher cette page n'est pas un
    // paiement, et il masquait le bandeau « paiement échoué » pendant 24 h. Il
    // reste posé au clic sur le bouton de paiement (shared/stripe-setup-session.js)
    // et sur la page de succès.
    try { localStorage.setItem('paymentPageSeenTs', String(Date.now())); } catch (e) {}

    // Set config for shared stripe-setup-session.js
    window.STRIPE_SETUP_CONFIG = {
        btnNoStripeId: 'setupBtnNoStripeId',
        btnStripeId: 'setupBtnStripeId',
        successUrl: window.location.origin + '/membership/moyen-de-paiement-ajoute',
        cancelUrl: window.location.href,
        paymentMethods: ['card', 'sepa_debit'],
        option: 'setup-card'
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
