/**
 * Ordotype — 2FA events instrumentation (GA4)
 *
 * Runs on the /membership/connexion-2fa page. Pushes 3 GA4 events into
 * window.dataLayer so the existing GTM container (GTM-MPMWHVV) can forward
 * them as GA4 Events :
 *   - 2fa_otp_success : OTP verified successfully
 *   - 2fa_otp_failure : OTP rejected (error_reason: invalid | expired | unknown)
 *   - 2fa_abandoned   : user leaves the page without successful verification
 *
 * Companion GTM objects are defined in workspace "2FA events (Claude API setup)"
 * and consume these dataLayer keys : error_reason, attempt_number,
 * time_on_page_sec, resent_before_success.
 *
 * Backend observed (ordotype-backend) :
 *   - POST /v1.0.0/otp/generate → send OTP code (5 min TTL)
 *   - POST /v1.0.0/otp/verify   → verify OTP code
 *
 * Related Notion : https://www.notion.so/34a30a1b750f811999b9f853a3ef5451
 *
 * Version: 1.5.0 (2026-04-24)
 *   1.0.0 — initial fetch proxy implementation.
 *   1.1.0 — add XMLHttpRequest wrapper (Memberstack/axios uses XHR, fetch
 *           proxy alone never fires on /otp/verify).
 *   1.2.0 — count attempts from /otp/verify calls instead of form submits.
 *   1.3.0 — add resend_count to 2fa_otp_failure and 2fa_abandoned payloads so
 *           Looker can split "abandon with resend" (delivery issue) from
 *           "abandon without resend" (givers-up). Skip pagehide on bfcache
 *           restore (event.persisted) which otherwise creates false
 *           abandons on Safari back/forward navigation.
 *   1.4.x — push 2fa_view on init; attach member_id via localStorage.ms_member_id.
 *   1.5.0 — reduce 2fa_abandoned false positives. Three changes:
 *           (a) mark success at XHR readyState=2 (HEADERS_RECEIVED) instead of
 *               waiting for loadend, so a Memberstack-initiated navigation on
 *               200 doesn't beat us to pagehide.
 *           (b) belt-and-suspenders: scan dataLayer for 2fa_otp_success before
 *               firing abandoned.
 *           (c) bounce filter: skip abandoned when attempt_count=0 AND
 *               time_on_page_sec<3 (pre-form misclicks / back-button).
 */

(function () {
  'use strict';

  if (!window || window.__ordotype2faEventsInstalled) return;
  window.__ordotype2faEventsInstalled = true;
  window.dataLayer = window.dataLayer || [];

  // On /membership/connexion-2fa, _ms-mem isn't populated yet (auth not
  // complete), but ms_member_id IS set in localStorage just before the 2FA
  // challenge renders. Use it to attribute events to the member.
  var memberIdOnPage = null;
  try { memberIdOnPage = localStorage.getItem('ms_member_id') || null; } catch (e) {}

  // Update user_id for this session (gtag pattern, works before/after gtag.js).
  if (memberIdOnPage) {
    (function() {
      function _gtag() { window.dataLayer.push(arguments); }
      _gtag('set', { user_id: memberIdOnPage });
    })();
  }

  // Replaces the former GA4 Admin "Create event" rule that synthesized
  // membership_2fa_view from page_view on /membership/connexion-2fa.
  // member_id populates the {{memberstack - member_id}} DLV so subsequent
  // tag firings on this page get attribution even though _ms-mem is empty.
  var viewPayload = { event: '2fa_view' };
  if (memberIdOnPage) viewPayload.member_id = memberIdOnPage;
  window.dataLayer.push(viewPayload);

  // --- Timers ---------------------------------------------------------------
  var pageLoadedAt = Date.now();
  var lastCodeRequestAt = pageLoadedAt; // refreshed on each successful /otp/generate
  var OTP_TTL_MS = 5 * 60 * 1000; // cf. otp.service.ts createOtp()

  // --- Counters -------------------------------------------------------------
  var attemptCount = 0;
  var resendCount = 0;
  var successFired = false;
  var abandonFired = false;

  function sec(fromTs) {
    return Math.round((Date.now() - (fromTs || pageLoadedAt)) / 1000);
  }

  // --- Click listener: resend buttons --------------------------------------
  // Counts user intent to resend (in parallel to the /otp/generate interception
  // below, which handles the actual backend success).
  document.addEventListener('click', function (evt) {
    var target = evt && evt.target;
    if (!target || !target.closest) return;
    if (target.closest('#resend-otp-by-email, #send-otp-by-sms')) {
      resendCount += 1;
    }
  });

  // Note: we do NOT listen on document submit events. Memberstack's OTP form
  // is a React component that calls the API directly without dispatching a
  // native submit event. Attempts are counted per /otp/verify call (see the
  // fetch and XHR handlers below).

  // --- Endpoint matchers ---------------------------------------------------
  // Host-agnostic: matches api.ordotype.fr, staging, Render preview, etc.
  var RE_GENERATE = /\/v1\.0\.0\/otp\/generate\b/;
  var RE_VERIFY = /\/v1\.0\.0\/otp\/verify\b/;

  // Shared event emitters (used by both fetch and XHR handlers).
  function ttlReason() {
    return Date.now() - lastCodeRequestAt > OTP_TTL_MS ? 'expired' : 'invalid';
  }

  function onGenerateSuccess() {
    lastCodeRequestAt = Date.now();
  }

  // `attemptNumber` is captured at /otp/verify send-time and passed through
  // the response handlers via closure, so two parallel calls (very unlikely)
  // would each emit their own correct attempt index.
  function onVerifySuccess(attemptNumber) {
    successFired = true;
    window.dataLayer.push({
      event: '2fa_otp_success',
      attempt_number: attemptNumber,
      time_on_page_sec: sec(),
      resent_before_success: resendCount > 0,
    });
  }

  function onVerifyFailureFromBody(attemptNumber, body) {
    var reason;
    if (body && body.code === 'OTP_EXPIRED') reason = 'expired';
    else if (body && body.code === 'OTP_INVALID') reason = 'invalid';
    else reason = ttlReason();
    window.dataLayer.push({
      event: '2fa_otp_failure',
      error_reason: reason,
      attempt_number: attemptNumber,
      resend_count: resendCount,
    });
  }

  function onVerifyFailureNoBody(attemptNumber) {
    window.dataLayer.push({
      event: '2fa_otp_failure',
      error_reason: ttlReason(),
      attempt_number: attemptNumber,
      resend_count: resendCount,
    });
  }

  // Register a new /otp/verify call and return the attempt number to use.
  function registerVerifyAttempt() {
    attemptCount += 1;
    return attemptCount;
  }

  // --- Fetch proxy ---------------------------------------------------------
  // Covers cases where the frontend uses native fetch.
  var ORIGINAL_FETCH = window.fetch;

  window.fetch = function (input, init) {
    var url =
      typeof input === 'string'
        ? input
        : (input && input.url) || '';
    var isGenerate = RE_GENERATE.test(url);
    var isVerify = RE_VERIFY.test(url);

    var promise = ORIGINAL_FETCH.apply(this, arguments);

    if (isGenerate) {
      promise
        .then(function (resp) {
          if (resp && resp.ok) onGenerateSuccess();
        })
        .catch(function () {});
      return promise;
    }

    if (!isVerify) return promise;

    var attemptNumber = registerVerifyAttempt();
    return promise.then(function (resp) {
      if (resp && resp.ok) {
        onVerifySuccess(attemptNumber);
        return resp;
      }
      resp
        .clone()
        .json()
        .then(function (body) {
          onVerifyFailureFromBody(attemptNumber, body);
        })
        .catch(function () {
          onVerifyFailureNoBody(attemptNumber);
        });
      return resp;
    });
  };

  // --- XMLHttpRequest wrapper ----------------------------------------------
  // Memberstack 2.0 / axios use XHR by default in browsers. Without this, we
  // miss every /otp/verify call. Wrapping both open() and send() lets us
  // attach a load listener with the right URL context.
  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
    var XHR_PROTO = window.XMLHttpRequest.prototype;
    var ORIGINAL_XHR_OPEN = XHR_PROTO.open;
    var ORIGINAL_XHR_SEND = XHR_PROTO.send;

    XHR_PROTO.open = function (method, url) {
      try {
        this.__ordoUrl = typeof url === 'string' ? url : '';
      } catch (e) {}
      return ORIGINAL_XHR_OPEN.apply(this, arguments);
    };

    XHR_PROTO.send = function () {
      try {
        var url = this.__ordoUrl || '';
        var isGenerate = RE_GENERATE.test(url);
        var isVerify = RE_VERIFY.test(url);
        if (isGenerate || isVerify) {
          var xhr = this;
          var attemptNumber = isVerify ? registerVerifyAttempt() : 0;
          // Fire success as early as possible (HEADERS_RECEIVED) to win the
          // race against pagehide when Memberstack navigates on 200.
          xhr.addEventListener('readystatechange', function () {
            if (!isVerify || successFired) return;
            if (xhr.readyState < 2) return;
            var s = xhr.status;
            if (s >= 200 && s < 300) onVerifySuccess(attemptNumber);
          });
          xhr.addEventListener('loadend', function () {
            var ok = xhr.status >= 200 && xhr.status < 300;
            if (isGenerate) {
              if (ok) onGenerateSuccess();
              return;
            }
            // isVerify
            if (ok) {
              if (!successFired) onVerifySuccess(attemptNumber);
              return;
            }
            var body = null;
            try {
              body = JSON.parse(xhr.responseText);
            } catch (e) {}
            if (body) onVerifyFailureFromBody(attemptNumber, body);
            else onVerifyFailureNoBody(attemptNumber);
          });
        }
      } catch (err) {
        // Never break the original request over an instrumentation bug.
      }
      return ORIGINAL_XHR_SEND.apply(this, arguments);
    };
  }

  // --- Abandon detection ---------------------------------------------------
  // Fires on page hide / unload when no 2fa_otp_success was recorded.
  // Using pagehide because it is more reliable than beforeunload on iOS Safari.
  function dataLayerHasSuccess() {
    try {
      var dl = window.dataLayer || [];
      for (var i = 0; i < dl.length; i++) {
        var e = dl[i];
        if (e && e.event === '2fa_otp_success') return true;
      }
    } catch (err) {}
    return false;
  }

  function pushAbandonedOnce(evt) {
    // bfcache restore: Safari back/forward navigation calls pagehide with
    // persisted=true even though the user is not abandoning. Skip.
    if (evt && evt.persisted === true) return;
    if (successFired || abandonFired) return;
    // Belt-and-suspenders: if anything already pushed a 2fa_otp_success
    // (e.g. readystatechange path raced ahead of the successFired assignment
    // between event loop ticks), don't double-count.
    if (dataLayerHasSuccess()) return;
    // Bounce filter: a user arriving and leaving within 3s without any
    // /otp/verify attempt is a misclick or back-button, not an intentional
    // abandonment of the 2FA challenge.
    if (attemptCount === 0 && sec() < 3) return;
    abandonFired = true;
    window.dataLayer.push({
      event: '2fa_abandoned',
      time_on_page_sec: sec(),
      attempt_number: attemptCount,
      resend_count: resendCount,
    });
  }
  window.addEventListener('pagehide', pushAbandonedOnce);
  window.addEventListener('beforeunload', pushAbandonedOnce);

  // Visibility change covers mobile tab-away. We do NOT fire abandon here
  // because the user may return; instead we only mark on actual hide.
})();
