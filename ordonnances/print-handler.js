/**
 * Ordotype Ordonnances - Print Handler
 * Handles printing of prescription content.
 */
(function() {
  'use strict';

  function init() {
    var printButton = document.getElementById("print-button-cp");

    if (!printButton) {
      console.log('[PrintHandler] Print button not found');
      return;
    }

    printButton.addEventListener("click", function() {
      printContent("printableArea");
    });

    console.log('[PrintHandler] Initialized');
  }

  function printContent(printableAreaId) {
    var printableArea = document.getElementById(printableAreaId);

    if (!printableArea) {
      console.warn('[PrintHandler] Printable area not found');
      return;
    }

    var printWindow = window.open("", "", "height=400,width=800");
    printWindow.document.write("</head><body>");
    printWindow.document.write(printableArea.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.print();
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
