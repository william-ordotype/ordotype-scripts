/**
 * Ordotype Inscription - Background Handler
 * Adds background class for non-logged users.
 *
 * Adds 'background-avif' class to body if user is not logged in (no _ms-mem in localStorage).
 */
(function() {
    'use strict';

    const PREFIX = '[BackgroundHandler]';

    function init() {
        if (!localStorage.getItem('_ms-mem')) {
            document.body.classList.add('background-avif');
            console.log(PREFIX, 'Added background-avif class');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
