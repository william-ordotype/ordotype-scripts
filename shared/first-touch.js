/**
 * Ordotype - First Touch Attribution (Shared, site-wide)
 *
 * Records the very first page a visitor ever lands on (localStorage), then
 * copies it ONCE to the member's Memberstack custom fields after signup.
 * Answers "which page recruited this account?" (e.g. /tools/amt) — GA4 can't,
 * because signup usually happens in a later brand/direct session.
 *
 * Custom fields written (must exist in the Memberstack dashboard):
 *   first-landing  — pathname+query of the first page ever visited
 *   first-date     — ISO timestamp of that first visit
 *   first-referrer — referrer hostname of that first visit ("" = direct)
 *
 * Attribution guard: fields are only written if the account was created AFTER
 * the recorded first visit (48h clock-skew margin). An existing member opening
 * a new browser is never (re)attributed. Fields are never overwritten.
 *
 * Usage in Webflow site-wide footer custom code (pin to a commit):
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@<commit>/shared/first-touch.js"></script>
 */
(function() {
    'use strict';

    var PREFIX = '[FirstTouch]';
    var KEY = 'ordo_first_touch';
    var SYNCED_KEY = 'ordo_first_touch_synced';
    var CLOCK_SKEW_MS = 48 * 3600 * 1000;
    var MAX_ATTEMPTS = 50; // 50 * 200ms = 10s max wait for the Memberstack SDK

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function safeSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }

    // --- 1. Record the first touch (runs immediately, before any await) ---

    if (!safeGet(KEY)) {
        var referrerHost = '';
        try { referrerHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
        // Ignore internal navigation showing up as referrer on the recording page
        if (referrerHost === location.hostname) referrerHost = '';

        safeSet(KEY, JSON.stringify({
            landing: (location.pathname + location.search).slice(0, 255),
            referrer: referrerHost.slice(0, 100),
            date: new Date().toISOString()
        }));
    }

    // --- 2. Copy to the member once, after signup ---

    // Cheap pre-check: skip the SDK wait entirely for anonymous visitors
    // (the vast majority of loads). _ms-mem only exists for logged-in members.
    if (safeGet(SYNCED_KEY) || !safeGet(KEY) || !safeGet('_ms-mem')) return;

    function sync() {
        var memberstack = window.$memberstackDom;
        if (!memberstack) return;

        var firstTouch;
        try { firstTouch = JSON.parse(safeGet(KEY)); } catch (e) { return; }
        if (!firstTouch || !firstTouch.landing || !firstTouch.date) return;

        memberstack.getCurrentMember().then(function(result) {
            var member = result && result.data ? result.data : result;
            // Logged out (stale _ms-mem, post-checkout session loss…): retry on a later load
            if (!member || !member.id) return;

            // Already attributed (this browser or another device) — never overwrite
            if (member.customFields && member.customFields['first-landing']) {
                safeSet(SYNCED_KEY, '1');
                return;
            }

            // Account older than this browser's first visit = existing member on a
            // new device, not an acquisition — mark done without writing.
            var createdAt = member.createdAt ? new Date(member.createdAt).getTime() : null;
            var firstTouchTime = new Date(firstTouch.date).getTime();
            if (createdAt && !isNaN(firstTouchTime) && createdAt < firstTouchTime - CLOCK_SKEW_MS) {
                safeSet(SYNCED_KEY, '1');
                return;
            }

            memberstack.updateMember({
                customFields: {
                    'first-landing': firstTouch.landing,
                    'first-date': firstTouch.date,
                    'first-referrer': firstTouch.referrer || ''
                }
            }).then(function() {
                safeSet(SYNCED_KEY, '1');
                console.log(PREFIX, 'Attributed account to', firstTouch.landing);
            }).catch(function(err) {
                var msg = (err && err.message) ? String(err.message) : String(err);
                // Expired session token: expected edge case (e.g. post-checkout
                // return on iOS Safari) — retry silently on a later page load.
                if (/unauthor/i.test(msg)) {
                    console.warn(PREFIX, 'Sync skipped — Memberstack session expired');
                    return;
                }
                console.error(PREFIX, 'Sync error:', msg);
                if (window.OrdoErrorReporter) {
                    window.OrdoErrorReporter.report('FirstTouch', msg);
                }
            });
        }).catch(function(err) {
            console.warn(PREFIX, 'Failed to get current member:', err);
        });
    }

    var attempts = 0;
    function waitForMemberstack() {
        if (window.$memberstackDom) {
            sync();
        } else if (attempts < MAX_ATTEMPTS) {
            attempts++;
            setTimeout(waitForMemberstack, 200);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForMemberstack);
    } else {
        waitForMemberstack();
    }
})();
