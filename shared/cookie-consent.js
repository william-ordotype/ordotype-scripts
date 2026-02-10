(function() {
  var COOKIE_NAME = 'fs-cc';
  var COOKIE_DAYS = 365;

  // Check if logged in (banner still shown, but GTM auto-grants analytics)
  var isLoggedIn = false;
  if (window.OrdoMemberstack) {
    isLoggedIn = !!window.OrdoMemberstack.memberId;
  } else {
    try {
      var member = JSON.parse(localStorage.getItem('_ms-mem') || '{}');
      isLoggedIn = !!(member && member.id);
    } catch (e) {}
  }

  // Get elements
  var banner = document.querySelector('[fs-cc="banner"]');
  var prefsPanel = document.querySelector('[fs-cc="preferences"]');
  var manager = document.querySelector('[fs-cc="manager"]');

  // Get existing consent from cookie
  function getConsent() {
    var match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (match) {
      try {
        return JSON.parse(decodeURIComponent(match[2]));
      } catch (e) {}
    }
    return null;
  }

  // Save consent to cookie
  function saveConsent(consents) {
    var data = { consents: consents, timestamp: Date.now() };
    var expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
    document.cookie = COOKIE_NAME + '=' + encodeURIComponent(JSON.stringify(data)) + ';expires=' + expires + ';path=/;SameSite=Lax';
  }

  // Get checkbox states from preferences panel
  function getCheckboxStates() {
    var marketing = document.querySelector('[fs-cc-checkbox="marketing"]');
    var analytics = document.querySelector('[fs-cc-checkbox="analytics"]');
    var personalization = document.querySelector('[fs-cc-checkbox="personalization"]');
    return {
      marketing: marketing ? marketing.checked : false,
      analytics: analytics ? analytics.checked : false,
      personalization: personalization ? personalization.checked : false
    };
  }

  // Set checkbox states in preferences panel
  function setCheckboxStates(consents) {
    var marketing = document.querySelector('[fs-cc-checkbox="marketing"]');
    var analytics = document.querySelector('[fs-cc-checkbox="analytics"]');
    var personalization = document.querySelector('[fs-cc-checkbox="personalization"]');
    if (marketing) marketing.checked = consents.marketing || false;
    if (analytics) analytics.checked = consents.analytics || false;
    if (personalization) personalization.checked = consents.personalization || false;
  }

  // Show/hide elements
  function showBanner() { if (banner) banner.style.display = 'flex'; }
  function hideBanner() { if (banner) banner.style.display = 'none'; }
  function showPrefs() { if (prefsPanel) prefsPanel.style.display = 'flex'; }
  function hidePrefs() { if (prefsPanel) prefsPanel.style.display = 'none'; }
  function showManager() { if (manager) manager.style.display = 'flex'; }
  function hideManager() { if (manager) manager.style.display = 'none'; }

  // Update GTM consent (if gtag available)
  function updateGtagConsent(consents) {
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        'ad_storage': consents.marketing ? 'granted' : 'denied',
        'ad_user_data': consents.marketing ? 'granted' : 'denied',
        'ad_personalization': consents.personalization ? 'granted' : 'denied',
        'analytics_storage': consents.analytics ? 'granted' : 'denied',
        'personalization_storage': consents.personalization ? 'granted' : 'denied'
      });
    }
    // Update Clarity if available
    if (window.clarity) {
      window.clarity('consent', consents.analytics);
    }
  }

  // Handle actions
  function handleAllow() {
    var consents = { marketing: true, analytics: true, personalization: true };
    saveConsent(consents);
    updateGtagConsent(consents);
    hideBanner();
    hidePrefs();
    showManager();
  }

  function handleDeny() {
    var consents = { marketing: false, analytics: false, personalization: false };
    saveConsent(consents);
    updateGtagConsent(consents);
    hideBanner();
    hidePrefs();
    showManager();
  }

  function handleSubmit() {
    var consents = getCheckboxStates();
    saveConsent(consents);
    updateGtagConsent(consents);
    hideBanner();
    hidePrefs();
    showManager();
  }

  function handleOpenPrefs() {
    var existing = getConsent();
    if (existing && existing.consents) {
      setCheckboxStates(existing.consents);
    }
    hideBanner();
    showPrefs();
  }

  // Bind click handlers using event delegation
  document.addEventListener('click', function(e) {
    var target = e.target.closest('[fs-cc]');
    if (!target) return;

    var action = target.getAttribute('fs-cc');

    if (action === 'allow') {
      e.preventDefault();
      handleAllow();
    } else if (action === 'deny') {
      e.preventDefault();
      handleDeny();
    } else if (action === 'submit') {
      e.preventDefault();
      handleSubmit();
    } else if (action === 'open-preferences') {
      e.preventDefault();
      handleOpenPrefs();
    } else if (action === 'close') {
      e.preventDefault();
      hideBanner();
      hidePrefs();
    }
  });

  // Initialize on DOM ready
  function init() {
    var existing = getConsent();

    if (existing) {
      // Already consented, hide banner, show manager button
      hideBanner();
      hidePrefs();
      showManager();
    } else {
      // First visit, show banner
      showBanner();
      hidePrefs();
      hideManager();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
