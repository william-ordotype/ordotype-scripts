/**
 * Ordotype Mes Informations - Partnership City
 * Reads partnership-city from sessionStorage/cookie after signup.
 * Forces statut to 'Interne' and syncs airtablerecordid.
 * Only loaded when config.enablePartnershipCity is true (internes-assos page).
 *
 * Depends on: core.js, Memberstack frontend SDK ($memberstackDom)
 */
(function() {
  'use strict';

  var PREFIX = '[PartnershipCity]';
  var KEY = 'signup-partnership-city';
  var MS_KEY = 'partnership-city';

  function getCookie(key) {
    var match = document.cookie.match(new RegExp(key + '=([^;]+)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function setCityAfterSignup() {
    var attempts = 0;

    while (attempts < 10) {
      try {
        if (!window.$memberstackDom) {
          await new Promise(function(r) { setTimeout(r, 500); });
          attempts++;
          continue;
        }

        var result = await window.$memberstackDom.getCurrentMember();
        if (!result || !result.data) {
          await new Promise(function(r) { setTimeout(r, 500); });
          attempts++;
          continue;
        }

        // Get city from storage
        var storageCity = null;
        var source = null;

        try {
          storageCity = sessionStorage.getItem(KEY);
          if (storageCity) source = 'sessionStorage';
        } catch (err) {
          console.error(PREFIX, 'SessionStorage read error:', err);
        }

        if (!storageCity) {
          storageCity = getCookie(KEY);
          if (storageCity) source = 'cookie';
        }

        var userId = null;
        try { userId = localStorage.getItem('userId'); } catch (e) {}

        var existingCity = result.data.customFields
          ? result.data.customFields[MS_KEY]
          : null;
        var existingAirtableId = result.data.customFields
          ? result.data.customFields.airtablerecordid
          : null;

        // Prepare custom fields
        var customFields = { statut: 'Interne' };
        var needsUpdate = false;

        if (storageCity && existingCity !== storageCity) {
          customFields[MS_KEY] = storageCity;
          needsUpdate = true;
        }

        if (userId && userId.trim() !== '' && existingAirtableId !== userId) {
          customFields.airtablerecordid = userId;
          needsUpdate = true;
        }

        if (needsUpdate || storageCity) {
          await window.$memberstackDom.updateMember({ customFields: customFields });

          // Flush storage
          try { sessionStorage.removeItem(KEY); } catch (e) {}
          document.cookie = KEY + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

          if (userId && userId.trim() !== '') {
            try { localStorage.removeItem('userId'); } catch (e) {}
          }

          console.log(PREFIX, 'Updated from', source, '| city:', storageCity);
          return;
        }

        // No city in storage - debug value if no existing city
        if (!storageCity && (!existingCity || existingCity.indexOf('DBG') === 0)) {
          await window.$memberstackDom.updateMember({
            customFields: {
              'partnership-city': 'DBG__READ_MISS_ALL_' + new Date().toISOString(),
              statut: 'Interne'
            }
          });
        }

        // Flush userId if present but not needed
        if (userId) {
          try { localStorage.removeItem('userId'); } catch (e) {}
        }

        return;

      } catch (err) {
        console.error(PREFIX, 'Attempt', attempts + 1, 'failed:', err);
        attempts++;
        await new Promise(function(r) { setTimeout(r, 1000); });
      }
    }

    console.error(PREFIX, 'Failed after 10 attempts');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setCityAfterSignup);
  } else {
    setCityAfterSignup();
  }
})();
