/**
 * Onglet « Mon profil » tel qu'il sera dessiné sans anciens blocs : les trois formulaires Memberstack
 * (Personnel, Professionnel, Contact) posés dans les emplacements de leurs cartes, les valeurs lues par
 * Memberstack lui-même (data-ms-member, « Non renseigné » écrit dans le Designer), et les blocs
 * « is-secours » de l'onglet supprimés. À appliquer sur la structure servie (compte-profil-securite.html).
 */
const { JSDOM } = require('jsdom');

const FORMULAIRES = { perso: 'profile-tab-1', pro: 'profile-tab-2', contact: 'profile-tab-3' };
// Repère de la carte → champ Memberstack ; l'e-mail est lu dans auth par Memberstack.
const CHAMPS = ['prnom', 'nom', 'statut', 'specialite', 'mode-dexercice', 'n-rpps', 'phone', 'country', 'email'];

module.exports = function profilDirecte(fixture) {
  const d = new JSDOM(`<body>${fixture}</body>`).window.document;
  const tab = d.querySelector('.w-tab-pane[data-w-tab="information"]');
  const v2 = tab.querySelector('[data-ordo-v2="profil"]');
  for (const [section, id] of Object.entries(FORMULAIRES)) {
    const form = d.getElementById(id);
    if (!form) throw new Error('formulaire introuvable : ' + id);
    v2.querySelector(`[data-ordo-form-slot="${section}"]`).appendChild(form.closest('.w-form') || form);
  }
  for (const name of CHAMPS) {
    const el = v2.querySelector(`[data-ordo-champ="${name}"]`);
    if (!el) continue;
    el.setAttribute('data-ms-member', name);
    el.textContent = 'Non renseigné';
  }
  for (const b of tab.querySelectorAll('.inner-block-wraper.is-secours')) b.remove();
  return d.body.innerHTML;
};
