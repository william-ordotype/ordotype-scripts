/**
 * Ordotype Pathology - Prefetch
 * Précharge en arrière-plan les pages d'ordonnance et de conseil patient que le
 * membre va probablement ouvrir dans le cadre de la fiche :
 *   - les premières lignes visibles quand un onglet (ou sous-onglet) s'ouvre ;
 *   - la ligne survolée à la souris ou touchée au doigt, en priorité.
 *
 * Pourquoi : une page qui n'est plus dans le cache du CDN (par exemple après une
 * publication du site) vient du serveur d'origine en 0,5 à 1,5 s, contre moins
 * de 0,1 s depuis le cache. Préchargée avant le clic, elle est déjà dans le
 * cache du CDN, et souvent dans celui du navigateur : le cadre l'affiche sans
 * attendre.
 *
 * Retenue : au plus MAX_PAR_ONGLET pages par onglet ouvert, EN_PARALLELE
 * téléchargements à la fois, chaque page une seule fois par visite. Rien quand
 * le paywall est affiché (le cadre ne s'ouvre pas), et seulement la ligne
 * survolée quand le navigateur demande d'économiser les données.
 * Depends on: rien (vanilla).
 */
(function() {
  'use strict';

  var MAX_PAR_ONGLET = 8;
  var EN_PARALLELE = 2;
  var DELAI_ONGLET_MS = 300;
  var LIGNE = '.pathologies_tab .content-item[data-iframe-id]';

  var dejaDemandees = {};
  var file = [];
  var enCours = 0;

  function paywallAffiche() {
    var p = document.querySelector('.rappels-cliniques-content .rc_hidden_warning_wrapper');
    return !!p && window.getComputedStyle(p).display === 'block';
  }

  function economieDeDonnees() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  }

  // Une ligne est affichée si elle n'est pas masquée par une condition Webflow
  // et si tous les onglets qui la contiennent sont actifs (classe w--tab-active).
  function ligneAffichee(ligne) {
    if (ligne.closest('.w-condition-invisible')) return false;
    var p = ligne.parentElement;
    while (p) {
      if (p.classList && p.classList.contains('w-tab-pane') && !p.classList.contains('w--tab-active')) return false;
      p = p.parentElement;
    }
    return true;
  }

  // Même source que iframe-handler.js : l'embed .iframe-meta, sinon la ligne.
  function adresse(ligne) {
    var source = ligne.querySelector('.iframe-meta') || ligne;
    var slug = source.getAttribute('data-iframe-slug');
    var collection = source.getAttribute('data-collection-slug');
    if (!slug || !collection) return null;
    return window.location.origin + '/' + collection + '/' + slug;
  }

  var prefetchNatif = (function() {
    try {
      var l = document.createElement('link');
      return !!(l.relList && l.relList.supports && l.relList.supports('prefetch'));
    } catch (e) {
      return false;
    }
  })();

  function telecharger(url, fini) {
    try {
      if (prefetchNatif) {
        var lien = document.createElement('link');
        lien.rel = 'prefetch';
        lien.href = url;
        lien.onload = fini;
        lien.onerror = fini;
        document.head.appendChild(lien);
      } else if (window.fetch) {
        window.fetch(url, { credentials: 'same-origin' })
          .then(function(r) { return r.text(); })
          .catch(function() {})
          .then(fini);
      } else {
        fini();
      }
    } catch (e) {
      fini();
    }
  }

  function suivant() {
    while (enCours < EN_PARALLELE && file.length) {
      var url = file.shift();
      enCours++;
      telecharger(url, function() {
        enCours--;
        suivant();
      });
    }
  }

  function prechargerAdresse(url, prioritaire) {
    if (!url || dejaDemandees[url]) return false;
    dejaDemandees[url] = true;
    if (prioritaire) file.unshift(url); else file.push(url);
    suivant();
    return true;
  }

  function prechargerOngletOuvert() {
    if (paywallAffiche() || economieDeDonnees()) return;
    var lignes = document.querySelectorAll(LIGNE);
    var n = 0;
    for (var i = 0; i < lignes.length && n < MAX_PAR_ONGLET; i++) {
      if (!ligneAffichee(lignes[i])) continue;
      if (prechargerAdresse(adresse(lignes[i]), false)) n++;
    }
  }

  function surLigne(ev) {
    var cible = ev.target;
    var ligne = cible && cible.closest ? cible.closest(LIGNE) : null;
    if (!ligne || paywallAffiche()) return;
    prechargerAdresse(adresse(ligne), true);
  }

  document.addEventListener('mouseover', surLigne, { passive: true });
  document.addEventListener('touchstart', surLigne, { passive: true });

  document.addEventListener('click', function(ev) {
    var cible = ev.target;
    if (cible && cible.closest && cible.closest('.pathologies_tab .w-tab-link')) {
      setTimeout(prechargerOngletOuvert, DELAI_ONGLET_MS);
    }
  }, true);

  // Un onglet peut déjà être ouvert au chargement (ancre, script d'onglets).
  function auRepos() {
    if (window.requestIdleCallback) window.requestIdleCallback(prechargerOngletOuvert, { timeout: 3000 });
    else setTimeout(prechargerOngletOuvert, 1500);
  }
  if (document.readyState === 'complete') auRepos();
  else window.addEventListener('load', auRepos);

  console.log('[Prefetch] Initialized');
})();
