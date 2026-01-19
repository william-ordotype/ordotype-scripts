/**
 * Ordotype Pathology - Opacity Reveal
 * Reveals hidden elements by setting opacity to 1.
 */
(function() {
  'use strict';

  function init() {
    const selectors = [
      '.rc-html.opacity-0',
      '.redac-and-ref.patho',
      '.premium-content-component.new-paywall',
      '.rc_hidden_warning_wrapper',
      '.rappels-cliniques_row'
    ];

    const elements = document.querySelectorAll(selectors.join(', '));

    elements.forEach(function(el) {
      setTimeout(function() {
        el.style.opacity = '1';
      }, 50);
    });

    console.log('[OpacityReveal] Revealed', elements.length, 'element(s)');
  }

  window.addEventListener('load', init);
})();
