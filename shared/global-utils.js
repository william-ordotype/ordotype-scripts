/**
 * Ordotype Global Utilities
 *
 * Contains:
 * - Skeleton loader removal
 * - Rich text HTML decoder
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/global-utils.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[GlobalUtils]';

    /**
     * Skeleton Loader
     * Removes skeleton-loader divs after a delay specified by ms-code-skeleton attribute
     */
    function initSkeletonLoader() {
        const skeletonElements = document.querySelectorAll('[ms-code-skeleton]');

        skeletonElements.forEach((element, index) => {
            // Create a skeleton div
            const skeletonDiv = document.createElement('div');
            skeletonDiv.classList.add('skeleton-loader');
            skeletonDiv.setAttribute('id', `skeleton-${index}`);

            // Add the skeleton div to the current element
            element.style.position = 'relative';
            element.appendChild(skeletonDiv);

            // Get delay from the attribute
            let delay = element.getAttribute('ms-code-skeleton');

            // If attribute value is not a number, set default delay as 2000ms
            if (isNaN(delay)) {
                delay = 2000;
            }

            setTimeout(() => {
                // Remove the skeleton loader div after delay
                const skeletonDiv = document.getElementById(`skeleton-${index}`);

                if (skeletonDiv && element.contains(skeletonDiv)) {
                    element.removeChild(skeletonDiv);
                }
            }, delay);
        });

        console.log(PREFIX, `Skeleton loaders initialized: ${skeletonElements.length}`);
    }

    /**
     * Rich Text HTML Decoder
     * Decodes HTML entities in rich text elements
     * Handles .w-richtext p and .decode-html elements
     */
    function initRichTextDecoder() {
        // First pass: handle escaped block-level HTML in direct children of .w-richtext
        // Some CMS items have entire HTML escaped (with &amp; entities in attributes),
        // which the standard regex below misses. Replace the wrapper <p> at parent level
        // since block-level elements (p, ul, table...) can't nest inside <p>.
        document.querySelectorAll('.w-richtext:not(.rc-html):not(.rich-text-block-18) > p').forEach(function(el) {
            var html = el.innerHTML;
            if (/&lt;[a-z][a-z0-9]*(?:[^&]|&(?!gt;))*&gt;/i.test(html)) {
                var decoded = el.textContent;
                if (/^\s*<(p|ul|ol|div|table|dl|blockquote|h[1-6])\b/i.test(decoded)) {
                    var parent = el.parentNode;
                    var temp = document.createElement('div');
                    temp.innerHTML = decoded;
                    while (temp.firstChild) {
                        parent.insertBefore(temp.firstChild, el);
                    }
                    parent.removeChild(el);
                }
            }
        });

        // Second pass: decode .w-richtext p elements that contain escaped HTML tags
        // Webflow sometimes escapes HTML content, sometimes not
        // Only decode if escaped tags are detected (e.g., &lt;p&gt;, &lt;strong&gt;)
        //
        // This pass also covers .rc-html (which the first pass deliberately skips,
        // see commit a566e29). Some legacy .rc-html fiches store their ENTIRE body
        // escaped inside one wrapper <p> (e.g. <p>&lt;table&gt;...&lt;/table&gt;</p>).
        // Decoding such a <p> with `el.innerHTML = el.textContent` would re-inject
        // block-level elements (table/p/ul...) INSIDE the <p> — invalid HTML the
        // parser flattens into a wall of unstyled text. So when the decoded content
        // starts with a block element, lift it to the parent (next to the <p>) and
        // drop the now-empty wrapper, mirroring the first pass. Inline-only escaped
        // content (strong/a/abbr) keeps the original in-place decode unchanged.
        document.querySelectorAll('.w-richtext p').forEach(function(el) {
            var html = el.innerHTML;
            var hasEscapedHtmlTag = /&lt;[a-z][a-z0-9]*[^&]*&gt;/i.test(html);
            if (!hasEscapedHtmlTag) return;
            var decoded = el.textContent;
            // Lift decoded block-level content out of the wrapper <p> (see above).
            // .rich-text-block-18 is excluded from the lift to preserve its prior
            // in-place behaviour (commit 1a8b431 kept it out of the parent-lift pass).
            var startsWithBlock = /^\s*<(p|ul|ol|div|table|dl|blockquote|h[1-6])\b/i.test(decoded);
            if (startsWithBlock && !el.closest('.rich-text-block-18')) {
                var parent = el.parentNode;
                var temp = document.createElement('div');
                temp.innerHTML = decoded;
                while (temp.firstChild) {
                    parent.insertBefore(temp.firstChild, el);
                }
                parent.removeChild(el);
            } else {
                el.innerHTML = decoded;
            }
        });

        // Handler for .decode-html that starts with "-&nbsp;&lt;"
        document.querySelectorAll('.decode-html').forEach(function(el) {
            var html = el.innerHTML;
            if (html.indexOf('-&nbsp;&lt;') === 0 && html.indexOf('&gt;') > 7) {
                el.innerHTML = el.textContent;
            }
        });

        // Handler for .urine-24h and .selles - decode all HTML entities
        document.querySelectorAll('.urine-24h, .selles').forEach(function(el) {
            el.innerHTML = el.textContent;
        });

        console.log(PREFIX, 'Rich text decoder initialized');
    }

    /**
     * Churn Offer Tracking Loader
     * Injects shared/tracking-churn-offers.js on cancellation funnel pages only.
     * Centralised here so non-offer cancel pages don't need a bespoke Webflow
     * footer edit to be instrumented (global-utils.js is already site-wide).
     */
    const CHURN_PATHS = [
        '/membership/offre-annulation',
        '/membership/annulation-abonnement',
        '/membership/desabonnement-module-ordotype',
        '/membership/desabonnement-module-rhumato',
        '/membership/annulation-offre-asso-interne'
    ];

    function loadChurnTracking() {
        const path = window.location.pathname.replace(/\/$/, '');
        if (CHURN_PATHS.indexOf(path) === -1) return;

        // Resolve version from this script's own src so a pinned global-utils.js
        // pulls a matching tracking-churn-offers.js.
        let version = 'main';
        const list = document.getElementsByTagName('script');
        for (let i = 0; i < list.length; i++) {
            const src = list[i].src || '';
            if (src.indexOf('/shared/global-utils.js') === -1) continue;
            const m = src.match(/ordotype-scripts@([^\/]+)\//);
            if (m) { version = m[1]; break; }
        }

        const script = document.createElement('script');
        script.defer = true;
        script.src = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@'
            + version + '/shared/tracking-churn-offers.js';
        document.head.appendChild(script);
        console.log(PREFIX, 'Churn tracking injected (' + version + ')');
    }

    /**
     * Note Uploader Button (mobile)
     * The note editor is injected at runtime. Its mobile "Importer des fichiers"
     * button is an <a href="#"> that was never wired to the file <input>, so a
     * tap on the button does nothing (just the href="#" jump). Delegate a click
     * on document: when the uploader button (or its inner label/icon) is tapped,
     * forward it to the file input in the same wrapper. Delegation means it works
     * no matter when the editor DOM is injected.
     *
     * NB: we use `click` (reliable for opening a file picker on iOS — a
     * programmatic input.click() from touchend is NOT). The iOS "two taps"
     * issue caused by the button's :hover style is solved in CSS, not here
     * (see global-styles.css @media (hover: none)).
     */
    function initNoteUploaderButton() {
        document.addEventListener('click', function(ev) {
            const target = ev.target;
            if (!target || !target.closest) return;
            // Only the mobile button is visible/clickable (display:none on desktop)
            const button = target.closest('.uploader_w a.button');
            if (!button) return;
            const input = button.closest('.uploader_w').querySelector('input.input-file');
            if (!input) return;
            ev.preventDefault(); // stop the dead href="#" jump
            input.click();       // open the native file picker (same user gesture)
        });
        console.log(PREFIX, 'Note uploader button wired');
    }

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initSkeletonLoader();
            initRichTextDecoder();
            loadChurnTracking();
            initNoteUploaderButton();
        });
    } else {
        initSkeletonLoader();
        initRichTextDecoder();
        loadChurnTracking();
        initNoteUploaderButton();
    }
})();
