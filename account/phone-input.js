/**
 * Ordotype Account - Phone Input
 * International phone number formatting using intl-tel-input.
 * Depends on: jQuery, intl-tel-input CSS & JS (loaded by loader.js)
 */
(function() {
  'use strict';

  const UTILS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js';
  const LIB_POLL_MS = 100;
  const LIB_POLL_MAX = 100;

  /**
   * Load the formatting helpers ourselves rather than handing intl-tel-input
   * a `utilsScript` option. In 17.0.8 the library answers a failed helper load
   * by calling a method that does not exist on the instance, which raises an
   * uncaught TypeError from inside the library and cannot be caught from here.
   * Loading the file ourselves keeps that failure in our hands: the field stays
   * usable, it only loses auto-formatting.
   *
   * Never rejects, so a blocked or offline CDN degrades instead of breaking.
   */
  function loadUtils() {
    return new Promise(resolve => {
      if (window.intlTelInputUtils) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = UTILS_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        console.warn('[PhoneInput] Formatting helpers unavailable, continuing without them');
        resolve();
      };
      (document.body || document.head).appendChild(script);
    });
  }

  function init(inputs) {
    inputs.forEach(input => {
      const preferredCountries = input.getAttribute('ms-code-phone-number').split(',');

      const iti = window.intlTelInput(input, {
        preferredCountries: preferredCountries,
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
        // getNumber() guards on the helpers internally, but the format argument
        // is read before the call, so it has to be checked here first.
        if (!window.intlTelInputUtils) return;

        const formatted = iti.getNumber(window.intlTelInputUtils.numberFormat.INTERNATIONAL);
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

  function start() {
    const inputs = document.querySelectorAll('input[ms-code-phone-number]');

    if (!inputs.length) {
      console.log('[PhoneInput] No phone inputs found');
      return;
    }

    // Helpers first: intl-tel-input reads them while building the instance, so
    // loading them afterwards would leave the placeholder unformatted.
    loadUtils().then(() => init(inputs));
  }

  // Wait for intl-tel-input to be available, but give up rather than poll for
  // the life of the page when the library itself never loads.
  function waitForDependency(attempt) {
    const tries = attempt || 0;

    if (window.intlTelInput) {
      start();
      return;
    }

    if (tries >= LIB_POLL_MAX) {
      console.warn('[PhoneInput] intl-tel-input did not load, skipping phone formatting');
      return;
    }

    setTimeout(() => waitForDependency(tries + 1), LIB_POLL_MS);
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForDependency(0));
  } else {
    waitForDependency(0);
  }
})();
