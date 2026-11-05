/**
 * Ligne « Mot de passe » de Connexion et sécurité telle que le Designer la dessinera (planche B du 05/11/2026) :
 * deux contenus que Memberstack départage. `has-password` : les points et « Modifier », comme aujourd'hui.
 * `!has-password` (compte Google sans mot de passe) : badge « Non défini », texte « Facultatif : … » et
 * « Ajouter un mot de passe », qui ouvre le même formulaire. À appliquer sur la page servie (compte-servie.html).
 */
const { JSDOM } = require('jsdom');

module.exports = function motDePasseFacultatif(fixture) {
  const d = new JSDOM(`<body>${fixture}</body>`).window.document;
  const slot = d.querySelector('[data-ordo-v2="securite"] [data-ordo-form-slot="password"]');
  if (!slot) throw new Error('emplacement du mot de passe introuvable');
  const ligne = slot.closest('.compte-v2_ligne-bloc').querySelector('.compte-v2_ligne');
  ligne.querySelector('.compte-v2_ligne-titre').insertAdjacentHTML('beforeend',
    ' <span data-ms-content="!has-password" class="compte-v2_badge">Non défini</span>');
  const points = ligne.querySelector('.compte-v2_ligne-texte .compte-v2_muted');
  points.setAttribute('data-ms-content', 'has-password');
  points.insertAdjacentHTML('afterend', '<div data-ms-content="!has-password" class="compte-v2_muted">'
    + 'Facultatif : pour vous connecter aussi avec votre adresse e-mail, et pour pouvoir dissocier Google.</div>');
  const modifier = ligne.querySelector('[data-ordo-edit="password"]');
  modifier.setAttribute('data-ms-content', 'has-password');
  modifier.insertAdjacentHTML('afterend',
    '<a href="#" data-ordo-edit="password" data-ms-content="!has-password" class="compte-v2_btn">Ajouter un mot de passe</a>');
  return d.body.innerHTML;
};
