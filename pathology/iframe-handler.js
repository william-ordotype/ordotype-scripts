/**
 * Ordotype Pathology - Iframe Handler
 * Manages iframe loading for prescriptions/recommendations.
 * Depends on: jQuery, Webflow
 */
(function() {
  'use strict';

  function dispatchIframeLoadedEvent(data, iframe) {
    try {
      var iframeOrigin = new URL(iframe.src).origin;
      var myOrigin = window.location.origin;

      if (iframeOrigin === myOrigin) {
        iframe.contentWindow.postMessage(
          { type: "iframeLoaded", data: data },
          myOrigin
        );
        console.log("[IframeHandler] iframeLoaded event dispatched");
      } else {
        console.warn("[IframeHandler] Cross-origin iframe detected: " + iframeOrigin + " !== " + myOrigin);
      }
    } catch (err) {
      console.warn("[IframeHandler] postMessage failed:", err);
    }
  }

  function init() {
    var paywallElem = $('.rappels-cliniques-content .rc_hidden_warning_wrapper');
    var spinnerSafetyTimeout = null;

    // Handle paywall visibility
    if ($(paywallElem).css('display') === 'block') {
      $('.pathology_tab-view-iframe').hide();
      $('.content-item').removeAttr('data-collection-slug').removeAttr('data-iframe-slug');
      // Force opacity:1 on the clone — the CSS rule `.rc_hidden_warning_wrapper
      // { opacity: 0 }` is cleared on the ORIGINAL by opacity-reveal.js inside
      // a 50ms setTimeout after DCL. If init runs before that timeout, the
      // original still has opacity:0 inline-empty and the clone inherits the
      // hidden state — .show() flips display but the clone stays invisible.
      $('.pathologies_tab_col-right').append($(paywallElem).clone().css('opacity', '1').hide());
    }

    // A broken item (embed removed in the Designer, missing attributes)
    // must not become a dead click: skip preventDefault so the item's real
    // <a href> navigates to the page instead, and report once per page load
    // (Discord + Sentry via the shared reporter).
    var reportedBrokenItem = false;
    function brokenItemFallback(reason) {
      console.warn('[IframeHandler] ' + reason + ' — falling back to link navigation');
      if (!reportedBrokenItem && window.OrdoErrorReporter) {
        reportedBrokenItem = true;
        window.OrdoErrorReporter.report('IframeHandler', reason + ' (plain click fell back to link navigation)');
      }
    }

    // Open corresponding iframe on collection item click
    $('.pathologies_tab .content-item[data-iframe-id]').click(function(ev) {
      // The item title is now a real <a href> to the ordonnance page (SEO:
      // crawlable internal links). Modified clicks (cmd/ctrl/shift/alt)
      // fall through so the browser opens a new tab/window; a plain click
      // keeps the iframe behavior via the preventDefault below.
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

      var target = $(ev.currentTarget);
      var iframeMeta = target.find('.iframe-meta')[0];

      if (!iframeMeta) {
        brokenItemFallback('.iframe-meta not found inside content-item');
        return;
      }

      var slug = iframeMeta.getAttribute('data-iframe-slug');
      var collection = iframeMeta.getAttribute('data-collection-slug');

      if (!slug || !collection) {
        brokenItemFallback('Missing slug or collection on iframe-meta');
        return;
      }

      // Everything the iframe needs is present: cancel the link navigation
      // and keep today's behavior.
      ev.preventDefault();

      var host = window.location.origin;
      var url = host + '/' + collection + '/' + slug;
      var currentIframeId = ev.currentTarget.getAttribute('data-iframe-id');

      $('.content-item').removeClass('is-active');

      // Loading state — skip spinner if iframe is already loaded with this
      // URL (mousedown prefetch finished before click, or same item re-clicked);
      // otherwise show spinner + arm a 1s safety net in case the load event
      // never fires for this navigation.
      target.find('.tab_right-icon').hide();
      var isDesktop = window.innerWidth > 767;
      var openedIframe = isDesktop ? document.getElementById(currentIframeId) : null;
      var alreadyLoaded = openedIframe
        && openedIframe.getAttribute('src') === url
        && openedIframe.dataset.loaded === '1';

      if (alreadyLoaded) {
        target.find('.tab_right-icon').show();
      } else {
        target.find('.loading-spinner').show();
        if (spinnerSafetyTimeout) clearTimeout(spinnerSafetyTimeout);
        spinnerSafetyTimeout = setTimeout(function() {
          $('.pathologies_tab .loading-spinner').hide();
          $('.pathologies_tab .tab_right-icon').show();
          spinnerSafetyTimeout = null;
        }, 1000);
      }

      // Desktop
      if (isDesktop) {
        target.addClass('is-active');

        if ($(paywallElem).css('display') === 'block') {
          // Users are not premium
          $('#' + currentIframeId).parent().find('.job-post-title-ordo-display').remove();
          $('#' + currentIframeId).next().show().prepend('<h3 class="job-post-title-ordo-display">' + target.find('.content-item_name').first().text() + '</h3>');
          target.find('.tab_right-icon').show();
          $('.pathologies_tab .loading-spinner').hide();
          return;
        }

        // Mark embed via dataset (not URL) so Webflow-bundled URL parsers
        // (e.g. PersonalizedButton) don't pick up the marker in slugs.
        // embed-mode.js reads this via window.frameElement.dataset.embed.
        // Skip if mousedown handler already started this exact load — re-setting
        // src to the same URL causes Chrome to restart the load and discard
        // the head-start.
        if (openedIframe.getAttribute('src') !== url) {
          openedIframe.dataset.loaded = '';
          openedIframe.dataset.embed = '1';
          openedIframe.setAttribute('src', url);
        }
      } else {
        // Mobile
        target.addClass("is-active");

        if ($(paywallElem).css("display") === "block") {
          // Users are not premium
          var hasPaywallOpened = target.next(".rc_hidden_warning_wrapper");
          $(".pathologies_tab .content-item").next().remove();
          target.find(".tab_right-icon").show();

          if (hasPaywallOpened.length) {
            // Remove paywall if already opened
            $(".pathologies_tab .loading-spinner").hide();
            target.next().remove();
            target.removeClass("is-active");
            return;
          }

          // Force opacity:1 on the mobile clone for the same reason the
          // desktop init clone does — opacity-reveal.js races a 50ms timeout.
          var paywallMobile = $(paywallElem).clone().css('opacity', '1');
          target.after(
            paywallMobile.prepend('<h3 class="job-post-title-ordo-display">' + target.find(".content-item_name").first().text() + '</h3>')
          );
          $(".pathologies_tab .loading-spinner").hide();
          return;
        }

        var hasIframe = target.next("iframe");
        $(".mobile-iframe").remove(); // Remove any previously created iframe

        if (hasIframe.length) {
          // Act as toggle: if iframe exists, remove it
          $(".pathologies_tab .loading-spinner").hide();
          $(".pathologies_tab .tab_right-icon").show();
          target.removeClass("is-active");
          return;
        }

        var iframe = document.createElement("iframe");
        iframe.className = "mobile-iframe";
        iframe.dataset.embed = '1';
        iframe.src = url;
        iframe.style.width = "100%";
        iframe.style.height = "600px";

        // Define the load event handler
        function iframeLoadHandler(event) {
          iframe.dataset.loaded = '1';
          if (spinnerSafetyTimeout) {
            clearTimeout(spinnerSafetyTimeout);
            spinnerSafetyTimeout = null;
          }
          $('.pathologies_tab .loading-spinner').hide();
          $('.pathologies_tab .tab_right-icon').show();
          if (window.pathologyId) {
            var prescriptionTypeFr = iframe.closest('[data-w-tab]').getAttribute('data-w-tab');
            var prescriptionType = prescriptionTypeFr === "Conseil patient" ? "recommendation" : "prescription";

            dispatchIframeLoadedEvent({
              pathologyId: window.pathologyId,
              prescriptionType: prescriptionType
            }, iframe);
          } else {
            console.warn('[IframeHandler] No pathology id found');
          }

          iframe.removeEventListener("load", iframeLoadHandler);
        }

        iframe.addEventListener("load", iframeLoadHandler);
        target.after(iframe);
      }
    });

    // Prefetch on mousedown (desktop only): start the iframe load ~50-100ms
    // before the click event fires. No bandwidth waste — only the button
    // the user committed to pressing triggers a load.
    // Mobile creates iframes dynamically on click, so prefetch doesn't apply.
    $('.pathologies_tab .content-item[data-iframe-id]').on('mousedown', function(ev) {
      if (window.innerWidth <= 767) return;        // desktop only
      if (ev.button !== 0) return;                  // primary (left) button only
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return; // opening in a new tab: don't waste an iframe load
      if ($(paywallElem).css('display') === 'block') return; // skip when paywalled

      var meta = $(ev.currentTarget).find('.iframe-meta')[0];
      if (!meta) return;
      var slug = meta.getAttribute('data-iframe-slug');
      var collection = meta.getAttribute('data-collection-slug');
      if (!slug || !collection) return;

      var iframeId = ev.currentTarget.getAttribute('data-iframe-id');
      var iframe = document.getElementById(iframeId);
      if (!iframe) return;

      var url = window.location.origin + '/' + collection + '/' + slug;
      if (iframe.getAttribute('src') === url) return; // already loading/loaded

      iframe.dataset.embed = '1';
      iframe.setAttribute('src', url);
    });

    // Refresh iframe when switching subtab
    $('.tabs-menu-docs').on('click', function() {
      $('.pathologies_tab_col-left iframe').remove();
      $('.pathologies_tab_col-right iframe').attr('src', '');
      $('.pathologies_tab_col-right .rc_hidden_warning_wrapper').hide();
      $('.pathologies_tab_col-left .rc_hidden_warning_wrapper').remove();
      $('.content-item').removeClass('is-active');
    });

    // Hide loading state after iframe loads
    $('iframe').on('load', function(ev) {
      ev.target.dataset.loaded = '1';
      if (spinnerSafetyTimeout) {
        clearTimeout(spinnerSafetyTimeout);
        spinnerSafetyTimeout = null;
      }
      $('.pathologies_tab .loading-spinner').hide();
      $('.pathologies_tab .tab_right-icon').show();

      if (window.pathologyId) {
        var prescriptionTypeFr = ev.target.closest('[data-w-tab]').getAttribute('data-w-tab');
        var prescriptionType = prescriptionTypeFr === "Conseil patient" ? "recommendation" : "prescription";

        dispatchIframeLoadedEvent({
          pathologyId: window.pathologyId,
          prescriptionType: prescriptionType
        }, ev.target);
      } else {
        console.warn('[IframeHandler] No pathology id found');
      }
    });

    // Show always first visible tab
    var Webflow = window.Webflow || [];
    Webflow.push(function() {
      var tabButtons = document.querySelectorAll('.pathologies_tab .career_tab-link');
      var firstVisibleButton = Array.from(tabButtons).find(function(button) {
        return !button.classList.contains('w-condition-invisible');
      });

      if (firstVisibleButton) {
        firstVisibleButton.click();
      }
    });
    window.Webflow = Webflow;

    // Subnav toggle
    $('.subnav_header').on('click', function(ev) {
      $(ev.currentTarget).next('.sb_holder').slideToggle(300);
    });

    console.log('[IframeHandler] Initialized');
  }

  $(document).ready(init);
})();
