(function() {
  'use strict';

  var css = '[data-ms-content]:empty { display: none; }';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Hide empty grid children (only if they contain no visible content)
  var grid = document.querySelector('.ab-grid');
  if (grid) {
    var children = grid.children;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.querySelector('.abonnement-wrapper')) continue;
      var text = (child.textContent || '').trim();
      if (!text) {
        child.style.display = 'none';
      }
    }
  }

  console.log('[OrdoAccount] Styles injected');
})();
