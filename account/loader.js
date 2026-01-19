/**
 * Ordotype Account - Loader
 * Loads all account scripts in the correct order.
 * 
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/YOUR_USER/YOUR_REPO@main/account/loader.js"></script>
 * 
 * To bust cache after updates, use a version tag:
 * <script defer src="https://cdn.jsdelivr.net/gh/YOUR_USER/YOUR_REPO@v1.0.1/account/loader.js"></script>
 */
(function() {
  'use strict';

  // Base URL - update this after uploading to GitHub
  const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account';

  // Scripts to load (in order)
  const scripts = [
    'core.js',           // Must be first - exposes window.OrdoAccount
    'subscriptions.js',
    'status-selectors.js',
    'delete-account.js',
    'billing-portal.js',
    'phone-input.js'
  ];

  // External dependencies for phone input
  const dependencies = [
    {
      type: 'css',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css'
    },
    {
      type: 'js',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js'
    }
  ];

  // Load a single script
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${url}`));
      document.head.appendChild(script);
    });
  }

  // Load a stylesheet
  function loadCSS(url) {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  // Load all dependencies first, then scripts in order
  async function loadAll() {
    console.log('[OrdoAccount] Loading...');

    try {
      // Load external dependencies (CSS + intl-tel-input)
      await Promise.all(dependencies.map(dep => {
        return dep.type === 'css' ? loadCSS(dep.url) : loadScript(dep.url);
      }));

      // Load scripts sequentially
      for (const file of scripts) {
        await loadScript(`${BASE}/${file}`);
      }

      console.log('[OrdoAccount] All scripts loaded');
    } catch (err) {
      console.error('[OrdoAccount] Load error:', err);
    }
  }

  loadAll();
})();
