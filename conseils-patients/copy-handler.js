/**
 * Ordotype Conseils Patients - Copy Handler
 * Handles copying patient recommendation content as rich text.
 * Converts QR code grid to table for clipboard compatibility.
 */
(function() {
  'use strict';

  function init() {
    function decodeHTMLEntities(text) {
      var textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      return textarea.value;
    }

    function fallbackExecCommand(element) {
      var range = document.createRange();
      range.selectNodeContents(element);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('[CopyHandler] execCommand failed:', err);
      }
      selection.removeAllRanges();
    }

    // Convert QR code grid to a table for clipboard compatibility
    function convertQrGridToTable(clone) {
      var qrGrid = clone.querySelector('.qr-codes-fcp-collection-list');
      if (!qrGrid) return;

      var items = qrGrid.querySelectorAll('.w-dyn-item');
      if (items.length === 0) return;

      // Create table with 2 columns
      var table = document.createElement('table');
      table.setAttribute('style', 'border-collapse: collapse; width: 100%; margin-top: 8px; border: none;');

      var row;
      items.forEach(function(item, index) {
        if (index % 2 === 0) {
          row = document.createElement('tr');
          table.appendChild(row);
        }

        var cell = document.createElement('td');
        cell.setAttribute('style', 'border: none; padding: 8px; vertical-align: middle; width: 50%;');

        // Get the link element
        var link = item.querySelector('a');
        if (link) {
          var img = link.querySelector('img.qr-code');
          var titleDiv = link.querySelector('.text-weight-bold');
          var sourceDiv = link.querySelector('.text-style-italic');
          var typeDiv = link.querySelector('.text-weight-semibold:not(.text-style-italic)');

          // Create a flex container using table for compatibility
          var innerTable = document.createElement('table');
          innerTable.setAttribute('style', 'border: none; border-collapse: collapse;');

          var innerRow = document.createElement('tr');

          // QR code cell
          var imgCell = document.createElement('td');
          imgCell.setAttribute('style', 'border: none; padding: 0; vertical-align: middle; width: 60px;');
          if (img) {
            var newImg = document.createElement('img');
            newImg.src = img.src;
            newImg.setAttribute('style', 'width: 60px; height: 60px;');
            newImg.alt = img.alt || '';
            imgCell.appendChild(newImg);
          }
          innerRow.appendChild(imgCell);

          // Text cell
          var textCell = document.createElement('td');
          textCell.setAttribute('style', 'border: none; padding-left: 10px; vertical-align: middle;');

          if (titleDiv) {
            var title = document.createElement('div');
            title.setAttribute('style', 'font-weight: bold; color: black;');
            title.textContent = titleDiv.textContent;
            textCell.appendChild(title);
          }
          if (sourceDiv) {
            var source = document.createElement('div');
            source.setAttribute('style', 'font-size: 0.75rem; font-style: italic; color: black;');
            source.textContent = sourceDiv.textContent;
            textCell.appendChild(source);
          }
          if (typeDiv) {
            var type = document.createElement('div');
            type.setAttribute('style', 'font-size: 0.75rem; font-weight: bold; color: black;');
            type.textContent = typeDiv.textContent;
            textCell.appendChild(type);
          }

          innerRow.appendChild(textCell);
          innerTable.appendChild(innerRow);
          cell.appendChild(innerTable);
        }

        row.appendChild(cell);
      });

      // If odd number of items, add empty cell
      if (items.length % 2 !== 0) {
        var emptyCell = document.createElement('td');
        emptyCell.setAttribute('style', 'border: none; padding: 8px; width: 50%;');
        row.appendChild(emptyCell);
      }

      // Replace the grid with the table
      var wrapper = qrGrid.closest('.qr-code-fcp-div-block-wrapper');
      if (wrapper) {
        wrapper.innerHTML = '';
        wrapper.appendChild(table);
      }
    }

    function copyAsRichText(element, useDecoded) {
      useDecoded = useDecoded || false;

      // Clone the element
      var clone = element.cloneNode(true);

      // Remove the print banner content
      var bannerContent = clone.querySelector('#print-banner-content');
      if (bannerContent) {
        bannerContent.remove();
      }

      // Convert QR grid to table for clipboard compatibility
      convertQrGridToTable(clone);

      var htmlContent = clone.innerHTML;
      if (useDecoded) {
        htmlContent = decodeHTMLEntities(htmlContent);
      }
      var textContent = element.textContent.trim();

      if (navigator.clipboard && window.ClipboardItem) {
        var blobHTML = new Blob([htmlContent], { type: 'text/html' });
        var blobText = new Blob([textContent], { type: 'text/plain' });
        var clipboardItem = new ClipboardItem({
          'text/html': blobHTML,
          'text/plain': blobText
        });
        navigator.clipboard.write([clipboardItem]).catch(function() {
          fallbackExecCommand(element);
        });
      } else {
        fallbackExecCommand(element);
      }
    }

    function removeElements(selector) {
      document.querySelectorAll(selector).forEach(function(el) {
        el.remove();
      });
    }

    var copyButton = document.getElementById('copy-button');
    var copySection = document.getElementById('printableArea_CP');

    if (copyButton && copySection) {
      copyButton.addEventListener('click', function() {
        removeElements('.tr-wrap');
        copyAsRichText(copySection, true);
      });
      console.log('[CopyHandler] Initialized');
    } else {
      console.log('[CopyHandler] Copy button or section not found');
    }
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
