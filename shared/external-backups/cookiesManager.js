function toggleCookiesManager() {
  var cookieManagerButton = document.querySelector('[x-ordo-utils="cookieManagerButton"]');
  var cookieManagerClose = document.querySelector('[x-ordo-utils="cookieManagerClose"]');
  var cookieManagerBannerClose = document.querySelector('[x-ordo-utils="cookieManagerBannerClose"]');
  var cookieBanner = document.querySelector('[x-ordo-utils="cookieBanner"]');
  var hasSeenCookieBanner = document.cookie
    .split("; ")
    .find(function(row) { return row.startsWith("fs-cc="); });

  function animateOut(el, duration) {
    if (!el) return;
    el.style.display = "block";
    el.style.opacity = "1";
    el.style.bottom = "0";
    el.style.transition = "opacity " + duration + "ms ease, bottom " + duration + "ms ease";
    requestAnimationFrame(function() {
      el.style.opacity = "0";
      el.style.bottom = "-100%";
    });
  }

  function animateIn(el, duration) {
    if (!el) return;
    el.style.display = "block";
    el.style.opacity = "0";
    el.style.bottom = "-100%";
    el.style.transition = "opacity " + duration + "ms ease, bottom " + duration + "ms ease";
    requestAnimationFrame(function() {
      el.style.opacity = "1";
      el.style.bottom = "0";
    });
  }

  if (!hasSeenCookieBanner && cookieBanner) {
    setTimeout(function() {
      cookieBanner.style.opacity = "0";
      cookieBanner.style.display = "block";
      cookieBanner.style.transition = "opacity 0.3s ease";
      requestAnimationFrame(function() {
        cookieBanner.style.opacity = "1";
      });
    }, 2000);
  }

  if (cookieManagerButton) {
    cookieManagerButton.addEventListener("click", function() {
      animateOut(cookieManagerButton, 800);
    });
  }

  if (cookieManagerClose) {
    cookieManagerClose.addEventListener("click", function() {
      animateIn(cookieManagerButton, 400);
    });
  }

  if (cookieManagerBannerClose) {
    cookieManagerBannerClose.addEventListener("click", function() {
      var banner = document.querySelector('[fs-cc="banner"]');
      animateOut(banner, 800);
      animateIn(cookieManagerButton, 400);
    });
  }
}

toggleCookiesManager();
