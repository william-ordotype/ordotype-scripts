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

  if (isBelgiumGroupActivated()) {
    console.log('[BelgiumRedirect] Redirecting to /nos-offres-belgique');
    window.location.href = '/nos-offres-belgique';
  } else {
    console.log('[BelgiumRedirect] No redirection needed');
  }
})();
