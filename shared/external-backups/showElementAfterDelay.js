function l() {
  document.querySelectorAll('[x-ordo-utils="showElementAfterDelay"]').forEach(function(e) {
    var t = parseInt(e.getAttribute("data-delay-milliseconds"), 10);
    if (isNaN(t)) {
      console.error("Invalid or missing data-delay-milliseconds attribute");
      return;
    }
    setTimeout(function() {
      e.style.opacity = "0";
      e.style.display = "block";
      e.style.transition = "opacity 0.3s ease";
      requestAnimationFrame(function() {
        e.style.opacity = "1";
      });
    }, t);
  });
}
l();
