/**
 * Ordotype Account - Delete Account
 * Handles account deletion flow with confirmation.
 * Depends on: core.js
 *
 * The request carries only the member's session token: the server reads the account to delete
 * from that session, never from the page. The form's own action and fields are not used.
 */
(function() {
  'use strict';

  const member = window.OrdoAccount && window.OrdoAccount.member;
  if (!member || !member.id) return;

  const DELETE_URL = 'https://webhooks.ordotype.fr/.netlify/functions/account-delete';
  const MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s
  const REQUEST_TIMEOUT_MS = 15000;

  function init() {
    const deleteBtn = document.getElementById('delete-account-btn');
    const formContainer = document.getElementById('delete-account-form-v2');
    const deleteForm = document.getElementById('delete-form');

    // Show form when button clicked
    if (deleteBtn && formContainer) {
      deleteBtn.addEventListener('click', () => {
        deleteBtn.style.display = 'none';
        formContainer.style.display = 'block';
      });
    }

    // Handle form submission
    if (deleteForm) {
      setupFormHandler(deleteForm);
    }

    console.log('[DeleteAccount] Initialized');
  }

  function memberToken() {
    return new Promise(function(resolve) {
      var attempts = 0;
      (function poll() {
        if (window.$memberstackDom) return resolve(window.$memberstackDom);
        if (++attempts > MS_MAX_ATTEMPTS) return resolve(null);
        setTimeout(poll, 200);
      })();
    }).then(function(ms) {
      if (!ms || typeof ms.getMemberCookie !== 'function') return '';
      return Promise.resolve(ms.getMemberCookie()).then(function(t) {
        return t ? String(t) : '';
      });
    });
  }

  // A deletion that does not go through must not stay silent. Without a status the request got
  // no answer: reportNetwork knows whether the page was leaving, in which case there is no incident.
  function reportFailure(err) {
    const reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    try {
      if (!err.status && typeof reporter.reportNetwork === 'function') reporter.reportNetwork('DeleteAccount', err);
      else reporter.report('DeleteAccount', err);
    } catch (e) {
      console.error('[DeleteAccount] Report error:', e);
    }
  }

  async function requestDeletion() {
    const token = await memberToken().catch(function() { return ''; });
    if (!token) {
      const err = new Error('No member session token');
      err.status = 'no_token';
      throw err;
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(function() { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    try {
      const response = await fetch(DELETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: '{}',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) {
        const err = new Error('Delete request failed: HTTP ' + response.status);
        err.status = response.status;
        throw err;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function setupFormHandler(form) {
    const messages = {
      waiting: document.getElementById('waiting-message-delete'),
      success: document.getElementById('success-message-delete'),
      error: document.getElementById('error-message-delete')
    };
    let submitting = false;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitting) return;
      submitting = true;

      // Show waiting state
      form.style.display = 'none';
      if (messages.error) messages.error.style.display = 'none';
      if (messages.waiting) messages.waiting.style.display = 'block';

      try {
        await requestDeletion();

        // Success
        if (messages.waiting) messages.waiting.style.display = 'none';
        if (messages.success) messages.success.style.display = 'block';

        // Clean up
        localStorage.removeItem('_ms-mem');
        localStorage.removeItem('userExists');

        // Logout from Memberstack as cleanup after account deletion.
        // Distinct from a regular #logout-button click (which gets reason=user_clicked_button
        // via auth-cdn auth.forms.ts). reason is forwarded to Sentry by auth-cdn proxy.
        if (window.$memberstackDom) {
          await window.$memberstackDom.logout({ reason: 'account_deleted' });
        }

        // Redirect home
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);

      } catch (error) {
        console.error('[DeleteAccount] Error:', error);
        reportFailure(error);

        if (messages.waiting) messages.waiting.style.display = 'none';
        if (messages.error) messages.error.style.display = 'block';
        form.style.display = 'block';
        submitting = false;
      }
    });
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
