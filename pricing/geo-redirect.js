/**
 * Ordotype Pricing - Geo Redirect
 * Handles geographic redirection using external geo service.
 */
(function(g, e, o, t, a, r, ge, tl, y, s) {
  var REVEAL_TIMEOUT_MS = 5000;
  var FRENCH_TIME_ZONES = [
    'Europe/Paris',
    'Indian/Reunion', 'Indian/Mayotte',
    'America/Martinique', 'America/Guadeloupe', 'America/Cayenne',
    'America/St_Barthelemy', 'America/Marigot', 'America/Miquelon',
    'Pacific/Noumea', 'Pacific/Wallis',
    'Pacific/Tahiti', 'Pacific/Marquesas', 'Pacific/Gambier'
  ];

  var timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (err) {}

  // The page is hidden only while a redirect is likely. A device set to a
  // French time zone keeps it visible from the start; the service still
  // runs and can still redirect.
  var revealed = FRENCH_TIME_ZONES.indexOf(timeZone) !== -1;
  var safety = null;

  if (!revealed) {
    g.getElementsByTagName(o)[0].insertAdjacentHTML(
      'afterbegin',
      '<style id="georedirect1711366785415style">body{opacity:0.0 !important;}</style>'
    );
  }

  s = function() {
    if (revealed) return;
    revealed = true;
    g.getElementById('georedirect1711366785415style').innerHTML = 'body{opacity:1.0 !important;}';
  };

  function cancelSafety() {
    if (safety === null) return;
    clearTimeout(safety);
    safety = null;
  }

  // The page starts at opacity 0 and is revealed by the geo service, either by
  // answering or by failing. A request that does neither, which a filtering
  // proxy can produce, would leave the page invisible for good. This is the
  // only exit from that case, and it says so rather than passing silently.
  if (!revealed) {
    safety = setTimeout(function() {
      safety = null;
      s();
      var reporter = window.OrdoErrorReporter;
      if (reporter && typeof reporter.reportNetwork === 'function') {
        reporter.reportNetwork('GeoRedirect', new Error('Geo service silent after ' + REVEAL_TIMEOUT_MS + ' ms, page revealed'));
      }
    }, REVEAL_TIMEOUT_MS);
  }

  t = g.getElementsByTagName(o)[0];
  y = g.createElement(e);
  y.async = true;
  y.src = 'https://g10498469755.co/gr?id=-NtpPBZ2LUmVhp1P7L7i&refurl=' + g.referrer + '&winurl=' + encodeURIComponent(window.location);
  t.parentNode.insertBefore(y, t);

  y.onerror = function() {
    cancelSafety();
    s();
  };

  window.georedirect1711366785415loaded = function(redirect) {
    cancelSafety();
    var to = 0;
    if (redirect) {
      to = 5000;
    }
    setTimeout(function() {
      s();
    }, to);
  };

  console.log('[GeoRedirect] Initialized');
})(document, 'script', 'head');
