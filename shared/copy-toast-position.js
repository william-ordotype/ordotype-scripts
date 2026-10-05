/**
 * Ordotype - Copy Toast Position (Shared)
 * Place le message « copiée » au milieu de la partie visible du cadre copié,
 * sur les ordonnances et les conseils patients. Sans ce script, la feuille de
 * style de la page le laisse en bas de l'écran.
 *
 * Usage in Webflow:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/copy-toast-position.js"></script>
 */
(function() {
  'use strict';

  var TRIGGERS = '#copy-button, #copy-button-fcp, [data-ordo-copy="trigger"]';
  // Demi-hauteur du message plus une marge, pour qu'il ne touche pas le bord.
  var EDGE = 40;

  function firstRendered(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.getClientRects().length) return el;
    }
    return null;
  }

  function boxFor(trigger) {
    if (trigger.id === 'copy-button-fcp') return firstRendered(['printableArea']);
    return firstRendered(['ordo-to-be-copied', 'printableArea_CP', 'printableArea_CP_AR']);
  }

  // Bande verticale réellement visible. Dans le cadre d'une fiche, la page
  // peut dépasser de l'écran : on la coupe à ce que montre la page parente.
  function visibleBand() {
    var top = 0;
    var bottom = window.innerHeight;
    try {
      var frame = window.frameElement;
      if (frame) {
        var r = frame.getBoundingClientRect();
        top = Math.max(top, -r.top);
        bottom = Math.min(bottom, window.parent.innerHeight - r.top);
      }
    } catch (e) {}
    return { top: top, bottom: bottom };
  }

  function place(trigger) {
    var container = document.querySelector('.toast_component.centered');
    var box = boxFor(trigger);
    if (!container || !box) return;

    var r = box.getBoundingClientRect();
    var band = visibleBand();
    var visTop = Math.max(r.top, band.top);
    var visBottom = Math.min(r.bottom, band.bottom);
    var y = visTop < visBottom ? (visTop + visBottom) / 2 : (r.top + r.bottom) / 2;
    y = Math.min(Math.max(y, band.top + EDGE), band.bottom - EDGE);

    var s = container.style;
    s.top = Math.round(y) + 'px';
    s.bottom = 'auto';
    s.left = Math.max(0, Math.round(r.left)) + 'px';
    s.right = Math.max(0, Math.round(document.documentElement.clientWidth - r.right)) + 'px';
    s.transform = 'translateY(-50%)';
  }

  // Phase de capture : la position est posée avant que copy-handler.js
  // n'affiche le message.
  document.addEventListener('click', function(e) {
    var trigger = e.target && e.target.closest && e.target.closest(TRIGGERS);
    if (!trigger) return;
    try {
      place(trigger);
    } catch (err) {
      // Le message reste en bas de l'écran ; la copie n'est pas touchée.
      try {
        if (window.OrdoErrorReporter && window.OrdoErrorReporter.reportSideEffect) {
          window.OrdoErrorReporter.reportSideEffect('CopyToastPosition', err);
          return;
        }
        var e2 = err instanceof Error ? err : new Error(String(err));
        window.dispatchEvent(new ErrorEvent('error', { message: 'CopyToastPosition: ' + e2.message, error: e2 }));
      } catch (ignored) {}
    }
  }, true);
})();
