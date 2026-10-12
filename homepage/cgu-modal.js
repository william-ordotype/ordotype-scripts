/**
 * Ordotype Homepage - CGU Modal
 * Handles CGU acceptance modal with 90-day expiration.
 * Never shown without its #cgu-accepted button (reported instead).
 * Depends on: Memberstack ($memberstackDom)
 *
 * Is anyone stuck behind it?
 *   GA4 (consented visitors): cgu_modal_view, cgu_modal_accept, and
 *   cgu_modal_leave = page left after 3 s+ with the modal still open.
 *   Sentry + Discord (everyone): button missing, or entirely covered 3 s
 *   after the modal opened.
 */
(function() {
  'use strict';

  function init() {
    var memberstack = window.$memberstackDom;
    var modalEls = document.querySelectorAll('[ms-code-element-temporary]');
    var acceptBtn = document.querySelector('#cgu-accepted');

    // 90-day cutoff
    var cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    // localStorage accessors THROW on locked-down browsers ('Block all
    // cookies', storage disabled by policy) - the population this file
    // targets. Reads fall back to null (no stored acceptance -> the modal
    // is shown, so the CGU still get presented); writes are best-effort.
    function storageGet(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function storageSet(key, value) {
      try { localStorage.setItem(key, value); } catch (e) {}
    }

    // La mesure ne doit jamais casser la page. L'implémentation vit dans
    // shared/error-reporter.js ; ce repli couvre le cas où il n'est pas chargé.
    function track(eventName) {
      try {
        if (window.OrdoErrorReporter && window.OrdoErrorReporter.track) {
          window.OrdoErrorReporter.track({ event: eventName });
          return;
        }
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: eventName });
      } catch (err) {
        console.error('[CGUModal] tracking failed:', err);
        try {
          if (window.OrdoErrorReporter && window.OrdoErrorReporter.reportSideEffect) {
            window.OrdoErrorReporter.reportSideEffect('CGUModalEvents', err);
          }
        } catch (ignored) {}
      }
    }

    function report(message) {
      console.error('[CGUModal] ' + message);
      var reporter = window.OrdoErrorReporter;
      if (reporter && typeof reporter.report === 'function') {
        reporter.report('CGUModal', new Error(message));
      }
    }

    // Simple check if user is connected
    function isUserConnected() {
      return storageGet('_ms-mem') !== null;
    }

    // On load: check localStorage, fallback to member.json['cgu-accepted-date']
    function checkCGUAcceptedDate() {
      var acceptedDate = storageGet('cgu-accepted-date');

      if (!acceptedDate) {
        var memString = storageGet('_ms-mem');
        if (memString) {
          try {
            var member = JSON.parse(memString);
            // No ES2020 syntax (?. / ??) in this file: it must parse on old
            // hospital browsers (Chrome 78, Sentry ORDOTYPE-FRONTEND-1FB)
            acceptedDate = (member.json && member.json['cgu-accepted-date']) || null;
          } catch (e) {
            console.warn("[CGUModal] Could not parse _ms-mem JSON:", e);
          }
        }
      }

      if (!acceptedDate || new Date(acceptedDate) < cutoffDate) {
        showModal();
      } else {
        hideModal();
      }
    }

    // The modal covers the whole page: shown without its "J'ai compris"
    // button, nothing could close it. Better to skip it and say so loudly.
    function canClose() {
      if (acceptBtn || !modalEls.length) return true;
      report('#cgu-accepted introuvable : fenêtre CGU non affichée');
      return false;
    }

    var openedAt = 0;      // 0 = modal not open
    var leftForCgu = false;

    function describe(el) {
      var name = el.tagName.toLowerCase();
      if (el.id) name += '#' + el.id;
      if (typeof el.className === 'string' && el.className) name += '.' + el.className.split(/\s+/).join('.');
      return name;
    }

    // Blocked = no point of the button can be clicked. Off screen is fine:
    // the modal scrolls. Partly covered is fine: the rest still works.
    function checkReachable() {
      try {
        if (!openedAt || !document.elementFromPoint) return;
        var r = acceptBtn.getBoundingClientRect();
        if (!r.width || r.top < 0 || r.bottom > window.innerHeight) return;
        var y = r.top + r.height / 2;
        var cover = null;
        var xs = [r.left + r.width * 0.15, r.left + r.width / 2, r.left + r.width * 0.85];
        for (var i = 0; i < xs.length; i++) {
          var hit = document.elementFromPoint(xs[i], y);
          if (!hit || acceptBtn.contains(hit)) return;
          cover = hit;
        }
        report('bouton « J’ai compris » entièrement recouvert par ' + describe(cover));
      } catch (e) {
        console.error('[CGUModal] reachability check failed:', e);
      }
    }

    function showModal() {
      if (!modalEls.length) return;
      modalEls.forEach(function(el) {
        el.classList.add('show');
      });
      openedAt = Date.now();
      track('cgu_modal_view');
      setTimeout(checkReachable, 3000);
    }

    function hideModal() {
      modalEls.forEach(function(el) {
        el.classList.remove('show');
      });
      openedAt = 0;
    }

    modalEls.forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest && e.target.closest('a[href*="cgu"]')) leftForCgu = true;
      });
    });

    // Under 3 s it is a redirect or a bounce, not someone stuck.
    window.addEventListener('pagehide', function() {
      if (openedAt && !leftForCgu && Date.now() - openedAt >= 3000) {
        openedAt = 0;
        track('cgu_modal_leave');
      }
    });

    // On "Accept" click: hide modal, save to localStorage, update Memberstack if connected
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function() {
        hideModal();

        var nowISO = new Date().toISOString();
        // Always save to localStorage (works for both connected and anonymous users)
        storageSet('cgu-accepted-date', nowISO);

        // Only update Memberstack if user is connected
        if (isUserConnected() && memberstack) {
          memberstack.updateMemberJSON({
            json: { 'cgu-accepted-date': nowISO }
          })
          .then(function() {
            console.log("[CGUModal] Member JSON updated successfully");
          })
          .catch(function(err) {
            console.error("[CGUModal] Failed to update member JSON:", err);
          });
        } else {
          console.log("[CGUModal] User not connected - saved to localStorage only");
        }

        track('cgu_modal_accept');
      });
    }

    // Run initial check
    if (canClose()) checkCGUAcceptedDate();

    console.log('[CGUModal] Initialized');
  }

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
