/**
 * Ordotype Mes Informations - Phone Input
 * International phone number formatting using intl-tel-input.
 * Loads the library, its stylesheet and its formatting helpers itself, once a
 * phone field is on screen.
 */
(function() {
  'use strict';

  var LIB_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css';
  var LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js';
  var LIB_TIMEOUT_MS = 15000;
  var UTILS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js';
  var UTILS_TIMEOUT_MS = 8000;

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
    return new Promise(function(resolve) {
      if (window.intlTelInputUtils) {
        resolve();
        return;
      }

      var settled = false;

      function settle(message) {
        if (settled) return;
        settled = true;
        if (message) report(message);
        resolve();
      }

      var timer = setTimeout(function() {
        settle('Formatting helpers timed out, continuing without them');
      }, UTILS_TIMEOUT_MS);

      var script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = UTILS_URL;
      script.async = true;
      script.onload = function() {
        clearTimeout(timer);
        settle(null);
      };
      script.onerror = function() {
        clearTimeout(timer);
        settle('Formatting helpers unavailable, continuing without them');
      };
      (document.body || document.head).appendChild(script);
    });
  }

  /**
   * Fetch the library and its stylesheet, and say whether the field can be
   * built. Both are third party, so both wait for the field to be on screen:
   * on the home page the field belongs to a prompt shown only to members who
   * have not given a number, and every other visitor was paying for a request
   * they had no use for, plus the failures that come with it.
   *
   * Always settles, never later than LIB_TIMEOUT_MS: a filtering proxy can
   * hold the request open without ever answering or erroring, and the deadline
   * is how that case reaches us instead of leaving the field waiting forever.
   */
  function loadLibrary() {
    return new Promise(function(resolve) {
      if (window.intlTelInput) {
        resolve(true);
        return;
      }

      var settled = false;

      function settle(ready, message) {
        if (settled) return;
        settled = true;
        if (message) report(message);
        resolve(ready);
      }

      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LIB_CSS_URL;
      // The country selector loses its flags and its spacing without this
      // sheet, and nothing else on the page does. A plain input is a fair
      // outcome, so the sheet never gates the field and never reports.
      link.onerror = function() {
        console.warn('[PhoneInput] Stylesheet unavailable, the field stays unstyled');
      };
      document.head.appendChild(link);

      var timer = setTimeout(function() {
        settle(false, 'intl-tel-input timed out, skipping phone formatting');
      }, LIB_TIMEOUT_MS);

      var script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = LIB_URL;
      script.async = true;
      script.onload = function() {
        clearTimeout(timer);
        settle(!!window.intlTelInput, window.intlTelInput ? null : 'intl-tel-input loaded without defining itself, skipping phone formatting');
      };
      script.onerror = function() {
        clearTimeout(timer);
        settle(false, 'intl-tel-input unavailable, skipping phone formatting');
      };
      (document.body || document.head).appendChild(script);
    });
  }

  function init(inputs) {
    inputs.forEach(function(input) {
      var preferredCountries = input.getAttribute('ms-code-phone-number').split(',');

      var iti = window.intlTelInput(input, {
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

      function formatNumber() {
        // getNumber() guards on the helpers internally, but the format argument
        // is read before the call, so it has to be checked here first.
        if (!window.intlTelInputUtils) return;

        var formatted = iti.getNumber(window.intlTelInputUtils.numberFormat.INTERNATIONAL);
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

  /**
   * Run once one of the fields is actually on screen.
   *
   * `isIntersecting` was added to the entry after IntersectionObserver itself
   * shipped, so a browser can expose the constructor - which skips the
   * fallback below - and still leave the property undefined. Reading the ratio
   * as well keeps those browsers on the working path instead of never firing.
   */
  function whenVisible(elements, run) {
    var done = false;
    function fire() {
      if (done) return;
      done = true;
      run();
    }

    if (typeof window.IntersectionObserver !== 'function') return fire();

    var obs = new window.IntersectionObserver(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting || entries[i].intersectionRatio > 0) {
          obs.disconnect();
          fire();
          return;
        }
      }
    // A field sitting just under the fold on the profile page should start
    // loading before the visitor scrolls to it, not after.
    }, { rootMargin: '200px' });

    for (var j = 0; j < elements.length; j++) obs.observe(elements[j]);
  }

  function start() {
    var inputs = document.querySelectorAll('input[ms-code-phone-number]');

    if (!inputs.length) {
      console.log('[PhoneInput] No phone inputs found');
      return;
    }

    // Nothing third party is fetched until one of the fields is on screen.
    // A field that is never shown then costs no request at all, which is the
    // common case on the home page.
    //
    // Once the library lands the field is built immediately, without waiting
    // for the helpers: that is DOM work, no network, and it carries the
    // country selector plus the listener that normalises the value on submit.
    // Building before the helpers costs only the generated example
    // placeholder, and `autoPlaceholder: 'polite'` leaves an input that
    // already has a placeholder alone. All four pages that carry this field
    // hardcode one, so nothing is lost. `getNumber` reads the helpers off the
    // global at call time, so formatting starts working the moment they land.
    whenVisible(inputs, function() {
      loadLibrary().then(function(ready) {
        if (!ready) return;
        init(inputs);
        loadUtils();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
