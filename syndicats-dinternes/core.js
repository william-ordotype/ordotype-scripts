/**
 * Core functionality for Syndicats d'Internes
 * - Stores current URL in localStorage for tracking
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/syndicats-dinternes/core.js"></script>
 */
(function() {
    var PREFIX = '[OrdoSyndicat]';

    localStorage.setItem('locat', location.href);
    console.log(PREFIX, 'Stored location:', location.href);
})();
