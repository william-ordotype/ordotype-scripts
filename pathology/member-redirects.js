/**
 * Ordotype Pathology - Member Redirects
 * Handles member state checks and redirections based on subscription status.
 *
 * Requires:
 * - shared/memberstack-utils.js
 * - jQuery (optional, for banner display)
 */
(function() {
    'use strict';

    const PREFIX = '[MemberRedirects]';
    const ms = window.OrdoMemberstack || {};
    const BANNER_DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

    // Grace period check for payment redirect prevention (24 hours)
    const GRACE_PERIOD = 24 * 60 * 60 * 1000;
    const justPaidTs = parseInt(localStorage.getItem('justPaidTs') || '0', 10);
    if (justPaidTs && (Date.now() - justPaidTs) < GRACE_PERIOD) {
        console.log(PREFIX, 'Within grace period, skipping redirect logic');
        return;
    }

    const member = ms.member;
    if (!member || !member.id) return;

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
                localStorage.setItem(elem.key, new Date().toISOString());
            });
        }
    });

    // Use shared constants and helpers from memberstack-utils
    const isFrance = ms.isFrenchTerritory(ms.customFields["country"]);
    const planConnections = ms.planConnections;
    const allowedPlanIds = ms.ALLOWED_INTERN_PLAN_IDS;

    // Safe date parsing via shared utility
    const expiredDate = ms.safeDate('cb');
    const switchDate = ms.safeDate('date-de-switch');
    const signupDate = ms.safeDateFromValue(member.createdAt);

    const date_till_expired = ms.daysUntil(expiredDate);
    const date_since_signup = ms.daysSince(signupDate);
    const date_since_switch = ms.daysSince(switchDate);

    const hasAllowedPlanId = planConnections.some(plan =>
        allowedPlanIds.indexOf(plan.planId) !== -1 && plan.status !== 'CANCELED'
    );

    const semestreValue = ms.customFields["semestre"];
    const semestre = parseInt(semestreValue, 10);
    const specialite = ms.customFields["specialite"];
    const isSemesterAllowed = [undefined, null, 'Autre', ''].indexOf(semestreValue) !== -1;
    const isInterne = ms.customFields["statut"] === 'Interne';

    const storedDateEssaiGratuit = localStorage.getItem("storedDateEssaiGratuit");
    const storedDateEssaiGratuitBlue = localStorage.getItem("storedDateEssaiGratuitBlue");
    const storedDateEssaiGratuitRempla = localStorage.getItem("storedDateEssaiGratuitRempla");
    const storedDateEssaiGratuitRemplaBlue = localStorage.getItem("storedDateEssaiGratuitRemplaBlue");

    const isNotRemplacant = ms.customFields['mode-dexercice'] !== 'Remplacant';
    const isRemplacant = ms.customFields['mode-dexercice'] === 'Remplacant';

    const isPastDueBrique = ms.hasPlan('pln_brique-past-due-os1c808ai');
    const isSepaTemporary = ms.hasPlan('pln_sepa-temporary-lj4w0oky');
    // Account plans, i.e. the ones a failed payment must be signalled for. Add-ons
    // (modules, extra storage) are deliberately absent: losing an add-on must not lock
    // the whole site. Listed explicitly rather than matched on a prefix, because naming
    // does not separate the two families reliably and the two mistakes are not
    // symmetrical: a missing entry only means the member is not warned, while a wrong
    // match locks a paying member out of the product.
    //
    // Keep in sync with homepage/member-redirects.js.
    const ACCOUNT_PLAN_IDS = [
        'pln_compte-praticien-offre-speciale-500-premiers--893z0o60', // Module Médecine Générale (FR) — compte principal
        'pln_compte-interne-sy4j0oft', // Compte Interne (FR)
        'pln_compte-interne-img-nl410oxc', // Compte Interne IMG
        'pln_compte-praticien-ov4d0oln', // Compte Praticien (remplaçant)
        'pln_compte-ide-1gq10bkx', // Profession paramédicale
        'pln_compte-m-decin-hu490oka', // Compte Médecin (archivé, abonnements actifs)
        'pln_praticien-belgique-2p70qka', // Module Médecine Générale (BE)
        'pln_praticien-marocain-in470oks', // Praticien marocain (archivé, abonnements actifs)
        'pln_m-decin-exer-ant-en-mauritanie-j5430ol3', // Médecin en Mauritanie (archivé, abonnements actifs)
        'pln_module-m-decine-g-n-rale-lu--5yfe0f08', // Module Médecine générale (LU)
        'pln_module-m-decine-g-n-rale-1-an-cm4c0b2p', // Module Médecine générale - 1 an
        'pln_modume-m-decine-g-n-rale-9ze80shk', // Module Médecine générale
        'pln_ordotype-plus-rhumatologie-jzz0k85', // MG & Rhumatologie
        'pln_ordotype-plus-module-soins-palliatifs-qph60vfs', // MG & Soins palliatifs (archivé, abonnements actifs)
        'pln_modules-mg-rhumato-et-soins-palliatifs-rc4b0dyw', // Modules MG, Rhumato et Soins palliatifs
        'pln_modules-m-decine-g-n-rale-soins-palliatifs-et-rhumatologie-rq7q0trl', // Modules MG, Soins palliatifs et Rhumatologie
    ];
    const hasPastDuePlan = planConnections.some(plan =>
        ACCOUNT_PLAN_IDS.indexOf(plan.planId) !== -1 &&
        plan.status !== 'CANCELED' && plan.status === 'REQUIRES_PAYMENT'
    );

    // Combined redirection if required member information is missing
    if (
        (hasAllowedPlanId && (!ms.customFields["prnom"] || !ms.customFields["semestre"])) ||
        (planConnections.length === 2 &&
            planConnections[0].status === 'CANCELED' &&
            (planConnections[1].planId === 'pln_compte-interne-derni-re-ann-e-9f4o0oyy' ||
                planConnections[1].planId === 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95') &&
            (!ms.customFields["prnom"] || !ms.customFields["semestre"]))
    ) {
        window.location.replace("/membership/mes-informations-internes");
        return;
    }
    else if (hasAllowedPlanId && isInterne && isSemesterAllowed) {
        window.location.replace('/membership/conserver-ses-acces');
        return;
    }
    /*
    else if (
        isInterne &&
        semestre >= ms.getRequiredSemester(specialite) &&
        !planConnections.some(plan =>
            plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
            plan.status !== 'CANCELED'
        )
    ) {
        if ($) $('#banner-to-hide-fin-internat').css({ 'display': 'flex' });
    }
    */
    else if (
        ms.customFields["semestre"] === 'Internat terminé' &&
        hasAllowedPlanId &&
        isInterne &&
        date_since_signup !== null && date_since_signup > 15 &&
        !planConnections.some(plan =>
            plan.planId === 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60' &&
            plan.status !== 'CANCELED'
        )
    ) {
        window.location.replace("/membership/fin-internat");
        return;
    }
    else if (
        ms.customFields["semestre"] === 'Internat terminé' &&
        hasAllowedPlanId &&
        isInterne &&
        date_since_signup !== null && date_since_signup < 15 &&
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
            date_till_expired !== null && date_till_expired < 31
        )
    ) {
        if ($) $('#pathologie-cb-expired-click').css({ 'display': 'flex' });
    }
    else if (
        planConnections.some(plan =>
            plan.type === 'SUBSCRIPTION' &&
            (plan.status === 'ACTIVE' || plan.status === 'TRIALING') &&
            date_till_expired !== null && date_till_expired >= 31 && date_till_expired < 60
        )
    ) {
        if ($) $('#pathologie-cb-expires-soon-click').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch !== null && date_since_switch < 8 &&
        ms.hasPlan('pln_essai-gratuit-5e4s0o0r') &&
        isNotRemplacant &&
        (!storedDateEssaiGratuitBlue || (Date.now() - new Date(storedDateEssaiGratuitBlue)) > BANNER_DISMISS_DURATION)
    ) {
        if ($) $('#essai-gratuit-banner-blue').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch !== null && date_since_switch >= 8 &&
        ms.hasPlan('pln_essai-gratuit-5e4s0o0r') &&
        isNotRemplacant &&
        (!storedDateEssaiGratuit || (Date.now() - new Date(storedDateEssaiGratuit)) > BANNER_DISMISS_DURATION)
    ) {
        if ($) $('#essai-gratuit-banner').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch !== null && date_since_switch < 8 &&
        ms.hasPlan('pln_essai-gratuit-5e4s0o0r') &&
        isRemplacant &&
        isFrance &&
        (!storedDateEssaiGratuitRemplaBlue || (Date.now() - new Date(storedDateEssaiGratuitRemplaBlue)) > BANNER_DISMISS_DURATION)
    ) {
        if ($) $('#essai-gratuit-banner-rempla-blue').css({ 'display': 'flex' });
    }
    else if (
        date_since_switch !== null && date_since_switch >= 8 &&
        ms.hasPlan('pln_essai-gratuit-5e4s0o0r') &&
        isRemplacant &&
        isFrance &&
        (!storedDateEssaiGratuitRempla || (Date.now() - new Date(storedDateEssaiGratuitRempla)) > BANNER_DISMISS_DURATION)
    ) {
        if ($) $('#essai-gratuit-banner-rempla').css({ 'display': 'flex' });
    }
    else if (hasPastDuePlan && !isPastDueBrique && !isSepaTemporary) {
        window.location.replace("/membership/probleme-de-paiement");
        return;
    }

    console.log(PREFIX, 'Member redirects initialized');
})();
