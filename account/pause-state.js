/**
 * Ordotype Account - Pause State
 * Detects if the member has a paused subscription (via Memberstack metaData)
 * and shows the "En pause" card on the account page with Resume + Cancel buttons.
 *
 * Depends on: core.js (window.OrdoAccount, window.OrdoMemberstack)
 *
 * Reads metaData:
 *   - pause-end-date: ISO date string (e.g. "2026-10-17")
 *   - paused-group-key: Memberstack group key (e.g. "bouton-compte-praticien-only")
 *
 * Expected DOM (Webflow):
 *   - #pause-state-card (hidden by default, display:none)
 *   - #pause-plan-label (text: plan name)
 *   - #pause-resume-date (text: formatted date)
 *   - #resume-btn (button)
 *   - #cancel-definitive-btn (button)
 *   - #pause-member-id (hidden input)
 *   - #pause-action-waiting, #pause-action-success, #pause-action-error (messages)
 */
(function() {
    'use strict';

    var PREFIX = '[PauseState]';
    var RESUME_WEBHOOK = 'https://hook.eu1.make.com/2y3halxc530pmbgju3les5b6gk1kwydc';
    var CANCEL_DEFINITIVE_WEBHOOK = 'https://hook.eu1.make.com/greskl1wedbnhktd5cne0i88mq4qg7wr';
    var REDIRECT_DELAY = 3000;
    var REQUEST_TIMEOUT = 10000;

    // Reporter when it is there, ErrorEvent channel when it is not: the pages
    // where a resume fails are also the ones where the CDN can be blocked.
    function report(actionName, name, detail) {
        try {
            var message = actionName + ': ' + detail;
            var err = new Error(message);
            err.name = name;
            if (window.OrdoErrorReporter) {
                OrdoErrorReporter.report('PauseState', err);
                return;
            }
            window.dispatchEvent(new ErrorEvent('error', { message: message, error: err }));
        } catch (e) {
            // never throw from the reporting path
        }
    }

    // Group key → display label mapping
    var GROUP_LABELS = {
        'bouton-compte-praticien-only': 'Module MG - Compte Praticien',
        'interne-img-and-ft': 'Module MG - Compte Interne',
        'btn-asso-interne-only': 'Module MG - Compte Interne adhérent',
        'rhumatologie-paid-plan': 'Module Rhumatologie',
        'soins-palliatifs-paid-plan': 'Module Soins palliatifs',
        'btn-ide-only': 'Module MG - Compte IDE',
        'compte-praticien': 'Module MG - Compte Praticien'
    };

    /**
     * Check if the user has an active plan that belongs to the given group.
     * Reads ms_groups from localStorage to find which plans belong to the group,
     * then checks planConnections for an ACTIVE match.
     */
    function hasActivePlanForGroup(groupKey, planConnections) {
        if (!planConnections || !planConnections.length) return false;

        try {
            var raw = localStorage.getItem('ms_groups');
            if (!raw) return false;
            var groups = JSON.parse(raw);
            var group = null;
            for (var i = 0; i < groups.length; i++) {
                if (groups[i].key === groupKey) {
                    group = groups[i];
                    break;
                }
            }
            if (!group || !group.plans) return false;

            var groupPlanIds = group.plans.map(function(p) { return p.id; });

            for (var j = 0; j < planConnections.length; j++) {
                var conn = planConnections[j];
                var isLive = conn.status === 'ACTIVE' || conn.status === 'TRIALING';
                if (isLive && groupPlanIds.indexOf(conn.planId) !== -1) {
                    // payment.cancelAtDate is the generic scheduled-cancel flag
                    // (same meaning as in subscriptions.js), not pause-specific.
                    // Heuristic: treat such a connection as the paid drain of the
                    // pause rather than a resumed subscription, so the card stays
                    // visible during the drain. Accepted trade-off: a member who
                    // re-subscribed via checkout and then scheduled a normal
                    // cancel of the new sub sees the card again.
                    if (conn.payment && conn.payment.cancelAtDate) continue;
                    return true;
                }
            }
        } catch (e) {
            console.warn(PREFIX, 'Error reading ms_groups:', e.message);
        }

        return false;
    }

    function init() {
        var ms = window.OrdoMemberstack;
        if (!ms || !ms.metaData) {
            console.log(PREFIX, 'No metaData, skipping');
            return;
        }

        var pauseEndDate = ms.metaData['pause-end-date'];
        var pausedGroupKey = ms.metaData['paused-group-key'];

        if (!pauseEndDate || !pausedGroupKey) {
            return;
        }

        // Check if user still has an active plan from the paused group
        // If yes, the pause was resumed — don't show the card
        if (hasActivePlanForGroup(pausedGroupKey, ms.planConnections)) {
            console.log(PREFIX, 'User has active plan for group', pausedGroupKey, '— skipping pause card');
            return;
        }

        var endDate = new Date(pauseEndDate);
        if (isNaN(endDate.getTime()) || endDate <= new Date()) {
            console.log(PREFIX, 'Pause expired or invalid date:', pauseEndDate);
            return;
        }

        var formattedDate = endDate.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        var planLabel = GROUP_LABELS[pausedGroupKey] || 'Abonnement';
        var memberId = ms.memberId || '';

        // Populate and show the card
        var card = document.getElementById('pause-state-card');
        var labelEl = document.getElementById('pause-plan-label');
        var dateEl = document.getElementById('pause-resume-date');
        var memberIdInput = document.getElementById('pause-member-id');

        if (!card) {
            console.warn(PREFIX, 'No #pause-state-card found in DOM');
            return;
        }

        if (labelEl) labelEl.textContent = planLabel;
        if (dateEl) dateEl.textContent = 'Reprise automatique le ' + formattedDate;
        if (memberIdInput) memberIdInput.value = memberId;

        card.classList.remove('hidden');
        card.style.display = '';

        var hideExpiredStyle = document.createElement('style');
        hideExpiredStyle.textContent = '#expired-state-card { display: none !important; }';
        document.head.appendChild(hideExpiredStyle);
        var expiredCard = document.getElementById('expired-state-card');
        if (expiredCard) expiredCard.remove();

        console.log(PREFIX, 'Showing pause card:', planLabel, 'until', formattedDate);

        // Bind buttons
        var resumeBtn = document.getElementById('resume-btn');
        var cancelBtn = document.getElementById('cancel-definitive-btn');

        if (resumeBtn) {
            resumeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                handleAction(RESUME_WEBHOOK, 'Votre abonnement a été réactivé !', '/membership/abonnement-repris', 'resume');
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (confirm('Êtes-vous sûr de vouloir annuler définitivement votre abonnement ?')) {
                    handleAction(CANCEL_DEFINITIVE_WEBHOOK, 'Votre abonnement a été annulé.', null, 'cancel-definitive');
                }
            });
        }
    }

    function handleAction(webhookUrl, successMessage, redirectUrl, actionName) {
        var resumeBtn = document.getElementById('resume-btn');
        var cancelBtn = document.getElementById('cancel-definitive-btn');
        var waiting = document.getElementById('pause-action-waiting');
        var success = document.getElementById('pause-action-success');
        var error = document.getElementById('pause-action-error');
        // init() treats this input as optional, so dereferencing it here would
        // throw before the spinner, the error message and the report.
        var memberIdInput = document.getElementById('pause-member-id');
        var memberId = memberIdInput ? memberIdInput.value : '';
        if (!memberId) {
            report(actionName, 'PauseStateMissingMemberId', '#pause-member-id absent ou vide');
        }

        // Hide buttons, show waiting
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (waiting) waiting.style.display = 'block';
        if (error) error.style.display = 'none';

        var payload = 'memberId=' + encodeURIComponent(memberId) + '&pageUrl=' + encodeURIComponent(window.location.href);
        console.log(PREFIX, 'Calling webhook:', webhookUrl);
        console.log(PREFIX, 'Payload:', payload);

        var xhr = new XMLHttpRequest();

        xhr.onload = function() {
            console.log(PREFIX, 'Response status:', xhr.status);
            console.log(PREFIX, 'Response body:', xhr.responseText);
            if (waiting) waiting.style.display = 'none';
            if (xhr.status === 200) {
                if (success) {
                    success.textContent = successMessage;
                    success.style.display = 'block';
                }
                setTimeout(function() {
                    if (redirectUrl) {
                        window.location.href = redirectUrl;
                    } else {
                        window.location.reload();
                    }
                }, REDIRECT_DELAY);
            } else {
                var body = xhr.responseText ? ' — ' + String(xhr.responseText).slice(0, 200) : '';
                report(actionName, 'PauseStateActionFailed', 'HTTP ' + xhr.status + body);
                showError();
            }
        };

        xhr.onerror = function() {
            console.error(PREFIX, 'XHR error (network)');
            report(actionName, 'PauseStateNetworkError', 'network error');
            if (waiting) waiting.style.display = 'none';
            showError();
        };

        xhr.ontimeout = function() {
            console.error(PREFIX, 'XHR timeout after', REQUEST_TIMEOUT, 'ms');
            report(actionName, 'PauseStateTimeout', 'timeout after ' + REQUEST_TIMEOUT + 'ms');
            if (waiting) waiting.style.display = 'none';
            showError();
        };

        function showError() {
            if (error) error.style.display = 'block';
            if (resumeBtn) resumeBtn.style.display = '';
            if (cancelBtn) cancelBtn.style.display = '';
        }

        // open/setRequestHeader/send can throw synchronously behind a CSP rule
        // or a privacy extension. Without this, none of the handlers above ever
        // runs and the member is left on a spinner with both buttons hidden.
        try {
            xhr.open('POST', webhookUrl);
            xhr.timeout = REQUEST_TIMEOUT;
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.send(payload);
        } catch (err) {
            console.error(PREFIX, 'XHR send failed:', err);
            report(actionName, 'PauseStateSendFailed', (err && err.message) || String(err));
            if (waiting) waiting.style.display = 'none';
            showError();
        }
    }

    // Init after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
