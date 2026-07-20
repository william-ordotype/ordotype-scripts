/**
 * Ordotype Pathology - Sources List
 * Handles "Sources et recommandations" section with show more functionality.
 * Vanilla DOM — must not depend on jQuery (survives jQuery CDN failure).
 */
(function() {
  'use strict';

  // jQuery-.show()-alike: clear an inline "none"; if a stylesheet still
  // hides the element, force block.
  function show(el) {
    if (el.style.display === 'none') el.style.display = '';
    if (window.getComputedStyle(el).display === 'none') el.style.display = 'block';
  }

  function init() {
    const list = document.querySelector('.collection-list.w-dyn-items');
    const items = Array.prototype.slice
      .call(document.querySelectorAll('.collection-item-11.w-dyn-item'))
      .sort(function(a, b) {
        return Number(b.getAttribute('data-year')) - Number(a.getAttribute('data-year'));
      });
    const seeMoreBtn = document.getElementById('see-more-button');
    const sourcesSection = document.getElementById('sources-et-recos');

    // Reorder items by year (descending) — appendChild moves the node,
    // so appending in sorted order reorders the list in place.
    items.forEach(function(el) {
      el.style.display = 'none';
      if (list) list.appendChild(el);
    });

    // Show first 3 items
    items.slice(0, 3).forEach(show);

    // Toggle see more button
    if (items.length > 3) {
      if (sourcesSection) sourcesSection.classList.add('no-padding-bottom');
      if (seeMoreBtn) show(seeMoreBtn);
    } else {
      if (seeMoreBtn) seeMoreBtn.style.display = 'none';
    }

    // Handle see more click
    if (seeMoreBtn) {
      seeMoreBtn.addEventListener('click', function() {
        items.forEach(show);
        seeMoreBtn.style.display = 'none';
        if (sourcesSection) sourcesSection.classList.remove('no-padding-bottom');
      });
    }

    console.log('[SourcesList] Initialized with', items.length, 'items');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
