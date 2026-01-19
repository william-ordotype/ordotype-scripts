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

    // Handle paywall visibility
    if ($(paywallElem).css('display') === 'block') {
      $('.pathology_tab-view-iframe').hide();
      $('.content-item').removeAttr('data-collection-slug').removeAttr('data-iframe-slug');
      $('.pathologies_tab_col-right').append($(paywallElem).clone().hide());
    }

    // Open corresponding iframe on collection item click
    $('.pathologies_tab .content-item[data-iframe-id]').click(function(ev) {
      var target = $(ev.currentTarget);
      var iframeMeta = target.find('.iframe-meta')[0];

      if (!iframeMeta) {
        console.warn("[IframeHandler] .iframe-meta not found inside content-item");
        return;
      }

      var slug = iframeMeta.getAttribute('data-iframe-slug');
      var collection = iframeMeta.getAttribute('data-collection-slug');

      if (!slug || !collection) {
        console.warn("[IframeHandler] Missing slug or collection:", { slug: slug, collection: collection });
        return;
      }

      var host = window.location.origin;
      var url = host + '/' + collection + '/' + slug;
      var currentIframeId = ev.currentTarget.getAttribute('data-iframe-id');

      $('.content-item').removeClass('is-active');

      // Loading state
      target.find('.tab_right-icon').hide();
      target.find('.loading-spinner').show();

      // Desktop
      if (window.innerWidth > 767) {
        target.addClass('is-active');

        if ($(paywallElem).css('display') === 'block') {
          // Users are not premium
          $('#' + currentIframeId).parent().find('.job-post-title-ordo-display').remove();
          $('#' + currentIframeId).next().show().prepend('<h3 class="job-post-title-ordo-display">' + target.find('.content-item_name').first().text() + '</h3>');
          target.find('.tab_right-icon').show();
          $('.pathologies_tab .loading-spinner').hide();
          return;
        }

        var openedIframe = document.getElementById(currentIframeId);
        openedIframe.setAttribute('src', url);
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

          var paywallMobile = $(paywallElem).clone();
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
        iframe.src = url;
        iframe.style.width = "100%";
        iframe.style.height = "600px";

        // Define the load event handler
        function iframeLoadHandler(event) {
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

        // Hide spinner and show icon after a delay (fallback)
        setTimeout(function() {
          $(".pathologies_tab .loading-spinner").hide();
          $(".pathologies_tab .tab_right-icon").show();
        }, 1500);
      }
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
