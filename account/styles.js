(function() {
  'use strict';

  var css = '[data-ms-content]:empty { display: none; }';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Hide empty grid children that aren't subscription cards
  var grid = document.querySelector('.ab-grid');
  if (grid) {
    var children = grid.children;
    for (var i = 0; i < children.length; i++) {
      if (!children[i].classList.contains('abonnement-wrapper')) {
        children[i].style.display = 'none';
      }
    }
  }

  console.log('[OrdoAccount] Styles injected');
})();
