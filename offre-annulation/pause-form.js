/**
 * Ordotype - Pause Subscription Form
 * Handles the "Mettre en pause" button on the cancellation page.
 * Posts to a Make webhook which:
 *   1. Cancels the Stripe subscription (with metadata cancellation_comment=pause_by_customer)
 *   2. Writes pause-end-date + paused-group-key to Memberstack metaData
 *   3. Writes a comment to Memberstack custom field "comment" for CS
 *   4. Adds an entry to the "Paused Subscriptions" Data Store
 *   5. Sends Brevo confirmation email (template #806)
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

    function init() {
        var form = document.getElementById('pause-form');
        if (!form) {
            console.log(PREFIX, 'No pause form found, skipping');
            return;
        }

        if (!window.$memberstackDom) {
            console.warn(PREFIX, 'Memberstack not available');
            return;
        }

        form.addEventListener('submit', handleSubmit);
        console.log(PREFIX, 'Initialized');
    }

    async function handleSubmit(event) {
        event.preventDefault();

        var form = document.getElementById('pause-form');
        var stripeInput = document.getElementById('stripeCustomerIdPause');
        var memberIdInput = document.getElementById('memberIdPause');
        var waiting = document.getElementById('waiting-message-pause');
        var success = document.getElementById('success-message-pause');
        var error = document.getElementById('error-message-pause');

        try {
            var result = await window.$memberstackDom.getCurrentMember();
            var member = result.data;

            if (!member || !member.stripeCustomerId) {
                throw new Error('Stripe Customer ID not found');
            }

            if (stripeInput) {
                stripeInput.value = member.stripeCustomerId;
            }

            if (memberIdInput) {
                memberIdInput.value = member.id;
            }

            // Find the active MG subscription ID from planConnections
            var subIdInput = document.getElementById('stripeSubscriptionIdPause');
            if (subIdInput && member.planConnections) {
                var activeSub = member.planConnections.find(function(c) {
                    return c.active && c.payment && c.payment.stripeSubscriptionId;
                });
                if (activeSub) {
                    subIdInput.value = activeSub.payment.stripeSubscriptionId;
                }
            }

            showElement(waiting);
            hideElement(form);
            hideElement(error);

            var response = await submitForm(form);

            hideElement(waiting);

            if (response.ok) {
                showElement(success);
                console.log(PREFIX, 'Pause submitted successfully');
                setTimeout(function() {
                    window.location.href = '/membership/compte';
                }, REDIRECT_DELAY);
            } else {
                throw new Error('Server returned ' + response.status);
            }

        } catch (err) {
            console.error(PREFIX, 'Error:', err);
            hideElement(waiting);
            showElement(form);
            showElement(error);
        }
    }

    function submitForm(form) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', form.action);
            xhr.timeout = REQUEST_TIMEOUT;
            xhr.onload = function() { resolve({ ok: xhr.status === 200, status: xhr.status }); };
            xhr.onerror = function() { reject(new Error('Network error')); };
            xhr.ontimeout = function() { reject(new Error('Request timeout')); };
            var data = new FormData(form);
            data.append('pageUrl', window.location.href);
            xhr.send(data);
        });
    }

    function showElement(el) { if (el) el.style.display = 'block'; }
    function hideElement(el) { if (el) el.style.display = 'none'; }

    window.Webflow = window.Webflow || [];
    window.Webflow.push(init);
})();
