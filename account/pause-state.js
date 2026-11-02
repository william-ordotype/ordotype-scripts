/**
 * Ordotype Account - Pause State
 * Resume and definitive cancel of a paused subscription, for the « Mes abonnements » list
 * (subscriptions-overview.js draws the paused card and its buttons): window.OrdoPause.
 *
 * Depends on: Memberstack (session token)
 *
 * Resume and definitive cancel are sent to the member-forms endpoint (actions `resume-pause` and
 * `cancel-pause`) with the member's session token and no other data: the server reads the member
 * from the session.
 */
(function() {
    'use strict';

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

    // One call for the subscriptions list: onResult(true) only on
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
})();
