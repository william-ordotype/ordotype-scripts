/**
 * Ordotype - Syndicats d'Internes Modal
 * Handles modal toggle (signup prompt), QR code display, and URL param triggers.
 *
 * Expected DOM IDs:
 *   #hideModal        – element shown by default (hidden when modal opens)
 *   #displayModal     – main signup modal (shown on toggle)
 *   #qrCodeModal      – QR-code modal (shown via ?showQR=true)
 *   #hideModalOnClick  – button that triggers the toggle
 *
 * URL params:
 *   ?openModal=true   – auto-opens signup modal for non-logged-in users
 *   ?showQR=true      – shows QR modal for all users (highest priority)
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/syndicats-dinternes/modal.js"></script>
 */
(function() {
    'use strict';

    var PREFIX = '[OrdoSyndicat]';

    var HIDE_ID = 'hideModal';
    var SHOW_ID = 'displayModal';
    var QR_ID   = 'qrCodeModal';
    var BTN_ID  = 'hideModalOnClick';

    var PARAM_OPEN = 'openModal';
    var PARAM_QR   = 'showQR';

    function $(id) { return document.getElementById(id); }

    function isLoggedIn() {
        try {
            var ms = localStorage.getItem('_ms-mem');
            if (ms && ms !== 'null' && ms !== 'undefined') return true;
            var legacy = localStorage.getItem('_mem');
            return !!(legacy && legacy !== 'null' && legacy !== 'undefined');
        } catch (e) { return false; }
    }

    function hide(el) { if (el) el.style.display = 'none'; }
    function show(el) { if (el) el.style.display = 'block'; }

    function showOnly(idToShow) {
        hide($(HIDE_ID));
        hide($(SHOW_ID));
        hide($(QR_ID));

        var target = $(idToShow);
        if (!target) {
            console.warn(PREFIX, '#' + idToShow + ' not found.');
            return;
        }
        show(target);
    }

    function runToggle() {
        var hideEl = $(HIDE_ID);
        var showEl = $(SHOW_ID);
        if (!hideEl && !showEl) {
            console.warn(PREFIX, '#' + HIDE_ID + ' and #' + SHOW_ID + ' not found.');
            return;
        }
        hide(hideEl);
        show(showEl);
    }

    function paramIsTrue(name) {
        var qp = new URLSearchParams(location.search);
        if (!qp.has(name)) return false;
        var val = (qp.get(name) || '').toLowerCase();
        return val === '' || val === '1' || val === 'true';
    }

    function removeParam(name) {
        var url = new URL(location.href);
        url.searchParams.delete(name);
        history.replaceState(null, '', url.toString());
    }

    function init() {
        var btn = $(BTN_ID);
        if (btn) btn.addEventListener('click', runToggle);
        else console.warn(PREFIX, '#' + BTN_ID + ' not found.');

        // QR override takes priority (all users)
        if (paramIsTrue(PARAM_QR)) {
            showOnly(QR_ID);
            removeParam(PARAM_QR);
            console.log(PREFIX, 'QR modal opened via URL param');
            return;
        }

        // Auto-open main modal for non-logged-in users only
        if (!isLoggedIn() && paramIsTrue(PARAM_OPEN)) {
            runToggle();
            removeParam(PARAM_OPEN);
            console.log(PREFIX, 'Modal auto-opened for non-member');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
