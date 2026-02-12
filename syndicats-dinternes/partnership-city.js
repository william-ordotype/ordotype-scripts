/**
 * Ordotype - Partnership City Storage
 * Reads a city value from a CMS hidden input and persists it in sessionStorage
 * (with cookie fallback) so the signup flow can attach it to the member.
 *
 * Expected DOM:
 *   <input id="js-partnership-city" type="hidden" value="{{city from CMS}}">
 *
 * The value is re-stored on Memberstack signup form submission for extra safety.
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/syndicats-dinternes/partnership-city.js"></script>
 */
(function() {
    'use strict';

    var PREFIX = '[OrdoPartnerCity]';
    var KEY = 'signup-partnership-city';

    var el = document.getElementById('js-partnership-city');
    var cityValue = el ? el.value : null;

    console.log(PREFIX, 'City from CMS:', cityValue);

    if (!cityValue) {
        console.error(PREFIX, 'No city value found in CMS');
        return;
    }

    // Store immediately on page load
    try {
        sessionStorage.setItem(KEY, cityValue);
        console.log(PREFIX, 'Stored in sessionStorage:', cityValue);
    } catch (err) {
        console.error(PREFIX, 'sessionStorage failed:', err);
        try {
            document.cookie = KEY + '=' + encodeURIComponent(cityValue) + '; path=/; max-age=3600';
            console.log(PREFIX, 'Fallback: stored in cookie');
        } catch (cookieErr) {
            console.error(PREFIX, 'Cookie also failed:', cookieErr);
        }
    }

    // Re-store on Memberstack signup form submission
    document.addEventListener('submit', function(e) {
        if (e.target.matches('[data-ms-form="signup"]')) {
            console.log(PREFIX, 'Form submitted, re-storing city:', cityValue);
            try {
                sessionStorage.setItem(KEY, cityValue);
            } catch (err) {
                console.error(PREFIX, 'Failed to re-store on submit:', err);
            }
        }
    }, true);
})();
