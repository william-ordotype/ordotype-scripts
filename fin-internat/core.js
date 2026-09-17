/**
 * Ordotype Fin Internat - Core
 * Stores URL for tracking, marks the offer page as seen and watches the offer buttons.
 */
(function() {
    'use strict';

    var PREFIX = '[FinInternatCore]';
    var ms = window.OrdoMemberstack;

    // Store current URL for tracking
    try {
        localStorage.setItem('locat', location.href);
    } catch (e) {
        console.warn(PREFIX, 'localStorage not available:', e.message);
    }

    if (!ms || typeof ms.watchFinInternatActions !== 'function') {
        console.error(PREFIX, 'OrdoMemberstack end-of-internship helpers missing');
        if (window.OrdoErrorReporter) {
            window.OrdoErrorReporter.report('FinInternatCore', 'OrdoMemberstack end-of-internship helpers missing');
        }
        return;
    }

    ms.markFinInternatSeen();
    ms.watchFinInternatActions(document);

    console.log(PREFIX, 'Core initialized');
})();
