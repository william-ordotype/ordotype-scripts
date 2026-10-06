// Page /search-result : la flèche de l'en-tête (.search-back-button) revenait
// en arrière avec « javascript:history.back() ». Sans page précédente (lien
// ouvert depuis un mail ou une conversation, nouvel onglet, adresse tapée),
// elle ne faisait rien. Désormais : retour à la page précédente quand elle
// est sur le site, sinon l'accueil.
(function () {
  function init() {
    var links = document.querySelectorAll(".search-back-button");
    for (var i = 0; i < links.length; i++) wire(links[i]);
  }
  function cameFromSite() {
    var ref = document.referrer || "";
    return history.length > 1 && ref.indexOf(location.origin + "/") === 0;
  }
  function wire(a) {
    a.setAttribute("href", "/");
    a.addEventListener("click", function (e) {
      if (!cameFromSite()) return; // le lien mène à l'accueil
      e.preventDefault();
      history.back();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
