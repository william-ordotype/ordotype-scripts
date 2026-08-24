/**
 * Ordotype Account - Delete Account
 * Handles account deletion flow with confirmation.
 * Depends on: core.js
 */
(function() {
  'use strict';

  const member = window.OrdoAccount && window.OrdoAccount.member;
  if (!member || !member.id) return;

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

  function setupFormHandler(form) {
    const messages = {
      waiting: document.getElementById('waiting-message-delete'),
      success: document.getElementById('success-message-delete'),
      error: document.getElementById('error-message-delete')
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Show waiting state
      form.style.display = 'none';
      if (messages.waiting) messages.waiting.style.display = 'block';

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form)
        });

        if (!response.ok) throw new Error('Delete request failed');

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

        if (messages.waiting) messages.waiting.style.display = 'none';
        if (messages.error) messages.error.style.display = 'block';
        form.style.display = 'block';
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
