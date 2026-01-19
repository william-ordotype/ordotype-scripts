/**
 * Ordotype Pathology - Clipboard
 * Handles prescription copy functionality with ClipboardJS.
 * Depends on: ClipboardJS (external), Alpine.js (for toaster)
 */
(function() {
  'use strict';

  function init() {
    if (typeof ClipboardJS === 'undefined') {
      console.warn('[Clipboard] ClipboardJS not loaded');
      return;
    }

    const clipboard = new ClipboardJS('#copy-drawer');

    clipboard.on('success', function(e) {
      console.info('[Clipboard] Copied:', e.text.substring(0, 50) + '...');
      if (window.Alpine && Alpine.store('toasterStore')) {
        Alpine.store('toasterStore').toasterMsg('Ordonnance copiée', 'success');
      }
      e.clearSelection();
    });

    clipboard.on('error', function(e) {
      console.error('[Clipboard] Copy failed');
      if (window.Alpine && Alpine.store('toasterStore')) {
        Alpine.store('toasterStore').toasterMsg('Echec de copie', 'error');
      }
    });

    console.log('[Clipboard] Initialized');
  }

  window.addEventListener('DOMContentLoaded', init);
})();
