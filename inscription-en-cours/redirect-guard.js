/**
 * Redirect Guard for Inscription En Cours
 * Redirects non-logged users to /nos-offres
 * Must be loaded in header (blocking)
 */
(function() {
    const memData = JSON.parse(localStorage.getItem('_ms-mem') || '{}');

    if (!memData.id) {
        window.location.replace('/nos-offres');
    }
})();
