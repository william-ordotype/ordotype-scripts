/**
 * Ordotype Pricing - Geo Redirect
 * Handles geographic redirection using external geo service.
 */
(function(g, e, o, t, a, r, ge, tl, y, s) {
  var REVEAL_TIMEOUT_MS = 5000;

  g.getElementsByTagName(o)[0].insertAdjacentHTML(
    'afterbegin',
    '<style id="georedirect1711366785415style">body{opacity:0.0 !important;}</style>'
  );

  var revealed = false;
  var safety = null;

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
  safety = setTimeout(function() {
    safety = null;
    s();
    var reporter = window.OrdoErrorReporter;
    if (reporter && typeof reporter.reportNetwork === 'function') {
      reporter.reportNetwork('GeoRedirect', new Error('Geo service silent after ' + REVEAL_TIMEOUT_MS + ' ms, page revealed'));
    }
  }, REVEAL_TIMEOUT_MS);

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
