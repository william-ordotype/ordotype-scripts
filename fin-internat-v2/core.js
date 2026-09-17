/**
 * Ordotype Fin Internat V2 - Core
 * Stores URL for tracking, marks the offer page as seen and watches the offer buttons.
 */
(function() {
    'use strict';

    var PREFIX = '[FinInternatV2Core]';
    var ms = window.OrdoMemberstack;

    // Store current URL for tracking
    try {
        localStorage.setItem('locat', location.href);
    } catch (e) {
        console.warn(PREFIX, 'localStorage not available:', e.message);
    }

    function report(message) {
        console.error(PREFIX, message);
        if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('FinInternatV2Core', message);
    }

    if (!ms || typeof ms.watchFinInternatActions !== 'function') {
        report('OrdoMemberstack end-of-internship helpers missing');
        return;
    }

    ms.markFinInternatSeen();

    // Offer buttons, as configured by loader.js for stripe-checkout.js.
    var config = window.STRIPE_CHECKOUT_CONFIG || {};
    var buttonIds = [config.btnNoStripeId, config.btnStripeId].filter(Boolean);
    if (buttonIds.length !== 2) report('Offer button ids missing from STRIPE_CHECKOUT_CONFIG');
    ms.watchFinInternatActions(document, buttonIds);

    console.log(PREFIX, 'Core initialized');
})();
