/**
 * Ordotype Mes Informations - Checkout
 * Intercepts #profileForm submit and redirects to Stripe checkout.
 * Only loaded when config.enableCheckout is true (praticien-sepa page).
 *
 * Depends on: core.js
 */
(function() {
  'use strict';

  var PREFIX = '[ProfileCheckout]';

  function init() {
    var form = document.getElementById('profileForm');
    if (!form) {
      console.error(PREFIX, '#profileForm not found');
      return;
    }

    console.log(PREFIX, '#profileForm found, installing handler');

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      console.log(PREFIX, 'form.submit intercepted');

      var fnUrl = 'https://ordotype-stripe-checkout-sessions.netlify.app/.netlify/functions/create-checkout-session';

      // Read config for payment methods
      var config = window.OrdoMesInfos ? window.OrdoMesInfos.config : {};
      var paymentMethods = config.checkoutPaymentMethods || ['sepa_debit'];

      // Read member data from localStorage
      var raw = '{}';
      try { raw = localStorage.getItem('_ms-mem') || '{}'; } catch (err) {}
      var mem = {};
      try { mem = JSON.parse(raw); } catch (err) {}

      // Optional overrides from form data attributes
      var priceId = form.dataset.price || null;
      var couponId = form.dataset.coupon || null;
      var successUrl = form.dataset.successUrl || null;

      var payload = {
        stripeCustomerId: mem.stripeCustomerId || null,
        payment_method_types: paymentMethods,
        cancelUrl: window.location.href
      };

      if (priceId) payload.priceId = priceId;
      if (couponId) payload.couponId = couponId;
      if (successUrl) payload.successUrl = successUrl;

      console.log(PREFIX, 'request payload:', payload);

      fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function(resp) {
        console.log(PREFIX, 'response status:', resp.status);
        return resp.text();
      })
      .then(function(text) {
        console.log(PREFIX, 'raw response body:', text);

        var data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          console.error(PREFIX, 'JSON parse error', parseErr);
          alert('Unexpected server response; check console');
          return;
        }

        if (data.url) {
          console.log(PREFIX, 'redirecting to', data.url);
          window.location.href = data.url;
        } else {
          console.error(PREFIX, 'no url in response', data);
          alert('No checkout URL returned; check console');
        }
      })
      .catch(function(err) {
        console.error(PREFIX, 'network/error', err);
        alert('Error calling payment API; check console');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
