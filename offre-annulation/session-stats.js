/**
 * Ordotype - Session Stats Display (Real-time)
 * Calls the Netlify function to get the current user's GA4 session count
 * and displays it on the cancellation page (only if > 50).
 *
 * Requires: window.OrdoMemberstack (memberstack-utils.js loaded first)
 *
 * Expected DOM element (HTML embed in Webflow):
 * <div id="session-stats" style="display:none;">
 *   Vous avez utilisé Ordotype <strong id="session-count">0</strong> fois le mois dernier.
 * </div>
 */
(function() {
    'use strict';

    var PREFIX = '[SessionStats]';
    var API_URL = 'https://ordotype-webhooks.netlify.app/.netlify/functions/session-count';
    var MIN_SESSIONS = 50;

    function init() {
        var memberId = window.OrdoMemberstack && window.OrdoMemberstack.memberId;
        if (!memberId) {
            console.log(PREFIX, 'No member ID, skipping');
            return;
        }

        fetch(API_URL + '?member_id=' + encodeURIComponent(memberId))
            .then(function(res) { return res.json(); })
            .then(function(data) {
                var sessions = data.sessions;
                if (!sessions || sessions < MIN_SESSIONS) {
                    console.log(PREFIX, 'Sessions below threshold or not found:', sessions || 0);
                    return;
                }

                var container = document.getElementById('session-stats');
                var countEl = document.getElementById('session-count');

                if (container && countEl) {
                    countEl.textContent = sessions;
                    container.style.display = 'block';
                    console.log(PREFIX, 'Displaying sessions:', sessions);
                }
            })
            .catch(function(err) {
                console.warn(PREFIX, 'Failed to load session data:', err.message);
            });
    }

    // Run after Memberstack utils are loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
