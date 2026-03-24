/**
 * Ordotype Conseils Patients - QR Code Aggregator
 * Collects all .qr-code-block elements from #printableArea_CP content
 * and rebuilds the bottom .collection-list-wrapper-34 wrapper.
 */
(function() {
  'use strict';

  function init() {
    var printableArea = document.getElementById('printableArea_CP');
    var wrapper = document.querySelector('.qr-code-fcp-div-block-wrapper');

    if (!printableArea || !wrapper) {
      console.warn('[QRCodeAggregator] Missing #printableArea_CP or .qr-code-fcp-div-block-wrapper');
      return;
    }

    // Collect all .qr-code-block from the content area (exclude the bottom wrapper itself)
    var contentBlocks = printableArea.querySelectorAll('.w-dyn-item > .w-dyn-list .qr-code-block');
    if (!contentBlocks.length) {
      console.log('[QRCodeAggregator] No QR code blocks found in content');
      return;
    }

    // Build exclusion set from hidden CMS slugs in the wrapper
    var excludeSlugs = {};
    wrapper.querySelectorAll('.qr-exclude-item').forEach(function(item) {
      var slug = item.getAttribute('data-slug');
      if (slug) excludeSlugs[slug] = true;
    });
    var excludeCount = Object.keys(excludeSlugs).length;
    if (excludeCount) {
      console.log('[QRCodeAggregator] Excluding', excludeCount, 'slug(s):', Object.keys(excludeSlugs).join(', '));
    }

    // Deduplicate by href and filter out excluded slugs
    var seen = {};
    var uniqueBlocks = [];
    contentBlocks.forEach(function(block) {
      var href = block.getAttribute('href');
      if (!href || seen[href]) return;
      // Check if the block's slug is in the exclusion set
      var blockSlug = block.getAttribute('data-slug');
      var excluded = blockSlug && excludeSlugs[blockSlug];
      if (!excluded) {
        seen[href] = true;
        uniqueBlocks.push(block);
      }
    });

    // Create a new list container
    var list = document.createElement('div');
    list.setAttribute('role', 'list');
    list.className = 'collection-list-13 w-dyn-items';

    // Clone each unique QR code block into the list
    uniqueBlocks.forEach(function(block) {
      var listItem = document.createElement('div');
      listItem.setAttribute('role', 'listitem');
      listItem.className = 'w-dyn-item';
      listItem.appendChild(block.cloneNode(true));
      list.appendChild(listItem);
    });

    // Hide inline QR code lists in the content area
    printableArea.querySelectorAll('.w-dyn-item > .w-dyn-list').forEach(function(inlineList) {
      if (inlineList.querySelector('.qr-code-block')) {
        inlineList.style.display = 'none';
      }
    });

    // Clear the wrapper and inject the aggregated list
    wrapper.innerHTML = '';
    wrapper.appendChild(list);

    console.log('[QRCodeAggregator] Aggregated', uniqueBlocks.length, 'QR code(s) into .qr-code-fcp-div-block-wrapper');
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
