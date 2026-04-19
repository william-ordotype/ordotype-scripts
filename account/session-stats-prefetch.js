/**
 * Ordotype Account - Session Stats Prefetch
 * Pre-fetches the user's GA4 session count on /membership/compte and caches
 * it in localStorage so /membership/offre-annulation can render instantly.
 *
 * Cache key: ordo_session_stats
 * Cache shape: { memberId, sessions, ts }
 *
 * Requires: window.OrdoMemberstack (memberstack-utils.js loaded first)
 */
(function() {
    'use strict';

    var PREFIX = '[SessionStatsPrefetch]';
    var API_URL = 'https://memberstack-webhooks.netlify.app/.netlify/functions/session-count';
    var CACHE_KEY = 'ordo_session_stats';

    function init() {
        var memberId = window.OrdoMemberstack && window.OrdoMemberstack.memberId;
        if (!memberId) {
            console.log(PREFIX, 'No member ID, skipping prefetch');
            return;
        }

        fetch(API_URL + '?member_id=' + encodeURIComponent(memberId))
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (typeof data.sessions !== 'number') return;
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        memberId: memberId,
                        sessions: data.sessions,
                        ts: Date.now()
                    }));
                    console.log(PREFIX, 'Cached sessions:', data.sessions);
                } catch (e) {
                    console.warn(PREFIX, 'localStorage write failed:', e.message);
                }
            })
            .catch(function(err) {
                console.warn(PREFIX, 'Prefetch failed:', err.message);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
