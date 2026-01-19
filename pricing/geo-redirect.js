/**
 * Ordotype Pricing - Geo Redirect
 * Handles geographic redirection using external geo service.
 */
(function(g, e, o, t, a, r, ge, tl, y, s) {
  g.getElementsByTagName(o)[0].insertAdjacentHTML(
    'afterbegin',
    '<style id="georedirect1711366785415style">body{opacity:0.0 !important;}</style>'
  );

  s = function() {
    g.getElementById('georedirect1711366785415style').innerHTML = 'body{opacity:1.0 !important;}';
  };

  t = g.getElementsByTagName(o)[0];
  y = g.createElement(e);
  y.async = true;
  y.src = 'https://g10498469755.co/gr?id=-NtpPBZ2LUmVhp1P7L7i&refurl=' + g.referrer + '&winurl=' + encodeURIComponent(window.location);
  t.parentNode.insertBefore(y, t);

  y.onerror = function() {
    s();
  };

  window.georedirect1711366785415loaded = function(redirect) {
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
