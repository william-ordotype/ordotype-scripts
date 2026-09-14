/**
 * Password visibility toggle
 *
 * Expected markup, the toggle sharing its parent with the password input:
 * <div>
 *   <input type="password">
 *   <div data-ordo-password-toggle role="button" tabindex="0" aria-label="Afficher le mot de passe">
 *     <div data-ordo-password-icon="show">...</div>
 *     <div data-ordo-password-icon="hide">...</div>
 *   </div>
 * </div>
 *
 * Loaded from the Webflow site footer, only on pages that contain a toggle:
 * <script>
 *   (function () {
 *     if (!document.querySelector('[data-ordo-password-toggle]')) return;
 *     var s = document.createElement('script');
 *     s.src = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@<sha>/shared/password-toggle.js';
 *     s.crossOrigin = 'anonymous';
 *     document.body.appendChild(s);
 *   })();
 * </script>
 */
(function () {
  'use strict';

  if (window.__ordoPasswordToggle) return;
  window.__ordoPasswordToggle = true;

  var SEL = '[data-ordo-password-toggle]';
  var MARK = 'data-ordo-password-input';

  function parts(btn) {
    return {
      input: btn.parentNode ? btn.parentNode.querySelector('input') : null,
      show: btn.querySelector('[data-ordo-password-icon="show"]'),
      hide: btn.querySelector('[data-ordo-password-icon="hide"]')
    };
  }

  function sync(btn) {
    var p = parts(btn);
    if (!p.input) return;
    if (!p.input.hasAttribute(MARK)) p.input.setAttribute(MARK, '');
    var visible = p.input.type === 'text';
    if (p.show) p.show.style.display = visible ? 'none' : 'block';
    if (p.hide) p.hide.style.display = visible ? 'block' : 'none';
    btn.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  }

  function toggle(btn, refocus) {
    var p = parts(btn);
    if (!p.input) return;
    p.input.type = p.input.type === 'password' ? 'text' : 'password';
    sync(btn);
    if (refocus) p.input.focus();
  }

  function find(e) {
    return e.target && e.target.closest ? e.target.closest(SEL) : null;
  }

  document.addEventListener('mousedown', function (e) {
    if (find(e)) e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    var btn = find(e);
    if (!btn) return;
    e.preventDefault();
    toggle(btn, document.activeElement !== btn);
  });

  document.addEventListener('keydown', function (e) {
    var btn = find(e);
    if (!btn || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggle(btn, false);
  });

  window.addEventListener('submit', function (e) {
    var btns = e.target && e.target.querySelectorAll ? e.target.querySelectorAll(SEL) : [];
    for (var i = 0; i < btns.length; i++) {
      var p = parts(btns[i]);
      if (p.input) p.input.type = 'password';
      sync(btns[i]);
    }
  }, true);

  function init() {
    var style = document.createElement('style');
    style.textContent = 'input[' + MARK + ']::-ms-reveal{display:none}';
    (document.head || document.documentElement).appendChild(style);
    var all = document.querySelectorAll(SEL);
    for (var i = 0; i < all.length; i++) sync(all[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
