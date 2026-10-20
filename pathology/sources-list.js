/**
 * Ordotype Pathology - Sources List
 * Handles "Sources et recommandations" section with show more functionality.
 * Vanilla DOM — must not depend on jQuery (survives jQuery CDN failure).
 */
(function() {
  'use strict';

  // jQuery-.show()-alike: clear an inline "none"; if a stylesheet still
  // hides the element, force block.
  function show(el) {
    if (el.style.display === 'none') el.style.display = '';
    if (window.getComputedStyle(el).display === 'none') el.style.display = 'block';
  }

  function clean(text) {
    return text.replace(/[\s​-‍﻿]+/g, ' ').trim();
  }

  // Auteur d'une source : l'infobulle montre sa description, le lien son url.
  // Sans description (surtout des personnes : « Konstantinos G. Kyriakoulis,
  // et al. »), une bulle noire vide s'affichait au survol ; sans url, href=""
  // rouvrait la fiche dans un nouvel onglet. On retire la bulle vide ou qui
  // répète le nom, et le lien vide.
  function cleanAuthors() {
    document.querySelectorAll('.auteur-ref-html').forEach(function(author) {
      const link = author.querySelector('a');
      if (link && !link.getAttribute('href')) {
        link.removeAttribute('href');
        link.removeAttribute('target');
      }

      const tooltip = author.querySelector('.tooltip');
      const tip = tooltip && tooltip.querySelector('.tooltiptext');
      if (!tip) return;
      const text = clean(tip.textContent);
      const name = clean(tooltip.textContent.replace(tip.textContent, ''));
      if (!text || text === name) tip.remove();
    });
  }

  function init() {
    cleanAuthors();

    const list = document.querySelector('.collection-list.w-dyn-items');
    const items = Array.prototype.slice
      .call(document.querySelectorAll('.collection-item-11.w-dyn-item'))
      .sort(function(a, b) {
        return Number(b.getAttribute('data-year')) - Number(a.getAttribute('data-year'));
      });
    const seeMoreBtn = document.getElementById('see-more-button');
    const sourcesSection = document.getElementById('sources-et-recos');

    // Reorder items by year (descending) — appendChild moves the node,
    // so appending in sorted order reorders the list in place.
    items.forEach(function(el) {
      el.style.display = 'none';
      if (list) list.appendChild(el);
    });

    // Show first 3 items
    items.slice(0, 3).forEach(show);

    // Toggle see more button
    if (items.length > 3) {
      if (sourcesSection) sourcesSection.classList.add('no-padding-bottom');
      if (seeMoreBtn) show(seeMoreBtn);
    } else {
      if (seeMoreBtn) seeMoreBtn.style.display = 'none';
    }

    // Handle see more click
    if (seeMoreBtn) {
      seeMoreBtn.addEventListener('click', function() {
        items.forEach(show);
        seeMoreBtn.style.display = 'none';
        if (sourcesSection) sourcesSection.classList.remove('no-padding-bottom');
      });
    }

    console.log('[SourcesList] Initialized with', items.length, 'items');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
