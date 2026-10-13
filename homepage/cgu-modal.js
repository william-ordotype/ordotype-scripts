/**
 * Ordotype Homepage - CGU Modal
 * Handles CGU acceptance modal with 90-day expiration.
 * Never shown without its #cgu-accepted button (reported instead).
 * Depends on: Memberstack ($memberstackDom)
 *
 * Is anyone stuck behind it?
 *   GA4 (consented visitors): cgu_modal_view, cgu_modal_accept, and
 *   cgu_modal_leave = page left after 3 s+ with the modal still open.
 *   cgu_modal_masquee = modal not rendered in front of the page;
 *   cgu_modal_contournee = page clicked through the open modal.
 *   Sentry + Discord (everyone): button missing, or entirely covered 3 s
 *   after the modal opened while the modal is in front. A modal that is
 *   not in front is reported apart, once a day per browser.
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

    // Once a day per browser (every time when storage is unusable).
    function firstToday(key) {
      var today = new Date(Date.now()).toISOString().slice(0, 10);
      if (storageGet(key) === today) return false;
      storageSet(key, today);
      return true;
    }

    function isRecent(date) {
      return !!date && new Date(date) >= cutoffDate;
    }

    var memberJson = null; // member's Memberstack JSON, once read

    // On load: this browser's date, else the member's Memberstack JSON.
    // No ES2020 syntax (?. / ??) in this file: it must parse on old
    // hospital browsers (Chrome 78, Sentry ORDOTYPE-FRONTEND-1FB)
    function checkCGUAcceptedDate() {
      if (isRecent(storageGet('cgu-accepted-date'))) {
        hideModal();
        return;
      }
      // The cached member (_ms-mem) has no json field: ask the API.
      if (!isUserConnected() || !memberstack || typeof memberstack.getMemberJSON !== 'function') {
        showModal();
        return;
      }
      memberstack.getMemberJSON().then(function(res) {
        memberJson = res && res.data && typeof res.data === 'object' ? res.data : {};
        var remote = memberJson['cgu-accepted-date'];
        if (isRecent(remote)) {
          storageSet('cgu-accepted-date', remote);
          hideModal();
        } else {
          showModal();
        }
      }, function(err) {
        if (firstToday('cgu-modal-json-signale')) {
          report('JSON Memberstack illisible, fenêtre affichée par défaut : ' + ((err && err.message) || err));
        }
        showModal();
      });
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
    var bypassed = false;  // page clicked through the modal
    var masked = false;    // modal found not in front of the page

    function describe(el) {
      var name = el.tagName.toLowerCase();
      if (el.id) name += '#' + el.id;
      if (typeof el.className === 'string' && el.className) name += '.' + el.className.split(/\s+/).join('.');
      return name.slice(0, 80);
    }

    function inModal(el) {
      for (var i = 0; i < modalEls.length; i++) {
        if (modalEls[i].contains(el)) return true;
      }
      return false;
    }

    // What the four corners of the screen hit: the modal's backdrop when
    // it is rendered in front.
    function probeCorners() {
      var de = document.documentElement;
      var w = Math.min(de.clientWidth || window.innerWidth, window.innerWidth || de.clientWidth);
      var h = Math.min(de.clientHeight || window.innerHeight, window.innerHeight || de.clientHeight);
      return [[4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4]].map(function(p) {
        return document.elementFromPoint(p[0], p[1]);
      });
    }

    function inFront(corners) {
      return corners.some(function(hit) { return !!hit && inModal(hit); });
    }

    function details(corners) {
      var vv = window.visualViewport;
      var modal = (acceptBtn && acceptBtn.closest && acceptBtn.closest('[ms-code-element-temporary]')) || modalEls[0];
      var cs = window.getComputedStyle(modal);
      return 'écran ' + window.innerWidth + 'x' + window.innerHeight
        + ', défilement ' + Math.round(window.pageYOffset || 0)
        + ', zone visible ' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height)
          + ' décalage ' + Math.round(vv.offsetTop) + ' zoom ' + Math.round(vv.scale * 100) / 100 : 'inconnue')
        + ', coins ' + corners.map(function(hit) { return hit ? describe(hit) : 'rien'; }).join(' / ')
        + ', fenêtre visibility:' + cs.visibility + ' opacity:' + cs.opacity
        + ' pointer-events:' + cs.pointerEvents + ' display:' + cs.display;
    }

    // Not in front of the page (hidden by the browser or an extension):
    // the page stays usable, nobody is stuck.
    function reportMasked(corners) {
      if (masked) return;
      masked = true;
      track('cgu_modal_masquee');
      if (firstToday('cgu-modal-masquee-signalee')) {
        report('fenêtre CGU pas au premier plan, page utilisable (' + details(corners) + ')');
      }
    }

    // Blocked = modal in front and no point of the button can be clicked.
    // Off screen is fine: the modal scrolls. Partly covered is fine: the
    // rest still works.
    function checkReachable() {
      try {
        if (!openedAt || !document.elementFromPoint) return;
        var corners = probeCorners();
        if (!inFront(corners)) {
          reportMasked(corners);
          return;
        }
        if (bypassed) return;
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
        report('bouton « J’ai compris » entièrement recouvert par ' + describe(cover) + ' (' + details(corners) + ')');
      } catch (e) {
        console.error('[CGUModal] reachability check failed:', e);
      }
    }

    // A real click outside the modal while it is not in front.
    document.addEventListener('click', function(e) {
      try {
        if (!openedAt || bypassed || !e.isTrusted || !document.elementFromPoint) return;
        var t = e.target;
        if (!t || t === document.documentElement || inModal(t)) return;
        if (inFront(probeCorners())) return;
        bypassed = true;
        track('cgu_modal_contournee');
      } catch (err) {
        console.error('[CGUModal] click check failed:', err);
      }
    }, true);

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

    // Under 3 s it is a redirect or a bounce, not someone stuck. Nor is
    // someone the modal never stopped.
    window.addEventListener('pagehide', function() {
      if (openedAt && !leftForCgu && !bypassed && !masked && Date.now() - openedAt >= 3000) {
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
          // updateMemberJSON replaces the whole JSON: keep its other keys.
          var json = {};
          var known = memberJson || {};
          for (var key in known) {
            if (Object.prototype.hasOwnProperty.call(known, key)) json[key] = known[key];
          }
          json['cgu-accepted-date'] = nowISO;
          memberstack.updateMemberJSON({ json: json })
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
