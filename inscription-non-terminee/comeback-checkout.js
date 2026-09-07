/**
 * Comeback Checkout for "Inscription non terminée" (/inscription-non-terminee/[slug])
 *
 * This is the page the user lands on when they CANCEL the Stripe Checkout that
 * was opened from /nos-offres (pricing/stripe-checkout.js) or /nos-offres-v2
 * (pricing-v2/stripe-checkout.js). It shows the offer they abandoned and a
 * "Finaliser l'inscription" button to resume.
 *
 * Behaviour:
 *   1. Reuse the abandoned session — the pricing scripts stash the Stripe
 *      Checkout Session URL in localStorage (key `ordo-pending-checkout-<option>`)
 *      right before redirecting to Stripe. Stripe session URLs stay valid ~24h,
 *      so the button just re-opens the EXACT session the user left.
 *   2. Fallback — if no stashed session exists or it has expired (> 24h), create
 *      a fresh single-offer session via the checkout.ordotype.fr function, using
 *      priceId/couponId from the CMS config.
 *
 * Reads config from window.COMEBACK_CONFIG (set by Webflow CMS).
 *
 * Usage in Webflow (footer of the /inscription-non-terminee/[slug] template):
 *   <script>
 *   window.COMEBACK_CONFIG = {
 *       option: "{{wf slug}}",              // 'praticien' | 'rempla' — must match the cancelUrl slug
 *       priceId: "{{wf stripepriceid}}",    // for the fresh-session fallback
 *       couponId: "{{wf code-promo}}",
 *       paymentMethods: "{{wf payment-method-types}}".split(',')
 *   };
 *   </script>
 *   <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-non-terminee/comeback-checkout.js"></script>
 *
 * Required DOM element:
 *   #checkoutStripe — the "Finaliser l'inscription" button.
 */
(function() {
  'use strict';

  var PREFIX = '[ComebackCheckout]';

  // GA4: the fresh checkout session could not be created, so the button has no
  // Stripe URL to send the user to. Pairs with comeback_resume_click — without
  // this event a broken fallback looks like a user who simply did not click.
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

  // Un accessoire qui échoue ne doit pas rester muet, sinon la panne efface son
  // propre témoin. Canal d'erreurs du site s'il est chargé, sinon un ErrorEvent
  // que le handler global capte.
  function reportSideEffect(err) {
    try {
      if (window.OrdoErrorReporter) {
        window.OrdoErrorReporter.report('ComebackCheckout', err);
        return;
      }
      var e = err instanceof Error ? err : new Error(String(err));
      window.dispatchEvent(new ErrorEvent('error', { message: e.message, error: e }));
    } catch (ignored) {}
  }

  // La mesure ne doit jamais casser la page : tout push passe par ici.
  function track(payload) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (err) {
      reportSideEffect(err);
    }
  }

  // Same signature in every emitter, so the block can be copied between files
  // without silently changing what lands in `failure_reason`.
  function trackCheckoutFailure(reason, option) {
    track({
      event: 'checkout_failed',
      checkout_source: 'comeback',
      failure_reason: reason,
      option: option || ''
    });
  }

  // A stashed Stripe Checkout Session URL is good for ~24h. Be a little
  // conservative (23h) so we never hand the user an about-to-expire link.
  var SESSION_MAX_AGE_MS = 23 * 60 * 60 * 1000;

  function init() {
    console.log(PREFIX, 'Init');

    var btn = document.getElementById('checkoutStripe');
    if (!btn) {
      console.warn(PREFIX, 'No #checkoutStripe button found, skipping');
      return;
    }

    var config = window.COMEBACK_CONFIG || {};
    var option = config.option || 'praticien';

    // GA4: user abandoned Stripe Checkout and landed on the comeback page.
    // Pairs with comeback_resume_click (below) to measure recovery rate.
    track({ event: 'comeback_view', option: option });

    // Memberstack data (prefer shared utility, fallback to inline parsing)
    var ms = window.OrdoMemberstack;
    if (!ms) {
      try {
        var raw = localStorage.getItem('_ms-mem');
        var parsed = raw ? JSON.parse(raw) : {};
        ms = {
          stripeCustomerId: parsed.stripeCustomerId,
          memberId: parsed.id,
          email: (parsed.auth && parsed.auth.email) || null
        };
      } catch (e) {
        ms = {};
      }
    }
    var stripeCustomerId = ms.stripeCustomerId;
    var memberstackUserId = ms.memberId;
    var memberstackEmail = ms.email;

    // 1) Try to reuse the abandoned session stashed by the pricing scripts.
    var pendingUrl = readStashedSessionUrl(option);
    if (pendingUrl) {
      console.log(PREFIX, 'Reusing abandoned session for option:', option);
      bindButton(btn, pendingUrl, option);
      return;
    }

    // 2) Fallback — create a fresh session. Needs a Stripe customer + a priceId.
    console.log(PREFIX, 'No valid stashed session, falling back to fresh session');

    if (!stripeCustomerId) {
      console.warn(PREFIX, 'No Stripe customer ID — cannot create fresh session');
      // Leave the button as-is; its native href (e.g. /nos-offres) still works.
      trackCheckoutFailure('no_customer_id', option);
      return;
    }

    var priceId = config.priceId || '';
    var couponId = config.couponId || null;
    var paymentMethods = (config.paymentMethods && config.paymentMethods.length)
      ? config.paymentMethods
      : ['card', 'sepa_debit'];

    if (!priceId) {
      console.warn(PREFIX, 'No priceId in COMEBACK_CONFIG — cannot create fresh session');
      trackCheckoutFailure('no_price_id', option);
      return;
    }

    createFreshSession({
      stripeCustomerId: stripeCustomerId,
      memberstackUserId: memberstackUserId,
      memberstackEmail: memberstackEmail,
      priceId: priceId,
      couponId: couponId,
      paymentMethods: paymentMethods,
      option: option
    }).then(function(session) {
      if (session && session.url) {
        bindButton(btn, session.url, option, session.sessionId, {
          priceId: priceId,
          couponId: couponId,
          option: option,
          paymentMethods: paymentMethods,
          stripeCustomerId: stripeCustomerId,
          memberstackUserId: memberstackUserId,
          memberstackEmail: memberstackEmail
        });
      } else {
        console.warn(PREFIX, 'Fresh session unavailable; leaving button default href');
      }
    });
  }

  // Read the stashed session URL for an option, validating its age.
  // Returns the URL string, or null if missing/expired/invalid.
  function readStashedSessionUrl(option) {
    var key = 'ordo-pending-checkout-' + option;
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.url) return null;
      var age = Date.now() - (data.timestamp || 0);
      if (age > SESSION_MAX_AGE_MS) {
        console.log(PREFIX, 'Stashed session expired (age ms:', age, ')');
        localStorage.removeItem(key);
        return null;
      }
      return data.url;
    } catch (e) {
      console.warn(PREFIX, 'Could not read stashed session:', e);
      return null;
    }
  }

  // Create a fresh single-offer checkout session (same endpoint auto-checkout uses).
  function createFreshSession(ctx) {
    var fnUrl = 'https://checkout.ordotype.fr/.netlify/functions/create-checkout-session';
    var successUrl = 'https://www.ordotype.fr/membership/mes-informations-praticien';
    var cancelUrl = window.location.href; // stay on the comeback page on re-cancel

    return fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stripeCustomerId: ctx.stripeCustomerId,
        priceId: ctx.priceId,
        couponId: ctx.couponId,
        successUrl: successUrl,
        cancelUrl: cancelUrl,
        payment_method_types: ctx.paymentMethods
      })
    }).then(function(resp) {
      if (!resp.ok) throw new Error('Session API error: ' + resp.status);
      return resp.json();
    }).then(function(data) {
      if (data.reason === 'currency_mismatch' && data.redirectUrl) {
        console.log(PREFIX, 'Currency mismatch — redirecting to:', data.redirectUrl);
        window.location.href = data.redirectUrl;
        return null;
      }
      if (!data.sessionId || !data.url) throw new Error('Invalid session payload');
      return { sessionId: data.sessionId, url: data.url };
    }).catch(function(err) {
      console.error(PREFIX, 'Fresh session error:', err);
      if (window.OrdoErrorReporter) OrdoErrorReporter.report('ComebackCheckout', err);
      trackCheckoutFailure(checkoutFailureReason(err), ctx && ctx.option);
      return null;
    });
  }

  // Bind the "Finaliser l'inscription" button to a checkout URL.
  // `abandonCtx` (optional) is only present for fresh sessions, where we want
  // a fresh abandon-cart webhook + GTM event on click.
  // `option` is passed in: this function is a sibling of init(), not nested in
  // it, so it cannot read init()'s local. Reading it from the enclosing scope
  // threw a ReferenceError under 'use strict' and killed the click handler
  // before the redirect, leaving the button dead.
  function bindButton(btn, checkoutUrl, option, sessionId, abandonCtx) {
    var isRedirecting = false;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      if (isRedirecting) return;
      isRedirecting = true;
      btn.innerText = 'Patientez…';
      btn.disabled = true;

      // Mesure et webhook sont accessoires : ils s'exécutent sous try, la
      // redirection part du finally. Un accessoire qui jette ne peut donc pas
      // laisser l'utilisateur sur un bouton « Patientez… » mort. Les pushs
      // restent avant la navigation pour que sendBeacon ait le temps de partir.
      try {
        // Fires for BOTH the reused-session and fresh-session paths, so it's
        // the canonical "recovery attempt" step. (stripe_signup_click below
        // only fires on the fresh-session path, where we have a new session id.)
        track({
          event: 'comeback_resume_click',
          option: option,
          reused: !abandonCtx   // true = re-opened abandoned session, false = fresh
        });

        if (abandonCtx) {
          notifyWebhook({
            timestamp: new Date().toISOString(),
            checkoutSessionId: sessionId,
            url: checkoutUrl,
            stripeCustomerId: abandonCtx.stripeCustomerId,
            memberstackUserId: abandonCtx.memberstackUserId,
            memberstackEmail: abandonCtx.memberstackEmail,
            option: abandonCtx.option,
            priceId: abandonCtx.priceId,
            coupon: abandonCtx.couponId,
            originPage: window.location.href,
            paymentMethods: abandonCtx.paymentMethods
          });
          track({
            event: 'stripe_signup_click',
            option: abandonCtx.option,
            priceId: abandonCtx.priceId,
            coupon: abandonCtx.couponId,
            checkoutSessionId: sessionId
          });
        }
      } catch (err) {
        reportSideEffect(err);
      } finally {
        window.location.href = checkoutUrl;
      }
    });
    console.log(PREFIX, 'Button bound');
  }

  // Fire-and-forget abandon-cart webhook via proxy (survives navigation).
  function notifyWebhook(payload) {
    var url = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';
    var data = JSON.stringify({ type: 'abandon-cart', ...payload });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }));
    } else {
      fetch(url, { method: 'POST', keepalive: true, body: data }).catch(function() {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
