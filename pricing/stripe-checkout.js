/**
 * Ordotype Pricing - Stripe Checkout
 * Handles Stripe checkout session creation and button binding.
 */
(function() {
  'use strict';

  function init() {
    console.log('[StripeCheckout] Init');

    // Get all buttons (they might not exist on every page)
    var btn1 = document.getElementById('signup-prat-stripe-customer');
    var btn2 = document.getElementById('signup-rempla-stripe-customer');
    var noStripe1 = document.getElementById('signup-prat-from-decouverte');
    var noStripe2 = document.getElementById('signup-rempla-from-decouverte');

    // If none of these elements exist, we're not on a checkout page
    if (!btn1 && !btn2 && !noStripe1 && !noStripe2) {
      console.log('[StripeCheckout] Not on a checkout page, skipping');
      return;
    }

    // Memberstack data (from shared utility)
    var ms = window.OrdoMemberstack || {};
    var stripeCustomerId = ms.stripeCustomerId;
    var memberstackUserId = ms.memberId;
    var memberstackEmail = ms.email;

    // User not connected or no Stripe customer ID
    if (!stripeCustomerId) {
      // Hide Stripe buttons, show fallback buttons
      if (btn1) btn1.style.display = 'none';
      if (btn2) btn2.style.display = 'none';
      if (noStripe1) noStripe1.style.display = 'flex';
      if (noStripe2) noStripe2.style.display = 'flex';
      console.log('[StripeCheckout] No Stripe customer, showing fallback buttons');
      return;
    }

    // User is connected with Stripe customer ID
    // Show Stripe buttons, hide fallback buttons
    if (noStripe1) noStripe1.style.display = 'none';
    if (noStripe2) noStripe2.style.display = 'none';
    if (btn1) btn1.style.display = 'flex';
    if (btn2) btn2.style.display = 'flex';

    // If buttons don't exist, can't continue with checkout setup
    if (!btn1 || !btn2) {
      console.warn('[StripeCheckout] Stripe buttons missing, cannot setup checkout');
      return;
    }

    // Static URLs
    var successUrl = 'https://www.ordotype.fr/membership/mes-informations-praticien';
    var cancelUrl = window.location.href;

    // Read data from buttons
    var priceId1 = btn1.dataset.price;
    var couponId1 = btn1.dataset.coupon || null;
    var priceId2 = btn2.dataset.price;
    var couponId2 = btn2.dataset.coupon || null;

    var paymentMethods = ['sepa_debit'];

    // Retry fetch on network errors (TypeError) — transient mobile failures
    function fetchWithRetry(url, options, retries, delay) {
      return fetch(url, options).catch(function(err) {
        if (retries > 0 && err instanceof TypeError) {
          console.log('[StripeCheckout] Network error, retrying... (' + retries + ' left)');
          return new Promise(function(resolve) {
            setTimeout(resolve, delay || 1000);
          }).then(function() {
            return fetchWithRetry(url, options, retries - 1, delay);
          });
        }
        throw err;
      });
    }

    // Fetch both sessions
    fetchCheckoutSessions();

    async function fetchCheckoutSessions() {
      var sessionId1, url1, sessionId2, url2;

      try {
        var resp = await fetchWithRetry(
          'https://ordotype-stripe-double-checkout.netlify.app/.netlify/functions/create-checkout-session',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stripeCustomerId: stripeCustomerId,
              priceId1: priceId1,
              couponId1: couponId1,
              priceId2: priceId2,
              couponId2: couponId2,
              successUrl: successUrl,
              cancelUrl: cancelUrl,
              payment_method_types: paymentMethods
            })
          },
          2, 1000
        );
        var data = await resp.json();

        // Check for currency mismatch redirect
        if (data.reason === 'currency_mismatch' && data.redirectUrl) {
          console.log('[StripeCheckout] Currency mismatch - redirecting to:', data.redirectUrl);
          window.location.href = data.redirectUrl;
          return;
        }

        sessionId1 = data.sessionId1;
        url1 = data.url1;
        sessionId2 = data.sessionId2;
        url2 = data.url2;
      } catch (err) {
        console.error('[StripeCheckout] Fetch error:', err);
        if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout (pricing)', err);
        alert('Une erreur est survenue lors du chargement de la page.');
        return;
      }

      // Fire-and-forget webhook helper via proxy
      // Uses sendBeacon to survive page navigation (no CORS preflight with text/plain)
      function notifyWebhook(payload) {
        var url = 'https://ordotype-stripe-double-checkout.netlify.app/.netlify/functions/notify-webhook';
        var data = JSON.stringify({ type: 'abandon-cart', ...payload });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }));
        } else {
          fetch(url, {
            method: 'POST',
            keepalive: true,
            body: data
          }).catch(function() {});
        }
      }

      // Double-click prevention
      var isRedirecting = false;

      // Bind button #1
      btn1.addEventListener('click', function(e) {
        e.preventDefault();
        if (isRedirecting) return;
        isRedirecting = true;
        btn1.innerText = 'Patientez…';
        btn1.disabled = true;
        notifyWebhook({
          timestamp: new Date().toISOString(),
          checkoutSessionId: sessionId1,
          url: url1,
          stripeCustomerId: stripeCustomerId,
          memberstackUserId: memberstackUserId,
          memberstackEmail: memberstackEmail,
          option: 'praticien',
          priceId: priceId1,
          coupon: couponId1,
          originPage: window.location.href,
          paymentMethods: paymentMethods
        });
        window.location.href = url1;
      });

      // Bind button #2
      btn2.addEventListener('click', function(e) {
        e.preventDefault();
        if (isRedirecting) return;
        isRedirecting = true;
        btn2.innerText = 'Patientez…';
        btn2.disabled = true;
        notifyWebhook({
          timestamp: new Date().toISOString(),
          checkoutSessionId: sessionId2,
          url: url2,
          stripeCustomerId: stripeCustomerId,
          memberstackUserId: memberstackUserId,
          memberstackEmail: memberstackEmail,
          option: 'rempla',
          priceId: priceId2,
          coupon: couponId2,
          originPage: window.location.href,
          paymentMethods: paymentMethods
        });
        window.location.href = url2;
      });

      console.log('[StripeCheckout] Buttons bound');
    }
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
