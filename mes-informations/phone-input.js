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
  var CSS_TIMEOUT_MS = 2000;
  var UTILS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js';
  var UTILS_TIMEOUT_MS = 8000;

  function report(message) {
    console.warn('[PhoneInput] ' + message);
    if (window.OrdoErrorReporter && typeof window.OrdoErrorReporter.reportNetwork === 'function') {
      window.OrdoErrorReporter.reportNetwork('PhoneInput', new Error(message));
    }
  }

  /**
   * Load one third-party file. Always settles, and never later than
   * timeoutMs: a filtering proxy can hold a request open without ever
   * answering or erroring, so `load` and `error` alone would leave that case
   * silent forever. `onLate` runs when the file lands after the deadline.
   */
  function loadScript(url, timeoutMs, messages, onLate) {
    return new Promise(function(resolve) {
      var settled = false;

      function settle(ready, message) {
        if (settled) return false;
        settled = true;
        if (message) report(message);
        resolve(ready);
        return true;
      }

      var timer = setTimeout(function() {
        settle(false, messages.timeout);
      }, timeoutMs);

      var script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      script.src = url;
      script.async = true;
      script.onload = function() {
        clearTimeout(timer);
        if (!settle(true, null) && onLate) onLate();
      };
      script.onerror = function() {
        clearTimeout(timer);
        settle(false, messages.error);
      };
      (document.body || document.head).appendChild(script);
    });
  }

  /**
   * Load the formatting helpers ourselves rather than handing intl-tel-input
   * a `utilsScript` option. In 17.0.8 the library answers a failed helper load
   * by calling a method that does not exist on the instance, which raises an
   * uncaught TypeError from inside the library and cannot be caught from here.
   * Loading the file ourselves keeps that failure in our hands: the field stays
   * usable, it only loses auto-formatting.
   */
  function loadUtils() {
    if (window.intlTelInputUtils) return Promise.resolve(true);
    return loadScript(UTILS_URL, UTILS_TIMEOUT_MS, {
      timeout: 'Formatting helpers timed out, continuing without them',
      error: 'Formatting helpers unavailable, continuing without them'
    });
  }

  /**
   * The stylesheet is requested first and the field waits for it, bounded.
   * The library measures the flag against the applied rules to compute the
   * field padding: building before the sheet lands leaves the number sitting
   * under the flag for the life of the page. A sheet that never arrives only
   * costs the flags, so it never blocks past CSS_TIMEOUT_MS and never reports.
   */
  function loadStylesheet() {
    return new Promise(function(resolve) {
      var settled = false;

      function settle() {
        if (settled) return;
        settled = true;
        resolve();
      }

      var timer = setTimeout(settle, CSS_TIMEOUT_MS);
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LIB_CSS_URL;
      link.onload = function() {
        clearTimeout(timer);
        settle();
      };
      link.onerror = function() {
        clearTimeout(timer);
        console.warn('[PhoneInput] Stylesheet unavailable, the field stays unstyled');
        settle();
      };
      document.head.appendChild(link);
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

  var built = false;

  // Building throws nothing today, but it is now the last step of a promise
  // chain: without this the repo channel would never hear about it.
  function build(inputs) {
    if (built) return;
    built = true;
    try {
      init(inputs);
    } catch (e) {
      built = false;
      report('Phone field could not be built: ' + e.message);
      return;
    }
    loadUtils();
  }

  /**
   * Fetch the library and build the field. Both the library and its stylesheet
   * wait for the field to be on screen, so a field that is never shown costs
   * no request at all.
   *
   * A library that lands after the deadline still builds the field: the tag
   * stays in the page and the member is still in front of it.
   */
  function loadAndBuild(inputs) {
    var stylesheet = loadStylesheet();

    function whenStyled() {
      stylesheet.then(function() { build(inputs); });
    }

    if (window.intlTelInput) {
      whenStyled();
      return;
    }

    loadScript(LIB_URL, LIB_TIMEOUT_MS, {
      timeout: 'intl-tel-input timed out, skipping phone formatting',
      error: 'intl-tel-input unavailable, skipping phone formatting'
    }, whenStyled).then(function(ready) {
      if (!ready) return;
      if (!window.intlTelInput) {
        report('intl-tel-input loaded without defining itself, skipping phone formatting');
        return;
      }
      whenStyled();
    });
  }

  function start() {
    var inputs = document.querySelectorAll('input[ms-code-phone-number]');

    if (!inputs.length) {
      console.log('[PhoneInput] No phone inputs found');
      return;
    }

    // Once the library lands the field is built without waiting for the
    // helpers: that is DOM work, no network, and it carries the country
    // selector plus the listener that normalises the value on submit.
    // Building before the helpers costs only the generated example
    // placeholder, and `autoPlaceholder: 'polite'` leaves an input that
    // already has a placeholder alone. All four pages that carry this field
    // hardcode one, so nothing is lost. `getNumber` reads the helpers off the
    // global at call time, so formatting starts working the moment they land.
    whenVisible(inputs, function() {
      loadAndBuild(inputs);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
