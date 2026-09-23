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

  // State
  let portalUrl = null;
  let sessionId = null;
  let opening = false;
  let restoreOpening = null;

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
    // button, so that removing that button from the page keeps the portal reachable.
    window.OrdoBillingPortal = { open: function() { openPortal(null); } };

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

  async function prefetchPortalSession() {
    try {
      const response = await fetch(BILLING_PORTAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripeCustomerId: member.stripeCustomerId,
          returnUrl: window.location.href
        })
      });

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

  async function openPortal(btn) {
    // A second click while the portal is opening creates no second session
    if (opening) return;
    opening = true;
    const originalText = btn ? btn.textContent : '';
    if (btn) {
      btn.textContent = 'Patientez...';
      btn.disabled = true;
    }
    function restore() {
      opening = false;
      restoreOpening = null;
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
    restoreOpening = restore;

    // Fallback fetch if prefetch failed
    if (!portalUrl) {
      let status = 0;
      try {
        const response = await fetch(BILLING_PORTAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stripeCustomerId: member.stripeCustomerId,
            returnUrl: window.location.href
          })
        });
        status = response.status;
        const data = await response.json();
        if (data.url) {
          portalUrl = data.url;
          sessionId = data.id || extractSessionId(data.url);
        }
      } catch (err) {
        console.error('[BillingPortal] Fallback fetch error:', err);
        // A body that is not JSON still had an answer: keep its status
        if (status && !err.status) err.status = status;
        reportFailure(err);
        restore();
        return;
      }
      if (!portalUrl) {
        const missing = new Error('create-billing-portal ' + status + ': no portal url');
        missing.status = status;
        console.error('[BillingPortal] No portal URL returned');
        reportFailure(missing);
        restore();
        return;
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
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
