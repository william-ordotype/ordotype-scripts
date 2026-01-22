/**
 * Ordotype Inscription Offre Speciale - Not Connected Handler
 * Handles switching between connected/not-connected page views.
 *
 * Required DOM elements:
 * - #not-connected-animation - Button to trigger the switch
 * - #page-wrapper-connected - Container for connected users
 * - #page-wrapper-not-connected - Container for non-connected users
 *
 * Also handles URL hash #not-connected-animation to auto-trigger on load.
 */
(function() {
    'use strict';

    const PREFIX = '[NotConnectedHandler]';

    function handleNotConnected() {
        const connectedWrapper = document.getElementById('page-wrapper-connected');
        const notConnectedWrapper = document.getElementById('page-wrapper-not-connected');

        if (connectedWrapper) connectedWrapper.style.display = 'none';
        if (notConnectedWrapper) notConnectedWrapper.style.display = 'block';

        window.scrollTo(0, 0);
        console.log(PREFIX, 'Switched to not-connected view');
    }

    function init() {
        const button = document.getElementById('not-connected-animation');

        if (button) {
            button.addEventListener('click', handleNotConnected);
        }

        // Check if URL hash triggers the switch
        if (window.location.hash === '#not-connected-animation') {
            handleNotConnected();
        }

        console.log(PREFIX, 'Initialized');
    }

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
