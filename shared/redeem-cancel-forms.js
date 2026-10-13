/**
 * Ordotype - Redeem & Cancel Forms (Shared)
 * Handles redeem offer and cancellation form submissions with Stripe Customer ID injection.
 *
 * Used on:
 * - /membership/annulation-abonnement
 * - /membership/offre-annulation
 * - /membership/desabonnement-module-ordotype
 * - /membership/annulation-offre-asso-interne
 *
 * Required DOM elements:
 * - Forms: #redeem-form (optional), #cancel-form (optional)
 * - Hidden inputs: #stripeCustomerId (in redeem-form), #stripeCustomerIdCancel (in cancel-form)
 * - Messages: #waiting-message-redeem, #success-message-redeem, #error-message-redeem
 * - Messages: #waiting-message-cancel, #success-message-cancel, #error-message-cancel
 *
 * A form that carries data-ordo-action="<action>" is sent to the member-forms endpoint instead of its
 * own action: the request carries the member's session token and the form's own fields, never the
 * member's identity, which the server reads from the session. Forms without the attribute keep the
 * original behaviour.
 *
 * A logged out visitor (nothing is sent), or a member the server turns away because the offer is not
 * on their account (409), sees a message in the error element with a link to the subscriptions tab of
 * their account, instead of the generic error; a 409 `abonnement_impaye` points to support instead.
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
  const MEMBER_FORMS_URL = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
  // Identity fields stay in the page: the server reads the member from the session.
  const IDENTITY_FIELDS = ['email', 'MSuserId', 'memberId', 'stripeCustomerId', 'stripeCustomerIdCancel', 'stripeCustomerIdPause'];
  // Logged out visitors land on the account login card, which brings them back to this tab.
  const ACCOUNT_URL = '/membership/compte#abonnements';
  // Report name, link label and target of each notice; the wording is per form (FORMS[].notices).
  const NOTICES = {
    noSession: { name: 'CancelFormNoSession', link: 'Se connecter' },
    planAbsent: { name: 'CancelFormPlanAbsent', link: 'Voir mes abonnements' },
    unpaid: { name: 'CancelFormUnpaid', link: 'support@ordotype.fr', href: 'mailto:support@ordotype.fr' }
  };

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
      errorId: 'error-message-redeem',
      notices: {
        noSession: 'Connectez-vous pour profiter de cette offre.',
        planAbsent: 'Cette offre n\'est pas disponible pour votre compte. Vos abonnements sont dans votre compte.',
        unpaid: 'Un paiement est en attente sur cet abonnement. Écrivez-nous\u00a0:'
      }
    },
    cancel: {
      formId: 'cancel-form',
      stripeInputId: 'stripeCustomerIdCancel',
      waitingId: 'waiting-message-cancel',
      successId: 'success-message-cancel',
      errorId: 'error-message-cancel',
      notices: {
        noSession: 'Connectez-vous pour résilier votre offre.',
        planAbsent: 'Aucune offre active à résilier n\'a été trouvée sur votre compte. Vos abonnements et leur résiliation sont dans votre compte.',
        unpaid: 'Un paiement est en attente sur cet abonnement\u00a0: il ne peut pas être résilié en ligne. Écrivez-nous\u00a0:'
      }
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

    const error = document.getElementById(config.errorId);
    const elements = {
      form,
      stripeInput: document.getElementById(config.stripeInputId),
      waiting: document.getElementById(config.waitingId),
      success: document.getElementById(config.successId),
      error,
      // The page's own error content, put back after a notice replaced it.
      errorContent: error ? Array.prototype.map.call(error.childNodes, (n) => n.cloneNode(true)) : [],
      noticeShown: false,
      notices: config.notices,
      busy: false
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
    // One request at a time: a second click while the first is in flight sends nothing.
    if (elements.busy) return;
    elements.busy = true;

    const { form, stripeInput, waiting, success, error } = elements;

    try {
      const { data: member } = await window.$memberstackDom.getCurrentMember();
      if (!member) {
        refuse(elements, formName, 'noSession', 'no member session');
        return;
      }

      // Only the legacy path posts the Stripe id; the endpoint reads the member from the session.
      const action = form.getAttribute('data-ordo-action');
      if (!action) {
        if (!member.stripeCustomerId) {
          throw new Error('Stripe Customer ID not found');
        }
        if (stripeInput) {
          stripeInput.value = member.stripeCustomerId;
          console.log(PREFIX, `Stripe ID set for ${formName}:`, member.stripeCustomerId);
        }
      }

      // Show waiting state
      showElement(waiting);
      hideElement(form);
      hideElement(error);

      // Submit the form
      const response = action ? await submitToServer(form, action) : await submitForm(form);

      // Hide waiting
      hideElement(waiting);

      if (response.ok) {
        // Success
        showElement(success);
        console.log(PREFIX, `${formName} form submitted successfully`);

        // Redirect to homepage (the form stays locked until then)
        setTimeout(() => {
          window.location.href = '/';
        }, REDIRECT_DELAY);
      } else if (action && response.status === 409) {
        const unpaid = serverError(response.body) === 'abonnement_impaye';
        refuse(elements, formName, unpaid ? 'unpaid' : 'planAbsent', 'server returned 409');
      } else {
        const detail = response.body ? `: ${String(response.body).slice(0, 200)}` : '';
        throw new Error(`Server returned ${response.status}${detail}`);
      }

    } catch (err) {
      console.error(PREFIX, `Error in ${formName}:`, err);
      report(formName, 'CancelFormSubmitFailed', (err && err.message) || String(err));
      hideElement(waiting);
      showElement(form);
      if (elements.noticeShown) setError(elements, null);
      showElement(error);
      elements.busy = false;
    }
  }

  /**
   * Nothing was done: say why in the error element, with a link to the account, and give the form back.
   */
  function refuse(elements, formName, kind, detail) {
    report(formName, NOTICES[kind].name, detail);
    hideElement(elements.waiting);
    showElement(elements.form);
    setError(elements, { text: elements.notices[kind], link: NOTICES[kind].link, href: NOTICES[kind].href });
    showElement(elements.error);
    elements.busy = false;
  }

  /** The `error` code of a JSON error body, or ''. */
  function serverError(body) {
    try {
      const parsed = JSON.parse(String(body || ''));
      return parsed && typeof parsed.error === 'string' ? parsed.error : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Fills the error element with a notice, or puts the page's own content back when notice is null.
   */
  function setError(elements, notice) {
    const el = elements.error;
    if (!el) return;
    try {
      while (el.firstChild) el.removeChild(el.firstChild);
      elements.noticeShown = !!notice;
      if (!notice) {
        elements.errorContent.forEach((n) => el.appendChild(n.cloneNode(true)));
        return;
      }
      const line = document.createElement('div');
      line.appendChild(document.createTextNode(notice.text + ' '));
      const link = document.createElement('a');
      link.href = notice.href || ACCOUNT_URL;
      link.textContent = notice.link;
      line.appendChild(link);
      el.appendChild(line);
    } catch (e) {
      // the element keeps whatever it holds
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
   * Send a form to the member-forms endpoint with the member's session token.
   * Resolves with the same shape as submitForm.
   */
  async function submitToServer(form, action) {
    const token = await Promise.resolve(window.$memberstackDom.getMemberCookie()).catch(() => '');
    if (!token) throw new Error('No member session token');

    const fields = {};
    new FormData(form).forEach((value, name) => {
      if (typeof value === 'string' && IDENTITY_FIELDS.indexOf(name) === -1) fields[name] = value;
    });

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : null;
    try {
      const response = await fetch(MEMBER_FORMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + String(token) },
        body: JSON.stringify({ action: action, fields: fields }),
        signal: controller ? controller.signal : undefined
      });
      const body = await response.text().catch(() => '');
      return { ok: response.status === 200, status: response.status, body: body };
    } catch (err) {
      throw new Error(err && err.name === 'AbortError' ? 'Request timeout' : 'Network error');
    } finally {
      if (timer) clearTimeout(timer);
    }
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
