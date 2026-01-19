/**
 * Ordotype Pathology - Sources List
 * Handles "Sources et recommandations" section with show more functionality.
 * Depends on: jQuery
 */
(function() {
  'use strict';

  function init() {
    const list = $(".collection-list.w-dyn-items");
    const items = $(".collection-item-11.w-dyn-item").sort(function(a, b) {
      return $(b).data("year") - $(a).data("year");
    });
    const seeMoreBtn = $("#see-more-button");
    const sourcesSection = $("#sources-et-recos");

    // Reorder items by year (descending)
    items.detach().hide().appendTo(list);

    // Show first 3 items
    items.slice(0, 3).show();

    // Toggle see more button
    if (items.length > 3) {
      sourcesSection.addClass("no-padding-bottom");
      seeMoreBtn.show();
    } else {
      seeMoreBtn.hide();
    }

    // Handle see more click
    seeMoreBtn.click(function() {
      items.show();
      seeMoreBtn.hide();
      sourcesSection.removeClass("no-padding-bottom");
    });

    console.log('[SourcesList] Initialized with', items.length, 'items');
  }

  $(document).ready(init);
})();
