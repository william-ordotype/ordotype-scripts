/**
 * Ordotype Mes Informations - Core
 * Exposes window.OrdoMesInfos globally for mes-informations page scripts.
 * Reads window.MES_INFOS_CONFIG set inline on each Webflow page.
 *
 * Requires: shared/memberstack-utils.js
 * Must load before: all other mes-informations scripts
 */
(function() {
  'use strict';

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('[OrdoMesInfos] localStorage not available:', e.message);
    }
  }

  // Store current URL for tracking
  safeSetItem('locat', location.href);

  // Use shared memberstack utility
  var ms = window.OrdoMemberstack || {};
  var memberData = ms.member || {};

  // Merge page-level config with defaults
  var pageConfig = window.MES_INFOS_CONFIG || {};

  var config = {
    baseUrl: window.location.hostname === "ordotype.webflow.io"
      ? "https://ordotype.webflow.io"
      : "https://www.ordotype.fr",
    isLoggedIn: Boolean(memberData.id),
    rppsText: pageConfig.rppsText !== undefined ? pageConfig.rppsText : 'Pas de RPPS',
    forceStatut: pageConfig.forceStatut || null,
    syncFields: pageConfig.syncFields || [],
    fillOnlyFields: pageConfig.fillOnlyFields || [],
    setJustPaidTs: Boolean(pageConfig.setJustPaidTs),
    showStatutSelectors: Boolean(pageConfig.showStatutSelectors),
    showRequiredIfVisible: pageConfig.showRequiredIfVisible !== false,
    enableCheckout: Boolean(pageConfig.enableCheckout),
    checkoutPaymentMethods: pageConfig.checkoutPaymentMethods || ['sepa_debit'],
    enablePartnershipCity: Boolean(pageConfig.enablePartnershipCity)
  };

  // Délai de grâce de 24 h (justPaidTs), posé seulement au retour d'un vrai
  // paiement (20/10/2026). Ces pages s'ouvrent aussi hors paiement : la page
  // praticien-sepa s'affiche AVANT le paiement, et la page praticien peut être
  // rouverte plus tard. La pose à l'affichage donnait 24 h sans redirection ni
  // bandeau de facturation à un membre qui n'avait rien payé. Deux marqueurs de
  // retour d'un paiement réussi :
  // - `ordo_checkout=cs_…` : nos fonctions Stripe (checkout.ordotype.fr,
  //   pricing.ordotype.fr), où Stripe écrit l'id de la session ;
  // - `fromCheckout=true` : le paiement Memberstack.
  function isPaymentReturn() {
    try {
      var params = new URLSearchParams(window.location.search);
      return /^cs_/.test(params.get('ordo_checkout') || '') || params.get('fromCheckout') === 'true';
    } catch (e) {
      return false;
    }
  }

  if (config.setJustPaidTs && isPaymentReturn()) {
    safeSetItem('justPaidTs', Date.now().toString());
    setTimeout(function() {
      try { localStorage.removeItem('justPaidTs'); } catch (e) {}
    }, 86400000);
  }

  // Expose globally for other scripts
  window.OrdoMesInfos = {
    member: memberData,
    config: config,

    hasPlan: function(planId) {
      return ms.hasPlan ? ms.hasPlan(planId) : false;
    },

    getPlan: function(planId) {
      return ms.getPlan ? ms.getPlan(planId) : null;
    }
  };

  console.log('[OrdoMesInfos] Core loaded',
    config.isLoggedIn ? '(logged in)' : '(not logged in)');
})();
