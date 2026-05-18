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

  function revealAndStrip() {
    // Pre-reveal members-only content by REMOVING data-ms-content="members"
    // (not via CSS). Removing the attribute means Memberstack's hide rule
    // no longer matches the element, so Webflow's own class-based layout
    // (display: flex on .posos-div-block, etc.) stays authoritative.
    // CSS-based reveal with `display: revert` would clobber those layouts.
    //
    // Only "members" is pre-revealed — premium-pages/!copier-coller-html
    // and other plan-specific gates stay under Memberstack's control.
    var membersOnly = document.querySelectorAll('[data-ms-content="members"]');
    for (var i = 0; i < membersOnly.length; i++) {
      membersOnly[i].removeAttribute('data-ms-content');
    }
    // Strip ms-code-skeleton so global-utils.js's setTimeout-based skeleton
    // removal becomes a no-op (the attr it reads is gone). Then yank any
    // already-attached .skeleton-loader overlays so content reveals NOW
    // instead of waiting the configured delay (typically 200ms).
    // The decoder in global-utils.js has already run by this point
    // (it shares the DOMContentLoaded handler that adds the skeletons),
    // so removing the overlay safely reveals decoded HTML.
    var skeletons = document.querySelectorAll('[ms-code-skeleton]');
    for (var j = 0; j < skeletons.length; j++) {
      skeletons[j].removeAttribute('ms-code-skeleton');
    }
    var overlays = document.querySelectorAll('.skeleton-loader');
    for (var k = 0; k < overlays.length; k++) {
      overlays[k].remove();
    }
  }
  // Run once now (covers the case where global-utils already added overlays).
  revealAndStrip();
  // Always re-run on DOMContentLoaded — if global-utils.js adds overlays
  // later in the same DOMContentLoaded handler (its listener fires first),
  // we need a second pass to remove them. The listener is a no-op if the
  // event already fired, so this is safe even in late-load scenarios.
  document.addEventListener('DOMContentLoaded', revealAndStrip);
  // Final safety net: if anything (e.g. a setTimeout) injects an overlay
  // after DOMContentLoaded, catch it on window.load.
  window.addEventListener('load', revealAndStrip);

  console.log('[OrdoEmbed] Active');
})();
