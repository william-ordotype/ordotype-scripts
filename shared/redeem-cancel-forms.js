/**
 * Ordotype - Redeem & Cancel Forms (Shared)
 * Handles redeem offer and cancellation form submissions with Stripe Customer ID injection.
 *
 * Used on:
 * - /membership/annulation-abonnement
 * - /membership/offre-annulation
 * - /membership/desabonnement-module-ordotype
 *
 * Required DOM elements:
 * - Forms: #redeem-form (optional), #cancel-form (optional)
 * - Hidden inputs: #stripeCustomerId (in redeem-form), #stripeCustomerIdCancel (in cancel-form)
 * - Messages: #waiting-message-redeem, #success-message-redeem, #error-message-redeem
 * - Messages: #waiting-message-cancel, #success-message-cancel, #error-message-cancel
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/redeem-cancel-forms.js"></script>
 */
(function() {
  'use strict';

  const PREFIX = '[RedeemCancelForms]';
  const REDIRECT_DELAY = 3000;
  const REQUEST_TIMEOUT = 10000;
  const SELF_PATH = 'shared/redeem-cancel-forms.js';
  const REPORTER_PATH = 'shared/error-reporter.js';
  const CDN_BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/';

  /**
   * Pages that load this script through a page loader already have the reporter.
   * The cancel pages include it directly, so pull it in when it is missing.
   */
  function ensureReporter() {
    if (window.OrdoErrorReporter) return;
    const tag = document.querySelector('script[src*="' + SELF_PATH + '"]');
    const script = document.createElement('script');
    script.src = tag ? tag.src.replace(SELF_PATH, REPORTER_PATH) : CDN_BASE + REPORTER_PATH;
    script.crossOrigin = 'anonymous';
    script.onerror = () => report('reporter', 'ReporterUnavailable', 'error-reporter.js blocked');
    document.head.appendChild(script);
  }

  /**
   * Reports through the shared reporter, falling back to the ErrorEvent channel
   * the auth bundle listens on. The fallback is the point: the networks that
   * break a cancellation are the ones that also block the CDN the reporter is
   * served from, so returning early on a missing reporter would drop exactly
   * the reports worth having. Each cause carries its own error name so Sentry
   * keeps them as distinct issues.
   */
  function report(formName, name, detail) {
    try {
      const message = formName + ': ' + detail;
      const err = new Error(message);
      err.name = name;
      if (window.OrdoErrorReporter) {
        OrdoErrorReporter.report('RedeemCancelForms', err);
        return;
      }
      window.dispatchEvent(new ErrorEvent('error', { message: message, error: err }));
    } catch (e) {
      // never throw from the reporting path
    }
  }

  /**
   * Form configuration
   */
  const FORMS = {
    redeem: {
      formId: 'redeem-form',
      stripeInputId: 'stripeCustomerId',
      waitingId: 'waiting-message-redeem',
      successId: 'success-message-redeem',
      errorId: 'error-message-redeem'
    },
    cancel: {
      formId: 'cancel-form',
      stripeInputId: 'stripeCustomerIdCancel',
      waitingId: 'waiting-message-cancel',
      successId: 'success-message-cancel',
      errorId: 'error-message-cancel'
    }
  };

  /**
   * Initialize the module
   */
  function init() {
    // Before the Memberstack guard: without a listener the browser submits the
    // form natively with an empty Stripe id, so the member sees a confirmation
    // while nothing is cancelled. That is the failure worth hearing about, and
    // reporting it needs the reporter loaded first.
    ensureReporter();

    if (!window.$memberstackDom) {
      console.warn(PREFIX, 'Memberstack not available');
      report('init', 'CancelFormNoMemberstack', 'Memberstack SDK absent, forms left unbound');
      return;
    }

    // Setup each form
    let formsFound = 0;
    Object.entries(FORMS).forEach(([name, config]) => {
      if (setupForm(name, config)) formsFound++;
    });

    if (formsFound > 0) {
      console.log(PREFIX, `Initialized (${formsFound} form(s))`);
    } else {
      report('init', 'CancelFormNotFound', 'no redeem or cancel form on ' + window.location.pathname);
    }
  }

  /**
   * Setup a form with its event handlers
   * @returns {boolean} true if form was found and setup
   */
  function setupForm(name, config) {
    const form = document.getElementById(config.formId);
    if (!form) {
      return false;
    }

    const elements = {
      form,
      stripeInput: document.getElementById(config.stripeInputId),
      waiting: document.getElementById(config.waitingId),
      success: document.getElementById(config.successId),
      error: document.getElementById(config.errorId)
    };

    form.addEventListener('submit', (e) => handleSubmit(e, elements, name));
    console.log(PREFIX, `Form setup: ${name}`);
    return true;
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(event, elements, formName) {
    event.preventDefault();

    const { form, stripeInput, waiting, success, error } = elements;

    try {
      // Get current member and inject Stripe Customer ID
      const { data: member } = await window.$memberstackDom.getCurrentMember();

      if (!member || !member.stripeCustomerId) {
        throw new Error('Stripe Customer ID not found');
      }

      if (stripeInput) {
        stripeInput.value = member.stripeCustomerId;
        console.log(PREFIX, `Stripe ID set for ${formName}:`, member.stripeCustomerId);
      }

      // Show waiting state
      showElement(waiting);
      hideElement(form);
      hideElement(error);

      // Submit the form
      const response = await submitForm(form);

      // Hide waiting
      hideElement(waiting);

      if (response.ok) {
        // Success
        showElement(success);
        console.log(PREFIX, `${formName} form submitted successfully`);

        // Redirect to homepage
        setTimeout(() => {
          window.location.href = '/';
        }, REDIRECT_DELAY);
      } else {
        const detail = response.body ? ` — ${String(response.body).slice(0, 200)}` : '';
        throw new Error(`Server returned ${response.status}${detail}`);
      }

    } catch (err) {
      console.error(PREFIX, `Error in ${formName}:`, err);
      report(formName, 'CancelFormSubmitFailed', (err && err.message) || String(err));
      hideElement(waiting);
      showElement(form);
      showElement(error);
    }
  }

  /**
   * Submit form with timeout
   */
  function submitForm(form) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action);
      xhr.timeout = REQUEST_TIMEOUT;

      xhr.onload = () =>
        resolve({ ok: xhr.status === 200, status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));

      var data = new FormData(form);
      data.append('pageUrl', window.location.href);
      xhr.send(data);
    });
  }

  /**
   * Helper: Show element
   */
  function showElement(el) {
    if (el) el.style.display = 'block';
  }

  /**
   * Helper: Hide element
   */
  function hideElement(el) {
    if (el) el.style.display = 'none';
  }

  // Initialize when Webflow is ready
  window.Webflow = window.Webflow || [];
  window.Webflow.push(init);
})();
