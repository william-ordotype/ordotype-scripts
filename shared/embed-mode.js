/**
 * Ordotype - Embed Mode (Shared)
 * Activates when the page is loaded with ?embed=1 (e.g. inside a pathology iframe).
 *
 * Effects (only when ?embed=1):
 *  - Tags <html> with .is-embed (so site CSS can hide nav/footer if desired).
 *  - Pre-reveals [data-ms-content="members"] so the iframe doesn't wait on
 *    Memberstack's getCurrentMember() round-trip. The parent has already
 *    paywalled the click, so trusting the embed is safe in this flow.
 *  - Strips ms-code-skeleton attributes so Memberstack's loading skeleton
 *    never holds the content back.
 *
 * Exposes: window.OrdoEmbed.active (boolean) — loaders read this to skip
 * non-essential modules (tracking, print-handler) when embedded.
 *
 * Must be loaded BEFORE memberstack-utils.js and any module that paints
 * gated content (opacity-reveal, html-cleaner, copy-handler, etc.).
 */
(function() {
  'use strict';

  // Detect embed via the parent iframe element's data-embed attribute.
  // The parent's iframe-handler.js sets iframe.dataset.embed = '1' before
  // assigning src. We avoid URL markers (?embed=1 / #embed=1) because
  // Webflow-bundled JS reads location.href for slug extraction and would
  // include the marker in slugs (favorites, analytics, etc.).
  //
  // window.frameElement is non-null only inside a same-origin iframe;
  // accessing it across origins throws, which we treat as "not our embed".
  var isEmbed = false;
  try {
    isEmbed = !!(window.frameElement && window.frameElement.dataset && window.frameElement.dataset.embed === '1');
  } catch (e) {}

  window.OrdoEmbed = { active: isEmbed };

  if (!isEmbed) return;

  document.documentElement.classList.add('is-embed');

  var style = document.createElement('style');
  style.textContent =
    '.is-embed [data-ms-content="members"]{' +
      'display:revert !important;' +
      'visibility:visible !important;' +
      'opacity:1 !important;' +
    '}';
  (document.head || document.documentElement).appendChild(style);

  function stripSkeletons() {
    var nodes = document.querySelectorAll('[ms-code-skeleton]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('ms-code-skeleton');
    }
  }
  stripSkeletons();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', stripSkeletons);
  }

  console.log('[OrdoEmbed] Active');
})();
