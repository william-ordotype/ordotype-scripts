/**
 * Ordotype Homepage - Member Redirects
 * Handles member state checks and redirections based on subscription status.
 *
 * Requires:
 * - shared/memberstack-utils.js
 * - jQuery
 */
(function() {
    'use strict';

    const PREFIX = '[MemberRedirects]';
    const ms = window.OrdoMemberstack || {};

    // Close button click handler for banners
    document.addEventListener("click", function(event) {
        const closeButton = event.target.closest(".nfc_close-button");
        if (closeButton) {
            event.preventDefault();
            console.log(PREFIX, 'Close button clicked');

            const wrapper = closeButton.closest(".nfc_wrapper");
            if (wrapper) {
                wrapper.style.display = "none";
                console.log(PREFIX, 'nfc_wrapper div hidden');
            }
        }
    });

    // Grace period check for payment redirect prevention (120 seconds)
    const GRACE_PERIOD = 120 * 1000;
    const justPaidTs = parseInt(localStorage.getItem('justPaidTs') || '0', 10);
    if (justPaidTs && (Date.now() - justPaidTs) < GRACE_PERIOD) {
        console.log(PREFIX, 'Within grace period, skipping redirect logic');
        if (typeof jQuery !== 'undefined') {
            jQuery('#banner-to-hide-payment-failed').css({ display: 'none' });
        }
        return;
    }

    // Member state and redirection logic (requires jQuery)
    if (typeof jQuery === 'undefined') {
        console.warn(PREFIX, 'jQuery not found, skipping member redirects');
        return;
    }

    (function() {
        const member = ms.member;
        if (!member || !member.id) return;

        const $ = jQuery;
        const SUBSCRIPTION = 'SUBSCRIPTION';
        const ACTIVE = 'ACTIVE';
        const TRIALING = 'TRIALING';
        const EXPIRE_SOON_DAYS = 60; // Days before CB expiry to show "expires soon" banner
        const EXPIRE_DAYS = 31;      // Days before CB expiry to show "expired" banner
        const SIGNUP_DAYS = 15;      // Days after signup before certain redirects activate

        // Safe date parsing via shared utility
        const switchDate = ms.safeDate('date-de-switch');
        const signupDate = ms.safeDateFromValue(member.createdAt);
        const expiredDate = ms.safeDate('cb');

        const date_since_signup = ms.daysSince(signupDate);
        const date_since_switch = ms.daysSince(switchDate);
        const date_till_expired = ms.daysUntil(expiredDate);

        // Use shared constants from memberstack-utils
        const isFrance = ms.isFrenchTerritory(ms.customFields["country"]);
        const srpImg = document.getElementById('aimger');
        const planConnections = ms.planConnections;
        const allowedPlanIds = ms.ALLOWED_INTERN_PLAN_IDS;

        const hasAllowedPlanId = planConnections.some(plan =>
            allowedPlanIds.indexOf(plan.planId) !== -1 && plan.status !== 'CANCELED'
        );

        const noRPPS = !ms.customFields["n-rpps"] || ms.customFields["n-rpps"].length === 0;
        const noPhone = !ms.customFields["phone"] || ms.customFields["phone"].length === 0;
        const isInterne = ms.customFields["statut"] === 'Interne';
        const isMedecin = ms.customFields["statut"] === 'Medecin';
        const specialite = ms.customFields["specialite"];
        const partnershipCity = ms.customFields["partnership-city"];
        const semestreValue = ms.customFields["semestre"];
        const semestre = parseInt(semestreValue, 10);
        const isSemesterAllowed = [undefined, null, 'Autre', ''].indexOf(semestreValue) !== -1;

        const isEssaiGratuit = ms.hasPlan('pln_essai-gratuit-5e4s0o0r');
        const isPastDueBrique = ms.hasPlan('pln_brique-past-due-os1c808ai');
        const isSepaTemporary = ms.hasPlan('pln_sepa-temporary-lj4w0oky');
        const hasPastDuePlan = planConnections.some(plan =>
            plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
            plan.status === 'REQUIRES_PAYMENT'
        );
        const isNotRemplacant = ms.customFields['mode-dexercice'] !== 'Remplacant';
        const isRemplacant = ms.customFields['mode-dexercice'] === 'Remplacant';

        function hasOnlyNonPremiumPlans(connections) {
            return connections.every(plan =>
                plan.status === 'CANCELED' || plan.planId === 'pln_essai-expir--vr4r0ouk'
            );
        }

        function isSubscriptionActiveOrTrialing(plan) {
            return plan.type === SUBSCRIPTION && (plan.status === ACTIVE || plan.status === TRIALING);
        }

        // Redirect if any of the plans require updating the "prnom" field and that field is empty
        if (planConnections.some(plan =>
            ['pln_essai-gratuit-5e4s0o0r', 'pln_eipa-b22kq009o', 'pln_padhue-mo12g06h7'].indexOf(plan.planId) !== -1 &&
            !ms.customFields["prnom"]
        )) {
            window.location.replace("/membership/mes-informations");
            return;
        }
        else if (planConnections.some(plan =>
            ['pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95', 'pln_compte-interne-derni-re-ann-e-9f4o0oyy'].indexOf(plan.planId) !== -1 &&
            !ms.customFields["prnom"]
        )) {
            window.location.replace("/membership/mes-informations-internes");
            return;
        }

        // Redirect if "specialite" is required but not provided
        if ((isInterne || isMedecin) && !ms.customFields["specialite"]) {
            window.location.replace("/membership/specialite-medicale-manquante");
            return;
        }

        if (isInterne && !partnershipCity && date_since_switch !== null && date_since_switch > 8 && planConnections.some(plan =>
            plan.planId === 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95' &&
            plan.status !== 'CANCELED'
        )) {
            window.location.replace("/membership/info-ville-partenaire");
            return;
        }

        // Display various banners based on member conditions
        if (isEssaiGratuit && isNotRemplacant && date_since_switch !== null && date_since_switch < 8) {
            $('#banner-to-hide-essai-gratuit-blue').css({ display: 'flex' });
        } else if (isEssaiGratuit && isNotRemplacant) {
            $('#banner-to-hide-essai-gratuit-new').css({ display: 'flex' });
        } else if (isEssaiGratuit && isRemplacant && date_since_switch !== null && date_since_switch < 8 && isFrance) {
            $('#banner-to-hide-essai-gratuit-blue-rempla').css({ display: 'flex' });
        } else if (isEssaiGratuit && isRemplacant && isFrance) {
            $('#banner-to-hide-essai-gratuit-new-rempla').css({ display: 'flex' });
        } else if (hasAllowedPlanId && isInterne && isSemesterAllowed) {
            window.location.replace('/membership/conserver-ses-acces');
            return;
        } else if (hasOnlyNonPremiumPlans(planConnections)) {
            const isInternatTerminated = ms.customFields["semestre"] === 'Internat terminé';
            if (planConnections.length === 1) {
                $('#banner-to-hide-essai-expire' + (isInternatTerminated ? '-rempla' : '')).css({ display: 'flex' });
            } else if (planConnections.length > 1) {
                $('#banner-to-hide-' + (isInternatTerminated ? 'essai-expire-rempla' : 'canceled')).css({ display: 'flex' });
            }
        } else if (
            ms.customFields["semestre"] === 'Internat terminé' && hasAllowedPlanId &&
            date_since_signup !== null && date_since_signup > SIGNUP_DAYS &&
            !planConnections.some(plan =>
                plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
                plan.status !== 'CANCELED'
            )
        ) {
            window.location.replace("/membership/fin-internat");
            return;
        } else if (
            ms.customFields["semestre"] === 'Internat terminé' && hasAllowedPlanId &&
            date_since_signup !== null && date_since_signup < SIGNUP_DAYS &&
            !planConnections.some(plan =>
                plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
                plan.status !== 'CANCELED'
            )
        ) {
            $('#banner-to-hide-signup-internat-termine').css({ display: 'flex' });
        } else if (
            planConnections.some(isSubscriptionActiveOrTrialing) &&
            date_till_expired !== null && date_till_expired < EXPIRE_DAYS
        ) {
            $('#banner-to-hide-cb-expired').css({ display: 'flex' });
        } else if (
            planConnections.some(isSubscriptionActiveOrTrialing) &&
            date_till_expired !== null && date_till_expired < EXPIRE_SOON_DAYS
        ) {
            $('#banner-to-hide-cb-expires-soon').css({ display: 'flex' });
        } else if (
            isInterne && noRPPS && date_since_signup !== null && date_since_signup > SIGNUP_DAYS && parseInt(semestreValue, 10) >= 2
        ) {
            $('#banner-to-hide-rpps-interne').css({ display: 'flex' });
        } else if (hasPastDuePlan && !isPastDueBrique && !isSepaTemporary) {
            window.location.replace("/membership/probleme-de-paiement");
            return;
        }
        else if (
            isInterne &&
            semestre >= ms.getRequiredSemester(specialite) &&
            !planConnections.some(plan =>
                plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
                plan.status !== 'CANCELED'
            )
        ) {
            // Reserved for future fin-internat banner
        }
        else if (partnershipCity === 'Rennes (MG)' && srpImg) {
            srpImg.style.display = 'flex';
        }
        else if (noPhone) {
            $('#banner-to-hide-phone-missing').css({ display: 'flex' });
        }

        console.log(PREFIX, 'Member redirects initialized');
    })();
})();
