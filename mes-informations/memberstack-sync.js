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

  // These fields describe the member, not the offer: they only fill an empty value,
  // and only for an account created recently. Anything else keeps what the member chose.
  // Fields listed in config.fillOnlyFields always follow this rule; FILL_ONLY_FIELDS
  // applies it to entries of config.syncFields.
  var FILL_ONLY_FIELDS = ['mode-dexercice'];

  // Statuts qu'un statut imposé peut remplacer. Absent de la table : il remplace tout.
  var REPLACEABLE_STATUTS = {
    'Interne': ['', 'Résident'],
    'Paramédical': ['', 'IDE']
  };

  function canReplaceStatut(current, forced) {
    var allowed = REPLACEABLE_STATUTS[forced];
    if (!allowed) return true;
    return allowed.indexOf(String(current == null ? '' : current).trim()) !== -1;
  }
  var FILL_ONLY_MAX_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
  var FILL_FORM_TIMEOUT_MS = 10000;

  function isFillOnly(msField) {
    return FILL_ONLY_FIELDS.indexOf(msField) !== -1;
  }

  function canFill(member, msField) {
    var current = member.customFields ? member.customFields[msField] : null;
    if (current && String(current).trim() !== '') return false;
    var createdAt = Date.parse(member.createdAt);
    return !isNaN(createdAt) && Date.now() - createdAt < FILL_ONLY_MAX_ACCOUNT_AGE_MS;
  }

  // Values stored by an older inscription loader can still be HTML-escaped (l&#39;Abbé):
  // write the real text, never the escaped form.
  function decodeEntities(value) {
    if (typeof value !== 'string' || value.indexOf('&') === -1) return value;
    var textarea = document.createElement('textarea');
    var current = value;
    for (var i = 0; i < 3; i++) {
      textarea.innerHTML = current;
      if (textarea.value === current) break;
      current = textarea.value;
    }
    return current;
  }

  function hasOption(select, value) {
    return Array.prototype.some.call(select.options, function(option) {
      return option.value === value;
    });
  }

  // The form was pre-filled from the member before the update landed, and some selects only
  // receive their options later: wait for the option, then show the value so that saving the
  // form does not send the old empty one back. A value the member already picked is kept.
  function fillFormField(msField, value) {
    var input = document.querySelector('[data-ms-member="' + msField + '"]');
    if (!input) return;

    function apply() {
      if (input.value) return true;
      if (input.tagName === 'SELECT' && !hasOption(input, value)) return false;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (apply()) return;
    var observer = new MutationObserver(function() {
      if (apply()) observer.disconnect();
    });
    observer.observe(input, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); }, FILL_FORM_TIMEOUT_MS);
  }

  var config = window.OrdoMesInfos && window.OrdoMesInfos.config;
  if (!config) return;

  var fields = config.syncFields.map(function(field) {
    return { key: field.key, msField: field.msField, fillOnly: isFillOnly(field.msField) };
  }).concat((config.fillOnlyFields || []).map(function(field) {
    return { key: field.key, msField: field.msField, fillOnly: true };
  }));

  // Skip if nothing to do
  if (!fields.length && !config.forceStatut) {
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
      var filledFields = [];

      // Collect localStorage values from syncFields and fillOnlyFields config
      fields.forEach(function(field) {
        var value = null;
        try { value = decodeEntities(localStorage.getItem(field.key)); } catch (e) {}

        if (value && value.trim() !== '') {
          if (field.fillOnly && !canFill(member, field.msField)) {
            try { localStorage.removeItem(field.key); } catch (e) {}
            return;
          }
          customFields[field.msField] = value;
          keysToRemove.push(field.key);
          if (field.fillOnly) filledFields.push(field.msField);
        }
      });

      // Force statut if configured, different from current, and allowed to replace it
      if (config.forceStatut) {
        var currentStatut = member && member.customFields
          ? member.customFields.statut
          : null;

        if (currentStatut !== config.forceStatut && canReplaceStatut(currentStatut, config.forceStatut)) {
          customFields.statut = config.forceStatut;
        }
      }

      // Nothing to update
      if (Object.keys(customFields).length === 0) {
        // Still clean up userId if present but not needed
        fields.forEach(function(field) {
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

          filledFields.forEach(function(msField) {
            fillFormField(msField, customFields[msField]);
          });

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
