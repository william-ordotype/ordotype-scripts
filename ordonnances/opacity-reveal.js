/**
 * Ordotype Ordonnances - Opacity Reveal
 * Reveals hidden elements by setting opacity to 1.
 */
(function() {
  'use strict';

  function init() {
    var selectors = [
      '.ordo-for-members',
      '.reco-rich-text',
      '.qr-codes-wrapper'
    ];

    var elements = document.querySelectorAll(selectors.join(', '));

    elements.forEach(function(el) {
      setTimeout(function() {
        el.style.opacity = '1';
      }, 50);
    });

    console.log('[OpacityReveal] Revealed', elements.length, 'element(s)');
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
