/**
 * Ordotype Account - Phone Input
 * International phone number formatting using intl-tel-input.
 * Depends on: jQuery, intl-tel-input CSS & JS (loaded by loader.js)
 */
(function() {
  'use strict';

  function init() {
    const inputs = document.querySelectorAll('input[ms-code-phone-number]');
    
    if (!inputs.length) {
      console.log('[PhoneInput] No phone inputs found');
      return;
    }

    inputs.forEach(input => {
      const preferredCountries = input.getAttribute('ms-code-phone-number').split(',');

      const iti = window.intlTelInput(input, {
        preferredCountries: preferredCountries,
        utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
        localizedCountries: {
          nc: "Nouvelle-Calédonie",
          pf: "Polynésie française",
          ma: "Maroc",
          dz: "Algérie",
          tn: "Tunisie",
          gf: "Guyane française",
          re: "La Réunion",
          fr: "France métropolitaine",
          be: "Belgique",
          ch: "Suisse",
          wf: "Wallis-et-Futuna"
        }
      });

      // Format on change/keyup
      function formatNumber() {
        const formatted = iti.getNumber(intlTelInputUtils.numberFormat.INTERNATIONAL);
        input.value = formatted;
      }

      input.addEventListener('change', formatNumber);
      input.addEventListener('keyup', formatNumber);

      // Format on form submit
      const form = input.closest('form');
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

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDependency);
  } else {
    waitForDependency();
  }
})();
