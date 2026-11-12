/**
 * Probleme de Paiement - Access Guard
 * Redirects users who shouldn't be on this page:
 * - Non-logged users -> homepage
 * - Users without REQUIRES_PAYMENT status -> homepage
 * - Users with SEPA temporary plan -> homepage
 *
 * Le garde ne pose AUCUN plan. La brique past due veut dire « le membre a choisi
 * de continuer avec un accès limité » : l'accueil et les fiches ne le renvoient
 * plus ici au prochain impayé. Elle ne se pose que par le bouton de la page
 * (`data-ms-plan:add`), jamais à la place du membre. La poser ici à un membre à
 * jour (vieux lien de relance, prélèvement SEPA en route) le privait de ce renvoi
 * pour la suite, et rien ne la retirait ensuite.
 * L'aller-retour accueil ↔ cette page est coupé par le repère `paymentPageSeenTs`
 * (posé par loader.js à l'affichage, lu par isPaymentPageSeenRecently dans
 * shared/memberstack-utils.js), pas par ce garde.
 *
 * Must be loaded in header (blocking) to redirect before page renders.
 *
 * Usage in Webflow header:
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement/access-guard.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[AccessGuard]';
    const SEPA_TEMPORARY_PLAN_ID = 'pln_sepa-temporary-lj4w0oky';

    document.addEventListener('DOMContentLoaded', function() {
        const memberstack = window.$memberstackDom;

        if (!memberstack) {
            console.error(PREFIX, 'Memberstack not found');
            return;
        }

        memberstack.getCurrentMember().then(({ data: member }) => {
            if (!member) {
                console.log(PREFIX, 'No member found, redirecting to homepage');
                window.location.href = '/';
                return;
            }

            const planConnections = member.planConnections || [];

            // Check if any plan has status 'REQUIRES_PAYMENT'
            const hasPastDuePlan = planConnections.some(plan => plan.status === 'REQUIRES_PAYMENT');

            // Check if user has SEPA temporary plan
            const isSepaTemporary = planConnections.some(plan => plan.planId === SEPA_TEMPORARY_PLAN_ID);

            if (!hasPastDuePlan || isSepaTemporary) {
                console.log(PREFIX, 'User should not be on this page, redirecting');
                window.location.href = '/';
            } else {
                console.log(PREFIX, 'User has valid past-due status, staying on page');
            }
        }).catch(error => {
            console.error(PREFIX, 'Error getting member:', error);
            window.location.href = '/';
        });
    });
})();
