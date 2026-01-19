/**
 * Ordotype Account - Subscriptions
 * Displays subscription cancellation status (canceled vs active).
 * Depends on: core.js
 */
(function() {
  'use strict';

  const member = window.OrdoAccount?.member;
  if (!member?.id) return;

  // Plan configurations - add new plans here
  const plans = [
    {
      id: "pln_compte-praticien-offre-speciale-500-premiers--893z0o60",
      prefix: "sub"  // Uses: sub-already-not-canceled-btn, sub-already-canceled-btn, etc.
    },
    {
      id: "pln_compte-interne-sy4j0oft",
      prefix: "sub-interne"
    },
    {
      id: "pln_praticien-belgique-2p70qka",
      prefix: "sub"  // Shares elements with first plan
    },
    {
      id: "pln_module-rhumatologie-kei40zul",
      prefix: "sub-rhumato"
    }
  ];

  function init() {
    // Hide all elements first
    plans.forEach(plan => {
      const elements = getElements(plan.prefix);
      Object.values(elements).forEach(el => {
        if (el) el.style.display = 'none';
      });
    });

    // No plan connections? Nothing to show
    if (!member.planConnections?.length) {
      console.log('[Subscriptions] No plan connections');
      return;
    }

    // Process each plan
    plans.forEach(plan => {
      const connection = window.OrdoAccount.getPlan(plan.id);
      if (!connection) return;

      const elements = getElements(plan.prefix);
      const isCanceled = Boolean(connection.payment?.cancelAtDate);

      if (isCanceled) {
        if (elements.canceledBtn) elements.canceledBtn.style.display = 'block';
        if (elements.canceledTag) elements.canceledTag.style.display = 'block';
      } else {
        if (elements.notCanceledBtn) elements.notCanceledBtn.style.display = 'block';
        if (elements.notCanceledTag) elements.notCanceledTag.style.display = 'block';
      }
    });

    console.log('[Subscriptions] Status display updated');
  }

  function getElements(prefix) {
    return {
      notCanceledBtn: document.getElementById(`${prefix}-already-not-canceled-btn`),
      notCanceledTag: document.getElementById(`${prefix}-already-not-canceled-tag`),
      canceledBtn: document.getElementById(`${prefix}-already-canceled-btn`),
      canceledTag: document.getElementById(`${prefix}-already-canceled-tag`)
    };
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
