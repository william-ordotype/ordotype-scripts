function c() {
  // Select all trigger elements with x-ordo-utils containing "show-toast"
  document.querySelectorAll("[x-ordo-utils*=show-toast]").forEach(trigger => {
    // Retrieve timeout value or default to 3000ms
    const timeout = trigger.dataset.showToastTimeout ?? 3000;
    // Hide the common toast container initially
    $(`[x-ordo-utils="toast-component-common"]`).hide();

    // Attach click event listener to each trigger
    trigger.addEventListener("click", event => {
      event.preventDefault();
      const toastElement = document.querySelector(`[x-ordo-utils="toast-component-common"]`);
      if (toastElement) {
        $(toastElement)
          .css({ display: "inline-block", opacity: 0, top: -100 })
          .animate({ top: 0, opacity: 1 }, 200);
        setTimeout(function() {
          $(toastElement).fadeOut(200);
        }, timeout);
      }
    });
  });
}
c();
