/**
 * Ordotype Pricing - Stripe Checkout
 * Handles Stripe checkout session creation and button binding.
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

  // Un accessoire qui échoue ne doit pas rester muet, sinon la panne efface son
  // propre témoin. Canal d'erreurs du site s'il est chargé, sinon un ErrorEvent
  // que le handler global capte.
  function reportSideEffect(err) {
    try {
      if (window.OrdoErrorReporter) {
        window.OrdoErrorReporter.report('StripeCheckout (pricing)', err);
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
      checkout_source: 'pricing',
      failure_reason: reason,
      option: option || ''
    });
  }

  var MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s

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
    // On cancel/abandon, send the user to the dedicated "comeback" page for the
    // offer they were subscribing to (CMS-driven: /inscription-non-terminee/[slug]).
    // Each option has its own slug so the page can show the right offer details.
    // These are sent as cancelUrl1 (Praticien) / cancelUrl2 (Rempla) so the
    // backend gives each Stripe session its own cancel page.
    // /nos-offres is SEPA-only, so the comeback pages are the "-sepa" slugs.
    var comebackBaseUrl = 'https://www.ordotype.fr/inscription-non-terminee/';
    var cancelUrl1 = comebackBaseUrl + 'praticien-sepa';
    var cancelUrl2 = comebackBaseUrl + 'rempla-sepa';

    // Read data from buttons
    var priceId1 = btn1.dataset.price;
    var couponId1 = btn1.dataset.coupon || null;
    var priceId2 = btn2.dataset.price;
    var couponId2 = btn2.dataset.coupon || null;

    // HTTP 409 from the checkout function: the member already has a subscription
    // to this offer's family, or a payment on it is pending. The Stripe buttons
    // become links to the account page; the fallback buttons stay hidden, since
    // they would start a second subscription. Any other 409 is a plain error.
    var ACCOUNT_URL = '/membership/compte';
    var CURRENT_OFFER_REASONS = ['already-subscribed', 'payment-pending'];
    function labelOf(btn) {
      var node = btn;
      while (node.children && node.children.length === 1) node = node.children[0];
      return node;
    }
    function showCurrentOffer(reason) {
      var pending = reason === 'payment-pending';
      var label = pending ? 'Régulariser mon paiement' : 'Mon offre actuelle';
      // Les boutons deviennent de vrais liens vers le compte : on cesse de
      // capturer leur clic, et un clic gardé ne part nulle part (il ouvrirait
      // un second abonnement).
      detachClicks();
      var dropped = takeHeldClick();
      if (noStripe1) noStripe1.style.display = 'none';
      if (noStripe2) noStripe2.style.display = 'none';
      [btn1, btn2].forEach(function(btn) {
        btn.setAttribute('href', ACCOUNT_URL);
        labelOf(btn).textContent = label;
        btn.style.display = 'flex';
      });
      trackCheckoutFailure(pending ? 'payment_pending' : 'already_subscribed');
      if (dropped) trackHeldClick(dropped, 'current_offer');
    }

    var paymentMethods = ['sepa_debit'];
    var pageCurrency = (window.OrdoPageCurrency || 'eur').toLowerCase();

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

    // Les boutons Stripe sont visibles dès maintenant, mais leurs sessions
    // n'arrivent qu'avec la réponse du serveur, une à quelques secondes plus
    // tard. Un clic dans cet intervalle ne faisait rien, sans un mot. Il est
    // désormais gardé : « Patientez… » tout de suite, puis Stripe dès que la
    // session est prête, ou le bouton Memberstack si sa création échoue.
    var WAIT_LABEL = 'Patientez…';
    var OFFERS = {
      praticien: { btn: btn1, fallback: noStripe1, priceId: priceId1, couponId: couponId1, stash: 'praticien-sepa' },
      rempla: { btn: btn2, fallback: noStripe2, priceId: priceId2, couponId: couponId2, stash: 'rempla-sepa' }
    };
    var sessions = null;      // { praticien: { id, url }, rempla: { id, url } }
    var isRedirecting = false;
    var heldClick = null;     // { option, at } : clic arrivé avant les sessions
    var savedLabels = {};

    function now() {
      return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now();
    }
    function showWaiting(option) {
      var label = labelOf(OFFERS[option].btn);
      if (!(option in savedLabels)) savedLabels[option] = label.textContent;
      label.textContent = WAIT_LABEL;
    }
    function restoreLabels() {
      Object.keys(savedLabels).forEach(function(option) {
        labelOf(OFFERS[option].btn).textContent = savedLabels[option];
      });
      savedLabels = {};
    }
    function takeHeldClick() {
      var held = heldClick;
      heldClick = null;
      return held;
    }
    // Sans cet événement, un clic arrivé trop tôt ne laisse aucune trace : il
    // compte les clics gardés, leur attente et leur issue. Le corps est construit
    // sous try : sur le chemin du succès, la redirection vers Stripe le suit.
    function trackHeldClick(held, outcome) {
      try {
        track({
          event: 'checkout_click_held',
          checkout_source: 'pricing',
          option: held.option,
          outcome: outcome,
          wait_ms: Math.round(now() - held.at)
        });
      } catch (err) {
        reportSideEffect(err);
      }
    }

    // Fire-and-forget webhook helper via proxy
    // Uses sendBeacon to survive page navigation (no CORS preflight with text/plain)
    function notifyWebhook(payload) {
      var url = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';
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
        console.warn('[StripeCheckout] Could not stash checkout session:', e);
      }
    }

    function goToCheckout(option) {
      var offer = OFFERS[option];
      var session = sessions[option];
      isRedirecting = true;
      showWaiting(option);
      // Stash, webhook et mesure sont accessoires : ils s'exécutent sous try,
      // la redirection part du finally. Un accessoire qui jette ne peut donc
      // pas laisser l'utilisateur sur un bouton « Patientez… » mort. Les
      // pushs restent avant la navigation pour que sendBeacon parte.
      try {
        stashCheckoutSession(offer.stash, session.id, session.url);
        notifyWebhook({
          timestamp: new Date().toISOString(),
          checkoutSessionId: session.id,
          url: session.url,
          stripeCustomerId: stripeCustomerId,
          memberstackUserId: memberstackUserId,
          memberstackEmail: memberstackEmail,
          option: option,
          priceId: offer.priceId,
          coupon: offer.couponId,
          originPage: window.location.href,
          paymentMethods: paymentMethods
        });
        track({
          event: 'stripe_signup_click',
          option: option,
          priceId: offer.priceId,
          coupon: offer.couponId,
          checkoutSessionId: session.id
        });
      } catch (err) {
        reportSideEffect(err);
      } finally {
        window.location.href = session.url;
      }
    }

    function onStripeClick(option) {
      return function(e) {
        e.preventDefault();
        // Double-click prevention, y compris pendant l'attente des sessions.
        if (isRedirecting || heldClick) return;
        if (sessions) {
          goToCheckout(option);
          return;
        }
        heldClick = { option: option, at: now() };
        showWaiting(option);
        console.log('[StripeCheckout] Click held until the checkout sessions are ready:', option);
      };
    }
    var clickHandlers = { praticien: onStripeClick('praticien'), rempla: onStripeClick('rempla') };
    function detachClicks() {
      btn1.removeEventListener('click', clickHandlers.praticien);
      btn2.removeEventListener('click', clickHandlers.rempla);
    }
    btn1.addEventListener('click', clickHandlers.praticien);
    btn2.addEventListener('click', clickHandlers.rempla);

    // Retour arrière depuis Stripe : le navigateur peut ressortir la page de
    // son cache telle qu'on l'a quittée, bouton sur « Patientez… » et clic
    // verrouillé. Les sessions restent valables : on rend la main.
    window.addEventListener('pageshow', function(e) {
      if (!e.persisted || !isRedirecting) return;
      isRedirecting = false;
      restoreLabels();
    });

    // Fetch both sessions
    fetchCheckoutSessions();

    async function fetchCheckoutSessions() {
      try {
        // Without a member token the request goes out without the header.
        var token = await memberToken().catch(function() { return ''; });
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        var resp = await fetchWithRetry(
          'https://pricing.ordotype.fr/.netlify/functions/create-checkout-session',
          {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              stripeCustomerId: stripeCustomerId,
              pageCurrency: pageCurrency,
              priceId1: priceId1,
              couponId1: couponId1,
              priceId2: priceId2,
              couponId2: couponId2,
              successUrl: successUrl,
              cancelUrl1: cancelUrl1,
              cancelUrl2: cancelUrl2,
              payment_method_types: paymentMethods,
              v: 2
            })
          },
          2, 1000
        );
        if (resp.status === 409) {
          var refusal = {};
          try { refusal = (await resp.json()) || {}; } catch (ignored) {}
          if (CURRENT_OFFER_REASONS.indexOf(refusal.error) !== -1) {
            showCurrentOffer(refusal.error);
            return;
          }
        }

        // fetchWithRetry only retries network errors, so a 4xx/5xx arrives here
        // as a perfectly readable Response. Without this check the JSON error
        // body parses, url1/url2 come out undefined, the catch never runs and
        // the buttons end up bound to `undefined`.
        if (!resp.ok) throw new Error('Session API error: ' + resp.status);

        var data = await resp.json();

        // Check for currency mismatch redirect
        if (data && data.reason === 'currency_mismatch' && data.redirectUrl) {
          console.log('[StripeCheckout] Currency mismatch - redirecting to:', data.redirectUrl);
          window.location.href = data.redirectUrl;
          return;
        }

        if (!data || !data.url1 || !data.url2) throw new Error('Invalid session payload');

        sessions = {
          praticien: { id: data.sessionId1, url: data.url1 },
          rempla: { id: data.sessionId2, url: data.url2 }
        };
      } catch (err) {
        console.error('[StripeCheckout] Fetch error:', err);
        if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout (pricing)', err);
        // Restore the Memberstack fallback first: the user must never wait on a
        // tag callback, and dataLayer.push runs GTM's callbacks synchronously.
        detachClicks();
        restoreLabels();
        var held = takeHeldClick();
        if (btn1) btn1.style.display = 'none';
        if (btn2) btn2.style.display = 'none';
        if (noStripe1) noStripe1.style.display = 'flex';
        if (noStripe2) noStripe2.style.display = 'flex';
        // Le clic gardé suit le membre sur le bouton Memberstack de la même offre.
        if (held && OFFERS[held.option].fallback) OFFERS[held.option].fallback.click();
        trackCheckoutFailure(checkoutFailureReason(err));
        if (held) trackHeldClick(held, 'fallback');
        return;
      }

      console.log('[StripeCheckout] Sessions ready');
      var held = takeHeldClick();
      if (held) {
        trackHeldClick(held, 'redirect');
        goToCheckout(held.option);
      }
    }
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
