/**
 * showElementOnClick - Vanilla JS (no jQuery)
 * Backup of dndevs/ordotype-front-utils@0.0.24 showElementOnClick,
 * rewritten to remove jQuery dependency.
 *
 * Replicates jQuery .fadeIn() behavior.
 *
 * Usage: Add x-ordo-utils="showElementOnClick" to the trigger element
 * and data-element-to-show="#elementId" to specify the target.
 */
(function() {
  function fadeIn(el) {
    el.style.display = 'block';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.4s ease';
    // Force reflow so the transition triggers
    void el.offsetHeight;
    el.style.opacity = '1';
  }

  document.querySelectorAll('[x-ordo-utils="showElementOnClick"]').forEach(function(trigger) {
    trigger.addEventListener('click', function() {
      var selector = trigger.getAttribute('data-element-to-show');
      if (!selector) {
        console.error('Missing data-element-to-show attribute');
        return;
      }
      var el = document.querySelector(selector);
      if (!el) {
        console.error('Element "' + selector + '" not found on the page');
        return;
      }
      fadeIn(el);
    });
  });
})();
