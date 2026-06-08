/**
 * Ordotype - Prise en Main - SAU Plan Switch
 * Runs on /membership/prise-en-main (the confirmation page shown right after
 * /membership/mes-informations).
 *
 * SAU partnership signups land on the "praticien" free plan
 * (pln_sau-praticien-ln1x0ovn). If, on the previous page, they declared their
 * statut as "Interne", grant them the SAU "interne" free plan
 * (pln_sau-interne-811d0aht). A Memberstack rule on the interne plan removes the
 * praticien plan automatically when interne is added — so we only add here.
 *
 * Why on this page (not on mes-informations):
 *  - statut is already persisted (the form submit completed), so we read the
 *    authoritative member.customFields.statut instead of a mid-form DOM value
 *  - no navigation race: this page is stable, so addPlan runs to completion
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

  function run() {
    var memberstack = window.$memberstackDom;
    if (!memberstack) {
      console.warn(PREFIX, 'Memberstack SDK not available');
      return;
    }

    memberstack.getCurrentMember().then(function(result) {
      var member = result && result.data ? result.data : null;
      if (!member) {
        console.log(PREFIX, 'No member, skipping');
        return;
      }

      var conns = member.planConnections || [];
      var hasPraticien = conns.some(function(c) { return c.planId === PRATICIEN_PLAN_ID; });
      var statut = member.customFields ? member.customFields.statut : null;

      // Only SAU praticien members who declared "Interne".
      if (!hasPraticien || statut !== INTERNE_STATUT) {
        console.log(PREFIX, 'No switch needed (hasPraticien=' + hasPraticien + ', statut=' + statut + ')');
        return;
      }

      memberstack.addPlan({ planId: INTERNE_PLAN_ID })
        .then(function() {
          console.log(PREFIX, 'Added interne plan; praticien removed by Memberstack rule');
        })
        .catch(function(err) {
          var detail = err;
          try { detail = JSON.stringify(err); } catch (e) {}
          console.error(PREFIX, 'addPlan error:', detail);
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
