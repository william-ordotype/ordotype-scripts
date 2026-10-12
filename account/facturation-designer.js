/**
 * Ordotype Account - Facturation dessinée dans le Designer (marqueur de palier)
 *
 * Ce fichier ne fait rien : sa présence dans le chargeur crée la décision
 * window.OrdoRollout['facturation-designer.js'], que lisent subscriptions-overview.js
 * et invoice-emails.js. Décision active : ils remplissent les éléments de l'onglet
 * Facturation dessinés dans Webflow ([data-ordo-facturation] et le bloc de gabarits
 * [data-ordo-gabarits="facturation"]) au lieu de construire leur propre présentation.
 *
 * Monter le palier = modifier le pourcentage dans account/loader.js, fusionner,
 * déplacer l'épingle du pied de page de Mon compte, publier.
 */
(function() {
  'use strict';
  window.OrdoFacturationDesigner = true;
})();
