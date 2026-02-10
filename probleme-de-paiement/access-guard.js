/**
 * Probleme de Paiement - Access Guard
 * Redirects users who shouldn't be on this page:
 * - Non-logged users -> homepage
 * - Users without REQUIRES_PAYMENT status -> homepage (after adding past-due plan)
 * - Users with SEPA temporary plan -> homepage (after adding past-due plan)
 *
 * Must be loaded in header (blocking) to redirect before page renders.
 *
 * Usage in Webflow header:
 * <script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement/access-guard.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[AccessGuard]';
    const PAST_DUE_PLAN_ID = 'pln_brique-past-due-os1c808ai';
    const SEPA_TEMPORARY_PLAN_ID = 'pln_sepa-temporary-lj4w0oky';

    document.addEventListener('DOMContentLoaded', function() {
        const memberstack = window.$memberstackDom;

        if (!memberstack) {
            console.error(PREFIX, 'Memberstack not found');
            return;
        }

        memberstack.getCurrentMember().then(async ({ data: member }) => {
            if (!member) {
                console.log(PREFIX, 'No member found, redirecting to homepage');
                window.location.href = '/';
                return;
            }

            const planConnections = member.planConnections;

            // Check if any plan has status 'REQUIRES_PAYMENT'
            const hasPastDuePlan = planConnections.some(plan => plan.status === 'REQUIRES_PAYMENT');

            // Check if user has SEPA temporary plan
            const isSepaTemporary = planConnections.some(plan => plan.planId === SEPA_TEMPORARY_PLAN_ID);

            if (!hasPastDuePlan || isSepaTemporary) {
                console.log(PREFIX, 'User should not be on this page, adding past-due plan and redirecting');
                try {
                    await memberstack.addPlan({
                        planId: PAST_DUE_PLAN_ID
                    });
                    console.log(PREFIX, 'Past-due plan added successfully');
                } catch (error) {
                    console.error(PREFIX, 'Error adding plan:', error);
                }
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
