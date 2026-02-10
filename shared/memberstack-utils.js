/**
 * Ordotype - Memberstack Utilities (Shared)
 * Safely parses Memberstack data from localStorage and exposes it globally.
 * Must be loaded before any script that reads Memberstack data.
 *
 * Exposes: window.OrdoMemberstack
 *
 * Usage in Webflow footer (via loader.js):
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/memberstack-utils.js"></script>
 */
(function() {
    'use strict';

    var PREFIX = '[OrdoMemberstack]';
    var MILLISECONDS_IN_DAY = 8.64e7;

    // --- Safe localStorage access ---

    function safeGetItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn(PREFIX, 'localStorage not available:', e.message);
            return null;
        }
    }

    // --- Parse member data safely ---

    var member = {};
    try {
        var raw = safeGetItem('_ms-mem');
        if (raw) {
            member = JSON.parse(raw);
            if (!member || typeof member !== 'object') {
                member = {};
            }
        }
    } catch (e) {
        console.warn(PREFIX, 'Failed to parse Memberstack data:', e.message);
        member = {};
    }

    var planConnections = Array.isArray(member.planConnections) ? member.planConnections : [];
    var customFields = member.customFields || {};

    // --- Shared constants ---

    var FRENCH_TERRITORIES = [
        'French Guiana', 'Guadeloupe', 'Martinique', 'Mayotte', 'Réunion',
        'Saint Barthélemy', 'Saint Martin', 'Saint Pierre and Miquelon',
        'French Polynesia', 'Wallis and Futuna', 'New Caledonia',
        'Clipperton Island', 'The French Southern and Antarctic Lands', 'France'
    ];

    var ALLOWED_INTERN_PLAN_IDS = [
        'pln_brique-google-internes-paris-i31as0w8p',
        'pln_compte-interne-img-nl410oxc',
        'pln_compte-interne-sy4j0oft',
        'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95',
        'pln_compte-interne-derni-re-ann-e-9f4o0oyy'
    ];

    var SPECIALIZATION_DURATIONS = {
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

    // --- Helpers ---

    /**
     * Parse a date from a custom field safely.
     * Returns a valid Date or null (never Invalid Date).
     */
    function safeDate(fieldName) {
        var value = customFields[fieldName];
        if (!value) return null;
        var d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    /**
     * Parse a date from any value safely.
     * Returns a valid Date or null (never Invalid Date).
     */
    function safeDateFromValue(value) {
        if (!value) return null;
        var d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    /**
     * Returns the number of days since a given date, or null if the date is invalid.
     */
    function daysSince(date) {
        if (!date || isNaN(date.getTime())) return null;
        return (Date.now() - date) / MILLISECONDS_IN_DAY;
    }

    /**
     * Returns the number of days until a given date, or null if the date is invalid.
     */
    function daysUntil(date) {
        if (!date || isNaN(date.getTime())) return null;
        return (date - Date.now()) / MILLISECONDS_IN_DAY;
    }

    /**
     * Check if a country is a French territory.
     */
    function isFrenchTerritory(country) {
        return FRENCH_TERRITORIES.indexOf(country) !== -1;
    }

    /**
     * Get the required semester for a given specialization.
     * Returns the semester duration (6, 10, or 12) or 8 as default.
     */
    function getRequiredSemester(specialization) {
        var durations = Object.keys(SPECIALIZATION_DURATIONS);
        for (var i = 0; i < durations.length; i++) {
            var duration = durations[i];
            if (SPECIALIZATION_DURATIONS[duration].indexOf(specialization) !== -1) {
                return parseInt(duration, 10);
            }
        }
        return 8;
    }

    /**
     * Check if the member has a specific plan (any status).
     */
    function hasPlan(planId) {
        return planConnections.some(function(c) { return c.planId === planId; });
    }

    /**
     * Get a plan connection by planId.
     */
    function getPlan(planId) {
        for (var i = 0; i < planConnections.length; i++) {
            if (planConnections[i].planId === planId) return planConnections[i];
        }
        return null;
    }

    /**
     * Check if a plan is active (ACTIVE or TRIALING).
     */
    function isActive(planId) {
        var plan = getPlan(planId);
        return plan ? (plan.status === 'ACTIVE' || plan.status === 'TRIALING') : false;
    }

    // --- Expose globally ---

    window.OrdoMemberstack = {
        member: member,
        stripeCustomerId: member.stripeCustomerId || null,
        memberId: member.id || member.userId || null,
        email: (member.auth && member.auth.email) || member.email || null,
        planConnections: planConnections,
        customFields: customFields,

        // Helpers
        hasPlan: hasPlan,
        getPlan: getPlan,
        isActive: isActive,
        safeDate: safeDate,
        safeDateFromValue: safeDateFromValue,
        daysSince: daysSince,
        daysUntil: daysUntil,
        isFrenchTerritory: isFrenchTerritory,
        getRequiredSemester: getRequiredSemester,

        // Shared constants
        FRENCH_TERRITORIES: FRENCH_TERRITORIES,
        ALLOWED_INTERN_PLAN_IDS: ALLOWED_INTERN_PLAN_IDS,
        SPECIALIZATION_DURATIONS: SPECIALIZATION_DURATIONS,
        MILLISECONDS_IN_DAY: MILLISECONDS_IN_DAY
    };

    console.log(PREFIX, 'Loaded', member.id ? '(member: ' + member.id.substring(0, 8) + '...)' : '(not logged in)');
})();
