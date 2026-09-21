/**
 * Ordotype Pricing - Belgium Redirect
 * Redirects Belgian users to /nos-offres-belgique based on ms_groups.
 */
(function() {
  'use strict';

  function isBelgiumGroupActivated() {
    var msGroups = localStorage.getItem('ms_groups');

    if (!msGroups) {
      return false;
    }

    var groups;
    try {
      groups = JSON.parse(msGroups);
    } catch (error) {
      console.error('[BelgiumRedirect] Failed to parse ms_groups:', error);
      return false;
    }

    var belgiumGroup = groups.find(function(group) {
      return group.key === 'belgium';
    });

    if (!belgiumGroup) {
      return false;
    }

    return belgiumGroup.activeMemberHasAccess;
  }

  // The browser keeps showing this page until the next one arrives. Hide it
  // meanwhile, and show it again if the navigation never happens or the page
  // is restored from the back/forward cache.
  function hideWhileLeaving() {
    var root = document.documentElement;
    root.style.setProperty('opacity', '0', 'important');
    function show() {
      root.style.removeProperty('opacity');
    }
    setTimeout(show, 5000);
    window.addEventListener('pageshow', function(event) {
      if (event.persisted) show();
    });
  }

  if (isBelgiumGroupActivated()) {
    console.log('[BelgiumRedirect] Redirecting to /nos-offres-belgique');
    hideWhileLeaving();
    window.location.href = '/nos-offres-belgique';
  } else {
    console.log('[BelgiumRedirect] No redirection needed');
  }
})();
