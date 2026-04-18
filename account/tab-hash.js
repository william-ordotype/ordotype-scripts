/**
 * Ordotype Account - Tab Hash Navigation
 * When landing on /membership/compte with a hash like #abonnements,
 * automatically clicks the matching tab so the user sees the right section.
 *
 * Supported hashes:
 *   #abonnements           → "Abonnements et facturation" tab
 *   #profil                → "Mon profil" tab
 *   #connexion             → "Connexion et sécurité" tab
 */
(function() {
    'use strict';

    var PREFIX = '[TabHash]';

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

    function switchToTab(keyword) {
        var tabs = document.querySelectorAll('a.w-tab-link, [role="tab"], [data-w-tab]');
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            var label = (tab.getAttribute('data-w-tab') || tab.textContent || '').trim().toLowerCase();
            if (label.indexOf(keyword) !== -1) {
                tab.click();
                console.log(PREFIX, 'Switched to tab:', label);
                return true;
            }
        }
        console.warn(PREFIX, 'No tab matched keyword:', keyword);
        return false;
    }

    function init() {
        var hash = (window.location.hash || '').replace('#', '').toLowerCase();
        if (!hash) return;
        var keyword = KEYWORD_MAP[hash];
        if (!keyword) return;
        switchToTab(keyword);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
