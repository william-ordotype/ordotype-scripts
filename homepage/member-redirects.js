/**
 * Ordotype Homepage - Member Redirects
 * Handles member state checks and redirections based on subscription status.
 *
 * Requires:
 * - jQuery
 * - Memberstack data in localStorage
 */
(function() {
    'use strict';

    const PREFIX = '[MemberRedirects]';

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

    // Grace period check for payment redirect prevention
    const GRACE_PERIOD = 120 * 1000; // 120 seconds
    const justPaidTs = parseInt(localStorage.getItem('justPaidTs') || '0', 10);
    if (justPaidTs && (Date.now() - justPaidTs) < GRACE_PERIOD) {
        console.log(PREFIX, '🕒 Within grace period, skipping redirect logic');
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
        const memString = localStorage.getItem('_ms-mem');
        if (!memString) return;
        const member = JSON.parse(memString);
        if (!member) return;

        const $ = jQuery;
        const SUBSCRIPTION = 'SUBSCRIPTION';
        const ACTIVE = 'ACTIVE';
        const TRIALING = 'TRIALING';
        const MILLISECONDS_IN_DAY = 8.64e7;
        const EXPIRE_SOON_DAYS = 60;
        const EXPIRE_DAYS = 31;
        const SIGNUP_DAYS = 15;

        const switchDate = new Date(member.customFields["date-de-switch"]);
        const signupDate = new Date(member.createdAt);
        const date_since_signup = (Date.now() - signupDate) / MILLISECONDS_IN_DAY;
        const date_since_switch = (Date.now() - switchDate) / MILLISECONDS_IN_DAY;
        const expiredDate = new Date(member.customFields["cb"]);
        const date_till_expired = -(Date.now() - expiredDate) / MILLISECONDS_IN_DAY;

        const frenchTerritories = [
            'French Guiana', 'Guadeloupe', 'Martinique', 'Mayotte', 'Réunion',
            'Saint Barthélemy', 'Saint Martin', 'Saint Pierre and Miquelon',
            'French Polynesia', 'Wallis and Futuna', 'New Caledonia',
            'Clipperton Island', 'The French Southern and Antarctic Lands', 'France'
        ];

        const allowedPlanIds = [
            'pln_brique-google-internes-paris-i31as0w8p',
            'pln_compte-interne-img-nl410oxc',
            'pln_compte-interne-sy4j0oft',
            'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95',
            'pln_compte-interne-derni-re-ann-e-9f4o0oyy'
        ];

        const specializationDurations = {
            6: ["Médecine générale", "Médecine générale ", "Médecine palliative", "Soins palliatifs"],
            10: ["Anatomie pathologique", "Anesthésiologie", "Anesthésie réanimation", "Cardiologie",
                "Gastro-entérologie", "Hématologie", "Hépatologie", "Immunologie", "Infectiologie",
                "Médecine interne", "Néonatologie", "Néphrologie", "Oncologie", "Pédiatrie",
                "Pneumologie", "Radiologie", "Radiothérapie"],
            12: ["Chirurgie cardiaque", "Chirurgie générale", "Chirurgie gynécologique",
                "Chirurgie maxillo-faciale", "Chirurgie oculaire", "Chirurgie pédiatrique",
                "Chirurgie plastique, reconstructive et esthétique", "Chirurgie thoracique",
                "Chirurgie traumatologique", "Chirurgie vasculaire", "Chirurgie viscérale",
                "Gynécologie-obstétrique", "Neurochirurgie", "Obstétrique", "Ophtalmologie",
                "Orthopédie", "ORL", "Urologie"]
        };

        const isFrance = frenchTerritories.includes(member.customFields["country"]);
        const srpImg = document.getElementById('aimger');
        const planConnections = member.planConnections;

        const hasAllowedPlanId = planConnections.some(plan =>
            allowedPlanIds.includes(plan.planId) && plan.status !== 'CANCELED'
        );

        const noRPPS = !member.customFields["n-rpps"] || member.customFields["n-rpps"].length === 0;
        const noPhone = !member.customFields["phone"] || member.customFields["phone"].length === 0;
        const isInterne = member.customFields["statut"] === 'Interne';
        const isMedecin = member.customFields["statut"] === 'Medecin';
        const specialite = member.customFields["specialite"];
        const partnershipCity = member.customFields["partnership-city"];
        const semestreValue = member.customFields["semestre"];
        const semestre = parseInt(semestreValue, 10);
        const isSemesterAllowed = [undefined, null, 'Autre', ''].includes(semestreValue);

        const isEssaiGratuit = planConnections.some(plan =>
            plan.planId === 'pln_essai-gratuit-5e4s0o0r'
        );
        const isPastDueBrique = planConnections.some(plan =>
            plan.planId === 'pln_brique-past-due-os1c808ai'
        );
        const isSepaTemporary = planConnections.some(plan =>
            plan.planId === 'pln_sepa-temporary-lj4w0oky'
        );
        const hasPastDuePlan = planConnections.some(plan =>
            plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
            plan.status === 'REQUIRES_PAYMENT'
        );
        const isNotRemplacant = member.customFields['mode-dexercice'] !== 'Remplacant';
        const isRemplacant = member.customFields['mode-dexercice'] === 'Remplacant';

        // Get required semester based on specialization
        function getRequiredSemester(specialization) {
            for (const [semesterDuration, specializations] of Object.entries(specializationDurations)) {
                if (specializations.includes(specialization)) {
                    return parseInt(semesterDuration, 10);
                }
            }
            return 8;
        }

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
            ['pln_essai-gratuit-5e4s0o0r', 'pln_eipa-b22kq009o', 'pln_padhue-mo12g06h7'].includes(plan.planId) &&
            !member.customFields["prnom"]
        )) {
            window.location.replace("/membership/mes-informations");
            return;
        }
        else if (planConnections.some(plan =>
            ['pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95', 'pln_compte-interne-derni-re-ann-e-9f4o0oyy'].includes(plan.planId) &&
            !member.customFields["prnom"]
        )) {
            window.location.replace("/membership/mes-informations-internes");
            return;
        }

        // Redirect if "specialite" is required but not provided
        if ((isInterne || isMedecin) && !member.customFields["specialite"]) {
            window.location.replace("/membership/specialite-medicale-manquante");
            return;
        }

        if (isInterne && !partnershipCity && date_since_switch > 8 && planConnections.some(plan =>
            plan.planId === 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95' &&
            plan.status !== 'CANCELED'
        )) {
            window.location.replace("/membership/info-ville-partenaire");
            return;
        }

        // Display various banners based on member conditions
        if (isEssaiGratuit && isNotRemplacant && date_since_switch < 8) {
            $('#banner-to-hide-essai-gratuit-blue').css({ display: 'flex' });
        } else if (isEssaiGratuit && isNotRemplacant) {
            $('#banner-to-hide-essai-gratuit-new').css({ display: 'flex' });
        } else if (isEssaiGratuit && isRemplacant && date_since_switch < 8 && isFrance) {
            $('#banner-to-hide-essai-gratuit-blue-rempla').css({ display: 'flex' });
        } else if (isEssaiGratuit && isRemplacant && isFrance) {
            $('#banner-to-hide-essai-gratuit-new-rempla').css({ display: 'flex' });
        } else if (hasAllowedPlanId && isInterne && isSemesterAllowed) {
            window.location.replace('/membership/conserver-ses-acces');
            return;
        } else if (hasOnlyNonPremiumPlans(planConnections)) {
            const isInternatTerminated = member.customFields["semestre"] === 'Internat terminé';
            if (planConnections.length === 1) {
                $('#banner-to-hide-essai-expire' + (isInternatTerminated ? '-rempla' : '')).css({ display: 'flex' });
            } else if (planConnections.length > 1) {
                $('#banner-to-hide-' + (isInternatTerminated ? 'essai-expire-rempla' : 'canceled')).css({ display: 'flex' });
            }
        } else if (
            member.customFields["semestre"] === 'Internat terminé' && hasAllowedPlanId &&
            date_since_signup > SIGNUP_DAYS &&
            !planConnections.some(plan =>
                plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
                plan.status !== 'CANCELED'
            )
        ) {
            window.location.replace("/membership/fin-internat");
            return;
        } else if (
            member.customFields["semestre"] === 'Internat terminé' && hasAllowedPlanId &&
            date_since_signup < SIGNUP_DAYS &&
            !planConnections.some(plan =>
                plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
                plan.status !== 'CANCELED'
            )
        ) {
            $('#banner-to-hide-signup-internat-termine').css({ display: 'flex' });
        } else if (
            planConnections.some(isSubscriptionActiveOrTrialing) &&
            date_till_expired < EXPIRE_DAYS
        ) {
            $('#banner-to-hide-cb-expired').css({ display: 'flex' });
        } else if (
            planConnections.some(isSubscriptionActiveOrTrialing) &&
            date_till_expired < EXPIRE_SOON_DAYS
        ) {
            $('#banner-to-hide-cb-expires-soon').css({ display: 'flex' });
        } else if (
            isInterne && noRPPS && date_since_signup > SIGNUP_DAYS && parseInt(semestreValue, 10) >= 2
        ) {
            $('#banner-to-hide-rpps-interne').css({ display: 'flex' });
        } else if (hasPastDuePlan && !isPastDueBrique && !isSepaTemporary) {
            window.location.replace("/membership/probleme-de-paiement");
            return;
        }
        else if (
            isInterne &&
            semestre >= getRequiredSemester(specialite) &&
            !planConnections.some(plan =>
                plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
                plan.status !== 'CANCELED'
            )
        ) {
            // $('#banner-to-hide-fin-internat').css({ display: 'flex' });
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
