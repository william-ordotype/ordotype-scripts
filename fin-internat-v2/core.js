/**
 * Ordotype Fin Internat V2 - Core
 * Stores URL for tracking and sets grace period to prevent redirect loops
 */
(function() {
    'use strict';

    const PREFIX = '[FinInternatV2Core]';

    // Store current URL for tracking
    localStorage.setItem('locat', location.href);

    // Set grace period to prevent payment redirect loops
    // This prevents member-redirects.js from redirecting back during checkout flow
    localStorage.setItem('justPaidTs', Date.now());
    setTimeout(() => localStorage.removeItem('justPaidTs'), 120000);

    console.log(PREFIX, 'Core initialized, grace period set');
})();
