/**
 * Ordotype Mes Informations - Partnership City
 * Reads partnership-city from sessionStorage/cookie after signup.
 * Forces statut to 'Interne' and syncs airtablerecordid.
 * Only the fields that change are written, after memberstack-sync.js; nothing
 * at all when everything is already saved.
 * Only loaded when config.enablePartnershipCity is true (internes-assos page).
 *
 * Depends on: core.js, Memberstack frontend SDK ($memberstackDom)
 */
(function() {
  'use strict';

  var PREFIX = '[PartnershipCity]';
  var KEY = 'signup-partnership-city';
  var MS_KEY = 'partnership-city';
  var SYNC_WAIT_MS = 15000;

  function getCookie(key) {
    var match = document.cookie.match(new RegExp(key + '=([^;]+)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function isInterne(statut) {
    return String(statut || '').trim().toLowerCase() === 'interne';
  }

  /**
   * memberstack-sync.js (chargé avant) écrit aussi `airtablerecordid` depuis la même clé `userId`.
   * On attend qu'il ait fini, borné, et on reçoit ce qu'il a écrit : sans ça les deux scripts
   * envoyaient la même valeur, soit deux `member.updated` pour un seul changement.
   */
  function waitForSync() {
    var pending = window.OrdoMesInfos && window.OrdoMesInfos.syncDone;
    if (!pending || typeof pending.then !== 'function') return Promise.resolve({});
    return new Promise(function(resolve) {
      var timer = setTimeout(function() { resolve({}); }, SYNC_WAIT_MS);
      pending.then(function(written) {
        clearTimeout(timer);
        resolve(written || {});
      }, function() {
        clearTimeout(timer);
        resolve({});
      });
    });
  }

  async function setCityAfterSignup() {
    var attempts = 0;
    var reported = false;
    var written = await waitForSync();

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

        // Ce que le membre a maintenant : sa fiche, plus ce que memberstack-sync.js vient d'écrire.
        var current = Object.assign({}, result.data.customFields || {}, written);
        var existingCity = current[MS_KEY];
        var existingAirtableId = current.airtablerecordid;

        var cityChanged = Boolean(storageCity && existingCity !== storageCity);
        var airtableChanged = Boolean(userId && userId.trim() !== '' && existingAirtableId !== userId);

        if (cityChanged || airtableChanged || storageCity) {
          // Seuls les champs qui changent partent ; rien du tout si tout est déjà en place.
          var customFields = {};
          if (!isInterne(current.statut)) customFields.statut = 'Interne';
          if (cityChanged) customFields[MS_KEY] = storageCity;
          if (airtableChanged) customFields.airtablerecordid = userId;

          if (Object.keys(customFields).length) {
            await window.$memberstackDom.updateMember({ customFields: customFields });
          }

          // Flush storage
          try { sessionStorage.removeItem(KEY); } catch (e) {}
          document.cookie = KEY + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

          if (userId && userId.trim() !== '') {
            try { localStorage.removeItem('userId'); } catch (e) {}
          }

          console.log(PREFIX, Object.keys(customFields).length ? 'Updated from' : 'Already saved, from', source, '| city:', storageCity);
          return;
        }

        // No city in storage and none saved: report it, the field stays as it is.
        if (!storageCity && (!existingCity || existingCity.indexOf('DBG') === 0)) {
          if (!reported && window.OrdoErrorReporter) {
            reported = true;
            window.OrdoErrorReporter.report('PartnershipCity', new Error('No partnership city found after signup'));
          }
          if (!isInterne(current.statut)) {
            await window.$memberstackDom.updateMember({ customFields: { statut: 'Interne' } });
          }
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
