/**
 * Ordotype - Session Stats Display
 * Shows the user's GA4 session count on the cancellation page (only if > threshold).
 *
 * Reads from localStorage cache populated by account/session-stats-prefetch.js
 * on /membership/compte. Falls back to live fetch if cache is missing/stale.
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
    var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/session-count';
    var CACHE_KEY = 'ordo_session_stats';
    var CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
    var MIN_SESSIONS = 18;

    function render(sessions) {
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
    }

    function readCache(memberId) {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            if (!entry || entry.memberId !== memberId) return null;
            if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
            return entry.sessions;
        } catch (e) {
            return null;
        }
    }

    function writeCache(memberId, sessions) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                memberId: memberId,
                sessions: sessions,
                ts: Date.now()
            }));
        } catch (e) {}
    }

    function init() {
        var memberId = window.OrdoMemberstack && window.OrdoMemberstack.memberId;
        if (!memberId) {
            console.log(PREFIX, 'No member ID, skipping');
            return;
        }

        var cached = readCache(memberId);
        if (cached !== null) {
            console.log(PREFIX, 'Using cached sessions:', cached);
            render(cached);
            return;
        }

        fetch(API_URL + '?member_id=' + encodeURIComponent(memberId))
            .then(function(res) { return res.json(); })
            .then(function(data) {
                render(data.sessions);
                if (typeof data.sessions === 'number') {
                    writeCache(memberId, data.sessions);
                }
            })
            .catch(function(err) {
                console.warn(PREFIX, 'Failed to load session data:', err.message);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
