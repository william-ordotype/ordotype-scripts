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

  var EURO_DESTINATION_ZONES = ['Europe/Brussels', 'Europe/Luxembourg', 'Europe/Berlin'];
  var LIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID', 'REQUIRES_PAYMENT', 'REQUIRES_AUTHENTICATION', 'INCOMPLETE'];

  function memberCurrency() {
    var member = null;
    try {
      var raw = window.localStorage.getItem('_ms-mem');
      member = raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
    var conns = member && Array.isArray(member.planConnections) ? member.planConnections : [];
    var found = null;
    for (var i = 0; i < conns.length; i++) {
      var c = conns[i] || {};
      var live = c.active === true || LIVE_STATUSES.indexOf(String(c.status || '').toUpperCase()) !== -1;
      var cur = c.payment && c.payment.currency ? String(c.payment.currency).toLowerCase() : '';
      if (!live || !cur) continue;
      if (cur !== 'eur') return cur;
      found = 'eur';
    }
    return found;
  }

  var frenchZone = FRENCH_TIME_ZONES.indexOf(timeZone) !== -1;
  var euroDestination = EURO_DESTINATION_ZONES.indexOf(timeZone) !== -1;
  var skipReason = frenchZone ? 'French time zone' : !euroDestination && memberCurrency() === 'eur' ? 'euro subscriber' : '';
  var hidden = !frenchZone && !skipReason;
  var revealed = false;
  var safety = null;

  s = function() {
    if (!hidden || revealed) return;
    revealed = true;
    g.getElementById('georedirect1711366785415style').innerHTML = 'body{opacity:1.0 !important;}';
  };

  function cancelSafety() {
    if (safety === null) return;
    clearTimeout(safety);
    safety = null;
  }

  if (hidden) {
    g.getElementsByTagName(o)[0].insertAdjacentHTML(
      'afterbegin',
      '<style id="georedirect1711366785415style">body{opacity:0.0 !important;}</style>'
    );

    // A hidden page is revealed by the geo service, either by answering or by
    // failing. A request that does neither, which a filtering proxy can
    // produce, would leave it invisible for good. This is the only exit from
    // that case, and it says so rather than passing silently.
    safety = setTimeout(function() {
      safety = null;
      s();
      var reporter = window.OrdoErrorReporter;
      if (reporter && typeof reporter.reportNetwork === 'function') {
        reporter.reportNetwork('GeoRedirect', new Error('Geo service silent after ' + REVEAL_TIMEOUT_MS + ' ms, page revealed'));
      }
    }, REVEAL_TIMEOUT_MS);
  }

  if (skipReason) {
    console.log('[GeoRedirect] No geo call: ' + skipReason);
    return;
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
    if (!hidden) return;
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
