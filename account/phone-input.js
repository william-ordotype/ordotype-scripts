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
   * can hold the request open without ever answering or erroring, so `load` and
   * `error` alone would leave that case silent forever. Nothing waits on the
   * result any more - the field is built before this runs - so the deadline is
   * now purely a witness: it is how a stalled network reaches us at all.
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
   * Run once one of the fields is actually on screen.
   *
   * `isIntersecting` was added to the entry after IntersectionObserver itself
   * shipped, so a browser can expose the constructor - which skips the
   * fallback below - and still leave the property undefined. Reading the ratio
   * as well keeps those browsers on the working path instead of never firing.
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
        if (entries[i].isIntersecting || entries[i].intersectionRatio > 0) {
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

    // The field itself is built straight away: that is DOM work, no network,
    // and it carries the country selector plus the listener that normalises
    // the value on submit. Holding it back until the field appears would show
    // a bare text box at the exact moment the member uses it, and a submit
    // inside that window would post an unformatted number.
    init(inputs);

    // 🔴 Only the formatting helpers wait, and they are the whole problem:
    // eight times the weight of the library, last in a chain the page starts
    // several hops earlier, so the request most likely to be dropped.
    // Fetching them for a field the visitor never opens buys a feature nobody
    // is looking at, and buys the failures that come with it.
    //
    // Building before the helpers costs only the generated example
    // placeholder, and `autoPlaceholder: 'polite'` leaves an input that
    // already has a placeholder alone. All four pages that carry this field
    // hardcode one, so nothing is lost. `getNumber` reads the helpers off the
    // global at call time, so formatting starts working the moment they land.
    whenVisible(inputs, loadUtils);
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
