/**
 * Ordotype Mes Informations - Memberstack Sync
 * Reads localStorage keys and pushes them to Memberstack custom fields.
 * Optionally forces a statut value (e.g. 'Medecin', 'Interne').
 * Cleans up localStorage after successful sync.
 *
 * Depends on: core.js, Memberstack frontend SDK ($memberstackDom)
 */
(function() {
  'use strict';

  var PREFIX = '[MemberstackSync]';
  var MAX_ATTEMPTS = 50; // 50 * 200ms = 10s max wait

  var config = window.OrdoMesInfos && window.OrdoMesInfos.config;
  if (!config) return;

  // Skip if nothing to do
  if (!config.syncFields.length && !config.forceStatut) {
    console.log(PREFIX, 'No fields to sync and no statut to force, skipping');
    return;
  }

  // _ms-mem can be empty while ms_member_id is still set (mid-auth, or session lost
  // on the post-checkout return) — use it to identify the member in logs.
  function getMemberIdHint() {
    try { return localStorage.getItem('ms_member_id') || 'unknown'; } catch (e) { return 'unknown'; }
  }

  function init() {
    var memberstack = window.$memberstackDom;
    if (!memberstack) {
      console.warn(PREFIX, 'Memberstack SDK not available');
      return;
    }

    memberstack.getCurrentMember().then(function(result) {
      var member = result && result.data ? result.data : result;

      // No authenticated member. getCurrentMember() resolves with { data: null }
      // when logged out, so we land here with no session — common on the
      // post-checkout return, especially iOS Safari (ITP wipes the session across
      // the Stripe round-trip). updateMember() would 401, and on this page
      // forceStatut means we'd otherwise fire on every logged-out load. Skip
      // quietly: the plan grant happens server-side via the Stripe webhook,
      // independently of this client-side custom-field sync.
      if (!member || !member.id) {
        console.warn(PREFIX, 'No authenticated member — skipping sync (session not available). member hint:', getMemberIdHint());
        return;
      }

      var customFields = {};
      var keysToRemove = [];

      // Collect localStorage values from syncFields config
      config.syncFields.forEach(function(field) {
        var value = null;
        try { value = localStorage.getItem(field.key); } catch (e) {}

        if (value && value.trim() !== '') {
          customFields[field.msField] = value;
          keysToRemove.push(field.key);
        }
      });

      // Force statut if configured and different from current
      if (config.forceStatut) {
        var currentStatut = member && member.customFields
          ? member.customFields.statut
          : null;

        if (currentStatut !== config.forceStatut) {
          customFields.statut = config.forceStatut;
        }
      }

      // Nothing to update
      if (Object.keys(customFields).length === 0) {
        // Still clean up userId if present but not needed
        config.syncFields.forEach(function(field) {
          try {
            var val = localStorage.getItem(field.key);
            if (val) localStorage.removeItem(field.key);
          } catch (e) {}
        });
        console.log(PREFIX, 'No updates needed');
        return;
      }

      // Push to Memberstack
      memberstack.updateMember({ customFields: customFields })
        .then(function() {
          // Clear localStorage keys that were synced
          keysToRemove.forEach(function(key) {
            try { localStorage.removeItem(key); } catch (e) {}
          });

          // Update statusField in DOM if statut was forced
          if (customFields.statut) {
            var statusField = document.getElementById('statusField');
            if (statusField) {
              statusField.value = customFields.statut;
            }
          }

          console.log(PREFIX, 'Synced', Object.keys(customFields).length, 'field(s)');
        })
        .catch(function(err) {
          var detail = err;
          try { detail = JSON.stringify(err); } catch (e) {}

          // "Unauthorized" = the Memberstack session/token expired or is invalid
          // (the member was cached by getCurrentMember() but the access token is
          // stale — again typical of the post-checkout return on iOS Safari). This
          // is an expected session edge case, not an actionable code error, so log
          // it but don't ping Discord.
          var msg = (err && err.message) ? String(err.message) : String(err);
          if (/unauthor/i.test(msg) || /unauthor/i.test(detail || '')) {
            console.warn(PREFIX, 'Sync skipped — Memberstack session expired (Unauthorized). member hint:', getMemberIdHint(), 'Fields:', Object.keys(customFields));
            return;
          }

          console.error(PREFIX, 'Sync error:', detail, 'Fields attempted:', Object.keys(customFields));
          if (window.OrdoErrorReporter) {
            window.OrdoErrorReporter.report('MemberstackSync', detail);
          }
        });
    }).catch(function(err) {
      console.error(PREFIX, 'Failed to get current member:', err);
    });
  }

  // Wait for Memberstack SDK
  var attempts = 0;
  function waitForMemberstack() {
    if (window.$memberstackDom) {
      init();
    } else if (attempts < MAX_ATTEMPTS) {
      attempts++;
      setTimeout(waitForMemberstack, 200);
    } else {
      console.warn(PREFIX, 'Memberstack SDK not available after', MAX_ATTEMPTS, 'attempts');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForMemberstack);
  } else {
    waitForMemberstack();
  }
})();
