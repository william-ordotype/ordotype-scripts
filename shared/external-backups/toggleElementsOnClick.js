function l() {
  document.querySelectorAll('[x-ordo-utils="toggleElementsOnClick"]').forEach(function(n) {
    n.addEventListener("click", function() {
      var showSelector = n.getAttribute("data-element-to-show");
      var hideSelector = n.getAttribute("data-element-to-hide");

      function fadeOut(el, callback) {
        if (el && window.getComputedStyle(el).display !== "none") {
          el.style.transition = "opacity 0.3s ease";
          el.style.opacity = "0";
          setTimeout(function() {
            el.style.display = "none";
            el.style.opacity = "";
            el.style.transition = "";
            if (callback) callback();
          }, 300);
        } else if (callback) {
          callback();
        }
      }

      function fadeIn(el) {
        if (el) {
          el.style.opacity = "0";
          el.style.display = "block";
          el.style.transition = "opacity 0.3s ease";
          requestAnimationFrame(function() {
            el.style.opacity = "1";
          });
          setTimeout(function() {
            el.style.transition = "";
          }, 300);
        }
      }

      if (hideSelector) {
        var hideEl = document.querySelector(hideSelector);
        fadeOut(hideEl, function() {
          if (showSelector) {
            var showEl = document.querySelector(showSelector);
            fadeIn(showEl);
          }
        });
      } else if (showSelector) {
        var showEl = document.querySelector(showSelector);
        fadeIn(showEl);
      } else {
        console.error("Missing data-element-to-show or data-element-to-hide id attribute");
      }
    });
  });
}
l();
