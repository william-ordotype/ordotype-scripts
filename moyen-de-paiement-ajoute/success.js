/**
 * Ordotype - Payment Method Added Success
 * Handles success page after payment method is added.
 * Counts down, then redirects to the homepage.
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
  const REDIRECT_URL = '/';

  /**
   * Initialize on DOM ready
   */
  function init() {
    // Set payment timestamp for grace period (24 hours)
    localStorage.setItem('justPaidTs', Date.now());
    setTimeout(() => localStorage.removeItem('justPaidTs'), 86400000);

    console.log(PREFIX, 'Payment method added successfully');

    startCountdown(COUNTDOWN_SECONDS, REDIRECT_URL);
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
