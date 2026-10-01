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
 *   - #pause-action-waiting, #pause-action-success, #pause-action-error (messages)
 *
 * Resume and definitive cancel are sent to the member-forms endpoint (actions `resume-pause` and
 * `cancel-pause`) with the member's session token and no other data: the server reads the member
 * from the session.
 */
(function() {
    'use strict';

    var PREFIX = '[PauseState]';
    var MEMBER_FORMS_URL = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
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

    // Resolves with the member's session token, or '' when there is none.
    function sessionToken() {
        try {
            var ms = window.$memberstackDom;
            if (!ms || typeof ms.getMemberCookie !== 'function') return Promise.resolve('');
            return Promise.resolve(ms.getMemberCookie()).then(function(t) {
                return t ? String(t) : '';
            }, function() { return ''; });
        } catch (e) {
            return Promise.resolve('');
        }
    }

    // One call for the subscriptions list and the card: onResult(true) only on
    // HTTP 200, and onResult is called exactly once.
    function send(action, actionName, onResult) {
        var done = false;
        function finish(ok) {
            if (done) return;
            done = true;
            if (typeof onResult === 'function') onResult(ok);
        }
        sessionToken().then(function(token) {
            if (!token) {
                report(actionName, 'PauseStateNoSession', 'no member session token');
                return finish(false);
            }
            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer = controller ? setTimeout(function() { controller.abort(); }, REQUEST_TIMEOUT) : null;
            function stop() {
                if (timer) clearTimeout(timer);
                timer = null;
            }
            var request;
            // fetch can throw synchronously behind a CSP rule or a privacy
            // extension: without this the caller would wait forever.
            try {
                request = fetch(MEMBER_FORMS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ action: action, fields: {} }),
                    signal: controller ? controller.signal : undefined
                });
            } catch (err) {
                stop();
                report(actionName, 'PauseStateSendFailed', (err && err.message) || String(err));
                return finish(false);
            }
            return Promise.resolve(request).then(function(response) {
                stop();
                if (response.status === 200) return finish(true);
                return Promise.resolve()
                    .then(function() { return response.text(); })
                    .catch(function() { return ''; })
                    .then(function(text) {
                        var body = text ? ' — ' + String(text).slice(0, 200) : '';
                        report(actionName, 'PauseStateActionFailed', 'HTTP ' + response.status + body);
                        finish(false);
                    });
            }, function(err) {
                stop();
                if (err && err.name === 'AbortError') {
                    report(actionName, 'PauseStateTimeout', 'timeout after ' + REQUEST_TIMEOUT + 'ms');
                } else {
                    report(actionName, 'PauseStateNetworkError', 'network error');
                }
                finish(false);
            });
        }).catch(function(err) {
            if (done) return;
            report(actionName, 'PauseStateSendFailed', (err && err.message) || String(err));
            finish(false);
        });
    }

    window.OrdoPause = {
        resume: function(onResult) { send('resume-pause', 'resume', onResult); },
        cancelDefinitive: function(onResult) { send('cancel-pause', 'cancel-definitive', onResult); },
        resumedUrl: '/membership/abonnement-repris',
        redirectDelay: REDIRECT_DELAY
    };

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

        // Populate and show the card
        var card = document.getElementById('pause-state-card');
        var labelEl = document.getElementById('pause-plan-label');
        var dateEl = document.getElementById('pause-resume-date');

        if (!card) {
            console.warn(PREFIX, 'No #pause-state-card found in DOM');
            return;
        }

        if (labelEl) labelEl.textContent = planLabel;
        if (dateEl) dateEl.textContent = 'Reprise automatique le ' + formattedDate;

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
                handleAction('resume-pause', 'Votre abonnement a été réactivé !', '/membership/abonnement-repris', 'resume');
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (confirm('Êtes-vous sûr de vouloir annuler définitivement votre abonnement ?')) {
                    handleAction('cancel-pause', 'Votre abonnement a été annulé.', null, 'cancel-definitive');
                }
            });
        }
    }

    function handleAction(action, successMessage, redirectUrl, actionName) {
        var resumeBtn = document.getElementById('resume-btn');
        var cancelBtn = document.getElementById('cancel-definitive-btn');
        var waiting = document.getElementById('pause-action-waiting');
        var success = document.getElementById('pause-action-success');
        var error = document.getElementById('pause-action-error');

        // Hide buttons, show waiting
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (waiting) waiting.style.display = 'block';
        if (error) error.style.display = 'none';

        send(action, actionName, function(ok) {
            if (waiting) waiting.style.display = 'none';
            if (ok) {
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
                return;
            }
            if (error) error.style.display = 'block';
            if (resumeBtn) resumeBtn.style.display = '';
            if (cancelBtn) cancelBtn.style.display = '';
        });
    }

    // Init after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
