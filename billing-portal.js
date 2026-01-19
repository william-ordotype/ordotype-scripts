/**
 * Ordotype Account - Billing Portal
 * Handles Stripe billing portal access and invoice viewing.
 * Depends on: core.js
 */
(function() {
  'use strict';

  const member = window.OrdoAccount?.member;
  if (!member?.id) return;

  // Endpoints
  const BILLING_PORTAL_URL = 'https://ordotype-stripe-setup-session.netlify.app/.netlify/functions/create-billing-portal';
  const WEBHOOK_URL = 'https://hook.eu1.make.com/4zw66riuwuci4vpxf2td1f5vc3s4z7mk';

  // State
  let portalUrl = null;
  let sessionId = null;

  function init() {
    const invoicesBtn = document.querySelector('[data-ms-action="customer-portal"]');
    
    if (!invoicesBtn) {
      console.log('[BillingPortal] Button not found');
      return;
    }

    // Clean up Memberstack attributes
    invoicesBtn.removeAttribute('href');
    invoicesBtn.removeAttribute('data-ms-action');

    // Check for Stripe customer
    if (!member.stripeCustomerId) {
      console.warn('[BillingPortal] No Stripe customer ID');
      invoicesBtn.style.opacity = '0.5';
      invoicesBtn.style.cursor = 'not-allowed';
      return;
    }

    // Prefetch portal session
    prefetchPortalSession();

    // Handle click
    invoicesBtn.addEventListener('click', handleClick);

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

  function extractSessionId(url) {
    const patterns = [/\/p\/session\/([^?#]+)/, /\/session\/([^?#]+)/];
    for (const p of patterns) {
      const match = url.match(p);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  async function handleClick(e) {
    e.preventDefault();
    
    const btn = e.currentTarget;
    const originalText = btn.textContent;
    btn.textContent = 'Patientez...';
    btn.disabled = true;

    // Fallback fetch if prefetch failed
    if (!portalUrl) {
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
        portalUrl = data.url;
        sessionId = data.id || extractSessionId(data.url);
      } catch (err) {
        console.error('[BillingPortal] Fallback fetch error:', err);
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }
    }

    // Send webhook (fire and forget)
    const payload = {
      checkoutSessionId: sessionId,
      stripeCustomerId: member.stripeCustomerId,
      memberstackUserId: member.id,
      memberstackEmail: member.auth?.email || member.email,
      option: 'billing_portal',
      paymentMethods: ['view_invoices'],
      originPage: window.location.href
    };

    fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
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
