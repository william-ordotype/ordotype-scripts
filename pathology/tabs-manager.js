/**
 * Ordotype Pathology - Tabs Manager
 * Handles tab visibility and auto-selection based on content visibility.
 */
(function() {
  'use strict';

  function init() {
    setTimeout(function() {
      handleSpecialTab();
      handleTabGroups();
    }, 100);
  }

  function handleSpecialTab() {
    const specialTab = document.querySelector("#w-tabs-0-data-w-tab-0");

    if (specialTab && specialTab.classList.contains("w-condition-invisible")) {
      const fallbackIds = [
        "#w-tabs-0-data-w-tab-1",
        "#w-tabs-0-data-w-tab-2",
        "#w-tabs-0-data-w-tab-4"
      ];

      for (const sel of fallbackIds) {
        const tab = document.querySelector(sel);
        if (tab && !tab.classList.contains("w-condition-invisible")) {
          tab.click();
          break;
        }
      }
    }
  }

  function handleTabGroups() {
    const tabGroups = [
      {
        name: "Group 1",
        tabs: [
          { tabSelector: "#w-tabs-1-data-w-tab-0", paneSelector: "#w-tabs-1-data-w-pane-0" },
          { tabSelector: "#w-tabs-1-data-w-tab-1", paneSelector: "#w-tabs-1-data-w-pane-1" },
          { tabSelector: "#w-tabs-1-data-w-tab-2", paneSelector: "#w-tabs-1-data-w-pane-2" }
        ]
      },
      {
        name: "Group 2",
        tabs: [
          { tabSelector: "#w-tabs-2-data-w-tab-0", paneSelector: "#w-tabs-2-data-w-pane-0" },
          { tabSelector: "#w-tabs-2-data-w-tab-1", paneSelector: "#w-tabs-2-data-w-pane-1" }
        ]
      }
    ];

    const fallbackTabs = [
      { tabSelector: "#w-tabs-1-data-w-tab-3", paneSelector: "#w-tabs-1-data-w-pane-3" },
      { tabSelector: "#w-tabs-2-data-w-tab-2", paneSelector: "#w-tabs-2-data-w-pane-2" }
    ];

    let lastVisibleTabs = {};
    let anyTabClicked = false;

    tabGroups.forEach(function(group) {
      let groupClicked = false;
      let visibleTabs = [];

      group.tabs.forEach(function(config) {
        const tab = document.querySelector(config.tabSelector);
        const pane = document.querySelector(config.paneSelector);

        if (pane && tab) {
          const isConditionInvisible = tab.classList.contains("w-condition-invisible");
          const items = pane.querySelectorAll(".w-dyn-list .content-item");
          const allInvisible = items.length > 0
            ? Array.from(items).every(function(item) {
                return item.classList.contains("w-condition-invisible");
              })
            : false;

          if (!allInvisible && !isConditionInvisible) {
            visibleTabs.push(tab);
            if (!groupClicked) {
              tab.style.display = "";
              tab.click();
              groupClicked = true;
              anyTabClicked = true;
            }
          } else {
            tab.style.display = "none";
          }
        }
      });

      if (visibleTabs.length > 0) {
        lastVisibleTabs[group.name] = visibleTabs[visibleTabs.length - 1];
      }
    });

    // Try fallback tabs if none clicked
    if (!anyTabClicked) {
      fallbackTabs.some(function(config) {
        const fallbackTab = document.querySelector(config.tabSelector);
        const fallbackPane = document.querySelector(config.paneSelector);

        if (fallbackTab && fallbackPane) {
          const items = fallbackPane.querySelectorAll(".w-dyn-list .content-item");
          const allInvisible = items.length > 0
            ? Array.from(items).every(function(item) {
                return item.classList.contains("w-condition-invisible");
              })
            : false;

          if (!allInvisible) {
            fallbackTab.style.display = "";
            fallbackTab.click();
            return true;
          } else {
            fallbackTab.style.display = "none";
          }
        }
        return false;
      });
    }

    // Add is-last class for non-logged-in users
    if (!localStorage.getItem("_ms-mem")) {
      Object.values(lastVisibleTabs).forEach(function(lastTab) {
        lastTab.classList.add("is-last");
      });

      const specialTab = document.querySelector("#w-tabs-3-data-w-tab-0");
      if (specialTab) {
        specialTab.classList.add("is-last");
      }
    }

    console.log('[TabsManager] Initialized');
  }

  // Run init - DOMContentLoaded may have already fired by the time this script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
