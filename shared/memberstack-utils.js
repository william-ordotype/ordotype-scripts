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
    var metaData = member.metaData || {};

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
        'pln_compte-interne-derni-re-ann-e-9f4o0oyy',
        'pln_sau-interne-811d0aht' // SAU partnership interne (free) — same intern lifecycle as above
    ];

    // Durée du cursus en semestres, par spécialité.
    //
    // ⚠️ Cette table n'a aujourd'hui AUCUN consommateur vivant : ses deux usages,
    // dans homepage/member-redirects.js et pathology/member-redirects.js, sont dans
    // des blocs commentés. L'accès est coupé par le champ auto-déclaré
    // `semestre = "Internat terminé"`, pas par un compte de semestres.
    //
    // Elle reste donc silencieusement fausse tant que personne ne la lit, et c'est
    // exactement ce qui la rend dangereuse : la réactiver avec une durée périmée
    // couperait l'accès à toute une cohorte, plusieurs semestres trop tôt.
    // Vérifier chaque entrée AVANT de décommenter quoi que ce soit.
    var SPECIALIZATION_DURATIONS = {
        // 4 ans. Le défaut de getRequiredSemester vaut déjà 8, donc tous les autres
        // DES de 4 ans (médecine d'urgence, dermatologie, gériatrie, neurologie,
        // rhumatologie, santé publique, biologie médicale, chirurgie orale…) n'ont
        // pas à figurer ici. La médecine générale y figure quand même : c'est la
        // population principale du site, et la ligne dit noir sur blanc que la
        // réforme de 2026 a été prise en compte. Elle valait 6 auparavant.
        8: ["Médecine générale", "Médecine générale ", "Médecine palliative", "Soins palliatifs"],
        // 5 ans. « Psychiatrie » manquait et tombait donc sur le défaut de 8,
        // soit deux semestres trop tôt (ajoutée le 01/09/2026).
        10: ["Anatomie pathologique", "Anesthésiologie", "Anesthésie réanimation", "Cardiologie",
            "Gastro-entérologie", "Hématologie", "Hépatologie", "Immunologie", "Infectiologie",
            "Médecine intensive-réanimation", "Médecine interne", "Néonatologie", "Néphrologie", "Oncologie", "Pédiatrie",
            "Pneumologie", "Psychiatrie", "Radiologie", "Radiothérapie"],
        // 6 ans.
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

    // --- Hydratation tardive ------------------------------------------------
    // `_ms-mem` est parsé UNE fois au chargement, et les champs sont figés dans
    // window.OrdoMemberstack. Or le SDK Memberstack peut écrire après nous :
    // sur /inscription-en-cours on arrive quelques secondes après la création
    // du compte, et `stripeCustomerId` n'est pas encore là. Chaque consommateur
    // se débrouillait avec son propre sondage et sa propre relecture de
    // localStorage, en perdant au passage la normalisation ci-dessous.
    //
    // `localStorageUsable` évite de sonder 40 fois une lecture qui ne peut que
    // échouer (navigation privée, stockage bloqué) : la réponse ne changera pas.

    // Dérivé de la lecture déjà faite plus haut : safeGetItem() renvoie null et
    // journalise quand le stockage est inaccessible, inutile de re-sonder.
    var localStorageUsable = safeGetItem('_ms-mem') !== null || (function() {
        try { localStorage.getItem('_ms-mem'); return true; } catch (e) { return false; }
    })();

    // FUSION, pas remplacement. Le SDK Memberstack réécrit `_ms-mem` plusieurs
    // fois par session, y compris des instantanés partiels : écraser
    // inconditionnellement effacerait un `stripeCustomerId` déjà valide sous les
    // pieds d'un consommateur qui l'avait lu. On ne remplace donc que par une
    // valeur non vide, et on garnit les tableaux/objets EN PLACE pour ne pas
    // périmer les références que d'autres modules ont aliasées au chargement.
    function applyMember(parsed) {
        member = parsed;
        var api = window.OrdoMemberstack;
        if (!api) return;

        api.member = member;
        if (member.stripeCustomerId) api.stripeCustomerId = member.stripeCustomerId;
        var id = member.id || member.userId;
        if (id) api.memberId = id;
        var mail = (member.auth && member.auth.email) || member.email;
        if (mail) api.email = mail;

        if (Array.isArray(member.planConnections)) {
            planConnections.length = 0;
            Array.prototype.push.apply(planConnections, member.planConnections);
        }
        if (member.customFields) {
            for (var k in member.customFields) {
                if (Object.prototype.hasOwnProperty.call(member.customFields, k)) {
                    customFields[k] = member.customFields[k];
                }
            }
        }
        if (member.metaData) {
            for (var m in member.metaData) {
                if (Object.prototype.hasOwnProperty.call(member.metaData, m)) {
                    metaData[m] = member.metaData[m];
                }
            }
        }
    }

    /**
     * Relit `_ms-mem` et met à jour les champs exposés, en place.
     * Renvoie window.OrdoMemberstack.
     */
    function refresh() {
        if (!localStorageUsable) return window.OrdoMemberstack;
        try {
            var raw = safeGetItem('_ms-mem');
            if (!raw) return window.OrdoMemberstack;
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') applyMember(parsed);
        } catch (e) {
            // snapshot illisible : on garde le précédent
        }
        return window.OrdoMemberstack;
    }

    var WAIT_TIMEOUT_MS = 2000;
    var WAIT_POLL_MS = 50;

    /**
     * Attend que `field` (ex. 'stripeCustomerId', 'memberId') soit renseigné.
     * Résout avec window.OrdoMemberstack, que le champ soit arrivé ou non :
     * c'est à l'appelant de décider quoi faire d'une absence après le délai.
     */
    function waitFor(field, timeoutMs) {
        var api = refresh();
        if (api && api[field]) return Promise.resolve(api);
        // Rien ne peut changer si on ne peut pas relire le stockage.
        if (!localStorageUsable) return Promise.resolve(api);

        var deadline = Date.now() + (typeof timeoutMs === 'number' ? timeoutMs : WAIT_TIMEOUT_MS);
        return new Promise(function(resolve) {
            var timer = setInterval(function() {
                var cur = refresh();
                if ((cur && cur[field]) || Date.now() >= deadline) {
                    clearInterval(timer);
                    resolve(cur);
                }
            }, WAIT_POLL_MS);
        });
    }

    // --- Expose globally ---

    window.OrdoMemberstack = {
        member: member,
        stripeCustomerId: member.stripeCustomerId || null,
        memberId: member.id || member.userId || null,
        email: (member.auth && member.auth.email) || member.email || null,
        planConnections: planConnections,
        customFields: customFields,
        metaData: metaData,

        // Hydratation tardive
        refresh: refresh,
        waitFor: waitFor,

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
