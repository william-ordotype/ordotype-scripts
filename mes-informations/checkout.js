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

      // Read member data from localStorage
      var raw = '{}';
      try { raw = localStorage.getItem('_ms-mem') || '{}'; } catch (err) {}
      var mem = {};
      try { mem = JSON.parse(raw); } catch (err) {}

      var payload = {
        memberId: mem.id,
        email: mem.auth && mem.auth.email ? mem.auth.email : null,
        stripeCustomerId: mem.stripeCustomerId || null,
        cancelUrl: window.location.href
      };

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
