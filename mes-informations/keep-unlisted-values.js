/**
 * Ordotype Mes Informations - Keep Unlisted Values
 * A saved value that is not in its list (an older label of the semestre) left
 * the select on its empty option, and saving the form erased it. The value is
 * added as an option for this member only and shown, as in Mon compte
 * (account/profile-overview.js). A value that only differs from an option by
 * an accent or case takes that option. A value already shown is kept.
 *
 * Loaded by mes-informations/loader.js and mes-informations-cms/loader.js.
 * Depends on: Memberstack frontend SDK ($memberstackDom)
 */
(function() {
  'use strict';

  var PREFIX = '[KeepUnlistedValues]';
  var FIELDS = ['semestre'];
  var MAX_ATTEMPTS = 50; // 50 * 200ms = 10s max wait

  function text(v) {
    return v == null ? '' : String(v).trim();
  }

  function plain(v) {
    return text(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function findOption(select, value) {
    var near = null;
    for (var i = 0; i < select.options.length; i++) {
      var option = select.options[i];
      if (option.value === value) return option;
      if (!near && plain(option.value) === plain(value)) near = option;
    }
    return near;
  }

  function keep(select, value) {
    var option = findOption(select, value);
    if (!option) {
      option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    if (!select.value) select.value = option.value;
  }

  function apply(member) {
    var customFields = (member && member.customFields) || {};
    FIELDS.forEach(function(key) {
      var value = text(customFields[key]);
      if (!value) return;
      var selects = document.querySelectorAll('select[data-ms-member="' + key + '"]');
      for (var i = 0; i < selects.length; i++) keep(selects[i], value);
    });
  }

  function init() {
    window.$memberstackDom.getCurrentMember().then(function(result) {
      var member = result && result.data ? result.data : null;
      if (!member || !member.id) return;
      apply(member);
    }).catch(function(err) {
      console.warn(PREFIX, 'Could not read the member:', err);
    });
  }

  var attempts = 0;
  function waitForMemberstack() {
    if (window.$memberstackDom) {
      init();
    } else if (attempts < MAX_ATTEMPTS) {
      attempts++;
      setTimeout(waitForMemberstack, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForMemberstack);
  } else {
    waitForMemberstack();
  }
})();
