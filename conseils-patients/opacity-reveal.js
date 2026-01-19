/**
 * Ordotype Conseils Patients - Opacity Reveal
 * Reveals hidden elements by setting opacity to 1.
 */
(function() {
  'use strict';

  function init() {
    var selectors = [
      '.qr-code-fcp-div-block-wrapper',
      '.rc-html-fcp'
    ];

    var elements = document.querySelectorAll(selectors.join(', '));

    elements.forEach(function(el) {
      setTimeout(function() {
        el.style.opacity = '1';
      }, 50);
    });

    console.log('[OpacityReveal] Revealed', elements.length, 'element(s)');
  }

  window.addEventListener('load', init);
})();
