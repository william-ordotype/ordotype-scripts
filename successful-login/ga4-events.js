/**
 * Ordotype — successful-login confirmation event
 *
 * Runs on the /membership/successful-login page. If the user arrived from
 * /membership/connexion-2fa, pushes a `2fa_login_confirmed` event into
 * dataLayer. This is a ground-truth success signal complementary to the
 * `2fa_success` event emitted from the connexion-2fa page's XHR interceptor:
 *
 *   - `2fa_success` fires when /otp/verify returns 200 — can race with the
 *     Memberstack-initiated navigation and occasionally be lost.
 *   - `2fa_login_confirmed` fires on the next page load — 100 % reliable
 *     because the browser committed the navigation.
 *
 * In Looker, compare counts to detect tracking drift :
 *   count(2fa_success) ≈ count(2fa_login_confirmed) — if not, investigate.
 *
 * Related Notion : https://www.notion.so/34a30a1b750f811999b9f853a3ef5451
 *
 * Version: 1.0.0 (2026-04-22)
 */

(function () {
  'use strict';

  if (!window || window.__ordotypeSuccessfulLoginInstalled) return;
  window.__ordotypeSuccessfulLoginInstalled = true;
  window.dataLayer = window.dataLayer || [];

  var ref = document.referrer || '';
  var cameFrom2fa = /\/membership\/connexion-2fa\b/.test(ref);

  window.dataLayer.push({
    event: '2fa_login_confirmed',
    came_from_2fa: cameFrom2fa,
  });
})();
