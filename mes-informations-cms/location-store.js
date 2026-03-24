/**
 * Ordotype Mes Informations CMS - Location Store
 * Saves current page URL to localStorage for redirect after signup.
 */
(function() {
  'use strict';

  localStorage.setItem('locat', location.href);
  console.log('[LocationStore] Saved:', location.href);
})();
