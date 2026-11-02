/**
 * Onglet « Connexion et sécurité » tel qu'il sera dessiné sans anciens blocs : chaque pièce qui
 * fonctionne (formulaires Memberstack e-mail et mot de passe, bouton Google, module de double
 * authentification, formulaire de suppression) est posée directement à sa place dans la nouvelle
 * présentation, le bouton Google remplaçant est retiré, et les blocs « is-secours » de l'onglet
 * disparaissent. Construit à partir de la vraie structure servie (compte-profil-securite.html).
 */
const { JSDOM } = require('jsdom');

module.exports = function securiteDirecte(fixture) {
  const d = new JSDOM(`<body>${fixture}</body>`).window.document;
  const tab = d.querySelector('.w-tab-pane[data-w-tab="security"]');
  const v2 = tab.querySelector('[data-ordo-v2="securite"]');
  const anciens = tab.querySelectorAll('.inner-block-wraper.is-secours');
  const piece = (sel) => {
    for (const b of anciens) {
      const el = b.querySelector(sel);
      if (el) return el;
    }
    throw new Error('pièce introuvable : ' + sel);
  };
  const bloc = (form) => form.closest('.w-form') || form;

  const google = piece('[data-ms-auth="manage-providers"]');
  const remplacant = v2.querySelector('[data-ordo-google]');
  remplacant.parentNode.replaceChild(google, remplacant);
  v2.querySelector('[data-ordo-form-slot="email"]').appendChild(bloc(piece('form[data-ms-form="email"]')));
  v2.querySelector('[data-ordo-form-slot="password"]').appendChild(bloc(piece('form[data-ms-form="password"]')));
  v2.querySelector('[data-ordo-totp-slot]').appendChild(piece('#ordotype-totp-section'));
  v2.querySelector('[data-ordo-form-slot="suppression"]').appendChild(piece('#delete-account-form-v2'));
  // Adresse affichée par Memberstack lui-même : lisible même sans le script.
  v2.querySelector('[data-ordo-champ="email"]').setAttribute('data-ms-member', 'email');
  // Bouton « Supprimer » de la carte repris par delete-account.js (id de l'ancien bouton) : il s'ouvre aussi en secours.
  v2.querySelector('[data-ordo-supprimer]').id = 'delete-account-btn';
  for (const b of anciens) b.remove();
  return d.body.innerHTML;
};
