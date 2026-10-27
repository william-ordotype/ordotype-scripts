/**
 * Ordotype Account - Tab Hash Navigation
 * When landing on /membership/compte with a hash like #abonnements,
 * automatically clicks the matching tab so the user sees the right section.
 *
 * Supported hashes:
 *   #abonnements           → "Abonnements et facturation" tab
 *   #profil                → "Mon profil" tab
 *   #connexion             → "Connexion et sécurité" tab
 *
 * The tab component is members-only (data-ms-content="members"): for a
 * logged-in member it can be missing, or come back on its default tab
 * ("Mon profil"), after this script has run. The tab is therefore applied
 * again whenever the page changes, for WATCH_MS, until the member picks a
 * tab themselves.
 */
(function() {
    'use strict';

    var PREFIX = '[TabHash]';
    var WATCH_MS = 8000;

    var KEYWORD_MAP = {
        'abonnements': 'billing',
        'abonnements-facturation': 'billing',
        'facturation': 'billing',
        'profil': 'information',
        'information': 'information',
        'connexion': 'security',
        'securite': 'security',
        'security': 'security'
    };

    var TAB_SELECTOR = 'a.w-tab-link, [role="tab"], [data-w-tab]';

    // Tab links only: panes carry data-w-tab too.
    function findTab(keyword) {
        var tabs = document.querySelectorAll(TAB_SELECTOR);
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            if (tab.classList.contains('w-tab-pane')) continue;
            var label = (tab.getAttribute('data-w-tab') || tab.textContent || '').trim().toLowerCase();
            if (label.indexOf(keyword) !== -1) return tab;
        }
        return null;
    }

    function init() {
        var hash = (window.location.hash || '').replace('#', '').toLowerCase();
        if (!hash) return;
        var keyword = KEYWORD_MAP[hash];
        if (!keyword) return;

        var applying = false;
        var memberPicked = false;
        var observer = null;
        var queued = false;

        function apply() {
            if (memberPicked) return;
            var tab = findTab(keyword);
            if (!tab) return;
            // A Webflow restart of the tabs selects data-current again.
            var component = tab.closest('.w-tabs');
            var name = tab.getAttribute('data-w-tab');
            if (component && name) component.setAttribute('data-current', name);
            if (tab.classList.contains('w--current')) return;
            applying = true;
            try {
                tab.click();
            } finally {
                applying = false;
            }
            console.log(PREFIX, 'Switched to tab:', keyword);
        }

        // A tab chosen by the member wins: stop applying the hash. Only a real
        // click counts; a script switching back to the default tab does not.
        document.addEventListener('click', function(e) {
            if (applying || !e.isTrusted) return;
            var target = e.target;
            if (target && target.closest && target.closest(TAB_SELECTOR)) memberPicked = true;
        }, true);

        apply();
        if (!findTab(keyword)) console.warn(PREFIX, 'No tab matched keyword yet:', keyword);

        if (typeof window.MutationObserver !== 'function') return;
        observer = new window.MutationObserver(function() {
            if (queued || memberPicked) return;
            queued = true;
            setTimeout(function() {
                queued = false;
                apply();
            }, 0);
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        setTimeout(function() {
            observer.disconnect();
        }, WATCH_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
