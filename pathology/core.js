/**
 * Ordotype Pathology - Core
 * Stores current URL and handles page unload behavior.
 * Vanilla DOM — must not depend on jQuery (survives jQuery CDN failure).
 */
(function() {
  'use strict';

  // Store current URL for tracking
  localStorage.setItem('locat', location.href);

  // Handle page unload - hide body and scroll to top.
  // [samepage] links suppress this for 1s instead of the old jQuery
  // off()/on() re-binding dance — same net behavior.
  var suppressUnloadHide = false;

  window.addEventListener('beforeunload', function() {
    if (suppressUnloadHide) return;
    document.body.style.display = 'none';
    window.scrollTo(0, 0);
  });

  // Disable beforeunload for same-page navigation
  document.addEventListener('click', function(ev) {
    var el = ev.target;
    if (!el || typeof el.closest !== 'function' || !el.closest('[samepage]')) return;
    suppressUnloadHide = true;
    setTimeout(function() {
      suppressUnloadHide = false;
    }, 1000);
  });

  console.log('[OrdoPathology] Core loaded');
})();
