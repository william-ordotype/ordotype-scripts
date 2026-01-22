/**
 * Ordotype Fin Internat - Geo Redirect
 * Geographic redirection using external service
 *
 * IMPORTANT: Load this script in the header (before page renders)
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/geo-redirect.js"></script>
 */
(function(g, e, o, t, a, r, ge, tl, y, s) {
    g.getElementsByTagName(o)[0].insertAdjacentHTML(
        'afterbegin',
        '<style id="georedirect1710774047582style">body{opacity:0.0 !important;}</style>'
    );
    s = function() {
        g.getElementById('georedirect1710774047582style').innerHTML = 'body{opacity:1.0 !important;}';
    };
    t = g.getElementsByTagName(o)[0];
    y = g.createElement(e);
    y.async = true;
    y.src = 'https://g10498469755.co/gr?id=-NtH44AfNiWDiw_4v2GY&refurl=' + g.referrer + '&winurl=' + encodeURIComponent(window.location);
    t.parentNode.insertBefore(y, t);
    y.onerror = function() { s(); };
    georedirect1710774047582loaded = function(redirect) {
        var to = 0;
        if (redirect) { to = 5000; }
        setTimeout(function() { s(); }, to);
    };
})(document, 'script', 'head');
