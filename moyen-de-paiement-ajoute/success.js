/**
 * Ordotype - Payment Method Added Success
 * Handles success page after payment method is added.
 * Creates billing portal session and redirects user.
 *
 * Page: /membership/moyen-de-paiement-ajoute
 *
 * Required DOM elements:
 * - #countdown - Countdown number display
 * - #label - "seconde(s)" label
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement-ajoute/success.js"></script>
 */
(function() {
  'use strict';

  const PREFIX = '[PaymentSuccess]';
  const COUNTDOWN_SECONDS = 2;
  const BILLING_PORTAL_URL = 'https://ordotype-stripe-setup-session.netlify.app/.netlify/functions/create-billing-portal';
  const WEBHOOK_URL = 'https://ordotype-stripe-setup-session.netlify.app/.netlify/functions/notify-webhook';

  /**
   * Initialize on DOM ready
   */
  function init() {
    // Set payment timestamp for grace period (2 minutes)
    localStorage.setItem('justPaidTs', Date.now());
    setTimeout(() => localStorage.removeItem('justPaidTs'), 120000);

    console.log(PREFIX, 'Payment method added successfully');

    // Get member data
    const memData = JSON.parse(localStorage.getItem('_ms-mem') || '{}');
    const stripeCustomerId = memData.stripeCustomerId;
    const setupSessionId = new URLSearchParams(window.location.search).get('session_id');

    if (!stripeCustomerId) {
      console.error(PREFIX, 'No Stripe customer ID found');
      startCountdown(COUNTDOWN_SECONDS, '/');
      return;
    }

    // Create billing portal and redirect
    createBillingPortalAndRedirect(stripeCustomerId, setupSessionId, memData);
  }

  /**
   * Create billing portal session and redirect
   */
  async function createBillingPortalAndRedirect(stripeCustomerId, setupSessionId, memData) {
    const returnUrl = window.location.origin;

    try {
      const response = await fetch(BILLING_PORTAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripeCustomerId: stripeCustomerId,
          returnUrl: returnUrl
        })
      });

      const data = await response.json();
      console.log(PREFIX, 'Billing portal session created:', data);

      if (!data.url) {
        throw new Error('No portal URL received');
      }

      // Extract portal session ID
      const portalSessionId = data.id || extractSessionIdFromUrl(data.url);

      // Send success tracking webhook
      sendTrackingWebhook(stripeCustomerId, setupSessionId, portalSessionId, memData);

      // Start countdown and redirect to billing portal
      startCountdown(COUNTDOWN_SECONDS, data.url);

    } catch (error) {
      console.error(PREFIX, 'Error:', error);
      // Fallback: redirect to homepage
      startCountdown(COUNTDOWN_SECONDS, '/');
    }
  }

  /**
   * Send tracking webhook to Make
   */
  function sendTrackingWebhook(stripeCustomerId, setupSessionId, portalSessionId, memData) {
    const payload = {
      type: 'setup-tracking',
      checkoutSessionId: setupSessionId || portalSessionId,
      stripeCustomerId: stripeCustomerId,
      memberstackUserId: memData.id,
      memberstackEmail: memData.auth?.email || memData.email,
      option: 'success_redirect',
      paymentMethods: ['setup_complete'],
      originPage: window.location.href
    };

    console.log(PREFIX, 'Sending payload:', payload);

    fetch(WEBHOOK_URL, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(() => console.log(PREFIX, 'Webhook sent'))
    .catch(err => console.error(PREFIX, 'Webhook error:', err));
  }

  /**
   * Extract session ID from billing portal URL
   */
  function extractSessionIdFromUrl(url) {
    const patterns = [/\/p\/session\/([^?#]+)/, /\/session\/([^?#]+)/];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  /**
   * Start countdown and redirect
   */
  function startCountdown(seconds, redirectUrl) {
    const countdownEl = document.getElementById('countdown');
    const labelEl = document.getElementById('label');

    const updateDisplay = (sec) => {
      if (countdownEl) countdownEl.textContent = sec;
      if (labelEl) labelEl.textContent = sec <= 1 ? 'seconde' : 'secondes';
    };

    updateDisplay(seconds);

    const interval = setInterval(() => {
      seconds -= 1;
      if (seconds >= 0) {
        updateDisplay(seconds);
      }
      if (seconds === 0) {
        clearInterval(interval);
        console.log(PREFIX, 'Redirecting to:', redirectUrl);
        window.location.href = redirectUrl;
      }
    }, 1000);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
