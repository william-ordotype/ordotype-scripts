/**
 * CMS Select - Vanilla JS replacement for @finsweet/attributes-cmsselect
 * Populates <select> dropdowns from Webflow CMS collection list items.
 *
 * Attributes (same as Finsweet):
 *   - fs-list-element="list"          → on the Collection List (.w-dyn-list)
 *   - fs-list-element="select-value"  → on a text element inside each Collection Item
 *   - fs-list-element="select"        → on the <select> field to populate
 *   - fs-list-instance="NAME"         → (optional) links a specific list to a specific select
 *
 * The list and select do NOT need to share a parent wrapper.
 * After populating, the source list is hidden.
 * Handles duplicates and observes dynamically added CMS items.
 */
(function() {
  'use strict';

  function populateSelects() {
    var selects = document.querySelectorAll('[fs-list-element="select"]');
    var lists = document.querySelectorAll('[fs-list-element="list"]');

    selects.forEach(function(select) {
      var instance = select.getAttribute('fs-list-instance');
      var list = null;

      // Match by instance name, or use the first list if no instance
      if (instance) {
        list = document.querySelector('[fs-list-element="list"][fs-list-instance="' + instance + '"]');
      } else if (lists.length === 1) {
        list = lists[0];
      } else {
        // Multiple lists, no instance specified — try closest common parent
        lists.forEach(function(l) {
          if (!list) list = l;
        });
      }

      if (!list) return;

      var seen = new Set();

      // Keep existing options (e.g. placeholder)
      Array.prototype.forEach.call(select.options, function(opt) {
        if (opt.value) seen.add(opt.value);
      });

      // Extract values from CMS items
      function addOptionsFromList() {
        var sources = list.querySelectorAll('[fs-list-element="select-value"]');
        sources.forEach(function(el) {
          var text = el.innerText.trim();
          if (!text || seen.has(text)) return;
          seen.add(text);
          var option = document.createElement('option');
          option.value = text;
          option.textContent = text;
          select.appendChild(option);
        });
      }

      addOptionsFromList();

      // Hide the source list after populating
      list.style.display = 'none';

      // Watch for dynamically added CMS items (load more / pagination)
      var items = list.querySelector('.w-dyn-items');
      if (items) {
        var observer = new MutationObserver(function() {
          addOptionsFromList();
        });
        observer.observe(items, { childList: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateSelects);
  } else {
    populateSelects();
  }
})();
