/**
 * Ordotype Mes Informations - Phone Input
 * International phone number formatting using intl-tel-input.
 * Depends on: intl-tel-input CSS & JS (loaded by loader.js)
 */
(function() {
  'use strict';

  var UTILS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js';
  var UTILS_TIMEOUT_MS = 8000;
  var LIB_POLL_MS = 100;
  var LIB_POLL_MAX = 100;

  var HINT_INVALID = "Ce numéro ne semble pas valide. Vérifiez l'indicatif du pays et le nombre de chiffres.";
  var POINTER_WAIT_MAX_MS = 1000;

  // Entries the message can offer to switch to.
  var PROPOSALS = {
    fr: { name: 'France métropolitaine', dialCode: '33' },
    gp: { name: 'Guadeloupe', dialCode: '590' },
    gf: { name: 'Guyane', dialCode: '594' },
    mq: { name: 'Martinique', dialCode: '596' },
    re: { name: 'La Réunion', dialCode: '262' },
    yt: { name: 'Mayotte', dialCode: '262' }
  };

  // French overseas territories available in the country selector.
  var OVERSEAS = ['gp', 'mq', 'gf', 're', 'yt', 'bl', 'mf', 'pm', 'wf', 'nc', 'pf'];

  // First national digits of overseas mobile numbers. These numbers are not
  // valid with +33, even where the formatting helpers accept them.
  var OVERSEAS_MOBILE_PREFIXES = {
    '690': 'gp',
    '691': 'gp',
    '692': 're',
    '693': 're',
    '639': 'yt',
    '694': 'gf',
    '696': 'mq',
    '697': 'mq'
  };

  // Entries whose national number always has 9 digits after the leading 0.
  // Without the formatting helpers, this length is the only check made.
  var NINE_DIGIT_NATIONAL = ['fr', 'gp', 'mq', 'gf', 're', 'yt', 'bl', 'mf'];

  var VISUALLY_HIDDEN = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;' +
    'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';

  // Shared by every field. A message rendered while a button is held down can
  // move that button before it is released, and the click is then lost. Mouse
  // and touch events are watched too: after a tap, focus can move on the
  // mousedown that follows pointerup.
  var pointer = { down: false, waiting: [], watched: false };

  var hintFailureReported = false;

  function report(message) {
    console.warn('[PhoneInput] ' + message);
    if (window.OrdoErrorReporter && typeof window.OrdoErrorReporter.reportNetwork === 'function') {
      window.OrdoErrorReporter.reportNetwork('PhoneInput', new Error(message));
    }
  }

  // Once per page: a check that keeps failing would otherwise report on
  // every keystroke.
  function reportHintFailure(err) {
    if (hintFailureReported) return;
    hintFailureReported = true;
    console.warn('[PhoneInput] Validity hint unavailable: ' + (err && err.message));
    if (window.OrdoErrorReporter && typeof window.OrdoErrorReporter.reportSideEffect === 'function') {
      window.OrdoErrorReporter.reportSideEffect('PhoneInput', err);
    }
  }

  function watchPointer() {
    if (pointer.watched) return;
    pointer.watched = true;
    var options = { capture: true, passive: true };
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function(type) {
      document.addEventListener(type, function() {
        pointer.down = true;
      }, options);
    });
    ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel'].forEach(function(type) {
      document.addEventListener(type, releasePointer, options);
    });
  }

  function releasePointer() {
    pointer.down = false;
    var waiting = pointer.waiting;
    pointer.waiting = [];
    if (!waiting.length) return;
    // After the click that follows the release.
    setTimeout(function() {
      waiting.forEach(function(run) {
        run();
      });
    }, 0);
  }

  /**
   * National digits of the entry, without the country code or leading 0.
   * Null when the entry starts with a country code other than the selected
   * one: the digits cannot be attributed.
   */
  function nationalDigits(value, dialCode) {
    var digits = value.replace(/\D/g, '');
    var international = null;
    if (value.charAt(0) === '+') international = digits;
    else if (value.indexOf('00') === 0) international = digits.slice(2);

    if (international !== null) {
      if (!dialCode || international.indexOf(dialCode) !== 0) return null;
      digits = international.slice(dialCode.length);
    }
    return digits.charAt(0) === '0' ? digits.slice(1) : digits;
  }

  function proposalFor(iso2, national) {
    return { iso2: iso2, number: '+' + PROPOSALS[iso2].dialCode + national };
  }

  function metropolitanProposal(utils, country, national) {
    if (OVERSEAS.indexOf(country.iso2) === -1 || !national) return null;
    var number = '+33' + national;
    if (utils.isValidNumber(number, 'fr') !== true) return null;
    return utils.getNumberType(number, 'fr') === utils.numberType.MOBILE ? proposalFor('fr', national) : null;
  }

  /**
   * Null when there is nothing to say: empty field, valid number, or no
   * certainty either way. Otherwise `{ proposal }`, where proposal is the
   * entry to switch to with the same digits, or null.
   */
  function assessNumber(iti, value) {
    if (!value) return null;
    var country = iti.getSelectedCountryData() || {};
    var national = nationalDigits(value, country.dialCode);
    var territory = national && national.length === 9 ? OVERSEAS_MOBILE_PREFIXES[national.slice(0, 3)] : null;
    var fromFrance = country.iso2 === 'fr' || OVERSEAS.indexOf(country.iso2) !== -1;

    if (territory && fromFrance && PROPOSALS[territory].dialCode !== country.dialCode) {
      return { proposal: proposalFor(territory, national) };
    }

    var utils = window.intlTelInputUtils;
    var valid = utils ? iti.isValidNumber() : null;
    if (valid === true) return null;
    if (valid === false) {
      return { proposal: territory ? null : metropolitanProposal(utils, country, national) };
    }

    if (NINE_DIGIT_NATIONAL.indexOf(country.iso2) === -1) return null;
    return national !== null && national.length !== 9 ? { proposal: null } : null;
  }

  function stateKey(result) {
    if (!result) return '';
    return result.proposal ? result.proposal.iso2 + result.proposal.number : 'invalid';
  }

  /**
   * Message under the field when the number does not look valid. Informative
   * only: the form is always submitted as it is.
   */
  function attachValidityHint(input, iti, form, index) {
    // intl-tel-input wraps the input; the message goes after that wrapper.
    var wrapper = input.parentNode;
    var zone = document.createElement('div');
    zone.id = (input.id || 'phone-' + index) + '-validity';
    zone.style.cssText = 'display:none;margin-top:.25rem;font-size:.875rem;line-height:1.4;';

    var message = document.createElement('div');
    message.style.color = 'var(--error-700, #ba1b1b)';

    var offer = document.createElement('div');
    offer.style.cssText = 'display:none;margin-top:.125rem;color:var(--neutral-500, #47505c);';
    var question = document.createElement('span');
    var action = document.createElement('button');
    action.type = 'button';
    action.style.cssText = 'margin:0 0 0 .25rem;padding:0;border:0;background:none;font:inherit;' +
      'color:var(--primary-1, #153cf5);text-decoration:underline;cursor:pointer;';

    // Always rendered, so that each change of its text is announced.
    var live = document.createElement('div');
    live.setAttribute('aria-live', 'polite');
    live.style.cssText = VISUALLY_HIDDEN;

    offer.appendChild(question);
    offer.appendChild(action);
    zone.appendChild(message);
    zone.appendChild(offer);
    wrapper.parentNode.insertBefore(zone, wrapper.nextSibling);
    wrapper.parentNode.insertBefore(live, zone.nextSibling);

    var shown = null;
    var waitToken = 0;

    function describe(visible) {
      var ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(function(id) {
        return id && id !== zone.id;
      });
      if (visible) ids.push(zone.id);
      if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
      else input.removeAttribute('aria-describedby');
    }

    function render(result) {
      if (stateKey(result) === stateKey(shown)) return;
      shown = result;
      var target = result && result.proposal ? PROPOSALS[result.proposal.iso2] : null;
      var text = target ? 'Vouliez-vous saisir un numéro de ' + target.name + ' (+' + target.dialCode + ')\u00a0?' : '';

      message.textContent = result ? HINT_INVALID : '';
      question.textContent = text;
      action.textContent = target ? 'Oui, passer en +' + target.dialCode : '';
      offer.style.display = target ? '' : 'none';
      zone.style.display = result ? '' : 'none';
      describe(Boolean(result));
      live.textContent = result ? (text ? HINT_INVALID + ' ' + text : HINT_INVALID) : '';
    }

    function check() {
      var result = null;
      try {
        result = assessNumber(iti, input.value.trim());
      } catch (err) {
        reportHintFailure(err);
      }
      render(result);
    }

    // Rendered once the pointer is released, so the click it started lands
    // where the visitor aimed.
    function checkAfterRelease() {
      waitToken += 1;
      var token = waitToken;
      var timer = setTimeout(run, POINTER_WAIT_MAX_MS);
      function run() {
        if (token !== waitToken) return;
        waitToken += 1;
        clearTimeout(timer);
        // Back in the field: the next exit checks again.
        if (document.activeElement !== input) check();
      }
      pointer.waiting.push(run);
    }

    function checkWhenSafe() {
      if (pointer.down) checkAfterRelease();
      else check();
    }

    function recheck() {
      if (shown) checkWhenSafe();
    }

    action.addEventListener('click', function() {
      var target = shown && shown.proposal;
      if (!target) return;
      // Cleared first: switching the country re-checks the field.
      render(null);
      iti.setCountry(target.iso2);
      input.value = target.number;
    });

    input.addEventListener('blur', function(event) {
      // Opening the country list, or leaving the window, is not leaving the field.
      if (event.relatedTarget && wrapper.contains(event.relatedTarget)) return;
      if (document.activeElement === input || !document.hasFocus()) return;
      checkWhenSafe();
    });
    input.addEventListener('input', recheck);
    input.addEventListener('change', recheck);
    input.addEventListener('countrychange', recheck);
    if (form) form.addEventListener('submit', check);
    watchPointer();
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

  function init(inputs) {
    inputs.forEach(function(input, index) {
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

      // The message is an extra: if it cannot be set up, the field above
      // must keep working and the helpers below must still load.
      try {
        attachValidityHint(input, iti, form, index);
      } catch (err) {
        reportHintFailure(err);
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

    // The field itself is built straight away: that is DOM work, no network,
    // and it carries the country selector plus the listener that normalises
    // the value on submit. Holding it back until the field appears would show
    // a bare text box at the exact moment the member uses it, and a submit
    // inside that window would post an unformatted number.
    init(inputs);

    // 🔴 Only the formatting helpers wait, and they are the whole problem:
    // eight times the weight of the library, last in a chain the page starts
    // several hops earlier, so the request most likely to be dropped. On the
    // home page the field belongs to a prompt shown only to members who have
    // not given a number yet, and the prompt is revealed by a script that
    // loads after this one. Fetching them for every other visitor buys a
    // feature nobody is looking at, and buys the failures that come with it.
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
    var tries = attempt || 0;

    if (window.intlTelInput) {
      start();
      return;
    }

    if (tries >= LIB_POLL_MAX) {
      report('intl-tel-input did not load, skipping phone formatting');
      return;
    }

    setTimeout(function() {
      waitForDependency(tries + 1);
    }, LIB_POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      waitForDependency(0);
    });
  } else {
    waitForDependency(0);
  }
})();
