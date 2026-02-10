function o() {
  document.querySelectorAll('[x-ordo-utils="hideElementOnClick"]').forEach(function(t) {
    t.addEventListener("click", function() {
      var selector = t.getAttribute("data-element-to-hide");
      if (!selector) {
        console.error("Missing data-element-to-hide id attribute");
        return;
      }
      var el = document.querySelector(selector);
      if (el) {
        el.style.transition = "opacity 0.4s ease";
        el.style.opacity = "0";
        setTimeout(function() {
          el.style.display = "none";
          el.style.opacity = "";
          el.style.transition = "";
        }, 400);
      } else {
        console.error('Element "' + selector + '" not found on the page');
      }
    });
  });
}
o();
