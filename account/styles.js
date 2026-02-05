(function() {
  'use strict';

  var css = '[data-ms-content]:empty { display: none; }';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  console.log('[OrdoAccount] Styles injected');
})();
