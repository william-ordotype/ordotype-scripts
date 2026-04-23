/**
 * Ordotype — Mes Informations GA4 events instrumentation
 *
 * Pushes `membership_info_view` on any /membership/mes-informations* page.
 * Replaces the former GA4 Admin "Create event" rule that synthesized the
 * event from page_view — the synthetic event inherited page_view's firing
 * time and missed member_id attribution on ~10% of visits due to the
 * page_view → _ms-mem race.
 *
 * The loader has already run memberstack-utils.js by the time this script
 * executes, so window.OrdoMemberstack is populated. These pages are behind
 * auth, so memberId should always be present — but we don't assume.
 *
 * Matches 5 page paths:
 *   /membership/mes-informations
 *   /membership/mes-informations-praticien
 *   /membership/mes-informations-internes
 *   /membership/mes-informations-internes-assos
 *   /membership/mes-informations-module
 *
 * Version: 1.0.0 (2026-04-23)
 */

(function () {
  'use strict';

  if (!window || window.__ordotypeMesInfosGa4Installed) return;
  var pathname = (location.pathname || '').replace(/\/+$/, '');
  if (!/^\/membership\/mes-informations(?:-|$)/.test(pathname)) return;
  window.__ordotypeMesInfosGa4Installed = true;
  window.dataLayer = window.dataLayer || [];
  console.log('[OrdoMesInfosGa4] Pushing membership_info_view');

  var ms = window.OrdoMemberstack || {};
  var memberId = ms.memberId || null;

  if (memberId) {
    (function () {
      function _gtag() { window.dataLayer.push(arguments); }
      _gtag('set', { user_id: memberId });
    })();
  }

  var payload = { event: 'membership_info_view' };
  if (memberId) payload.member_id = memberId;
  window.dataLayer.push(payload);
})();
