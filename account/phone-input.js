/**
 * Ordotype Account - Phone Input
 * International phone number formatting using intl-tel-input.
 * Depends on: jQuery, intl-tel-input CSS & JS (loaded by loader.js)
 */
(function() {
  'use strict';

  const UTILS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js';
  const UTILS_TIMEOUT_MS = 8000;
  const LIB_POLL_MS = 100;
  const LIB_POLL_MAX = 100;

  function report(message) {
    console.warn('[PhoneInput] ' + message);
    if (window.OrdoErrorReporter && typeof window.OrdoErrorReporter.reportNetwork === 'function') {
      window.OrdoErrorReporter.reportNetwork('PhoneInput', new Error(message));
    }
  }

  /**
   * Load the formatting helpers ourselves rather than handing intl-tel-input
   * a `utilsScript` option. In 17.0.8 the library answers a failed helper load
   * by calling a method that does not exist on the instance, which raises an
   * uncaught TypeError from inside the library and cannot be caught from here.
   * Loading the file ourselves keeps that failure in our hands: the field stays
   * usable, it only loses auto-formatting.
   *
   * Always settles, and never later than UTILS_TIMEOUT_MS. A filtering proxy
   * can hold the request open without ever answering or erroring, and the field
   * is built after this resolves: waiting on `load`/`error` alone would leave a
   * plain text box with no country selector at all.
   */
  function loadUtils() {
    return new Promise(resolve => {
      if (window.intlTelInputUtils) {
        resolve();
        return;
      }

      let settled = false;

      function settle(message) {
        if (settled) return;
        settled = true;
        if (message) report(message);
        resolve();
      }

      const timer = setTimeout(() => {
        settle('Formatting helpers timed out, continuing without them');
      }, UTILS_TIMEOUT_MS);

      const script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = UTILS_URL;
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        settle(null);
      };
      script.onerror = () => {
        clearTimeout(timer);
        settle('Formatting helpers unavailable, continuing without them');
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

  /**
   * Run once the phone field is actually on screen.
   *
   * The helpers weigh eight times the library itself, and they are the last
   * request of a chain the page starts several hops earlier, so they are also
   * the request most likely to be dropped on a slow connection. Fetching them
   * for a field the visitor never sees buys a feature nobody is looking at,
   * and buys the failures that come with it.
   *
   * Fires on the first field to become visible and builds every field then,
   * which is what happened before, only later. Without an observer, run at
   * once: that is exactly the previous behaviour.
   */
  function whenVisible(elements, run) {
    let done = false;
    function fire() {
      if (done) return;
      done = true;
      run();
    }

    if (typeof window.IntersectionObserver !== 'function') return fire();

    const obs = new window.IntersectionObserver(entries => {
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          obs.disconnect();
          fire();
          return;
        }
      }
    // A field sitting just under the fold should start loading before the
    // visitor scrolls to it, not after.
    }, { rootMargin: '200px' });

    for (let i = 0; i < elements.length; i++) obs.observe(elements[i]);
  }

  function start() {
    const inputs = document.querySelectorAll('input[ms-code-phone-number]');

    if (!inputs.length) {
      console.log('[PhoneInput] No phone inputs found');
      return;
    }

    whenVisible(inputs, () => {
      // Helpers first: intl-tel-input reads them while building the instance,
      // so loading them afterwards would leave the placeholder unformatted.
      loadUtils().then(() => init(inputs));
    });
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
      report('intl-tel-input did not load, skipping phone formatting');
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
