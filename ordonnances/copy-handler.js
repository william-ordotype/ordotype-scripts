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

    // Function to copy rich text (HTML) and plain text
    // The useDecoded parameter indicates whether to decode HTML entities
    function copyAsRichText(element, useDecoded) {
      useDecoded = useDecoded || false;

      var htmlContent = element.innerHTML;
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

    // Legacy function for selecting rich text and copying it to the clipboard
    function selectRichTextToClipboard(node) {
      if (typeof node === "string") {
        node = document.querySelector(node);
      }

      if (document.body.createTextRange) {
        var range = document.body.createTextRange();
        range.moveToElementText(node);
        range.select();
        document.execCommand("copy");
        document.selection.empty();
      } else if (window.getSelection) {
        var selection = window.getSelection();
        var rangeObj = document.createRange();
        rangeObj.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(rangeObj);
        document.execCommand("copy");
        window.getSelection().removeAllRanges();
      } else {
        console.warn("[CopyHandler] Could not select text in node: Unsupported browser.");
      }
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
        // Use the legacy function to select the rich text and copy it
        selectRichTextToClipboard(subjectElement);
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
