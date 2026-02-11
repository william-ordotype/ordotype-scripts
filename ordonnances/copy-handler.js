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
      // Save original state of ALL elements (execCommand copies computed styles)
      var allEls = element.querySelectorAll('*');
      var savedStyles = [];
      allEls.forEach(function(el) {
        savedStyles.push({ style: el.style.cssText, cls: el.getAttribute('class') });
        el.style.backgroundColor = 'transparent';
        el.style.background = 'transparent';
      });

      // Strip links specifically
      var links = element.querySelectorAll('a[href]');
      var savedHrefs = [];
      links.forEach(function(link) {
        savedHrefs.push(link.getAttribute('href'));
        link.removeAttribute('href');
        link.style.color = '#000000';
        link.style.fontWeight = 'bold';
        link.style.textDecoration = 'none';
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

      // Restore everything
      allEls.forEach(function(el, i) {
        el.style.cssText = savedStyles[i].style;
        if (savedStyles[i].cls) {
          el.setAttribute('class', savedStyles[i].cls);
        }
      });
      links.forEach(function(link, i) {
        link.setAttribute('href', savedHrefs[i]);
      });
    }

    // Function to copy rich text (HTML) and plain text
    // The useDecoded parameter indicates whether to decode HTML entities
    function copyAsRichText(element, useDecoded) {
      useDecoded = useDecoded || false;

      // Clone element and replace links with bold black text (no URLs in clipboard)
      var clone = element.cloneNode(true);
      clone.querySelectorAll('a[href]').forEach(function(link) {
        var span = document.createElement('span');
        span.innerHTML = link.innerHTML;
        span.style.color = '#000000';
        span.style.backgroundColor = 'transparent';
        span.style.fontWeight = 'bold';
        span.style.textDecoration = 'none';
        link.parentNode.replaceChild(span, link);
      });

      // Strip Webflow classes and dark backgrounds from ALL elements
      // Medical software doesn't have Webflow CSS, but some apps render
      // class-based styles from clipboard HTML unpredictably
      clone.querySelectorAll('*').forEach(function(el) {
        el.removeAttribute('class');
        el.style.backgroundColor = '';
        el.style.background = '';
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
