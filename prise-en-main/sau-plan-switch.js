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

  var VERSION = '2026-06-08-debug-1';
  var PREFIX = '[SauPlanSwitch]';
  var PRATICIEN_PLAN_ID = 'pln_sau-praticien-ln1x0ovn';
  var INTERNE_PLAN_ID = 'pln_sau-interne-811d0aht';
  var INTERNE_STATUT = 'Interne';
  var MAX_ATTEMPTS = 50; // 50 * 200ms = 10s max wait for the SDK

  // Top-level log: proves the file itself loaded and which version is served.
  console.log(PREFIX, 'script loaded — version', VERSION, '| readyState:', document.readyState);

  function safeStringify(value) {
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }

  function run() {
    var memberstack = window.$memberstackDom;
    console.log(PREFIX, 'run() — $memberstackDom present?', !!memberstack);
    if (!memberstack) {
      console.warn(PREFIX, 'Memberstack SDK not available, aborting');
      return;
    }

    console.log(PREFIX, 'calling getCurrentMember()...');
    memberstack.getCurrentMember().then(function(result) {
      console.log(PREFIX, 'getCurrentMember() raw result:', result);

      var member = result && result.data ? result.data : null;
      if (!member) {
        console.warn(PREFIX, 'No member in result.data — is the user logged in on this page?');
        return;
      }

      console.log(PREFIX, 'member.id:', member.id);

      var conns = member.planConnections || [];
      console.log(PREFIX, 'planConnections count:', conns.length);
      conns.forEach(function(c, i) {
        console.log(PREFIX, '  plan[' + i + ']:', 'planId=' + c.planId, '| status=' + c.status, '| active=' + c.active, '| type=' + c.type);
      });

      var customFields = member.customFields || {};
      console.log(PREFIX, 'customFields (full):', safeStringify(customFields));

      var hasPraticien = conns.some(function(c) { return c.planId === PRATICIEN_PLAN_ID; });
      var hasInterne = conns.some(function(c) { return c.planId === INTERNE_PLAN_ID; });
      var statut = customFields.statut;

      console.log(PREFIX, 'looking for praticien plan:', PRATICIEN_PLAN_ID, '-> found?', hasPraticien);
      console.log(PREFIX, 'looking for interne plan:  ', INTERNE_PLAN_ID, '-> already has?', hasInterne);
      console.log(PREFIX, 'statut value (stringified):', safeStringify(statut), '| expected:', safeStringify(INTERNE_STATUT), '| match?', statut === INTERNE_STATUT);

      // Only SAU praticien members who declared "Interne".
      if (!hasPraticien) {
        console.log(PREFIX, 'SKIP — member does not hold the SAU praticien plan (not a SAU praticien signup, or it was already swapped).');
        return;
      }
      if (statut !== INTERNE_STATUT) {
        console.log(PREFIX, 'SKIP — statut is not "' + INTERNE_STATUT + '" (got ' + safeStringify(statut) + ').');
        return;
      }
      if (hasInterne) {
        console.log(PREFIX, 'SKIP — member already holds the interne plan; nothing to do.');
        return;
      }

      console.log(PREFIX, 'DECISION — switching to interne plan. Calling addPlan(' + INTERNE_PLAN_ID + ')...');
      memberstack.addPlan({ planId: INTERNE_PLAN_ID })
        .then(function(res) {
          console.log(PREFIX, 'addPlan SUCCESS:', res);
          console.log(PREFIX, 'Done — praticien plan should be removed by your Memberstack rule.');
        })
        .catch(function(err) {
          console.error(PREFIX, 'addPlan ERROR:', err, '| stringified:', safeStringify(err));
          if (window.OrdoErrorReporter) {
            window.OrdoErrorReporter.report('SauPlanSwitch', safeStringify(err));
          }
        });
    }).catch(function(err) {
      console.error(PREFIX, 'getCurrentMember ERROR:', err, '| stringified:', safeStringify(err));
    });
  }

  // Wait for the Memberstack SDK, then run once.
  var attempts = 0;
  function waitForMemberstack() {
    if (window.$memberstackDom) {
      console.log(PREFIX, 'SDK ready after', attempts, 'wait(s)');
      run();
    } else if (attempts < MAX_ATTEMPTS) {
      attempts++;
      if (attempts === 1 || attempts % 10 === 0) {
        console.log(PREFIX, 'waiting for $memberstackDom... attempt', attempts);
      }
      setTimeout(waitForMemberstack, 200);
    } else {
      console.warn(PREFIX, 'Memberstack SDK not available after', MAX_ATTEMPTS, 'attempts — giving up');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForMemberstack);
  } else {
    waitForMemberstack();
  }
})();
