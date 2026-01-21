/**
 * Ordotype - Cancel Module Subscription
 * Handles module unsubscription (redeem offer or cancel) flows.
 *
 * Page: /membership/desabonnement-module-ordotype
 *
 * Required DOM elements:
 * - Forms: #redeem-form, #cancel-form
 * - Hidden inputs: #stripeCustomerId (in redeem-form), #stripeCustomerIdCancel (in cancel-form)
 * - Messages: #waiting-message-redeem, #success-message-redeem, #error-message-redeem
 * - Messages: #waiting-message-cancel, #success-message-cancel, #error-message-cancel
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/desabonnement-module/cancel-module.js"></script>
 */
(function() {
  'use strict';

  const PREFIX = '[CancelModule]';
  const REDIRECT_DELAY = 3000;
  const REQUEST_TIMEOUT = 10000;

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
    // Wait for Memberstack to be ready
    if (!window.$memberstackDom) {
      console.warn(PREFIX, 'Memberstack not available');
      return;
    }

    // Setup each form
    Object.entries(FORMS).forEach(([name, config]) => {
      setupForm(name, config);
    });

    console.log(PREFIX, 'Initialized');
  }

  /**
   * Setup a form with its event handlers
   */
  function setupForm(name, config) {
    const form = document.getElementById(config.formId);
    if (!form) {
      console.log(PREFIX, `Form not found: ${config.formId}`);
      return;
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

      if (!member?.stripeCustomerId) {
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
        throw new Error(`Server returned ${response.status}`);
      }

    } catch (err) {
      console.error(PREFIX, `Error in ${formName}:`, err);
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

      xhr.onload = () => resolve({ ok: xhr.status === 200, status: xhr.status });
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));

      xhr.send(new FormData(form));
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
