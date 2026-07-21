/**
 * Ordotype - Connexion autre appareil - Panel Switcher
 * Runs on /membership/connexion-autre-appareil (device-conflict page shown by
 * the auth proxy when the session was taken over on another device).
 *
 * DEPLOY: inline in the Webflow page footer custom code (Before </body> tag),
 * wrapped in <script>...</script>, preceded by this style block so the
 * secondary panels never flash before the script runs:
 *
 *   <style>
 *     #section-why-this-message { display: none; }
 *     section.section_main:has(#wf-form-reset-password) { display: none; }
 *   </style>
 *
 * The page is 3 stacked full-height sections designed as exclusive panels:
 *   main  = #section-main (login card)
 *   why   = #section-why-this-message (explainer + "Obtenir de l'aide")
 *   reset = unnamed section holding #wf-form-reset-password (Memberstack
 *           forgot-password form), resolved via closest('section') because
 *           it has no id in the Designer
 *
 * Without this script every panel is visible at once and the four href="#"
 * buttons are dead (nothing else on the page binds them; checked page HTML,
 * auth-bundle 4.5.8, global-utils, crisp-loader, GTM at runtime, 2026-07-21).
 *
 * open-crisp: crisp-loader gates anonymous visitors on analytics consent, so
 * Crisp may not be loaded when the button is clicked. An explicit help click
 * is a direct request for the chat, so we force-inject l.js ourselves, with
 * the same lookbehind feature check as crisp-loader (the Crisp bundle dies at
 * parse time on Safari < 16.4); on unsupported browsers we fall back to
 * mailto, and the panel shows phone + email right below the button anyway.
 */
(function () {
  'use strict';

  var PREFIX = '[ConnexionAutreAppareil]';

  function init() {
    var panels = {
      main: document.getElementById('section-main'),
      why: document.getElementById('section-why-this-message'),
      reset: null
    };
    var form = document.getElementById('wf-form-reset-password');
    if (form && form.closest) panels.reset = form.closest('section');

    if (!panels.main || !panels.why || !panels.reset) {
      console.warn(PREFIX + ' sections introuvables, abandon', {
        main: !!panels.main, why: !!panels.why, reset: !!panels.reset
      });
      return;
    }

    function show(name) {
      for (var key in panels) {
        panels[key].style.display = (key === name) ? 'block' : 'none';
      }
      window.scrollTo(0, 0);
    }

    function bind(id, handler) {
      var el = document.getElementById(id);
      if (!el) {
        console.warn(PREFIX + ' bouton #' + id + ' introuvable');
        return;
      }
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handler();
      });
    }

    show('main');

    bind('why-this-message-btn', function () { show('why'); });
    bind('back-to-section-main', function () { show('main'); });
    bind('reset-password-btn', function () { show('reset'); });
    bind('open-crisp', openCrisp);
  }

  function openCrisp() {
    window.$crisp = window.$crisp || [];
    window.$crisp.push(['do', 'chat:open']);
    if (!document.querySelector('script[src*="client.crisp.chat"]')) {
      try {
        new RegExp('(?<=a)b');
      } catch (e) {
        window.location.href = 'mailto:contact@ordotype.fr';
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://client.crisp.chat/l.js';
      s.async = 1;
      document.head.appendChild(s);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
