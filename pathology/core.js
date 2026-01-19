/**
 * Ordotype Pathology - Core
 * Stores current URL and handles page unload behavior.
 */
(function() {
  'use strict';

  // Store current URL for tracking
  localStorage.setItem('locat', location.href);

  // Handle page unload - hide body and scroll to top
  $(window).on('beforeunload', function() {
    $('body').hide();
    $(window).scrollTop(0);
  });

  // Disable beforeunload for same-page navigation
  $(document).on('click', '[samepage]', function() {
    $(window).off('beforeunload');
    setTimeout(function() {
      $(window).on('beforeunload', function() {
        $('body').hide();
        $(window).scrollTop(0);
      });
    }, 1000);
  });

  console.log('[OrdoPathology] Core loaded');
})();
