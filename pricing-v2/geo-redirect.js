/**
 * Ordotype Pricing V2 - Geo Redirect
 * Handles geographic redirection using external geo service.
 * Different ID than pricing version A.
 */
(function(g, e, o, t, a, r, ge, tl, y, s) {
  g.getElementsByTagName(o)[0].insertAdjacentHTML(
    'afterbegin',
    '<style id="georedirect1741959196388style">body{opacity:0.0 !important;}</style>'
  );

  s = function() {
    g.getElementById('georedirect1741959196388style').innerHTML = 'body{opacity:1.0 !important;}';
  };

  t = g.getElementsByTagName(o)[0];
  y = g.createElement(e);
  y.async = true;
  y.src = 'https://g10498469755.co/gr?id=-OLJqytgQPYuOlfE3AHn&refurl=' + g.referrer + '&winurl=' + encodeURIComponent(window.location);
  t.parentNode.insertBefore(y, t);

  y.onerror = function() {
    s();
  };

  window.georedirect1741959196388loaded = function(redirect) {
    var to = 0;
    if (redirect) {
      to = 5000;
    }
    setTimeout(function() {
      s();
    }, to);
  };

  console.log('[GeoRedirectV2] Initialized');
})(document, 'script', 'head');
