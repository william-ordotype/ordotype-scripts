/**
 * Ordotype Fin Internat V2 - Geo Redirect
 * Geographic redirection using external service
 *
 * IMPORTANT: Load this script in the header (before page renders)
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/geo-redirect.js"></script>
 */
(function(g, e, o, t, a, r, ge, tl, y, s) {
    g.getElementsByTagName(o)[0].insertAdjacentHTML(
        'afterbegin',
        '<style id="georedirect1761060850637style">body{opacity:0.0 !important;}</style>'
    );
    s = function() {
        g.getElementById('georedirect1761060850637style').innerHTML = 'body{opacity:1.0 !important;}';
    };
    t = g.getElementsByTagName(o)[0];
    y = g.createElement(e);
    y.async = true;
    y.src = 'https://g10498469755.co/gr?id=-Oc6P-hH4QQaSz9g-f1o&refurl=' + g.referrer + '&winurl=' + encodeURIComponent(window.location);
    t.parentNode.insertBefore(y, t);
    y.onerror = function() { s(); };
    georedirect1761060850637loaded = function(redirect) {
        var to = 0;
        if (redirect) { to = 5000; }
        setTimeout(function() { s(); }, to);
    };
})(document, 'script', 'head');
