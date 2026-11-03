/**
 * Ordotype Mes Informations - Payment return without a session
 * After a payment, tells a visitor who is not logged in that the payment went
 * through and links to the login page.
 *
 * Requires: core.js (OrdoMesInfos.isPaymentReturn, sets locat)
 */
(function() {
  'use strict';

  var PREFIX = '[OrdoPaymentReturn]';
  var LOGIN_URL = '/membership/login-ms';
  var MAX_ATTEMPTS = 50; // 50 * 200ms = 10s max wait

  // Au retour d'un paiement, un payeur sans session dans ce navigateur (lien de
  // relance ouvert sur le téléphone, session perdue pendant l'aller-retour Stripe)
  // voyait une carte vide : Memberstack masque le formulaire de profil. Son plan,
  // lui, est posé côté serveur. core.js a mis cette adresse dans locat : après la
  // connexion (et la 2FA), successful-login le ramène ici, formulaire affiché.
  var mesInfos = window.OrdoMesInfos;
  if (!mesInfos || typeof mesInfos.isPaymentReturn !== 'function' || !mesInfos.isPaymentReturn()) return;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function showLoginMessage() {
    if (document.querySelector('[data-ordo-payment-return]')) return;

    // Sans session, Memberstack retire le formulaire de la page, pas son enveloppe.
    var form = document.querySelector('form[data-ms-form="profile"]');
    var block = (form && form.closest('.w-form')) || document.querySelector('.inscr-p_form-block');
    if (!block || !block.parentNode) {
      console.warn(PREFIX, 'No profile form to put the login message next to');
      if (window.OrdoErrorReporter) {
        window.OrdoErrorReporter.reportSideEffect('PaymentReturn', new Error('No profile form on a payment return page'));
      }
      return;
    }

    // Mêmes classes que l'en-tête du formulaire et son bouton « Continuer ».
    var box = el('div', 'inscription_form');
    box.setAttribute('data-ordo-payment-return', '');
    var head = el('div', 'inscr-p_head');
    head.appendChild(el('h2', 'heading-h1-docs', 'Paiement bien reçu'));
    head.appendChild(el('p', 'text-size-small text-color-base-600', 'Connectez-vous pour terminer votre inscription.'));
    var button = el('a', 'button w-button', 'Se connecter');
    button.href = LOGIN_URL;
    // Un autre onglet a pu réécrire locat depuis l'arrivée sur cette page.
    button.addEventListener('click', function() {
      try { localStorage.setItem('locat', location.href); } catch (e) {}
    });
    box.appendChild(head);
    box.appendChild(button);
    block.parentNode.insertBefore(box, block);
    console.log(PREFIX, 'Not logged in after a payment, login message shown');
  }

  function init() {
    window.$memberstackDom.getCurrentMember().then(function(result) {
      var member = result && result.data ? result.data : result;
      if (member && member.id) return;
      showLoginMessage();
    }).catch(function(err) {
      console.error(PREFIX, 'Failed to get current member:', err);
    });
  }

  // Wait for Memberstack SDK
  var attempts = 0;
  function waitForMemberstack() {
    if (window.$memberstackDom) {
      init();
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
