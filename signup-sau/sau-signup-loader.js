/**
 * SAU signup page loader — /membership/sau-en-savoir-plus
 *
 * Bundles the two page-specific concerns that previously lived as a separate
 * inline script in the Webflow page footer:
 *
 *   1. [SAUSource]   — capture the acquisition source (?src= / Brevo UTMs) and
 *                      inject it as a hidden `src` input so Webflow forwards it
 *                      in the form webhook.
 *   2. [SAUHoneypot] — anti-bot honeypot: inject an invisible decoy field and
 *                      block submission if a bot fills it. Stops the scraper
 *                      spam hitting the unprotected SAU signup form.
 *
 * Crisp is intentionally NOT loaded here — it is loaded site-wide from the
 * global Webflow footer (shared/crisp-loader.js); keep that tag untouched.
 *
 * Loaded in Webflow via a single tag, e.g.:
 *   <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@<commit>/signup-sau/sau-signup-loader.js"></script>
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Source capture — [SAUSource]
   * ------------------------------------------------------------------ */
  (function () {
    var PREFIX = '[SAUSource]';
    var KEY = 'sau_src';
    var ALLOWED = { banner: 1, pricing: 1, email: 1 };

    // Capture the source on landing; persist for the session
    // (survives refresh / in-page nav).
    try {
      var qs = new URLSearchParams(window.location.search);
      var p = qs.get('src');
      // Brevo emails land with utm_medium=email (no ?src=), so map them to "email".
      if (!p && (qs.get('utm_medium') === 'email' || qs.get('utm_source') === 'brevo')) p = 'email';
      if (p && ALLOWED[p]) sessionStorage.setItem(KEY, p);
    } catch (e) {}

    function getSrc() {
      try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; }
    }

    // Inject a hidden "src" input so Webflow sends it in the form webhook.
    function inject() {
      var src = getSrc();
      if (!src) return;
      var forms = document.querySelectorAll('form');
      for (var i = 0; i < forms.length; i++) {
        var input = forms[i].querySelector('input[name="src"]');
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'src';
          forms[i].appendChild(input);
        }
        input.value = src;
      }
      console.log(PREFIX, 'source =', src);
    }

    inject();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  })();

  /* ------------------------------------------------------------------ *
   * 2. Honeypot anti-bot — [SAUHoneypot]
   * ------------------------------------------------------------------ */
  (function () {
    var PREFIX = '[SAUHoneypot]';
    var FORM_ID = 'wf-form-SAU-inscription-2';
    // Decoy field name — looks plausible to a dumb bot, means nothing to us.
    var HP_NAME = 'website-url';

    function setup() {
      var form = document.getElementById(FORM_ID);
      if (!form) return;
      if (form.querySelector('input[name="' + HP_NAME + '"]')) return; // already wired

      // Inject the invisible decoy. Off-screen (not display:none — some bots
      // skip those), not focusable, not autofilled, hidden from screen readers.
      var wrap = document.createElement('div');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden';

      var hp = document.createElement('input');
      hp.type = 'text';
      hp.name = HP_NAME;
      hp.tabIndex = -1;
      hp.setAttribute('autocomplete', 'off');
      wrap.appendChild(hp);
      form.appendChild(wrap);

      // Block submission (capture phase = runs before Webflow's handler) if
      // the trap is filled.
      form.addEventListener('submit', function (e) {
        if (hp.value.trim() !== '') {
          e.preventDefault();
          e.stopImmediatePropagation();
          console.log(PREFIX, 'blocked bot submission');
          return false;
        }
      }, true);

      console.log(PREFIX, 'armed');
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  })();
})();
