/**
 * Ordotype - Resume Confirmation
 * Runs on /membership/abonnement-repris after a successful resume.
 *
 * - Sets justPaidTs (2-min grace period) so homepage member-redirects.js
 *   doesn't react to Memberstack state that hasn't re-synced yet.
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/abonnement-repris/confirmation.js"></script>
 */
(function() {
    'use strict';

    var PREFIX = '[ResumeConfirm]';

    try { localStorage.setItem('justPaidTs', Date.now()); } catch (e) {}

    console.log(PREFIX, 'Grace period set');
})();
