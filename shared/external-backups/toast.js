/**
 * Toast - Vanilla JS (no jQuery)
 * Backup of dndevs/ordotype-front-utils showToast.
 *
 * Each trigger [x-ordo-utils*="show-toast"] is matched by index
 * to its own toast component [x-ordo-utils="toast-component-{index}"].
 */
(function() {
  var triggers = document.querySelectorAll("[x-ordo-utils*=show-toast]");

  triggers.forEach(function(trigger, index) {
    var timeout = trigger.dataset.showToastTimeout || 3000;
    var toastEl = document.querySelector('[x-ordo-utils="toast-component-' + index + '"]');

    // Hide initially
    if (toastEl) {
      toastEl.style.display = "none";
    }

    trigger.addEventListener("click", function(event) {
      event.preventDefault();
      if (!toastEl) return;

      toastEl.style.display = "inline-block";
      toastEl.style.opacity = "0";
      toastEl.style.top = "-100px";
      toastEl.style.transition = "top 0.2s ease, opacity 0.2s ease";

      requestAnimationFrame(function() {
        toastEl.style.opacity = "1";
        toastEl.style.top = "0px";
      });

      setTimeout(function() {
        toastEl.style.transition = "opacity 0.2s ease";
        toastEl.style.opacity = "0";
        setTimeout(function() {
          toastEl.style.display = "none";
        }, 200);
      }, timeout);
    });
  });
})();