/**
 * Ordotype Fin Internat V2 - Geo Redirect
 * Geographic redirection using external service
 *
 * IMPORTANT: Load this script in the header (before page renders)
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/geo-redirect.js"></script>
 */
(function(g, e, o, t, a, r, ge, tl, y, s) {
    var REVEAL_TIMEOUT_MS = 5000;

    g.getElementsByTagName(o)[0].insertAdjacentHTML(
        'afterbegin',
        '<style id="georedirect1761060850637style">body{opacity:0.0 !important;}</style>'
    );
    var revealed = false;
    var safety = null;

    s = function() {
        if (revealed) return;
        revealed = true;
        g.getElementById('georedirect1761060850637style').innerHTML = 'body{opacity:1.0 !important;}';
    };

    function cancelSafety() {
        if (safety === null) return;
        clearTimeout(safety);
        safety = null;
    }

    // The page starts at opacity 0 and is revealed by the geo service, either
    // by answering or by failing. A request that does neither, which a
    // filtering proxy can produce, would leave the page invisible for good.
    // This is the only exit from that case, and it says so rather than
    // passing silently.
    safety = setTimeout(function() {
        safety = null;
        s();
        var reporter = window.OrdoErrorReporter;
        if (reporter && typeof reporter.reportNetwork === 'function') {
            reporter.reportNetwork('GeoRedirectV2', new Error('Geo service silent after ' + REVEAL_TIMEOUT_MS + ' ms, page revealed'));
        }
    }, REVEAL_TIMEOUT_MS);
    t = g.getElementsByTagName(o)[0];
    y = g.createElement(e);
    y.async = true;
    y.src = 'https://g10498469755.co/gr?id=-Oc6P-hH4QQaSz9g-f1o&refurl=' + g.referrer + '&winurl=' + encodeURIComponent(window.location);
    t.parentNode.insertBefore(y, t);
    y.onerror = function() { cancelSafety(); s(); };
    window.georedirect1761060850637loaded = function(redirect) {
        cancelSafety();
        var to = 0;
        if (redirect) { to = 5000; }
        setTimeout(function() { s(); }, to);
    };
})(document, 'script', 'head');
