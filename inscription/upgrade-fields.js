/**
 * Ordotype Inscription - Upgrade Fields
 * When a logged-in member takes the offer with the plan button, adds the plan, then writes
 * the offer's fields on the member before leaving the page.
 *
 * The plan button only sends the plan id: without this, the fields the signup form carries
 * for new accounts never reach an existing member who takes the same offer.
 *
 * Fields come from the page's signup form ([data-ms-member] inputs) and from
 * window.INSCRIPTION_CONFIG.dureeOffre.
 * - Offer fields (type-de-compte, partnership-city, comment, duree-de-loffre) replace the
 *   member's value when the offer has one.
 * - Any other field (statut, specialite, mode-dexercice…) only fills an empty value.
 * Logged-out visitors keep Memberstack's default behaviour.
 *
 * Depends on: Memberstack frontend SDK ($memberstackDom)
 */
(function() {
  'use strict';

  var PREFIX = '[UpgradeFields]';
  var OFFER_FIELDS = ['type-de-compte', 'partnership-city', 'comment', 'duree-de-loffre'];
  var CREDENTIAL_FIELDS = ['email', 'password', 'new-password', 'current-password'];
  var SIGNUP_KEYS = [
    'signup-comment',
    'signup-type-de-compte',
    'signup-partnership-city',
    'signup-duree-offre',
    'signup-mode-dexercice',
    'signup-statut',
    'signup-specialite'
  ];
  var RELOAD_DELAY_MS = 2000;
  var processing = false;

  function getCachedMemberId() {
    try {
      var member = JSON.parse(localStorage.getItem('_ms-mem'));
      return member && member.id ? member.id : null;
    } catch (e) {
      return null;
    }
  }

  function findPlanButton(target) {
    var el = target;
    while (el && el.nodeType === 1) {
      if (el.tagName !== 'FORM' && el.hasAttribute('data-ms-plan:add')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function collectOfferFields() {
    var fields = {};
    var form = document.querySelector('form[data-ms-form="signup"]');
    if (form) {
      Array.prototype.forEach.call(form.querySelectorAll('[data-ms-member]'), function(input) {
        var key = input.getAttribute('data-ms-member');
        if (key && CREDENTIAL_FIELDS.indexOf(key) === -1) {
          fields[key] = String(input.value || '').trim();
        }
      });
    }
    var config = window.INSCRIPTION_CONFIG;
    if (config && config.dureeOffre) {
      fields['duree-de-loffre'] = String(config.dureeOffre).trim();
    }
    return fields;
  }

  function computeUpdates(member, fields) {
    var current = (member && member.customFields) || {};
    var updates = {};
    Object.keys(fields).forEach(function(key) {
      var value = fields[key];
      if (!value) return;
      var existing = current[key] ? String(current[key]).trim() : '';
      if (OFFER_FIELDS.indexOf(key) !== -1) {
        if (existing !== value) updates[key] = value;
      } else if (!existing) {
        updates[key] = value;
      }
    });
    return updates;
  }

  function clearSignupKeys() {
    SIGNUP_KEYS.forEach(function(key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
  }

  function report(err) {
    var detail = err && err.message ? err.message : String(err);
    console.error(PREFIX, 'Could not write the offer fields:', detail);
    if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('UpgradeFields', detail);
  }

  async function takeOffer(button) {
    var ms = window.$memberstackDom;
    var planId = button.getAttribute('data-ms-plan:add');
    var successMessage = button.getAttribute('data-ms-success-message');

    processing = true;
    if (ms._showLoader) ms._showLoader();

    var result;
    try {
      result = await ms.addPlan({ planId: planId });
    } catch (err) {
      processing = false;
      if (ms._hideLoader) ms._hideLoader();
      if (ms._showMessage) ms._showMessage((err && err.message) || 'Une erreur est survenue.', true);
      return;
    }

    var data = (result && result.data) || {};
    var updates = computeUpdates(data.member, collectOfferFields());
    try {
      if (Object.keys(updates).length) {
        await ms.updateMember({ customFields: updates });
        console.log(PREFIX, 'Offer fields written:', Object.keys(updates).join(', '));
      }
      // The fields are now on the member: nothing is left for mes-informations to apply later.
      clearSignupKeys();
    } catch (err) {
      report(err);
    }

    if (ms._hideLoader) ms._hideLoader();

    if (data.redirect && window.location.pathname !== data.redirect) {
      window.location.href = data.redirect;
      return;
    }
    var message = successMessage || (result && result._internalUseOnly && result._internalUseOnly.message);
    if (message && ms._showMessage) ms._showMessage(message, false);
    setTimeout(function() { window.location.reload(); }, RELOAD_DELAY_MS);
  }

  // Capture phase on the document runs before Memberstack's own listener on the button.
  document.addEventListener('click', function(event) {
    var button = findPlanButton(event.target);
    if (!button) return;

    var ms = window.$memberstackDom;
    if (!ms || typeof ms.addPlan !== 'function' || typeof ms.updateMember !== 'function') return;
    if (!getCachedMemberId()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (processing) return;
    takeOffer(button);
  }, true);
})();
