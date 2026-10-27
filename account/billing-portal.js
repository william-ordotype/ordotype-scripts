/**
 * Ordotype Account - Billing Portal
 * Handles Stripe billing portal access and invoice viewing.
 * Depends on: core.js
 */
(function() {
  'use strict';

  const member = window.OrdoAccount && window.OrdoAccount.member;
  if (!member || !member.id) return;

  // Endpoints
  const BILLING_PORTAL_URL = 'https://billing.ordotype.fr/.netlify/functions/create-billing-portal';
  const WEBHOOK_URL = 'https://billing.ordotype.fr/.netlify/functions/notify-webhook';
  const MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s

  // A busy or unreachable function answers 502, 503 or 504, or not at all: a click asks once more
  // after a short wait. A refusal (401, 422...) would get the same answer twice.
  const RETRYABLE = [502, 503, 504];
  const RETRY_DELAY_MS = 1000;

  const LABEL_BUSY = 'Patientez…';
  const LABEL_RETRY = 'Réessayer';
  const TITLE_FAILED = 'Le portail de paiement n’a pas pu s’ouvrir. Réessayez dans un instant.';
  const TITLE_SESSION = 'Votre session a expiré : reconnectez-vous puis réessayez.';

  // State
  let portalUrl = null;
  let sessionId = null;
  let pending = null;
  let restoreOpening = null;
  const labels = new WeakMap(); // button → its label before the first opening

  function init() {
    const invoicesBtn = document.querySelector('[data-ms-action="customer-portal"]');

    if (invoicesBtn) {
      // Clean up Memberstack attributes
      invoicesBtn.removeAttribute('href');
      invoicesBtn.removeAttribute('data-ms-action');
    }

    // Check for Stripe customer
    if (!member.stripeCustomerId) {
      console.warn('[BillingPortal] No Stripe customer ID');
      if (invoicesBtn) {
        invoicesBtn.style.opacity = '0.5';
        invoicesBtn.style.cursor = 'not-allowed';
      }
      return;
    }

    // Prefetch portal session
    prefetchPortalSession();

    // Lets other account scripts open the same portal. It does not depend on the page's own
    // button, so that removing that button from the page keeps the portal reachable. The caller
    // passes its clicked button to show the wait and the failure on it; the promise tells whether
    // the portal is opening (true) or not (false). With options.retryLabel === false, a failure
    // gives the button its own label back instead of « Réessayer » (a link that names what it opens).
    window.OrdoBillingPortal = { open: function(btn, options) { return openPortal(btn || null, options || null); } };

    // Back from the portal, the browser may restore the page as it was left, mid-opening
    window.addEventListener('pageshow', function(e) {
      if (e.persisted && restoreOpening) restoreOpening();
    });

    if (invoicesBtn) {
      invoicesBtn.addEventListener('click', handleClick);
    } else {
      console.log('[BillingPortal] Button not found, portal still available to other scripts');
    }

    console.log('[BillingPortal] Initialized');
  }

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

  // Without a member token the request goes out without the header.
  function requestPortal() {
    return memberToken().catch(function() { return ''; }).then(function(token) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(BILLING_PORTAL_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          stripeCustomerId: member.stripeCustomerId,
          returnUrl: window.location.href,
          v: 2
        })
      });
    });
  }

  async function prefetchPortalSession() {
    try {
      const response = await requestPortal();

      const data = await response.json();

      if (data.url) {
        portalUrl = data.url;
        sessionId = data.id || extractSessionId(data.url);
        console.log('[BillingPortal] Prefetched portal URL');
      }
    } catch (err) {
      console.error('[BillingPortal] Prefetch error:', err);
    }
  }

  // A click that opens nothing must not stay silent. Without a status the request got no answer:
  // reportNetwork knows whether the page was leaving, in which case there is no incident.
  function reportFailure(err) {
    const reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    try {
      if (!err.status && typeof reporter.reportNetwork === 'function') reporter.reportNetwork('BillingPortal', err);
      else reporter.report('BillingPortal', err);
    } catch (e) {
      console.error('[BillingPortal] Report error:', e);
    }
  }

  function extractSessionId(url) {
    const patterns = [/\/p\/session\/([^?#]+)/, /\/session\/([^?#]+)/];
    for (const p of patterns) {
      const match = url.match(p);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  function handleClick(e) {
    e.preventDefault();
    openPortal(e.currentTarget);
  }

  // One request for a portal address. Rejects with the answer's status, none when there was no answer.
  async function fetchPortal() {
    let status = 0;
    let data;
    try {
      const response = await requestPortal();
      status = response.status;
      data = await response.json();
    } catch (err) {
      // A body that is not JSON still had an answer: keep its status
      if (status && !err.status) err.status = status;
      throw err;
    }
    if (data && data.url) return data;
    const missing = new Error('create-billing-portal ' + status + ': no portal url');
    missing.status = status;
    throw missing;
  }

  // After a failed prefetch, the click asks again, and once more after a short wait if the function
  // was busy or unreachable (Memberstack slow to check the session makes it answer 502).
  async function fetchPortalForClick() {
    try {
      return await fetchPortal();
    } catch (err) {
      if (err.status && RETRYABLE.indexOf(err.status) === -1) throw err;
      console.warn('[BillingPortal] Portal not ready (' + (err.status || 'no answer') + '), one new try');
      await new Promise(function(resolve) { setTimeout(resolve, RETRY_DELAY_MS); });
      return fetchPortal();
    }
  }

  // Only a button that holds nothing but its text gets a new label: one with an icon keeps its own.
  function setLabel(btn, text) {
    if (!btn.children.length) btn.textContent = text;
  }

  function openPortal(btn, options) {
    // A second click while the portal is opening creates no second session
    if (pending) return pending;
    pending = openingPortal(btn, options);
    return pending;
  }

  async function openingPortal(btn, options) {
    const retryLabel = !(options && options.retryLabel === false);
    if (btn) {
      if (!labels.has(btn)) labels.set(btn, btn.textContent);
      setLabel(btn, LABEL_BUSY);
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.removeAttribute('title');
    }
    // A failure leaves the button saying so, as the invoice PDF and payment buttons do
    function restore(failure) {
      pending = null;
      restoreOpening = null;
      if (!btn) return;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (failure) {
        setLabel(btn, retryLabel ? LABEL_RETRY : labels.get(btn));
        btn.setAttribute('title', failure.status === 401 ? TITLE_SESSION : TITLE_FAILED);
      } else {
        setLabel(btn, labels.get(btn));
      }
    }
    restoreOpening = function() { restore(null); };

    // Fallback fetch if prefetch failed
    if (!portalUrl) {
      try {
        const data = await fetchPortalForClick();
        portalUrl = data.url;
        sessionId = data.id || extractSessionId(data.url);
      } catch (err) {
        console.error('[BillingPortal] Fallback fetch error:', err);
        reportFailure(err);
        restore(err);
        return false;
      }
    }

    // Send webhook (fire and forget) via proxy
    const payload = {
      type: 'setup-tracking',
      checkoutSessionId: sessionId,
      stripeCustomerId: member.stripeCustomerId,
      memberstackUserId: member.id,
      memberstackEmail: (member.auth && member.auth.email) || member.email,
      option: 'billing_portal',
      paymentMethods: ['view_invoices'],
      originPage: window.location.href
    };

    fetch(WEBHOOK_URL, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.error('[BillingPortal] Webhook error:', err));

    // Redirect
    window.location.href = portalUrl;
    return true;
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
