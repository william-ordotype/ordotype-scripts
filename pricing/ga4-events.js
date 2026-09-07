/**
 * Ordotype — Pricing GA4 events instrumentation
 *
 * Pushes `nos_offres_view` on /nos-offres page load. Replaces the former GA4
 * Admin "Create event" rule that synthesized the event from page_view.
 * Rule was deleted because the synthetic event inherited page_view's firing
 * time — before Memberstack hydrated _ms-mem — which meant ~49% of logged-in
 * visits were missing member_id attribution.
 *
 * This script fires after the loader, which means memberstack-utils.js has
 * already parsed _ms-mem and exposed window.OrdoMemberstack.memberId. If
 * present (user logged in), we set user_id via gtag so subsequent events in
 * the session inherit attribution.
 *
 * /nos-offres is public (anonymous visitors expected) — member_id is pushed
 * only when _ms-mem is populated.
 *
 * Related: connexion-2fa/ga4-events.js
 * Version: 1.1.0 (2026-09-07)
 *   1.1.0 — les pushs passent par OrdoErrorReporter.track().
 */

(function () {
  'use strict';

  // La mesure ne doit jamais casser la page. L'implémentation vit dans
  // shared/error-reporter.js ; ce repli couvre le cas où il n'est pas chargé.
  function track(payload) {
    try {
      if (window.OrdoErrorReporter && window.OrdoErrorReporter.track) {
        window.OrdoErrorReporter.track(payload);
        return;
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (err) {
      // Signaler même sans le reporter : une mesure qui échoue en silence
      // efface la preuve qu'il s'est passé quelque chose.
      try {
        if (window.OrdoErrorReporter && window.OrdoErrorReporter.reportSideEffect) {
          window.OrdoErrorReporter.reportSideEffect('PricingEvents', err);
          return;
        }
        var e = err instanceof Error ? err : new Error(String(err));
        window.dispatchEvent(new ErrorEvent('error', { message: 'PricingEvents: ' + e.message, error: e }));
      } catch (ignored) {}
    }
  }


  if (!window || window.__ordotypePricingGa4Installed) return;
  var pathname = (location.pathname || '').replace(/\/+$/, '');
  if (pathname !== '/nos-offres') return;
  window.__ordotypePricingGa4Installed = true;
  window.dataLayer = window.dataLayer || [];
  console.log('[OrdoPricingGa4] Pushing nos_offres_view');

  var ms = window.OrdoMemberstack || {};
  var memberId = ms.memberId || null;

  if (memberId) {
    (function () {
      function _gtag() { track(arguments); }
      _gtag('set', { user_id: memberId });
    })();
  }

  var payload = { event: 'nos_offres_view' };
  if (memberId) payload.member_id = memberId;
  track(payload);
})();
