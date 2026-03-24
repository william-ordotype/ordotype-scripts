/**
 * Ordotype Mes Informations CMS - Memberstack Sync
 * Syncs localStorage signup fields to Memberstack custom fields on page load.
 */
(function() {
  'use strict';

  var fields = [
    { key: 'signup-comment',          msField: 'comment' },
    { key: 'signup-type-de-compte',   msField: 'type-de-compte' },
    { key: 'signup-partnership-city', msField: 'partnership-city' },
    { key: 'signup-duree-offre',      msField: 'duree-de-loffre' }
  ];

  async function sync() {
    try {
      var customFields = {};

      fields.forEach(function(f) {
        var value = localStorage.getItem(f.key);
        if (value && value.trim() !== '') {
          customFields[f.msField] = value;
        }
      });

      if (Object.keys(customFields).length === 0) return;

      await window.$memberstackDom.updateMember({ customFields: customFields });

      fields.forEach(function(f) {
        if (customFields[f.msField]) {
          localStorage.removeItem(f.key);
        }
      });

      console.log('[MemberstackSync] Synced fields:', Object.keys(customFields).join(', '));
    } catch (err) {
      // Silently ignored (matches original behavior)
    }
  }

  sync();
})();
