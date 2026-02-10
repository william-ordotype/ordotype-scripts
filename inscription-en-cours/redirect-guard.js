/**
 * Redirect Guard for Inscription En Cours
 * Redirects non-logged users to /nos-offres
 * Must be loaded in header (blocking)
 */
(function() {
    var memberId = null;
    try {
        var raw = localStorage.getItem('_ms-mem');
        if (raw) {
            var memData = JSON.parse(raw);
            memberId = memData && memData.id;
        }
    } catch (e) {}

    if (!memberId) {
        window.location.replace('/nos-offres');
    }
})();
