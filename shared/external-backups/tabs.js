function f(tabMenu) {
  var bg = document.createElement("div");
  bg.className = "tab-bg";
  tabMenu.appendChild(bg);

  var defaultWidth = tabMenu.getAttribute("data-default-width");
  var defaultLeft = tabMenu.getAttribute("data-default-left");

  bg.style.cssText = "position:absolute;bottom:4px;top:4px;height:auto;background-color:#fff;transition:left 0.3s ease;border-radius:4px;box-shadow:0 4px 8px 1px rgba(12,14,22,.08);";

  function moveBg(link) {
    var left = link.offsetLeft || parseFloat(defaultLeft) || 0;
    var width = link.offsetWidth || parseFloat(defaultWidth) || 0;
    bg.style.left = left + "px";
    bg.style.width = width + "px";
  }

  var links = tabMenu.querySelectorAll(".w-tab-link");
  var current = tabMenu.querySelector(".w-tab-link.w--current");
  if (current) moveBg(current);

  links.forEach(function(link) {
    link.addEventListener("click", function(e) {
      e.preventDefault();
      links.forEach(function(l) { l.classList.remove("w--current"); });
      link.classList.add("w--current");
      moveBg(link);
    });
  });

  window.addEventListener("resize", function() {
    var active = tabMenu.querySelector(".w-tab-link.w--current");
    if (active) moveBg(active);
  });
}

function r() {
  document.querySelectorAll('[x-ordo-utils="tabs"]').forEach(function(el) {
    f(el);
  });
}
r();
