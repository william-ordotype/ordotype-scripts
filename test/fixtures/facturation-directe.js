/**
 * Onglet « Facturation » tel qu'il sera dessiné sans anciens blocs : dans la carte « Mes abonnements », le
 * texte d'attente et le lien natif Memberstack vers le portail Stripe ([data-ordo-attente]) ; l'ancrage de
 * l'interrupteur « factures par e-mail » posé dans son emplacement de la carte Factures ; les blocs
 * « is-secours » de l'onglet supprimés. À appliquer sur la structure servie (compte-facturation.html ou
 * compte-profil-securite.html).
 */
const { JSDOM } = require('jsdom');

const ATTENTE = '<div data-ordo-attente="1" class="compte-v2_attente">'
  + '<div data-ordo-champ="attente-texte" class="compte-v2_muted">Chargement de vos abonnements…</div>'
  + '<a href="#" data-ms-action="customer-portal" data-ordo-champ="attente-portail" class="compte-v2_lien is-seul">Gérer ma facturation</a>'
  + '</div>';

module.exports = function facturationDirecte(fixture) {
  const d = new JSDOM(`<body>${fixture}</body>`).window.document;
  const tab = d.querySelector('.w-tab-pane[data-w-tab="billing"]');
  const liste = tab.querySelector('[data-ordo-section="abonnements"] [data-ordo-liste="abonnements"]');
  liste.insertAdjacentHTML('afterend', ATTENTE);
  const ancre = d.getElementById('ordotype-invoice-emails');
  if (!ancre) throw new Error('ancrage introuvable : ordotype-invoice-emails');
  tab.querySelector('[data-ordo-slot="factures-email"]').appendChild(ancre.closest('.w-embed') || ancre);
  for (const b of tab.querySelectorAll('.inner-block-wraper.is-secours')) b.remove();
  return d.body.innerHTML;
};
