/**
 * Ordotype Pricing V2 - Stripe Checkout
 * Handles Stripe checkout session creation and button binding.
 * Difference from V1: payment methods include both 'card' and 'sepa_debit'
 */
(function() {
  'use strict';

  // GA4: the checkout session could not be created, so the user never reaches
  // Stripe. Pairs with stripe_signup_click, which only fires once a session
  // exists — without this event a broken checkout leaves no trace in analytics.
  function checkoutFailureReason(err) {
    var msg = (err && err.message) || '';
    var status = /Session API error:?\s*\(?(\d{3})/.exec(msg);
    if (status) return 'api_' + status[1];
    if (/Invalid (session payload|checkout session response)/.test(msg)) return 'invalid_payload';
    // Only a genuine fetch failure. A TypeError raised while reading a property
    // off a malformed response is a server problem, not a connectivity one, and
    // must not be filed as 'network'.
    if (err && err.name === 'TypeError' && /fetch|network|load failed|connection/i.test(msg)) {
      return 'network';
    }
    return 'other';
  }

  // La mesure ne doit jamais casser la page. Les pushs de ce fichier se trouvent
  // juste avant la redirection vers Stripe : une erreur dedans empêcherait le
  // paiement. C'est exactement ce qui a tué le bouton de la page comeback
  // pendant dix semaines. Tout push passe par ici.
  function track(payload) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (e) {}
  }

  // Same signature in every emitter, so the block can be copied between files
  // without silently changing what lands in `failure_reason`.
  function trackCheckoutFailure(reason, option) {
    track({
      event: 'checkout_failed',
      checkout_source: 'pricing-v2',
      failure_reason: reason,
      option: option || ''
    });
  }

  function init() {
    console.log('[StripeCheckoutV2] Init');

    // Get all buttons (they might not exist on every page)
    var btn1 = document.getElementById('signup-prat-stripe-customer');
    var btn2 = document.getElementById('signup-rempla-stripe-customer');
    var noStripe1 = document.getElementById('signup-prat-from-decouverte');
    var noStripe2 = document.getElementById('signup-rempla-from-decouverte');

    // If none of these elements exist, we're not on a checkout page
    if (!btn1 && !btn2 && !noStripe1 && !noStripe2) {
      console.log('[StripeCheckoutV2] Not on a checkout page, skipping');
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
      console.log('[StripeCheckoutV2] No Stripe customer, showing fallback buttons');
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
      console.warn('[StripeCheckoutV2] Stripe buttons missing, cannot setup checkout');
      return;
    }

    // Static URLs
    var successUrl = 'https://www.ordotype.fr/membership/mes-informations-praticien';
    // On cancel/abandon, send the user to the dedicated "comeback" page for the
    // offer they were subscribing to (CMS-driven: /inscription-non-terminee/[slug]).
    // Each option has its own slug so the page can show the right offer details.
    // These are sent as cancelUrl1 (Praticien) / cancelUrl2 (Rempla) so the
    // backend gives each Stripe session its own cancel page.
    // /nos-offres-v2 includes Card (CB), so the comeback pages are the "-cb" slugs.
    var comebackBaseUrl = 'https://www.ordotype.fr/inscription-non-terminee/';
    var cancelUrl1 = comebackBaseUrl + 'praticien-cb';
    var cancelUrl2 = comebackBaseUrl + 'rempla-cb';

    // Read data from buttons
    var priceId1 = btn1.dataset.price;
    var couponId1 = btn1.dataset.coupon || null;
    var priceId2 = btn2.dataset.price;
    var couponId2 = btn2.dataset.coupon || null;

    // V2 difference: includes both card and sepa_debit
    var paymentMethods = ['card', 'sepa_debit'];

    // Retry fetch on network errors (TypeError) — transient mobile failures
    function fetchWithRetry(url, options, retries, delay) {
      return fetch(url, options).catch(function(err) {
        if (retries > 0 && err instanceof TypeError) {
          console.log('[StripeCheckoutV2] Network error, retrying... (' + retries + ' left)');
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
          'https://pricing.ordotype.fr/.netlify/functions/create-checkout-session',
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
              cancelUrl1: cancelUrl1,
              cancelUrl2: cancelUrl2,
              payment_method_types: paymentMethods
            })
          },
          2, 1000
        );
        // fetchWithRetry only retries network errors, so a 4xx/5xx arrives here
        // as a perfectly readable Response. Without this check the JSON error
        // body parses, url1/url2 come out undefined, the catch never runs and
        // the buttons end up bound to `undefined`.
        if (!resp.ok) throw new Error('Session API error: ' + resp.status);

        var data = await resp.json();

        // Check for currency mismatch redirect
        if (data && data.reason === 'currency_mismatch' && data.redirectUrl) {
          console.log('[StripeCheckoutV2] Currency mismatch - redirecting to:', data.redirectUrl);
          window.location.href = data.redirectUrl;
          return;
        }

        if (!data || !data.url1 || !data.url2) throw new Error('Invalid session payload');

        sessionId1 = data.sessionId1;
        url1 = data.url1;
        sessionId2 = data.sessionId2;
        url2 = data.url2;
      } catch (err) {
        console.error('[StripeCheckoutV2] Fetch error:', err);
        if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckoutV2', err);
        // Restore the Memberstack fallback first: the user must never wait on a
        // tag callback, and dataLayer.push runs GTM's callbacks synchronously.
        if (btn1) btn1.style.display = 'none';
        if (btn2) btn2.style.display = 'none';
        if (noStripe1) noStripe1.style.display = 'flex';
        if (noStripe2) noStripe2.style.display = 'flex';
        trackCheckoutFailure(checkoutFailureReason(err));
        return;
      }

      // Fire-and-forget webhook helper via proxy
      // Uses sendBeacon to survive page navigation (no CORS preflight with text/plain)
      function notifyWebhook(payload) {
        var url = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';
        var data = JSON.stringify({ type: 'abandon-cart', ...payload });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }));
        } else {
          fetch(url, { method: 'POST', keepalive: true, body: data }).catch(function() {});
        }
      }

      // Stash the Stripe Checkout Session URL so the "comeback" page
      // (/inscription-non-terminee/[slug]) can re-open the EXACT session the
      // user abandoned instead of creating a new one. Stripe session URLs are
      // valid ~24h; we store a timestamp so the comeback page can fall back to
      // a fresh session if it has expired. Keyed by option so each comeback
      // page reads its own pending session.
      function stashCheckoutSession(option, sessionId, url) {
        try {
          localStorage.setItem('ordo-pending-checkout-' + option, JSON.stringify({
            url: url,
            sessionId: sessionId,
            timestamp: Date.now()
          }));
        } catch (e) {
          // localStorage unavailable (private mode / quota) — non-fatal
          console.warn('[StripeCheckoutV2] Could not stash checkout session:', e);
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
        stashCheckoutSession('praticien-cb', sessionId1, url1);
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
        track({
          event: 'stripe_signup_click',
          option: 'praticien',
          priceId: priceId1,
          coupon: couponId1,
          checkoutSessionId: sessionId1
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
        stashCheckoutSession('rempla-cb', sessionId2, url2);
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
        track({
          event: 'stripe_signup_click',
          option: 'rempla',
          priceId: priceId2,
          coupon: couponId2,
          checkoutSessionId: sessionId2
        });
        window.location.href = url2;
      });

      console.log('[StripeCheckoutV2] Buttons bound');
    }
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
