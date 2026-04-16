/**
 * Ordotype - Session Stats Display
 * Fetches pre-computed session counts from CDN and displays the user's
 * monthly sessions on the cancellation page (only if > 50).
 *
 * Requires: window.OrdoMemberstack (memberstack-utils.js loaded first)
 *
 * Expected DOM element:
 * <div id="session-stats" style="display:none;">
 *   Vous avez utilisé Ordotype <strong id="session-count">0</strong> fois le mois dernier.
 * </div>
 */
(function() {
    'use strict';

    var PREFIX = '[SessionStats]';
    var DATA_URL = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/offre-annulation/data/sessions.json';
    var MIN_SESSIONS = 50;

    function init() {
        var memberId = window.OrdoMemberstack && window.OrdoMemberstack.memberId;
        if (!memberId) {
            console.log(PREFIX, 'No member ID, skipping');
            return;
        }

        fetch(DATA_URL + '?v=' + Date.now())
            .then(function(res) { return res.json(); })
            .then(function(data) {
                var sessions = data[memberId];
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
