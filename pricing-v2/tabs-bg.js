/**
 * Ordotype Pricing - Tabs Background
 * Adds animated background to tabs with [x-ordo-utils="tabs"] attribute.
 * Depends on: jQuery
 */
(function() {
  'use strict';

  function initTabs(tabMenu) {
    console.log('[TabsBg] Initializing tabs');
    var $menu = $(tabMenu);

    $menu.append('<div class="tab-bg"></div>');

    $menu.find(".tab-bg").css({
      position: "absolute",
      bottom: "4px",
      top: "4px",
      height: "auto",
      "background-color": "#fff",
      transition: "left 0.3s ease",
      "border-radius": "4px",
      "box-shadow": "0 4px 8px 1px rgba(12,14,22,.08)",
      "pointer-events": "none"
    });

    function moveBg(tab) {
      var $tab = $(tab);
      var $container = $tab.closest(".w-tab-menu");
      var scrollLeft = $container.scrollLeft();
      var left = $tab.position().left + scrollLeft;
      var width = $tab.outerWidth();

      $container.find(".tab-bg").css({ left: left, width: width });
    }

    // Initial position
    moveBg($menu.find(".w-tab-link.w--current"));

    // Handle tab clicks
    tabMenu.addEventListener("click", function(e) {
      var $clicked = $(e.target).closest(".w-tab-link");
      if (!$clicked.length) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      var paneId = $clicked.attr("aria-controls");

      // Update tabs
      $menu.find(".w-tab-link").removeClass("w--current").attr("aria-selected", "false");
      $clicked.addClass("w--current").attr("aria-selected", "true");

      // Update panes
      var $pane = $("#" + paneId);
      $pane.siblings(".w-tab-pane").removeClass("w--tab-active").css({ display: "none", opacity: 0 });
      $pane.addClass("w--tab-active").css({ display: "block", opacity: 1 });

      moveBg($clicked[0]);
    }, true);

    // Handle resize
    $(window).resize(function() {
      moveBg($menu.find(".w-tab-link.w--current"));
    });
  }

  function init() {
    $('[x-ordo-utils="tabs"]').each(function() {
      initTabs(this);
    });
    console.log('[TabsBg] Initialized');
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
