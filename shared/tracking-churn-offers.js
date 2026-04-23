/**
 * Ordotype — Churn Offer Tracking (GA4)
 *
 * Instruments Win-Back Étape 1 (-50 % / 6 mois) and Étape 1 bis (gel 6 mois,
 * lancé 2026-04-14) on the cancellation funnel. Pushes 4 events to
 * window.dataLayer so GTM-MPMWHVV can forward them as GA4 Events.
 *
 *   - churn_offer_shown     : /membership/offre-annulation page loaded (once).
 *                             Params: offers_visible (e.g. "discount_50_6m,freeze_6m").
 *   - churn_offer_accepted  : user clicks submit on #redeem-form or #pause-form.
 *                             Params: offer_type (discount_50_6m | freeze_6m).
 *                             Fires on submit intent (not webhook success) so we
 *                             still see the event if the Make webhook fails.
 *   - churn_offer_declined  : user clicks submit on #cancel-form while on
 *                             /offre-annulation (refuses both retention offers).
 *                             Params: offers_shown.
 *   - churn_confirmed       : cancel webhook returned 200 on any cancel page
 *                             (MutationObserver on #success-message-cancel).
 *                             Params: last_offer_shown
 *                               ("discount_50_6m,freeze_6m" | "discount_50_6m"
 *                                | "freeze_6m" | "none").
 *
 * Every event also carries: member_id, plan, page_location.
 *
 * Loaded on:
 *   - /membership/offre-annulation           via offre-annulation/loader.js
 *   - /membership/annulation-abonnement      via inline <script defer> in Webflow footer
 *   - /membership/desabonnement-module-*     via inline <script defer> in Webflow footer
 *   - /membership/annulation-offre-asso-*    via inline <script defer> in Webflow footer
 *
 * Prerequisite: shared/memberstack-utils.js exposes window.OrdoMemberstack.
 * Falls back to localStorage.ms_member_id if OrdoMemberstack is unavailable
 * (covers pages where only this script is loaded inline).
 *
 * Companion GTM setup: register 4 custom events + custom dimensions
 * (offer_type, offers_visible, offers_shown, last_offer_shown, plan).
 *
 * Related Notion : https://www.notion.so/34a30a1b750f8106ab1cd5a29bee81b2
 *
 * Version: 1.1.0 (2026-04-23)
 *   1.0.0 — initial implementation.
 *   1.1.0 — delay churn_offer_shown until OrdoMemberstack populates (up to
 *           2s poll) so `plan` is attributed correctly on the impression
 *           event — loader.js races tracking-churn-offers.js injection.
 */
(function () {
  'use strict';

  if (window.__ordoChurnTrackingInstalled) return;
  window.__ordoChurnTrackingInstalled = true;

  var PREFIX = '[ChurnTracking]';
  window.dataLayer = window.dataLayer || [];

  var path = window.location.pathname;
  var onOfferPage = /\/membership\/offre-annulation\b/.test(path);

  // ---------- Member attribution -----------------------------------------
  function activePlanId(planConnections) {
    if (!Array.isArray(planConnections)) return null;
    var active = planConnections.find(function (c) {
      return c && (c.status === 'ACTIVE' || c.status === 'TRIALING');
    });
    return active ? active.planId : null;
  }

  function memberInfo() {
    var ms = window.OrdoMemberstack;
    var info = { member_id: null, plan: null };
    if (ms && ms.memberId) info.member_id = ms.memberId;
    else {
      try { info.member_id = localStorage.getItem('ms_member_id') || null; } catch (e) {}
    }
    if (ms && ms.planConnections) info.plan = activePlanId(ms.planConnections);
    return info;
  }

  // ---------- Offer detection --------------------------------------------
  function offersVisible() {
    var offers = [];
    if (document.getElementById('redeem-form')) offers.push('discount_50_6m');
    if (document.getElementById('pause-form')) offers.push('freeze_6m');
    return offers;
  }

  function push(eventName, extra) {
    var info = memberInfo();
    var payload = {
      event: eventName,
      member_id: info.member_id,
      plan: info.plan,
      page_location: window.location.href,
    };
    if (extra) {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
    }
    window.dataLayer.push(payload);
    console.log(PREFIX, eventName, payload);
  }

  // ---------- Wait for OrdoMemberstack -----------------------------------
  // offre-annulation/loader.js loads memberstack-utils.js first, but this
  // tracking script is injected in parallel by global-utils.js, so the two
  // race. Without a wait, pushShownOnce() can fire before planConnections is
  // populated, giving `plan: null`. User-click events are immune (they fire
  // seconds later) — only churn_offer_shown is at risk.
  var MS_WAIT_TIMEOUT_MS = 2000;
  var MS_POLL_INTERVAL_MS = 50;
  function waitForMemberstack(cb) {
    if (window.OrdoMemberstack) { cb(); return; }
    var deadline = Date.now() + MS_WAIT_TIMEOUT_MS;
    var timer = setInterval(function () {
      if (window.OrdoMemberstack || Date.now() > deadline) {
        clearInterval(timer);
        if (!window.OrdoMemberstack) {
          console.warn(PREFIX, 'OrdoMemberstack not ready after ' + MS_WAIT_TIMEOUT_MS + 'ms, firing with fallback');
        }
        cb();
      }
    }, MS_POLL_INTERVAL_MS);
  }

  // ---------- churn_offer_shown ------------------------------------------
  // Fires once on /offre-annulation when at least one offer is rendered.
  // We gate on offersVisible() rather than pathname alone, so an A/B test
  // that hides an offer still reports the correct offers_visible list.
  var shownFired = false;
  function pushShownOnce() {
    if (shownFired) return;
    var visible = offersVisible();
    if (!visible.length) return;
    shownFired = true;
    push('churn_offer_shown', { offers_visible: visible.join(',') });
  }

  // ---------- churn_offer_accepted ---------------------------------------
  function wireAccept(formId, offerType) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', function () {
      push('churn_offer_accepted', { offer_type: offerType });
    });
  }

  // ---------- churn_offer_declined ---------------------------------------
  // On /offre-annulation only: submitting the cancel form means the user
  // refused both retention offers. On /annulation-abonnement the same
  // submit is a plain churn_confirmed (no offer was shown) so we don't
  // emit declined there.
  function wireDeclined() {
    var form = document.getElementById('cancel-form');
    if (!form) return;
    form.addEventListener('submit', function () {
      push('churn_offer_declined', { offers_shown: offersVisible().join(',') });
    });
  }

  // ---------- churn_confirmed --------------------------------------------
  // redeem-cancel-forms.js sets #success-message-cancel display:block on a
  // 200 response, 3s before redirecting to /. We observe the style attribute
  // and fire once — this is the ground truth that the cancellation actually
  // completed, distinct from churn_offer_declined which is click intent.
  function watchConfirmed() {
    var successEl = document.getElementById('success-message-cancel');
    if (!successEl) return;

    var fired = false;
    function isVisible(el) {
      var style = el.style || {};
      return style.display && style.display !== 'none';
    }
    function maybeFire() {
      if (fired || !isVisible(successEl)) return;
      fired = true;
      var lastOffer = onOfferPage ? (offersVisible().join(',') || 'none') : 'none';
      push('churn_confirmed', { last_offer_shown: lastOffer });
      observer.disconnect();
    }

    var observer = new MutationObserver(maybeFire);
    observer.observe(successEl, { attributes: true, attributeFilter: ['style'] });
    maybeFire(); // guard against the edge case where display was set pre-observer
  }

  // ---------- Init --------------------------------------------------------
  function init() {
    if (onOfferPage) {
      // Bind click listeners + observer immediately — they fire on user
      // interaction so OrdoMemberstack is guaranteed ready by then.
      wireAccept('redeem-form', 'discount_50_6m');
      wireAccept('pause-form', 'freeze_6m');
      wireDeclined();
      // Delay churn_offer_shown until OrdoMemberstack populates (up to 2s)
      // so `plan` is attributed correctly on the impression event.
      waitForMemberstack(pushShownOnce);
    }
    watchConfirmed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
