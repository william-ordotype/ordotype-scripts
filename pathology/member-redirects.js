/**
 * Ordotype Pathology - Member Redirects
 * Handles member state checks and redirections based on subscription status.
 *
 * Requires:
 * - jQuery
 * - Memberstack data in localStorage
 */
(function() {
    'use strict';

    const PREFIX = '[MemberRedirects]';

    // Grace period check for payment redirect prevention
    const GRACE_PERIOD = 120 * 1000; // 120 seconds
    const justPaidTs = parseInt(localStorage.getItem('justPaidTs') || '0', 10);
    if (justPaidTs && (Date.now() - justPaidTs) < GRACE_PERIOD) {
        console.log(PREFIX, '🕒 Within grace period, skipping redirect logic');
        return;
    }

    const memString = localStorage.getItem('_ms-mem');
    if (!memString) return;
    const member = JSON.parse(memString);
    if (!member) return;

    const $ = typeof jQuery !== 'undefined' ? jQuery : null;

    // Storage elements for date tracking (banner dismissal)
    const storageElements = [
        { id: "date-into-local-storage", key: "currentDate" },
        { id: "date-into-local-storage-essai-gratuit", key: "storedDateEssaiGratuit" },
        { id: "date-into-local-storage-essai-gratuit-blue", key: "storedDateEssaiGratuitBlue" },
        { id: "date-into-local-storage-essai-gratuit-rempla", key: "storedDateEssaiGratuitRempla" },
        { id: "date-into-local-storage-essai-gratuit-rempla-blue", key: "storedDateEssaiGratuitRemplaBlue" }
    ];

    storageElements.forEach(elem => {
        const element = document.getElementById(elem.id);
        if (element) {
            element.addEventListener("click", () => {
                const currentDate = new Date();
                localStorage.setItem(elem.key, currentDate.toISOString());
            });
        }
    });

    // Define territories, durations and allowed plan IDs
    const frenchTerritories = [
        'French Guiana', 'Guadeloupe', 'Martinique', 'Mayotte', 'Réunion',
        'Saint Barthélemy', 'Saint Martin', 'Saint Pierre and Miquelon',
        'French Polynesia', 'Wallis and Futuna', 'New Caledonia',
        'Clipperton Island', 'The French Southern and Antarctic Lands', 'France'
    ];
    const isFrance = frenchTerritories.includes(member.customFields["country"]);

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

    const allowedPlanIds = [
        'pln_brique-google-internes-paris-i31as0w8p',
        'pln_compte-interne-img-nl410oxc',
        'pln_compte-interne-sy4j0oft',
        'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95',
        'pln_compte-interne-derni-re-ann-e-9f4o0oyy'
    ];

    // Date calculations
    const expiredDate = new Date(member.customFields["cb"]);
    const date_till_expired = -(Date.now() - expiredDate) / 8.64e7;
    const switchDate = new Date(member.customFields["date-de-switch"]);
    const signupDate = new Date(member.createdAt);
    const date_since_signup = (Date.now() - signupDate) / 8.64e7;
    const date_since_switch = (Date.now() - switchDate) / 8.64e7;

    const planConnections = member.planConnections;
    const hasAllowedPlanId = planConnections.some(plan =>
        allowedPlanIds.includes(plan.planId) && plan.status !== 'CANCELED'
    );

    const semestreValue = member.customFields["semestre"];
    const semestre = parseInt(semestreValue, 10);
    const specialite = member.customFields["specialite"];
    const isSemesterAllowed = [undefined, null, 'Autre', ''].includes(semestreValue);
    const isInterne = member.customFields["statut"] === 'Interne';

    const storedDateEssaiGratuit = localStorage.getItem("storedDateEssaiGratuit");
    const storedDateEssaiGratuitBlue = localStorage.getItem("storedDateEssaiGratuitBlue");
    const storedDateEssaiGratuitRempla = localStorage.getItem("storedDateEssaiGratuitRempla");
    const storedDateEssaiGratuitRemplaBlue = localStorage.getItem("storedDateEssaiGratuitRemplaBlue");

    const isNotRemplacant = member.customFields['mode-dexercice'] !== 'Remplacant';
    const isRemplacant = member.customFields['mode-dexercice'] === 'Remplacant';

    const isPastDueBrique = planConnections.some(plan =>
        plan.planId === 'pln_brique-past-due-os1c808ai'
    );
    const isSepaTemporary = planConnections.some(plan =>
        plan.planId === 'pln_sepa-temporary-lj4w0oky'
    );
    const hasPastDuePlan = planConnections.some(plan =>
        plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
        plan.status !== 'CANCELED' && plan.status === 'REQUIRES_PAYMENT'
    );

    // Get required semester based on specialization
    function getRequiredSemester(specialization) {
        for (const [semesterDuration, specializations] of Object.entries(specializationDurations)) {
            if (specializations.includes(specialization)) {
                return parseInt(semesterDuration, 10);
            }
        }
        return 8;
    }

    // Combined redirection if required member information is missing
    if (
        (hasAllowedPlanId && (!member.customFields["prnom"] || !member.customFields["semestre"])) ||
        (planConnections.length === 2 &&
            planConnections[0].status === 'CANCELED' &&
            (planConnections[1].planId === 'pln_compte-interne-derni-re-ann-e-9f4o0oyy' ||
                planConnections[1].planId === 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95') &&
            (!member.customFields["prnom"] || !member.customFields["semestre"]))
    ) {
        window.location.replace("/membership/mes-informations-internes");
        return;
    }
    else if (hasAllowedPlanId && isInterne && isSemesterAllowed) {
        window.location.replace('/membership/conserver-ses-acces');
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
    else if (
        member.customFields["semestre"] === 'Internat terminé' &&
        hasAllowedPlanId &&
        isInterne &&
        date_since_signup > 15 &&
        !planConnections.some(plan =>
            plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
            plan.status !== 'CANCELED'
        )
    ) {
        window.location.replace("/membership/fin-internat");
        return;
    }
    else if (
        member.customFields["semestre"] === 'Internat terminé' &&
        hasAllowedPlanId &&
        isInterne &&
        date_since_signup < 15 &&
        !planConnections.some(plan =>
            plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
            plan.status !== 'CANCELED'
        )
    ) {
        if ($) $('#banner-to-hide-signup-internat-termine').css({ 'display': 'flex' });
    }
    else if (
        planConnections.some(plan =>
            plan.type === 'SUBSCRIPTION' &&
            (plan.status === 'ACTIVE' || plan.status === 'TRIALING') &&
            date_till_expired < 31
        )
    ) {
        if ($) $('#pathologie-cb-expired-click').css({ 'display': 'flex' });
    }
    else if (
        planConnections.some(plan =>
            plan.type === 'SUBSCRIPTION' &&
            (plan.status === 'ACTIVE' || plan.status === 'TRIALING') &&
            date_till_expired >= 31 && date_till_expired < 60
        )
    ) {
        if ($) $('#pathologie-cb-expires-soon-click').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch < 8 &&
        planConnections.some(connection => connection.planId === 'pln_essai-gratuit-5e4s0o0r') &&
        isNotRemplacant &&
        (!storedDateEssaiGratuitBlue || (Date.now() - new Date(storedDateEssaiGratuitBlue)) > (24 * 60 * 60 * 1000))
    ) {
        if ($) $('#essai-gratuit-banner-blue').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch >= 8 &&
        planConnections.some(connection => connection.planId === 'pln_essai-gratuit-5e4s0o0r') &&
        isNotRemplacant &&
        (!storedDateEssaiGratuit || (Date.now() - new Date(storedDateEssaiGratuit)) > (24 * 60 * 60 * 1000))
    ) {
        if ($) $('#essai-gratuit-banner').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch < 8 &&
        planConnections.some(connection => connection.planId === 'pln_essai-gratuit-5e4s0o0r') &&
        isRemplacant &&
        isFrance &&
        (!storedDateEssaiGratuitRemplaBlue || (Date.now() - new Date(storedDateEssaiGratuitRemplaBlue)) > (24 * 60 * 60 * 1000))
    ) {
        if ($) $('#essai-gratuit-banner-rempla-blue').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch >= 8 &&
        planConnections.some(connection => connection.planId === 'pln_essai-gratuit-5e4s0o0r') &&
        isRemplacant &&
        isFrance &&
        (!storedDateEssaiGratuitRempla || (Date.now() - new Date(storedDateEssaiGratuitRempla)) > (24 * 60 * 60 * 1000))
    ) {
        if ($) $('#essai-gratuit-banner-rempla').css({ 'display': 'flex' });
    }
    else if (hasPastDuePlan && !isPastDueBrique && !isSepaTemporary) {
        window.location.replace("/membership/probleme-de-paiement");
        return;
    }

    console.log(PREFIX, 'Member redirects initialized');
})();
