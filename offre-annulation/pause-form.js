/**
 * Ordotype - Pause Subscription Form
 * Handles the "Mettre en pause" button on the cancellation page.
 * Posts to a Make webhook to pause the Stripe subscription for 6 months.
 *
 * Requires: window.OrdoMemberstack (memberstack-utils.js loaded first)
 *
 * Expected DOM elements:
 * - Form: #pause-form
 * - Hidden inputs: #stripeCustomerIdPause
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

            showElement(waiting);
            hideElement(form);
            hideElement(error);

            var response = await submitForm(form);

            hideElement(waiting);

            if (response.ok) {
                showElement(success);
                console.log(PREFIX, 'Pause submitted successfully');
                setTimeout(function() {
                    window.location.href = '/';
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
