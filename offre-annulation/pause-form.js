/**
 * Ordotype - Pause Subscription Form
 * Handles the "Mettre en pause" button on the cancellation page.
 * The pause request:
 *   1. Cancels the Stripe subscription (with metadata cancellation_comment=pause_by_customer)
 *   2. Writes pause-end-date + paused-group-key to Memberstack metaData
 *   3. Writes a comment to Memberstack custom field "comment" for CS
 *   4. Adds an entry to the "Paused Subscriptions" Data Store
 *   5. Sends Brevo confirmation email (template #806)
 *
 * A form that carries data-ordo-action="<action>" is sent to the member-forms endpoint instead of
 * its own action: the request carries the member's session token and the form's own non-identity
 * fields; the server reads the member from the session. A form without the attribute is posted to
 * its own action as before.
 *
 * Requires: window.OrdoMemberstack (memberstack-utils.js loaded first)
 *
 * Expected DOM elements:
 * - Form: #pause-form
 * - Hidden inputs: #stripeCustomerIdPause, #memberIdPause, #stripeSubscriptionIdPause
 * - Messages: #waiting-message-pause, #success-message-pause, #error-message-pause
 */
(function() {
    'use strict';

    var PREFIX = '[PauseForm]';
    var REDIRECT_DELAY = 3000;
    var REQUEST_TIMEOUT = 10000;
    var MEMBER_FORMS_URL = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
    var PREFILLED_IDS = ['stripeCustomerIdPause', 'memberIdPause', 'stripeSubscriptionIdPause'];
    // Identity fields stay in the page: the server reads the member from the session.
    var IDENTITY_FIELDS = ['email', 'MSuserId', 'memberId', 'memberIdPause', 'stripeCustomerId',
        'stripeCustomerIdCancel', 'stripeCustomerIdPause', 'stripeSubscriptionId', 'stripeSubscriptionIdPause'];
    var submitting = false;

    // Reporter when it is there, ErrorEvent channel when it is not: the pages
    // where a pause fails are also the ones where the CDN can be blocked.
    function report(name, detail) {
        try {
            var err = new Error(detail);
            err.name = name;
            if (window.OrdoErrorReporter) {
                OrdoErrorReporter.report('PauseForm', err);
                return;
            }
            window.dispatchEvent(new ErrorEvent('error', { message: detail, error: err }));
        } catch (e) {
            // never throw from the reporting path
        }
    }

    // Plan IDs that use the offre-annulation cancel page (Module MG)
    var MG_PLAN_IDS = [
        'pln_compte-praticien-offre-speciale-500-premiers--893z0o60',
        'pln_compte-m-decin-hu490oka',
        'pln_compte-praticien-ov4d0oln',
        'pln_abonnement-1-an-2-mois-gratuits-g04f0oue'
    ];

    function init() {
        var form = document.getElementById('pause-form');
        if (!form) {
            console.log(PREFIX, 'No pause form found, skipping');
            return;
        }

        var ms = window.OrdoMemberstack;
        if (!ms || !ms.memberId) {
            console.warn(PREFIX, 'OrdoMemberstack not available');
            // A marked form only needs the session token: keep it bound.
            if (form.getAttribute('data-ordo-action')) form.addEventListener('submit', handleSubmit);
            return;
        }

        // Pre-fill hidden inputs from localStorage data (no async call needed)
        var stripeInput = document.getElementById(PREFILLED_IDS[0]);
        var memberIdInput = document.getElementById(PREFILLED_IDS[1]);
        var subIdInput = document.getElementById(PREFILLED_IDS[2]);

        if (stripeInput) stripeInput.value = ms.stripeCustomerId || '';
        if (memberIdInput) memberIdInput.value = ms.memberId || '';

        // Find the active MG subscription
        if (subIdInput && ms.planConnections) {
            var mgSub = ms.planConnections.find(function(c) {
                return (c.status === 'ACTIVE' || c.status === 'TRIALING')
                    && c.payment
                    && c.payment.stripeSubscriptionId
                    && MG_PLAN_IDS.indexOf(c.planId) !== -1;
            });
            if (mgSub) {
                subIdInput.value = mgSub.payment.stripeSubscriptionId;
                console.log(PREFIX, 'Found MG sub:', mgSub.payment.stripeSubscriptionId);
            } else {
                console.warn(PREFIX, 'No active MG subscription found');
            }
        }

        form.addEventListener('submit', handleSubmit);
        console.log(PREFIX, 'Initialized');
    }

    function handleSubmit(event) {
        event.preventDefault();
        // A second submit while the first is pending would pause twice.
        if (submitting) return;
        submitting = true;

        var form = document.getElementById('pause-form');
        var waiting = document.getElementById('waiting-message-pause');
        var success = document.getElementById('success-message-pause');
        var error = document.getElementById('error-message-pause');

        showElement(waiting);
        hideElement(form);
        hideElement(error);

        var action = form.getAttribute('data-ordo-action');
        (action ? submitToServer(form, action) : submitForm(form))
            .then(function(response) {
                hideElement(waiting);
                if (response.ok) {
                    showElement(success);
                    console.log(PREFIX, 'Pause submitted successfully');
                    setTimeout(function() {
                        window.location.href = '/membership/abonnement-en-pause';
                    }, REDIRECT_DELAY);
                } else {
                    var detail = response.body ? ' — ' + String(response.body).slice(0, 200) : '';
                    throw new Error('Server returned ' + response.status + detail);
                }
            })
            .catch(function(err) {
                console.error(PREFIX, 'Error:', err);
                report('PauseFormSubmitFailed', (err && err.message) || String(err));
                hideElement(waiting);
                showElement(form);
                showElement(error);
                submitting = false;
            });
    }

    function submitForm(form) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', form.action);
            xhr.timeout = REQUEST_TIMEOUT;
            xhr.onload = function() {
                resolve({ ok: xhr.status === 200, status: xhr.status, body: xhr.responseText });
            };
            xhr.onerror = function() { reject(new Error('Network error')); };
            xhr.ontimeout = function() { reject(new Error('Request timeout')); };
            var data = new FormData(form);
            data.append('pageUrl', window.location.href);
            xhr.send(data);
        });
    }

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

    // The prefilled inputs are left out whatever their name in the Designer.
    function excludedFields() {
        var names = IDENTITY_FIELDS.slice();
        PREFILLED_IDS.forEach(function(id) {
            var input = document.getElementById(id);
            if (input && input.name) names.push(input.name);
        });
        return names;
    }

    /**
     * Send the form to the member-forms endpoint with the member's session token.
     * Resolves with the same shape as submitForm.
     */
    function submitToServer(form, action) {
        return sessionToken().then(function(token) {
            if (!token) throw new Error('No member session token');

            var excluded = excludedFields();
            var fields = {};
            new FormData(form).forEach(function(value, name) {
                if (typeof value === 'string' && excluded.indexOf(name) === -1) fields[name] = value;
            });

            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer = controller ? setTimeout(function() { controller.abort(); }, REQUEST_TIMEOUT) : null;
            function stop() {
                if (timer) clearTimeout(timer);
                timer = null;
            }
            return Promise.resolve()
                .then(function() {
                    return fetch(MEMBER_FORMS_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                        body: JSON.stringify({ action: action, fields: fields }),
                        signal: controller ? controller.signal : undefined
                    });
                })
                .then(function(response) {
                    return Promise.resolve()
                        .then(function() { return response.text(); })
                        .catch(function() { return ''; })
                        .then(function(body) {
                            stop();
                            return { ok: response.status === 200, status: response.status, body: body };
                        });
                }, function(err) {
                    stop();
                    throw new Error(err && err.name === 'AbortError' ? 'Request timeout' : 'Network error');
                });
        });
    }

    function showElement(el) { if (el) el.style.display = 'block'; }
    function hideElement(el) { if (el) el.style.display = 'none'; }

    window.Webflow = window.Webflow || [];
    window.Webflow.push(init);
})();
