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
        // Use $(document).ready() instead of Webflow.push() to avoid being blocked by Webflow errors
        $(document).ready(function() {
            // Decode .w-richtext p elements that contain escaped HTML tags
            // Webflow sometimes escapes HTML content, sometimes not
            // Only decode if escaped tags are detected (e.g., &lt;p&gt;, &lt;strong&gt;)
            $('.w-richtext p').html(function() {
                var html = $(this).html();
                // Detect escaped HTML tags: &lt; followed by tag name and &gt;
                var hasEscapedHtmlTag = /&lt;[a-z][a-z0-9]*[^&]*&gt;/i.test(html);

                if (hasEscapedHtmlTag) {
                    return $(this).text();
                }
                return html;
            });

            // Handler for .decode-html that starts with "-&nbsp;&lt;"
            $('.decode-html').html(function() {
                var html = $(this).html();
                // Check if it follows the pattern "-&nbsp;&lt;...&gt;"
                return html.indexOf('-&nbsp;&lt;') === 0 && html.indexOf('&gt;') > 7
                    ? $(this).text()
                    : html;
            });

            // Handler for .urine-24h - decode all HTML entities
            $('.urine-24h').html(function() {
                return $(this).text();
            });

            console.log(PREFIX, 'Rich text decoder initialized');
        });
    }

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initSkeletonLoader();
            initRichTextDecoder();
        });
    } else {
        initSkeletonLoader();
        initRichTextDecoder();
    }
})();
