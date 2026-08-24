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
      var headerHeight = $('.padding-global').height() || 0;
      // getElementById treats the id as data: a quote in a hand-authored
      // #refer anchor would make a jQuery attribute selector throw, and the
      // id index is O(1) on the longest pages of the site
      var el = document.getElementById(anchorRef.slice(1));

      if (el) {
        var yHeight = $(el).offset().top - headerHeight - 56;
        $('html, body').animate({ scrollTop: yHeight }, 500, 'swing');
      }
    }

    // Handle clicks for links starting with "#refer"
    $("body").on("click", "a[href^='#refer']", function(e) {
      e.preventDefault();
      // $(this) is the matched <a>; e.target can be a child node without an
      // href (Sentry ORDOTYPE-FRONTEND-1DZ: undefined.replace on click)
      scrollToAnchor($(this).attr('href'));
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
