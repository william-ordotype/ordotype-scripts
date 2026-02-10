/**
 * CMS Select - Vanilla JS replacement for @finsweet/attributes-cmsselect
 * Populates <select> dropdowns from Webflow CMS collection list items.
 *
 * Uses the same data attributes as the Finsweet original:
 *   - fs-cmsselect-element="select"     → the <select> to populate
 *   - fs-cmsselect-element="text-value"  → elements whose innerText becomes <option> values
 *
 * Both must share a common parent .w-dyn-list wrapper.
 * Handles duplicates and observes dynamically added CMS items.
 */
(function() {
  'use strict';

  function populateSelects() {
    var selects = document.querySelectorAll('[fs-cmsselect-element="select"]');

    selects.forEach(function(select) {
      var wrapper = select.closest('.w-dyn-list');
      if (!wrapper) return;

      var seen = new Set();

      // Keep existing options (e.g. placeholder)
      Array.prototype.forEach.call(select.options, function(opt) {
        if (opt.value) seen.add(opt.value);
      });

      var sources = wrapper.querySelectorAll('[fs-cmsselect-element="text-value"]');
      sources.forEach(function(el) {
        var text = el.innerText.trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        var option = document.createElement('option');
        option.value = text;
        option.textContent = text;
        select.appendChild(option);
      });

      // Watch for dynamically added CMS items (load more / pagination)
      var list = wrapper.querySelector('.w-dyn-items');
      if (list) {
        var observer = new MutationObserver(function() {
          var newSources = wrapper.querySelectorAll('[fs-cmsselect-element="text-value"]');
          newSources.forEach(function(el) {
            var text = el.innerText.trim();
            if (!text || seen.has(text)) return;
            seen.add(text);
            var option = document.createElement('option');
            option.value = text;
            option.textContent = text;
            select.appendChild(option);
          });
        });
        observer.observe(list, { childList: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateSelects);
  } else {
    populateSelects();
  }
})();
