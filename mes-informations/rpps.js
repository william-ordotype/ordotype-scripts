/**
 * Ordotype Mes Informations - RPPS
 * 1. When #notRPPS checkbox is checked, sets #RPPS input to configured text
 *    (skipped if config.rppsText is null).
 * 2. A number typed as the national identifier (« 8 » + RPPS, 12 digits, the one
 *    printed on the CPS card) is saved as the 11-digit RPPS: the leading 8 is
 *    removed when the field changes and again just before the form is sent,
 *    before Memberstack reads it. Only when the 11 remaining digits pass the
 *    Luhn check, as on the server; any other value is left as typed.
 *
 * Depends on: core.js
 */
(function() {
  'use strict';

  var config = window.OrdoMesInfos && window.OrdoMesInfos.config;
  if (!config) return;

  function luhnOk(s) {
    if (!s || !/^\d+$/.test(s)) return false;
    var total = 0;
    for (var i = 0; i < s.length; i++) {
      var d = Number(s.charAt(s.length - 1 - i));
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      total += d;
    }
    return total % 10 === 0;
  }

  // « 8 » + RPPS (spaces, dots and dashes allowed) → the 11-digit RPPS, or null.
  function withoutLeadingEight(value) {
    var compact = String(value == null ? '' : value).replace(/[\s.\-]/g, '');
    if (!/^8\d{11}$/.test(compact)) return null;
    var rpps = compact.slice(1);
    return luhnOk(rpps) ? rpps : null;
  }

  function normalize(input) {
    var rpps = withoutLeadingEight(input.value);
    if (rpps) input.value = rpps;
  }

  function init() {
    var checkbox = document.getElementById('notRPPS');
    var rppsInput = document.getElementById('RPPS');

    if (!rppsInput) {
      console.log('[RPPS] Elements not found, skipping');
      return;
    }

    rppsInput.addEventListener('change', function() { normalize(rppsInput); });
    // Capture phase on document: runs before the listeners of the form itself
    // (Memberstack reads the fields on submit).
    function beforeSend(event) {
      var form = rppsInput.form;
      if (!form) return;
      var target = event.target;
      var fromForm = event.type === 'submit'
        ? target === form
        : target && target.closest && target.closest('[type="submit"]') && form.contains(target);
      if (fromForm) normalize(rppsInput);
    }
    document.addEventListener('click', beforeSend, true);
    document.addEventListener('submit', beforeSend, true);

    if (checkbox && config.rppsText !== null) {
      checkbox.addEventListener('change', function() {
        if (checkbox.checked) {
          rppsInput.value = config.rppsText;
        }
      });

      // Apply initial state if checkbox is already checked
      if (checkbox.checked) {
        rppsInput.value = config.rppsText;
      }
    }

    console.log('[RPPS] Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
