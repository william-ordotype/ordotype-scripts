/**
 * Ordotype Ordonnances - Copy Handler
 * Handles copying prescription content as rich text.
 * Supports multiple copy methods: #copy-button, ms-code-copy, #copy-button-fcp
 */
(function() {
  'use strict';

  function init() {
    // Utility function to decode HTML entities
    function decodeHTMLEntities(text) {
      var textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      return textarea.value;
    }

    // Fallback method using execCommand for browsers without Clipboard API support
    function fallbackExecCommand(element) {
      // Temporarily style links so they don't paste as invisible (black on black)
      var links = element.querySelectorAll('a[href]');
      var savedStyles = [];
      links.forEach(function(link) {
        savedStyles.push(link.style.cssText);
        link.style.color = '#0563C1';
        link.style.backgroundColor = 'transparent';
        link.style.textDecoration = 'underline';
      });

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

      // Restore original styles
      links.forEach(function(link, i) {
        link.style.cssText = savedStyles[i];
      });
    }

    // Function to copy rich text (HTML) and plain text
    // The useDecoded parameter indicates whether to decode HTML entities
    function copyAsRichText(element, useDecoded) {
      useDecoded = useDecoded || false;

      // Clone element to style links without modifying the page
      var clone = element.cloneNode(true);
      clone.querySelectorAll('a[href]').forEach(function(link) {
        link.style.color = '#0563C1';
        link.style.backgroundColor = 'transparent';
        link.style.textDecoration = 'underline';
      });

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

    // Utility function to remove elements matching a given selector
    function removeElements(selector) {
      document.querySelectorAll(selector).forEach(function(el) {
        el.remove();
      });
    }

    // ----------------------------
    // Case 1: Using #copy-button & #copy-section
    // ----------------------------
    var copyButton = document.getElementById('copy-button');
    var copySection = document.getElementById('copy-section');

    if (copyButton && copySection) {
      copyButton.addEventListener('click', function() {
        removeElements('.tr-wrap');
        // Use 'true' to decode HTML entities since copy-section is encoded
        copyAsRichText(copySection, true);
      });
      console.log('[CopyHandler] Case 1 initialized (#copy-button)');
    }

    // ----------------------------
    // Case 2: Using ms-code-copy subject & trigger
    // Legacy implementation integration
    // ----------------------------
    var subjectElement = document.querySelector('[ms-code-copy="subject"]');
    var triggerElement = document.querySelector('[ms-code-copy="trigger"]');

    if (subjectElement && triggerElement) {
      // Remove any hidden/invisible elements if needed
      subjectElement.querySelectorAll('.w-condition-invisible').forEach(function(el) {
        el.remove();
      });

      triggerElement.addEventListener('click', function() {
        removeElements('.tr-wrap');
        copyAsRichText(subjectElement, false);
      });
      console.log('[CopyHandler] Case 2 initialized (ms-code-copy)');
    }

    // ----------------------------
    // Case 3: Using #copy-button-fcp & #printableArea
    // ----------------------------
    var copyButtonFcp = document.getElementById('copy-button-fcp');
    var printableArea = document.getElementById('printableArea');

    if (copyButtonFcp && printableArea) {
      copyButtonFcp.addEventListener('click', function() {
        removeElements('.tr-wrap');
        // Use 'true' to decode HTML entities if needed
        copyAsRichText(printableArea, true);
      });
      console.log('[CopyHandler] Case 3 initialized (#copy-button-fcp)');
    }

    console.log('[CopyHandler] Initialized');
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
