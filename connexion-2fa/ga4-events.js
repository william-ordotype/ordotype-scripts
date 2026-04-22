/**
 * Ordotype — 2FA events instrumentation (GA4)
 *
 * Runs on the /membership/connexion-2fa page. Pushes 3 GA4 events into
 * window.dataLayer so the existing GTM container (GTM-MPMWHVV) can forward
 * them as GA4 Events :
 *   - 2fa_success   : OTP verified successfully
 *   - 2fa_failure   : OTP rejected (error_reason: invalid | expired | unknown)
 *   - 2fa_abandoned : user leaves the page without successful verification
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
 * Version: 1.0.0 (2026-04-22)
 */

(function () {
  'use strict';

  if (!window || window.__ordotype2faEventsInstalled) return;
  window.__ordotype2faEventsInstalled = true;
  window.dataLayer = window.dataLayer || [];

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

  // --- Form submits --------------------------------------------------------
  // Generic: capture phase so we count every OTP form submission.
  document.addEventListener(
    'submit',
    function () {
      attemptCount += 1;
    },
    true,
  );

  // --- Fetch proxy ---------------------------------------------------------
  // Intercepts /otp/generate (refresh TTL timer) and /otp/verify (push events).
  // Regex matches the endpoints regardless of host (api.ordotype.fr, staging,
  // Render preview, etc.).
  var ORIGINAL_FETCH = window.fetch;
  var RE_GENERATE = /\/v1\.0\.0\/otp\/generate\b/;
  var RE_VERIFY = /\/v1\.0\.0\/otp\/verify\b/;

  window.fetch = function (input, init) {
    var url =
      typeof input === 'string'
        ? input
        : (input && input.url) || '';
    var isGenerate = RE_GENERATE.test(url);
    var isVerify = RE_VERIFY.test(url);

    var promise = ORIGINAL_FETCH.apply(this, arguments);

    if (isGenerate) {
      promise.then(function (resp) {
        if (resp && resp.ok) {
          lastCodeRequestAt = Date.now();
        }
      }).catch(function () {});
      return promise;
    }

    if (!isVerify) return promise;

    return promise.then(function (resp) {
      if (resp && resp.ok) {
        successFired = true;
        window.dataLayer.push({
          event: '2fa_success',
          attempt_number: attemptCount,
          time_on_page_sec: sec(),
          resent_before_success: resendCount > 0,
        });
        return resp;
      }

      // Failure path: prefer explicit backend code (OTP_EXPIRED / OTP_INVALID),
      // fall back to client-side TTL heuristic.
      function ttlReason() {
        return Date.now() - lastCodeRequestAt > OTP_TTL_MS ? 'expired' : 'invalid';
      }
      resp
        .clone()
        .json()
        .then(function (body) {
          var reason;
          if (body && body.code === 'OTP_EXPIRED') reason = 'expired';
          else if (body && body.code === 'OTP_INVALID') reason = 'invalid';
          else reason = ttlReason();
          window.dataLayer.push({
            event: '2fa_failure',
            error_reason: reason,
            attempt_number: attemptCount,
          });
        })
        .catch(function () {
          window.dataLayer.push({
            event: '2fa_failure',
            error_reason: ttlReason(),
            attempt_number: attemptCount,
          });
        });
      return resp;
    });
  };

  // --- Abandon detection ---------------------------------------------------
  // Fires on page hide / unload when no 2fa_success was recorded.
  // Using pagehide because it is more reliable than beforeunload on iOS Safari.
  function pushAbandonedOnce() {
    if (successFired || abandonFired) return;
    abandonFired = true;
    window.dataLayer.push({
      event: '2fa_abandoned',
      time_on_page_sec: sec(),
      attempt_number: attemptCount,
    });
  }
  window.addEventListener('pagehide', pushAbandonedOnce);
  window.addEventListener('beforeunload', pushAbandonedOnce);

  // Visibility change covers mobile tab-away. We do NOT fire abandon here
  // because the user may return; instead we only mark on actual hide.
})();
