// Recherche mobile : la loupe de l'entête ouvre un panneau de recherche sur place,
// sans changer de page. Le champ de l'entête y est déplacé, la recherche garde donc
// son fonctionnement. Sans ce script, la loupe mène à /search-result.
(function () {
  var POURCENT = 100;
  var PORTRAIT = "(max-width: 479px)";

  // En-tête du panneau : champ gris avec la loupe dedans, « Annuler » à droite.
  // Classes propres au panneau : aucune règle du site ne s'y applique. La croix
  // n'apparaît que s'il y a du texte (:placeholder-shown).
  var CSS =
    ".ot-search-panel{display:none}" +
    ".ot-search-panel.is-open{display:block;position:fixed;top:0;right:0;bottom:0;left:0;background:#fff;z-index:10001;overscroll-behavior:contain}" +
    ".ot-search-head{display:flex;align-items:center;gap:6px;padding:8px 8px 8px 16px}" +
    ".ot-search-field{position:relative;flex:1 1 0;min-width:0}" +
    ".ot-search-icon{position:absolute;left:13px;top:50%;width:18px;height:18px;margin-top:-9px;opacity:.5;pointer-events:none}" +
    ".ot-search-form{display:flex;align-items:center;height:48px;margin:0;padding:0 6px 0 40px;border-radius:14px;background:#f2f3f6}" +
    ".ot-search-panel .ot-search-input{flex:1 1 0;min-width:0;width:auto;height:48px;margin:0;padding:0;border:0;border-radius:0;outline:0;background:transparent;box-shadow:none;-webkit-appearance:none;appearance:none;font:inherit;font-size:17px;font-weight:400;color:#0c0e16}" +
    ".ot-search-clear{display:flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;padding:0;margin:0;border:0;background:none;color:#9e9fa2;cursor:pointer}" +
    ".ot-search-clear svg{width:20px;height:20px}" +
    ".ot-search-input:placeholder-shown+.ot-search-clear{display:none}" +
    ".ot-search-panel .ot-search-back{display:flex;align-items:center;flex:none;height:44px;padding:0 8px;color:#3454f6;font-size:16px;font-weight:500;line-height:1;text-decoration:none}" +
    "html.ot-search-open #search-results{z-index:10002!important;margin-top:1.25rem;max-height:calc(100vh - 6.5rem);max-height:calc(100dvh - 6.5rem);overflow-y:auto;overscroll-behavior:contain}" +
    "html.ot-search-open #search-results .srt-menu{padding-left:.5rem}" +
    "html.ot-search-open #search-results .srt-content{border-top:0}" +
    "html.ot-search-open #search-results .search-result{padding:1rem 0 1rem .5rem!important;font-size:1rem!important;line-height:1.5}";
  var LOUPE = "https://cdn.prod.website-files.com/604b9ac88b080efc7ce802bd/6464fa4d45e5736b95f15198_search.svg";
  var CLEAR = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M14 8L8 14M8 8L14 14M21 11C21 16.5228 16.5228 21 11 21C5.47715 21 1 16.5228 1 11C1 5.47715 5.47715 1 11 1C16.5228 1 21 5.47715 21 11Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function dispatchError(err) {
    try { window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err })); }
    catch (e) { setTimeout(function () { throw err; }, 0); }
  }
  // Panne d'un accessoire (mesure) : le rapporteur commun s'il est sur la page.
  function report(err) {
    var r = window.OrdoErrorReporter;
    if (r && typeof r.reportSideEffect === "function") r.reportSideEffect("SearchPanel", err);
    else dispatchError(err);
  }
  function safely(fn) {
    try { fn(); } catch (err) { report(err); }
  }
  function push(payload) {
    var r = window.OrdoErrorReporter;
    if (r && typeof r.track === "function") return r.track(payload);
    try { (window.dataLayer = window.dataLayer || []).push(payload); } catch (err) { report(err); }
  }

  function init() {
    var link = document.getElementById("logo-finder-mobile");
    link = link && link.closest("a");
    var input = document.getElementById("search-bar-nav");
    if (!link || !input || !window.matchMedia) return;
    var mq = window.matchMedia(PORTRAIT);
    if (!mq.matches) return;

    // Tirage fixé une fois par navigateur ; POURCENT = 0 rend la loupe à tous.
    var variant = "page", bucket = "sans_stockage";
    try {
      var n = parseInt(localStorage.getItem("ot_search_bucket"), 10);
      if (!(n >= 0 && n < 100)) {
        n = Math.floor(Math.random() * 100);
        localStorage.setItem("ot_search_bucket", String(n));
      }
      bucket = String(n);
      variant = n < POURCENT ? "panneau" : "page";
    } catch (err) {
      variant = "page"; // stockage refusé : la loupe d'origine
    }
    try { localStorage.setItem("ot_search_variant", variant); } catch (err) { /* lecture de confort seulement */ }

    // Toutes les clés à chaque envoi, même vides, pour qu'aucune valeur d'un
    // envoi précédent ne soit reprise.
    function track(event, params) {
      var payload;
      try {
        payload = {
          event: event, element: "search-panel", rollout_bucket: variant,
          rollout_percent: String(POURCENT), rollout_reason: bucket,
          reason: "", reason_codes: "", failure_reason: "", time_on_page_sec: ""
        };
        for (var k in params) payload[k] = params[k];
      } catch (err) {
        return report(err);
      }
      push(payload);
      safely(function () {
        if (typeof window.clarity !== "function") return;
        var tag = (params.failure_reason || params.reason || "").split(":")[0];
        window.clarity("event", event + (tag ? "_" + tag : ""));
        window.clarity("set", "recherche_panneau", event.replace("search_panel_", "") + (tag ? ":" + tag : ""));
      });
    }

    safely(function () { if (typeof window.clarity === "function") window.clarity("set", "recherche_variante", variant); });
    if (variant !== "panneau") {
      link.addEventListener("click", function () { track("search_panel_open", { reason: "loupe" }); });
      return;
    }

    var home = input.parentNode, next = input.nextSibling, navClasses = input.className, navPlaceholder = input.placeholder;
    var panel = null, form = null, clear = null, back = null;
    var open = false, leaving = false;

    // Construit au premier besoin seulement.
    function build() {
      if (panel) return;
      var style = document.createElement("style");
      style.textContent = CSS;
      document.head.appendChild(style);
      panel = document.createElement("div");
      panel.className = "ot-search-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-label", "Recherche");
      panel.innerHTML =
        '<div class="ot-search-head"><div class="ot-search-field"><img src="' + LOUPE + '" alt="" class="ot-search-icon">' +
        '<form class="ot-search-form" role="search">' +
        '<button type="button" class="ot-search-clear" aria-label="Effacer">' + CLEAR + "</button>" +
        "</form></div>" +
        '<a href="#" class="ot-search-back" aria-label="Fermer la recherche">Annuler</a></div>';
      document.body.appendChild(panel);
      form = panel.querySelector("form");
      clear = panel.querySelector(".ot-search-clear");
      back = panel.querySelector(".ot-search-back");
      // La fermeture garde le nom « fleche » dans la mesure, pour rester comparable.
      back.addEventListener("click", function (e) { e.preventDefault(); requestClose("fleche"); });
      clear.addEventListener("click", function () {
        input.value = "";
        removeResults();
        input.focus();
      });
      // Entrée : le moteur de recherche mène lui-même à la page de résultats.
      form.addEventListener("submit", function (e) { e.preventDefault(); });
    }

    function describe(el) {
      if (!el || !el.tagName) return "rien";
      var raw = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "";
      var cls = String(raw).trim().split(/\s+/).slice(0, 2).join(".");
      return (el.tagName.toLowerCase() + (cls ? "." + cls : "")).slice(0, 60);
    }
    function resultCount() {
      var r = document.getElementById("search-results");
      return r ? r.querySelectorAll(".search-result").length : 0;
    }
    function removeResults() {
      var r = document.getElementById("search-results");
      if (r && r.parentNode) r.parentNode.removeChild(r);
    }

    // Une ouverture du panneau = une séance.
    var S = null, closeReason = null, lastEmptyClose = 0;
    function startSession(origin) {
      S = { t0: Date.now(), origin: origin, typed: false, results: 0, taps: [], refocus: false, arrowTaps: 0,
            reopen: origin === "loupe" && Date.now() - lastEmptyClose < 30000, problems: {} };
      track("search_panel_open", { reason: origin, reason_codes: S.reopen ? "reouverture" : "" });
      requestAnimationFrame(function () { requestAnimationFrame(function () { selfCheck(0); }); });
    }
    function problem(kind, detail, blocking) {
      if (!S || S.problems[kind]) return;
      S.problems[kind] = true;
      track("search_panel_problem", { failure_reason: kind + (detail ? ":" + detail : "") });
      if (blocking) {
        var err = new Error("Recherche mobile : " + kind + (detail ? " (" + detail + ")" : ""));
        err.name = "SearchPanelBlocked";
        dispatchError(err);
      }
    }
    function endSession(outcome) {
      if (!S) return;
      var s = S;
      S = null;
      var results = Math.max(s.results, resultCount());
      var codes = [];
      if (s.typed) codes.push("tape");
      if (s.typed && !results) codes.push("aucun_resultat");
      if (s.reopen) codes.push("reouverture");
      if (s.refocus) codes.push("champ_retouche");
      if (s.arrowTaps > 1) codes.push("fleche_x" + s.arrowTaps);
      for (var k in s.problems) codes.push(k);
      if (s.unchecked) codes.push("controle_impossible");
      track("search_panel_close", { reason: outcome, reason_codes: codes.join(",") || "aucun",
                                    time_on_page_sec: String(Math.round((Date.now() - s.t0) / 1000)) });
      if (outcome === "fleche" || outcome === "retour_telephone" || outcome === "echap") lastEmptyClose = Date.now();
      else if (outcome === "resultat" || outcome === "page_resultats") lastEmptyClose = 0;
    }
    // La flèche et le champ sont-ils vraiment touchables, sur l'écran réel ?
    // Aucun élément sous le point (ou page cachée) : la page n'est pas encore
    // affichée, par exemple restaurée par Safari depuis l'historique. Ce n'est
    // pas un recouvrement : on remesure, puis on le note sans alerte.
    function selfCheck(attempt) {
      if (!open || !S) return;
      var s = S;
      attempt = attempt || 0;
      safely(function () {
        var b = back.getBoundingClientRect();
        var hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        var r = input.getBoundingClientRect();
        var invisible = r.width < 1 || r.height < 1;
        var hit2 = invisible ? null : document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || (!invisible && !hit2) || document.visibilityState === "hidden") {
          if (attempt < 3) return setTimeout(function () { if (open && S === s) selfCheck(attempt + 1); }, 400);
          s.unchecked = true;
          return;
        }
        if (!back.contains(hit)) problem("fleche_recouverte", describe(hit), true);
        if (invisible) return problem("champ_invisible", "", true);
        if (!form.contains(hit2)) problem("champ_recouvert", describe(hit2), true);
      });
    }

    function ours() { return !!(history.state && history.state.otSearch); }
    // Le moteur de recherche doit être branché sur ce champ.
    function engineReady() {
      try { return typeof searchBar !== "undefined" && searchBar === input; }
      catch (err) { return false; }
    }
    function show(origin) {
      if (open) return;
      build();
      try {
        form.insertBefore(input, clear);
      } catch (err) {
        return report(err);
      }
      open = true;
      input.className = "ot-search-input";
      input.placeholder = "Chercher";
      panel.classList.add("is-open");
      document.documentElement.classList.add("ot-search-open");
      startSession(origin);
    }
    function hide() {
      if (!open) return;
      var reason = closeReason || "retour_telephone";
      closeReason = null;
      // Le champ perd le focus avant d'être vidé : la recherche abandonnée reste comptée.
      safely(function () { input.blur(); });
      open = false;
      panel.classList.remove("is-open");
      document.documentElement.classList.remove("ot-search-open");
      safely(function () { endSession(reason); });
      removeResults();
      if (reason !== "rotation") input.value = "";
      input.className = navClasses;
      input.placeholder = navPlaceholder;
      try {
        home.insertBefore(input, next && next.parentNode === home ? next : null);
      } catch (err) {
        report(err);
      }
    }
    // Toute fermeture passe par l'historique : une entrée ajoutée à l'ouverture,
    // retirée à la fermeture.
    function requestClose(reason) {
      closeReason = reason;
      if (ours()) history.back();
      else hide();
    }
    // Retour sur une entrée du panneau (historique, rechargement) : rouvert
    // seulement si le moteur est branché, au plus tard au chargement complet.
    function restore() {
      if (!ours() || open) return;
      if (engineReady()) return show("retour");
      if (document.readyState === "complete") return;
      window.addEventListener("load", function onLoad() {
        window.removeEventListener("load", onLoad);
        if (ours() && !open && engineReady() && mq.matches) show("retour");
      });
    }

    link.addEventListener("click", function (e) {
      if (!engineReady()) {
        track("search_panel_open", { reason: "repli" }); // la loupe garde son lien
        return;
      }
      e.preventDefault();
      show("loupe");
      if (!open) return;
      input.focus();
      if (!ours()) history.pushState({ otSearch: 1 }, "");
    });
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") requestClose("echap"); });
    window.addEventListener("popstate", function () { if (ours()) restore(); else hide(); });
    window.addEventListener("pageshow", function () { leaving = false; if (ours()) restore(); else hide(); });
    window.addEventListener("pagehide", function () { leaving = true; });
    // Passage en paysage : le panneau n'est prévu que pour le portrait ; le champ
    // retourne dans l'entête, visible à cette largeur, avec ce qui a été tapé.
    function onViewport() { if (open && !mq.matches) requestClose("rotation"); }
    if (mq.addEventListener) mq.addEventListener("change", onViewport);
    else if (mq.addListener) mq.addListener(onViewport);

    document.addEventListener("pointerdown", function (e) {
      if (!open || !S) return;
      safely(function () {
        var b = back.getBoundingClientRect();
        var inArrowBox = e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
        // Recouverte = l'appui tombe sur autre chose que le panneau.
        if (inArrowBox && !panel.contains(e.target)) problem("fleche_recouverte", describe(e.target), true);
        if (back.contains(e.target)) S.arrowTaps++;
        if (e.target === input && !S.typed) S.refocus = true;
        var now = Date.now(), x = e.clientX, y = e.clientY;
        S.taps = S.taps.filter(function (t) { return now - t[0] < 800; });
        S.taps.push([now, x, y]);
        var near = S.taps.filter(function (t) { return Math.abs(t[1] - x) < 30 && Math.abs(t[2] - y) < 30; });
        if (near.length >= 3) problem("appuis_rageurs", describe(e.target), false);
      });
    }, true);
    document.addEventListener("click", function (e) {
      if (!open || !S || !e.target.closest) return;
      if (e.target.closest("#search-results .search-result")) return safely(function () { endSession("resultat"); });
      // Un vrai clic sur la flèche doit fermer. Seulement pour une séance ouverte
      // par la loupe dans cette page : son retour d'historique est immédiat.
      if (back.contains(e.target) && S.origin === "loupe") {
        var s = S;
        setTimeout(function () { if (open && S === s && !leaving) problem("fermeture_sans_effet", "", true); }, 1500);
      }
    }, true);
    input.addEventListener("keydown", function (e) {
      if (open && S && e.key === "Enter" && input.value.trim()) safely(function () { endSession("page_resultats"); });
    }, true);
    var countTimer;
    input.addEventListener("input", function () {
      if (!open || !S) return;
      S.typed = true;
      clearTimeout(countTimer);
      countTimer = setTimeout(function () {
        safely(function () { if (S) S.results = Math.max(S.results, resultCount()); });
      }, 900);
    });
    document.addEventListener("visibilitychange", function () {
      if (!open) return;
      if (document.visibilityState === "hidden") safely(function () { endSession("quitte"); });
      else if (!S) safely(function () { startSession("reprise"); });
    });
    window.__otSearchPanelOpen = function () { return open; };

    restore();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { safely(init); });
  else safely(init);
})();
