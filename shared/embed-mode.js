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

  // Require BOTH: #embed=1 hash AND being inside an iframe.
  // Hash (not query string) so the marker doesn't get picked up by
  // Webflow-bundled URL-slug parsers (PersonalizedButton, analytics, etc.).
  // The iframe check prevents leaks if someone opens the embed URL directly
  // (e.g. right-click → "Open frame in new tab", shared link, etc.) —
  // in that case we fall back to normal Memberstack gating.
  var hasEmbedParam = false;
  try {
    var hashStr = (window.location.hash || '').replace(/^#/, '');
    hasEmbedParam = new URLSearchParams(hashStr).get('embed') === '1';
  } catch (e) {}

  var inIframe = false;
  try { inIframe = window.self !== window.top; }
  catch (e) { inIframe = true; } // cross-origin top access throws → we're framed

  var isEmbed = hasEmbedParam && inIframe;
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
