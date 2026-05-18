/**
 * Ordotype Conseils Patients - Print Handler
 * Handles printing of patient recommendation content with banner.
 * Supports French and Arabic versions.
 */
(function() {
  'use strict';

  function init() {
    console.log("[PrintHandler] Adding event listeners...");

    var printButtonFr = document.getElementById("print-button-fr");
    var printButtonFr2 = document.getElementById("print-button-fr2");
    var printButtonAr = document.getElementById("print-button-ar");

    if (printButtonFr) {
      console.log("[PrintHandler] Found printButtonFr");
      printButtonFr.addEventListener("click", function() {
        printContent("printableArea_CP");
      });
    }

    if (printButtonFr2) {
      console.log("[PrintHandler] Found printButtonFr2");
      printButtonFr2.addEventListener("click", function() {
        printContent("printableArea_CP");
      });
    }

    if (printButtonAr) {
      console.log("[PrintHandler] Found printButtonAr");
      printButtonAr.addEventListener("click", function() {
        printContent("printableArea_CP_AR");
      });
    }

    console.log('[PrintHandler] Initialized');
  }

  function printContent(printableAreaId) {
    console.log("[PrintHandler] printContent called with ID:", printableAreaId);

    // Find the main printable area
    var printableArea = document.getElementById(printableAreaId);
    if (!printableArea) {
      console.error("[PrintHandler] No element found with ID:", printableAreaId);
      return;
    }

    // Clone that area
    var clone = printableArea.cloneNode(true);

    // Remove hidden elements from the clone
    removeHiddenElements(printableArea, clone);

    // Grab the banner text from the hidden element
    var bannerContentEl = document.getElementById("print-banner-content");
    var bannerText = bannerContentEl ? bannerContentEl.innerHTML : "";

    // Open a new window for printing
    var printWindow = window.open("", "", "height=400,width=800");
    if (!printWindow) {
      console.error("[PrintHandler] Print window failed to open. Popup blocker?");
      return;
    }

    // Build the print window's HTML
    printWindow.document.write("<html><head>");
    printWindow.document.write("<style>");

    // Hide the banner by default outside print
    printWindow.document.write("#print-banner-content { display: none; }");

    // Print-specific rules
    printWindow.document.write("@media print {");
    printWindow.document.write("  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }");

    // Banner styling
    printWindow.document.write("  #print-banner-content.contentwrapper {");
    printWindow.document.write("    display: block !important;");
    printWindow.document.write("    padding: 16px !important;");
    printWindow.document.write("    margin-bottom: 12px !important;");
    printWindow.document.write("    page-break-inside: avoid !important;");
    printWindow.document.write("  }");

    // Table rules
    printWindow.document.write("  table { border-collapse: collapse; width: 100%; page-break-inside: avoid; }");
    printWindow.document.write("  td, th { border: 1px solid black !important; padding: 8px; background-color: #ffffff !important; color: #000000 !important; }");
    printWindow.document.write("  td *, th * { color: #000000 !important; }");

    // Other styling
    printWindow.document.write("  .titlewrapper { display: flex !important; align-items: center !important; gap: 8px !important; }");
    printWindow.document.write("  .heading-style-h5.text-weight-semibold { margin-left: 10px !important; font-weight: bold !important; font-size:16pt; }");
    printWindow.document.write("  .text-weight-bold, .text-size-tiny.text-weight-semibold { font-weight: bold !important;}");
    printWindow.document.write("  .text-size-tiny { font-size: .75rem !important;}");
    printWindow.document.write("  .text-size-tiny.text-style-italic { font-style: italic !important;}");
    printWindow.document.write("  .qr-code-info-wrapper { margin-left: 10px !important;}");
    printWindow.document.write("  .flex_horizontal.link-no-underscore.border-base-200 { display: flex !important; align-items: center !important; border-radius: 4px !important; border: 1px solid rgba(12,14,22,0.3) !important; text-decoration: none !important; padding: 8px !important; color:black; }");
    printWindow.document.write("  .qr-codes-fcp-collection-list.w-dyn-items { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; justify-items: start !important; align-items: stretch !important; gap: 8px !important; margin-top: 8px !important; }");
    printWindow.document.write("  .max-width-full { width: 100% !important; }");
    printWindow.document.write("  .contentwrapper {");
    printWindow.document.write("    page-break-inside: avoid !important;");
    printWindow.document.write("    break-inside: avoid !important;");
    printWindow.document.write("    padding: 16px !important;");
    printWindow.document.write("    margin-bottom: 12px !important;");
    printWindow.document.write("  }");
    printWindow.document.write("  .qr-code { width: 60px !important; height: 60px !important; }");
    printWindow.document.write("}");

    printWindow.document.write("</style>");
    printWindow.document.write("</head><body>");

    // Insert the banner content
    printWindow.document.write('<div id="print-banner-content" class="contentwrapper">');
    printWindow.document.write(bannerText);
    printWindow.document.write("</div>");
    printWindow.document.write("<hr>");

    // Insert the cloned main content
    var arabicClass = printableAreaId === "printableArea_CP_AR" ? "rich-text-ar" : "";
    printWindow.document.write('<div class="' + arabicClass + '">');
    printWindow.document.write(clone.innerHTML);
    printWindow.document.write("</div>");

    // Inject a script to call print when the window is fully loaded
    printWindow.document.write("<script>");
    printWindow.document.write("window.onload = function() {");
    printWindow.document.write("  window.focus();");
    printWindow.document.write("  setTimeout(function() { window.print(); }, 500);");
    printWindow.document.write("};");
    printWindow.document.write("<\/script>");

    printWindow.document.write("</body></html>");
    printWindow.document.close();
  }

  function removeHiddenElements(original, clone) {
    var origChildren = Array.from(original.children);
    var cloneChildren = Array.from(clone.children);

    for (var i = 0; i < origChildren.length; i++) {
      var origChild = origChildren[i];
      var cloneChild = cloneChildren[i];
      var style = window.getComputedStyle(origChild);

      if (
        origChild.hidden ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        origChild.classList.contains("w-condition-invisible")
      ) {
        clone.removeChild(cloneChild);
      } else {
        removeHiddenElements(origChild, cloneChild);
      }
    }
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
