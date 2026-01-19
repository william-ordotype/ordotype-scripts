/**
 * Ordotype Pathology - Tooltips
 * Handles IPP and HBPM tooltip popups.
 */
(function() {
  'use strict';

  var currentCloseHandler = null;
  var initialized = false;

  function handleTooltip(e, type) {
    e.stopPropagation();

    var popup = document.querySelector('.tooltip-ipp-popup');
    var wrapper = document.querySelector(
      type === 'ipp'
        ? '.tooltip-ipp-block-wrapper.new-styling:not(.hbpm)'
        : '.tooltip-ipp-block-wrapper.new-styling.hbpm'
    );

    if (!popup || !wrapper) return;

    if (currentCloseHandler) {
      document.removeEventListener('click', currentCloseHandler);
    }

    popup.style.display = 'block';
    wrapper.style.display = 'block';

    currentCloseHandler = function(event) {
      var rcWrapper = document.querySelector('.rc-wrapper');
      var triggers = rcWrapper ? rcWrapper.querySelectorAll('.tooltip-ipp, .tooltip-hbpm') : [];
      var clickedTrigger = Array.from(triggers).some(function(t) {
        return t.contains(event.target);
      });

      if (!wrapper.contains(event.target) && !clickedTrigger) {
        popup.style.display = 'none';
        wrapper.style.display = 'none';
        document.removeEventListener('click', currentCloseHandler);
        currentCloseHandler = null;
      }
    };

    document.addEventListener('click', currentCloseHandler);
  }

  function init() {
    if (initialized) return true;

    var rcWrapper = document.querySelector('.rc-wrapper');
    if (!rcWrapper) return false;

    var tooltips = rcWrapper.querySelectorAll('.tooltip-ipp, .tooltip-hbpm');
    if (tooltips.length === 0) return false;

    rcWrapper.querySelectorAll('.tooltip-ipp').forEach(function(trigger) {
      trigger.onclick = function(e) {
        handleTooltip(e, 'ipp');
      };
    });

    rcWrapper.querySelectorAll('.tooltip-hbpm').forEach(function(trigger) {
      trigger.onclick = function(e) {
        handleTooltip(e, 'hbpm');
      };
    });

    initialized = true;
    console.log('[Tooltips] Initialized with', tooltips.length, 'tooltip(s)');
    return true;
  }

  // Watch for rc-wrapper to appear
  var observer = new MutationObserver(function() {
    if (init()) {
      observer.disconnect();
    }
  });

  if (!init()) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
