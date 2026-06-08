/**
 * Ordotype - Prise en Main - SAU Plan Switch
 * Runs on /membership/prise-en-main (the confirmation page shown right after
 * /membership/mes-informations).
 *
 * SAU partnership signups land on the "praticien" free plan
 * (pln_sau-praticien-ln1x0ovn). If they declared statut "Interne" on the
 * previous page, grant the SAU "interne" free plan (pln_sau-interne-811d0aht)
 * and remove the praticien plan.
 *
 * Why on this page (not on mes-informations):
 *  - statut is already persisted, so we read the authoritative
 *    member.customFields.statut instead of a mid-form DOM value
 *  - no navigation race: the page is stable, so addPlan/removePlan complete
 *
 * Removal is done by the script for safety. A Memberstack rule may already
 * remove the praticien plan when the interne plan is added — in that case
 * removePlan reports "no-plan-found", which we treat as success.
 *
 * Scope guard: only members who STILL hold the SAU praticien plan are touched,
 * so this (shared) confirmation page is safe for every other signup flow.
 *
 * Webflow: load once in the page footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/prise-en-main/sau-plan-switch.js"></script>
 */
(function() {
  'use strict';

  var PREFIX = '[SauPlanSwitch]';
  var PRATICIEN_PLAN_ID = 'pln_sau-praticien-ln1x0ovn';
  var INTERNE_PLAN_ID = 'pln_sau-interne-811d0aht';
  var INTERNE_STATUT = 'Interne';
  var MAX_ATTEMPTS = 50; // 50 * 200ms = 10s max wait for the SDK

  // A removePlan/addPlan "the member does not have / already has this plan"
  // error is benign: a Memberstack rule got there first. Treat it as success.
  function isAlreadyDone(err) {
    return !!err && (err.code === 'no-plan-found' ||
                     err.code === 'plan-already-added' ||
                     err.category === 'not_found' ||
                     err.category === 'conflict');
  }

  function run() {
    var memberstack = window.$memberstackDom;
    if (!memberstack) {
      console.warn(PREFIX, 'Memberstack SDK not available');
      return;
    }

    memberstack.getCurrentMember().then(function(result) {
      var member = result && result.data ? result.data : null;
      if (!member) return;

      var conns = member.planConnections || [];
      var hasPraticien = conns.some(function(c) { return c.planId === PRATICIEN_PLAN_ID; });
      var hasInterne = conns.some(function(c) { return c.planId === INTERNE_PLAN_ID; });
      var statut = member.customFields ? member.customFields.statut : null;

      // Only act on SAU members who still hold the praticien plan and declared
      // "Interne". Once praticien is gone this is a no-op on re-visit.
      if (!hasPraticien || statut !== INTERNE_STATUT) return;

      console.log(PREFIX, 'Switching praticien -> interne (statut Interne)');

      // Skip the add if the interne plan is somehow already present.
      var addStep = hasInterne
        ? Promise.resolve()
        : memberstack.addPlan({ planId: INTERNE_PLAN_ID }).catch(function(err) {
            if (isAlreadyDone(err)) return;
            throw err;
          });

      addStep
        .then(function() {
          return memberstack.removePlan({ planId: PRATICIEN_PLAN_ID }).catch(function(err) {
            if (isAlreadyDone(err)) {
              console.log(PREFIX, 'praticien plan already removed (Memberstack rule) — OK');
              return;
            }
            throw err;
          });
        })
        .then(function() {
          console.log(PREFIX, 'Done — interne plan granted, praticien removed');
        })
        .catch(function(err) {
          var detail = err;
          try { detail = JSON.stringify(err); } catch (e) {}
          console.error(PREFIX, 'Plan switch error:', detail);
          if (window.OrdoErrorReporter) {
            window.OrdoErrorReporter.report('SauPlanSwitch', detail);
          }
        });
    }).catch(function(err) {
      console.error(PREFIX, 'getCurrentMember error:', err);
    });
  }

  // Wait for the Memberstack SDK, then run once.
  var attempts = 0;
  function waitForMemberstack() {
    if (window.$memberstackDom) {
      run();
    } else if (attempts < MAX_ATTEMPTS) {
      attempts++;
      setTimeout(waitForMemberstack, 200);
    } else {
      console.warn(PREFIX, 'Memberstack SDK not available after', MAX_ATTEMPTS, 'attempts');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForMemberstack);
  } else {
    waitForMemberstack();
  }
})();
