/**
 * Ordotype Mes Informations CMS - RPPS Handler
 * 1. Sets RPPS value to "Pas de {equivalent}" when notRPPS checkbox is checked.
 * 2. On pages where the number is an RPPS (equivalent name containing « RPPS »),
 *    a number typed as the national identifier (« 8 » + RPPS, 12 digits) is
 *    saved as the 11-digit RPPS: the leading 8 is removed when the field changes
 *    and again just before the form is sent, before Memberstack reads it. Only
 *    when the 11 remaining digits pass the Luhn check, as on the server. Pages
 *    for another country's number (INAMI, GLN, CNS…) are left untouched.
 * Expects window.OrdoMesInfosCMS.rppsEquivalentName to be set by loader.
 */
(function() {
  'use strict';

  var rpps = document.getElementById('RPPS');
  var notRPPS = document.getElementById('notRPPS');

  if (!rpps) return;

  var equivalentName = (window.OrdoMesInfosCMS && window.OrdoMesInfosCMS.rppsEquivalentName) || 'RPPS';

  if (notRPPS) {
    notRPPS.addEventListener('change', function() {
      if (notRPPS.checked) {
        rpps.value = 'Pas de ' + equivalentName;
      }
    });
  }

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
    var number = compact.slice(1);
    return luhnOk(number) ? number : null;
  }

  function normalize() {
    var number = withoutLeadingEight(rpps.value);
    if (number) rpps.value = number;
  }

  if (/rpps/i.test(equivalentName)) {
    rpps.addEventListener('change', normalize);
    // Capture phase on document: runs before the listeners of the form itself
    // (Memberstack reads the fields on submit).
    var beforeSend = function(event) {
      var form = rpps.form;
      if (!form) return;
      var target = event.target;
      var fromForm = event.type === 'submit'
        ? target === form
        : target && target.closest && target.closest('[type="submit"]') && form.contains(target);
      if (fromForm) normalize();
    };
    document.addEventListener('click', beforeSend, true);
    document.addEventListener('submit', beforeSend, true);
  }

  console.log('[RPPSHandler] Initialized');
})();
