/**
 * Ordotype Pathology - Scroll Anchor
 * Handles smooth scrolling to anchors and tab navigation.
 * Depends on: jQuery, Webflow
 */
(function() {
  'use strict';

  var Webflow = window.Webflow || [];

  Webflow.push(function() {
    function scrollToAnchor(anchorRef) {
      var headerHeight = $('.padding-global').height();
      var ref = $("[id='" + anchorRef.replace('#', '') + "']");

      if (ref.length) {
        var yHeight = ref.offset().top - headerHeight - 56;
        $('html, body').animate({ scrollTop: yHeight }, 500, 'swing');
      }
    }

    // Handle clicks for links starting with "#refer"
    $("body").on("click", "a[href^='#refer']", function(e) {
      e.preventDefault();
      var target = $(e.target).attr('href');
      scrollToAnchor(target);
      return false;
    });

    // Handle Webflow tab clicks to scroll to #tab-anchor
    $('.pat_tabs-link.w-inline-block.w-tab-link').on('click', function() {
      setTimeout(function() {
        scrollToAnchor('#tab-anchor');
      }, 200);
    });

    console.log('[ScrollAnchor] Initialized');
  });

  window.Webflow = Webflow;
})();
