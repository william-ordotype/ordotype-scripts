/**
 * Ordotype Mes Informations - Phone Input
 * International phone number formatting using intl-tel-input.
 * Depends on: intl-tel-input CSS & JS (loaded by loader.js)
 */
(function() {
  'use strict';

  function init() {
    var inputs = document.querySelectorAll('input[ms-code-phone-number]');

    if (!inputs.length) {
      console.log('[PhoneInput] No phone inputs found');
      return;
    }

    inputs.forEach(function(input) {
      var preferredCountries = input.getAttribute('ms-code-phone-number').split(',');

      var iti = window.intlTelInput(input, {
        preferredCountries: preferredCountries,
        utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
        localizedCountries: {
          nc: "Nouvelle-Cal\u00e9donie",
          pf: "Polyn\u00e9sie fran\u00e7aise",
          ma: "Maroc",
          dz: "Alg\u00e9rie",
          tn: "Tunisie",
          gf: "Guyane fran\u00e7aise",
          re: "La R\u00e9union",
          fr: "France m\u00e9tropolitaine",
          be: "Belgique",
          ch: "Suisse",
          wf: "Wallis-et-Futuna"
        }
      });

      function formatNumber() {
        var formatted = iti.getNumber(intlTelInputUtils.numberFormat.INTERNATIONAL);
        input.value = formatted;
      }

      input.addEventListener('change', formatNumber);
      input.addEventListener('keyup', formatNumber);

      var form = input.closest('form');
      if (form) {
        form.addEventListener('submit', formatNumber);
      }
    });

    console.log('[PhoneInput] Initialized', inputs.length, 'input(s)');
  }

  // Wait for intl-tel-input to be available
  function waitForDependency() {
    if (window.intlTelInput) {
      init();
    } else {
      setTimeout(waitForDependency, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDependency);
  } else {
    waitForDependency();
  }
})();
