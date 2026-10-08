// Recherche mobile : la loupe de l'entête ouvre un panneau de recherche sur place,
// sans changer de page. Le champ de l'entête y est déplacé, la recherche garde donc
// son fonctionnement. Sans ce script, la loupe mène à /search-result.
(function () {
  var POURCENT = 100;
  var PORTRAIT = "(max-width: 479px)";

  // Le panneau est un élément du Designer (composant Navbar, classes search-panel_*,
  // caché tant qu'il n'a pas la combo is-open) : son dessin se règle dans Webflow et
  // le canvas montre le vrai rendu. Ce script ne fait que l'ouvrir, le fermer, y
  // déplacer le champ de l'entête et mesurer. Restent ici les règles que le Designer
  // ne sait pas exprimer :
  // - la croix n'apparaît que s'il y a du texte (:placeholder-shown) ;
  // - le champ perd l'apparence native du navigateur (appearance) ;
  // - l'anneau de focus de la croix, bouton d'un embed ;
  // - la liste des résultats, créée par le moteur, est posée sous l'en-tête
  //   (8 + 48 + 5 px) : il la place d'après le champ au moment où il la crée,
  //   ce qui peut tomber pendant un défilement de l'écran (clavier, retour dans
  //   Safari). Sans dvh, 100vh inclut la barre du navigateur : la marge sous la
  //   liste reste celle d'avant, pour que les derniers résultats restent atteignables.
  var CSS =
    ".search-panel_input:placeholder-shown+.search-panel_clear{display:none}" +
    ".search-panel_component .search-panel_input{-webkit-appearance:none;appearance:none}" +
    ".search-panel_component.is-open{overscroll-behavior:contain}" +
    ".search-panel_clear-button:focus-visible{outline:2px solid var(--primary-500,#3454f6);outline-offset:2px}" +
    "html.ot-search-open #search-results{z-index:10002!important;top:61px!important;margin-top:1.25rem;max-height:calc(100vh - 11rem);max-height:calc(100dvh - 6.5rem);overflow-y:auto;overscroll-behavior:contain}" +
    "html.ot-search-open #search-results .srt-menu{padding-left:.5rem}" +
    "html.ot-search-open #search-results .srt-content{border-top:0}" +
    "html.ot-search-open #search-results .search-result{padding:1rem 0 1rem .5rem!important;font-size:1rem!important;line-height:1.5}";

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

    // Repère pour séparer les enregistrements selon la version de l'en-tête.
    safely(function () { if (typeof window.clarity === "function") window.clarity("set", "recherche_entete", "designer"); });

    var home = input.parentNode, next = input.nextSibling, navClasses = input.className, navPlaceholder = input.placeholder;
    var navEnterHint = input.getAttribute("enterkeyhint");
    // Le panneau du Designer et ses pièces ; s'il manque, la loupe garde son lien.
    var panel = document.querySelector(".search-panel_component");
    var form = panel && panel.querySelector(".search-panel_form");
    var clear = panel && panel.querySelector(".search-panel_clear");
    var back = panel && panel.querySelector(".search-panel_back");
    var field = panel && panel.querySelector(".search-panel_field");
    var guard = null, built = false;
    var open = false, leaving = false;
    function panelReady() { return !!(panel && form && clear && back && field && clear.parentNode === form); }

    // Préparé au premier besoin seulement : posé en fin de page (au-dessus de
    // l'entête, z-index du Designer), aperçu de l'invite retiré, écoutes posées.
    function build() {
      if (built) return;
      built = true;
      var style = document.createElement("style");
      style.textContent = CSS;
      document.head.appendChild(style);
      if (panel.parentNode !== document.body) document.body.appendChild(panel);
      var preview = form.querySelector(".is-preview");
      if (preview && preview.parentNode) preview.parentNode.removeChild(preview);
      var clearButton = clear.querySelector("button") || clear;
      // La flèche ferme le panneau (raison « fleche » dans la mesure).
      back.addEventListener("click", function (e) { e.preventDefault(); requestClose("fleche"); });
      clearButton.addEventListener("click", function () {
        input.value = "";
        removeResults();
        input.focus();
      });
      // Tout le champ est cliquable, loupe et marges comprises.
      field.addEventListener("click", function (e) {
        if (e.target !== input && !clear.contains(e.target)) input.focus();
      });
      // Une réponse du moteur arrivée après l'effacement ne doit pas réafficher
      // de résultats sous un champ vide.
      if (window.MutationObserver) {
        guard = new MutationObserver(function () {
          if (open && !input.value.trim()) removeResults();
        });
      }
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
      if (s.resynced) codes.push("panneau_remis");
      track("search_panel_close", { reason: outcome, reason_codes: codes.join(",") || "aucun",
                                    time_on_page_sec: String(Math.round((Date.now() - s.t0) / 1000)) });
      if (outcome === "fleche" || outcome === "retour_telephone" || outcome === "echap") lastEmptyClose = Date.now();
      else if (outcome === "resultat" || outcome === "page_resultats") lastEmptyClose = 0;
    }
    // Écran décalé ou zoomé (clavier qui réapparaît au retour dans Safari, zoom
    // du doigt) : les points mesurés ne correspondent plus à ce qui est affiché.
    function viewportShifted() {
      var vv = window.visualViewport;
      return !!vv && (vv.offsetTop > 1 || vv.scale > 1.01);
    }
    // La flèche et le champ sont-ils vraiment touchables, sur l'écran réel ?
    // Aucun élément sous le point, page cachée ou écran décalé : la page n'est
    // pas encore affichée ou pas encore stable, par exemple restaurée par Safari
    // depuis l'historique ou au retour d'une autre appli. Ce n'est pas un
    // recouvrement : on remesure, puis on le note sans alerte.
    // Panneau ouvert d'après l'état mais plus à l'écran (vu au retour par
    // l'historique sur Android, page restaurée sans « ot-search-open », champ de
    // taille nulle) : ce n'est pas un recouvrement non plus. On le remet en place,
    // puis on remesure.
    function selfCheck(attempt) {
      if (!open || !S) return;
      var s = S;
      attempt = attempt || 0;
      safely(function () {
        if (!shown()) {
          resync();
          if (attempt < 3) return setTimeout(function () { if (open && S === s) selfCheck(attempt + 1); }, 400);
          s.unchecked = true;
          return;
        }
        var b = back.getBoundingClientRect();
        var hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        var r = input.getBoundingClientRect();
        var invisible = r.width < 1 || r.height < 1;
        var hit2 = invisible ? null : document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || (!invisible && !hit2) || document.visibilityState === "hidden" || viewportShifted()) {
          if (attempt < 3) return setTimeout(function () { if (open && S === s) selfCheck(attempt + 1); }, 400);
          s.unchecked = true;
          return;
        }
        if (!back.contains(hit)) problem("fleche_recouverte", describe(hit), true);
        if (invisible) return problem("champ_invisible", "", true);
        if (!form.contains(hit2)) problem("champ_recouvert", describe(hit2), true);
      });
    }

    // Le panneau est-il à l'écran : classes en place, champ dedans, boîte non vide ?
    function shown() {
      if (!panel) return false;
      var p = panel.getBoundingClientRect();
      return panel.classList.contains("is-open") && document.documentElement.classList.contains("ot-search-open") &&
        panel.parentNode === document.body && input.parentNode === form && p.width >= 1 && p.height >= 1;
    }
    // Remet à l'écran un panneau ouvert d'après l'état ; sans cela la loupe ne
    // ferait plus rien (show() ne rouvre pas un panneau déjà ouvert).
    // Noté « panneau_remis » à la fermeture seulement si quelque chose manquait.
    function resync() {
      safely(function () {
        var html = document.documentElement, changed = false;
        if (panel.parentNode !== document.body) { document.body.appendChild(panel); changed = true; }
        if (input.parentNode !== form) { form.insertBefore(input, clear); changed = true; }
        if (input.className !== "search-panel_input") { input.className = "search-panel_input"; changed = true; }
        if (!panel.classList.contains("is-open")) { panel.classList.add("is-open"); changed = true; }
        if (!html.classList.contains("ot-search-open")) { html.classList.add("ot-search-open"); changed = true; }
        if (changed && S) S.resynced = true;
      });
    }

    function ours() { return !!(history.state && history.state.otSearch); }
    // Le moteur de recherche doit être branché sur ce champ, et le panneau du
    // Designer présent sur la page.
    function engineReady() {
      if (!panelReady()) return false;
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
      input.className = "search-panel_input";
      input.placeholder = "Rechercher"; // comme sur ordinateur
      input.setAttribute("enterkeyhint", "search"); // touche « Rechercher » du clavier
      if (guard) guard.observe(document.body, { childList: true });
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
      if (guard) guard.disconnect();
      removeResults();
      if (reason !== "rotation") input.value = "";
      input.className = navClasses;
      input.placeholder = navPlaceholder;
      if (navEnterHint === null) input.removeAttribute("enterkeyhint");
      else input.setAttribute("enterkeyhint", navEnterHint);
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
      // Panneau ouvert d'après l'état mais effacé de l'écran : la loupe le remet.
      if (open && !shown()) {
        resync();
        if (!S) { startSession("loupe"); if (S) S.resynced = true; }
      }
      show("loupe");
      if (!open) return;
      input.focus();
      if (!ours()) history.pushState({ otSearch: 1 }, "");
    });
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") requestClose("echap"); });
    window.addEventListener("popstate", function () { if (ours()) restore(); else hide(); });
    window.addEventListener("pageshow", function () {
      leaving = false;
      if (!ours()) return hide();
      restore();
      if (open && !shown()) resync(); // page restaurée sans le panneau à l'écran
    });
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
        if (inArrowBox && !panel.contains(e.target) && !viewportShifted()) problem("fleche_recouverte", describe(e.target), true);
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
    // Entrée : page de résultats avec la requête encodée (« & », « # », « % »).
    // Traité avant le moteur de recherche, qui ne l'encode pas ; un résultat
    // choisi au clavier (flèches) reste ouvert par le moteur. Champ vide : rien.
    document.addEventListener("keydown", function (e) {
      if (!open || e.key !== "Enter" || e.target !== input || e.isComposing) return;
      if (document.querySelector("#search-results .autocomplete-active")) return;
      e.preventDefault();
      e.stopPropagation();
      var q = input.value.trim();
      if (!q) return;
      safely(function () { endSession("page_resultats"); });
      window.location.href = window.location.origin + "/search-result?query=" + encodeURIComponent(q) + "&page=1";
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
