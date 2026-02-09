function c() {
  var toastEl = document.querySelector('[x-ordo-utils="toast-component-common"]');
  if (toastEl) {
    toastEl.style.display = "none";
  }

  document.querySelectorAll("[x-ordo-utils*=show-toast]").forEach(function(trigger) {
    var timeout = trigger.dataset.showToastTimeout ?? 3000;

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
}
c();
