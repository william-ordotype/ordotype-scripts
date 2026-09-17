/**
 * Ordotype Fin Internat - Core
 * Stores URL for tracking, marks the page as seen, sets the grace period on action.
 */
(function() {
    'use strict';

    const PREFIX = '[FinInternatCore]';
    // Reduce offer, and both upgrade buttons (Memberstack native and Stripe customer).
    const ACTION_IDS = ['signup-rempla-from-decouverte', 'signup-rempla-stripe-customer'];
    const ACTION_ATTRIBUTES = ['data-ms-plan:add', 'data-ms-price:add'];

    function isAction(el) {
        for (; el && el.nodeType === 1; el = el.parentElement) {
            if (ACTION_IDS.indexOf(el.id) !== -1) return true;
            if (ACTION_ATTRIBUTES.some(function(name) { return el.hasAttribute(name); })) return true;
        }
        return false;
    }

    function store(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn(PREFIX, 'localStorage not available:', e.message);
        }
    }

    // Store current URL for tracking
    store('locat', location.href);

    // Page seen: member-redirects.js sends here at most once every 24 h.
    store('finInternatSeenTs', Date.now());

    // Grace period only once the member acts, so the plan change has time to sync
    // before member-redirects.js and fin-internat-paywall.js read it.
    document.addEventListener('click', function(event) {
        if (isAction(event.target)) store('justPaidTs', Date.now());
    }, true);

    console.log(PREFIX, 'Core initialized');
})();
