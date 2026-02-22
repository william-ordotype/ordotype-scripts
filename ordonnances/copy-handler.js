/**
 * Ordotype Ordonnances - Copy Handler
 * Handles copying prescription content as rich text.
 * Supports multiple copy methods: #copy-button, data-ordo-copy, #copy-button-fcp
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
      var hiddenEls = [];
      allEls.forEach(function(el) {
        savedStyles.push({ style: el.style.cssText, cls: el.getAttribute('class') });
        // Track hidden elements so we can ensure they stay hidden during copy
        var cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') {
          hiddenEls.push({ el: el, origDisplay: el.style.display, origVisibility: el.style.visibility });
          el.style.display = 'none';
        }
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

      // Remove hidden elements from clone before processing
      // (e.g. cms-section with display:none, .hide utility class)
      clone.querySelectorAll('*').forEach(function(el) {
        if (el.style.display === 'none' || el.style.visibility === 'hidden' ||
            el.classList.contains('hide') || el.classList.contains('w-condition-invisible')) {
          el.remove();
        }
      });

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
      var textContent = clone.textContent.trim();

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

    // Show the "Ordonnance copiée" toast
    var toastHideTimer = null;
    var toastFadeTimer = null;

    function showCopyToast() {
      var toastEl = document.querySelector('[x-ordo-utils="toast-component-common"]')
                 || document.querySelector('[x-ordo-utils*="toast-component"]');

      if (!toastEl) {
        console.warn('[CopyHandler] No toast element found');
        return;
      }

      // Cancel any pending hide/fade from a previous toast cycle
      if (toastHideTimer) { clearTimeout(toastHideTimer); toastHideTimer = null; }
      if (toastFadeTimer) { clearTimeout(toastFadeTimer); toastFadeTimer = null; }

      toastEl.classList.remove('hidden');
      toastEl.style.display = 'inline-block';
      toastEl.style.opacity = '0';
      toastEl.style.transition = 'opacity 0.2s ease, top 0.2s ease';
      toastEl.style.top = '-100px';

      requestAnimationFrame(function() {
        toastEl.style.opacity = '1';
        toastEl.style.top = '0px';
      });

      toastHideTimer = setTimeout(function() {
        toastHideTimer = null;
        toastEl.style.opacity = '0';
        toastFadeTimer = setTimeout(function() {
          toastFadeTimer = null;
          toastEl.style.display = 'none';
          toastEl.classList.add('hidden');
        }, 200);
      }, 3000);
    }

    // ----------------------------
    // Case 1: Using #copy-button & #copy-section
    // ----------------------------
    var copyButton = document.getElementById('copy-button');
    var copySection = document.getElementById('copy-section');

    if (copyButton && copySection) {
      copyButton.addEventListener('click', function(e) {
        e.preventDefault();
        removeElements('.tr-wrap');
        copyAsRichText(copySection, true);
        showCopyToast();
      });
      console.log('[CopyHandler] Case 1 initialized (#copy-button)');
    }

    // ----------------------------
    // Case 2: Using data-ordo-copy subject & trigger
    // Bind ALL trigger elements (multiple may exist for member/non-member variants)
    // ----------------------------
    var subjectElement = document.querySelector('[data-ordo-copy="subject"]');
    var triggerElements = document.querySelectorAll('[data-ordo-copy="trigger"]');

    if (subjectElement && triggerElements.length > 0) {
      // Remove any hidden/invisible elements if needed
      subjectElement.querySelectorAll('.w-condition-invisible').forEach(function(el) {
        el.remove();
      });

      triggerElements.forEach(function(trigger) {
        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          console.log('[CopyHandler] Case 2 click — copying from subject');
          removeElements('.tr-wrap');
          copyAsRichText(subjectElement, false);
          showCopyToast();
        });
      });
      console.log('[CopyHandler] Case 2 initialized (data-ordo-copy) — ' + triggerElements.length + ' trigger(s)');
    }

    // ----------------------------
    // Case 3: Using #copy-button-fcp & #printableArea
    // ----------------------------
    var copyButtonFcp = document.getElementById('copy-button-fcp');
    var printableArea = document.getElementById('printableArea')
                     || document.querySelector('[data-ordo-copy="subject"]');

    if (copyButtonFcp && printableArea) {
      copyButtonFcp.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('[CopyHandler] Case 3 click — copying from', printableArea.id || 'data-ordo-copy subject');
        removeElements('.tr-wrap');
        copyAsRichText(printableArea, true);
        showCopyToast();
      });
      console.log('[CopyHandler] Case 3 initialized (#copy-button-fcp), source:', printableArea.id || 'data-ordo-copy subject');
    } else if (copyButtonFcp) {
      console.warn('[CopyHandler] Case 3 SKIPPED — #copy-button-fcp found but no #printableArea or [data-ordo-copy="subject"]');
    }

    // Debug: log what was found/missed
    console.log('[CopyHandler] Initialized — subject:', !!subjectElement, '| triggers:', triggerElements.length, '| fcp:', !!copyButtonFcp, '| printableArea:', !!document.getElementById('printableArea'), '| toast:', !!(document.querySelector('[x-ordo-utils="toast-component-common"]') || document.querySelector('[x-ordo-utils*="toast-component"]')));
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
