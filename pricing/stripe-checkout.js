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

    // Parse Memberstack data (will be {} if user not connected)
    var memData = JSON.parse(localStorage.getItem('_ms-mem') || '{}');
    var stripeCustomerId = memData.stripeCustomerId;
    var memberstackUserId = memData.id;
    var memberstackEmail = memData.auth?.email || null;

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

    // Fetch both sessions
    fetchCheckoutSessions();

    async function fetchCheckoutSessions() {
      var sessionId1, url1, sessionId2, url2;

      try {
        var resp = await fetch(
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
          }
        );
        var data = await resp.json();
        sessionId1 = data.sessionId1;
        url1 = data.url1;
        sessionId2 = data.sessionId2;
        url2 = data.url2;
      } catch (err) {
        console.error('[StripeCheckout] Fetch error:', err);
        alert('Une erreur est survenue lors du chargement de la page.');
        return;
      }

      // Fire-and-forget webhook helper
      function notifyWebhook(payload) {
        fetch('https://hook.eu1.make.com/jjwdfcdpudi0gv30z4838ckwruk77ffo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(payload)
        }).catch(function(err) {
          console.warn('[StripeCheckout] Webhook notify failed:', err);
        });
      }

      // Bind button #1
      btn1.addEventListener('click', function(e) {
        e.preventDefault();
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
