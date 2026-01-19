/**
 * Ordotype Pricing - Hash Tabs
 * Handles URL hash-based tab selection.
 * Depends on: jQuery, Webflow
 */
(function() {
  'use strict';

  var Webflow = window.Webflow || [];

  Webflow.push(function() {
    // Ensure Webflow ix2 (interaction) is ready
    Webflow.require('ix2').init();

    var tabName = getTabName();
    if (!tabName) {
      console.log('[HashTabs] No hash found');
      return;
    }

    // Trigger click on the tab
    $('#' + tabName).click();

    // Scroll to the top of the page
    window.scrollTo(0, 0);

    console.log('[HashTabs] Activated tab:', tabName);

    function getTabName() {
      return location.hash.substring(1);
    }
  });

  window.Webflow = Webflow;
})();
