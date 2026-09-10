#!/usr/bin/env node
/**
 * Qui voit le bandeau d'inscription SAU, et quand.
 *
 * Deux publics le déclenchent, et un seul des deux dépend de l'heure :
 *
 *   - la spécialité « Médecine d'urgence », à toute heure ;
 *   - les internes de médecine générale de semestre 1 ou 2, uniquement
 *     dans la fenêtre de nuit, parce que c'est le moment où ils sont de
 *     garde.
 *
 * Le semestre est un champ auto-déclaré passé à `parseInt` : « Internat
 * terminé » donne NaN et doit donc échouer au test, sans lever.
 *
 * La fenêtre enjambe minuit, ce qui est le piège de ce genre de test : une
 * comparaison d'intervalle simple la rendrait toujours fausse. Les bornes
 * sont donc vérifiées une par une, des deux côtés.
 *
 * Le bandeau reste en bout de chaîne : n'importe quel bandeau de facturation
 * ou de profil au dessus de lui gagne. Ce test ne rejoue pas cette priorité,
 * il vérifie le public et l'heure.
 *
 * Usage : node test/sau-banner-audience.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'homepage/member-redirects.js'), 'utf8');

const PLAN_INTERNE_ADHERENT = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';

/** Rejoue le fichier avec un membre donné, à une heure donnée. */
function jouer({ statut, specialite, semestre, heure, snoozeMs }) {
    const fige = new Date(2026, 0, 15, heure, 30, 0).getTime();
    const affiches = [];
    const pushes = [];
    const redirections = [];

    function jq(selecteur) {
        return { css(regles) { if (regles && regles.display === 'flex') affiches.push(selecteur); } };
    }

    // Le lien du bandeau, tel que Webflow le sert : l'origine y est déjà écrite.
    const cta = {
        href: '/membership/sau-en-savoir-plus?src=banner',
        getAttribute(n) { return n === 'href' ? this.href : null; },
        setAttribute(n, v) { if (n === 'href') this.href = v; },
    };

    const store = {};
    if (snoozeMs) {
        store.sauSignupBannerDismissedTs = String(fige - snoozeMs);
        store.sauSignupBannerCloseCount = '1';
    }

    class DateFigee extends Date {
        constructor(...args) { if (args.length === 0) super(fige); else super(...args); }
        static now() { return fige; }
    }

    const ms = {
        member: { id: 'mem_test', createdAt: '2025-11-02T10:00:00.000Z' },
        metaData: {},
        planConnections: [{ planId: PLAN_INTERNE_ADHERENT, status: 'ACTIVE', type: 'SUBSCRIPTION' }],
        ALLOWED_INTERN_PLAN_IDS: [],
        customFields: {
            statut, specialite, semestre,
            prnom: 'Test', 'n-rpps': '12345678901', phone: '+33600000000',
            country: 'France', 'partnership-city': '', 'mode-dexercice': 'Salarie',
        },
        safeDate() { return null; },
        safeDateFromValue() { return null; },
        daysSince() { return null; },
        daysUntil() { return null; },
        isFrenchTerritory() { return true; },
        hasPlan() { return false; },
        getRequiredSemester() { return 6; },
    };

    const win = {
        OrdoMemberstack: ms,
        dataLayer: { push(o) { pushes.push(o); } },
        location: { replace(u) { redirections.push(u); } },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    };
    const contexte = {
        window: win,
        jQuery: jq,
        document: {
            getElementById: (id) => (id === 'click-banner-to-hide-sau-signup' ? cta : null),
            addEventListener: () => {},
        },
        localStorage: win.localStorage,
        console: { log() {}, warn() {}, error() {} },
        Date: DateFigee,
    };
    contexte.globalThis = contexte;
    vm.runInNewContext(SOURCE, contexte);

    const vu = pushes.filter(p => p.event === 'sau_signup_banner_view');
    return {
        affiche: affiches.indexOf('#banner-to-hide-sau-signup') !== -1,
        public: vu.length ? vu[0].sau_banner_audience : null,
        src: (cta.href.match(/[?&]src=([^&#]*)/) || [])[1] || null,
        redirections,
    };
}

const INTERNE_MG = { statut: 'Interne', specialite: 'Médecine générale' };
const CAS = [
    ['interne MG semestre 1, 2 h du matin', { ...INTERNE_MG, semestre: '1', heure: 2 }, true, 'interne_mg_nuit', 'banner-nuit'],
    ['interne MG semestre 2, 23 h 30', { ...INTERNE_MG, semestre: '2', heure: 23 }, true, 'interne_mg_nuit', 'banner-nuit'],
    ['interne MG semestre 2, 14 h', { ...INTERNE_MG, semestre: '2', heure: 14 }, false, null, 'banner'],
    ['interne MG semestre 4, 2 h', { ...INTERNE_MG, semestre: '4', heure: 2 }, false, null, 'banner'],
    ['interne MG internat terminé, 2 h', { ...INTERNE_MG, semestre: 'Internat terminé', heure: 2 }, false, null, 'banner'],
    ['interne pédiatrie semestre 1, 2 h', { statut: 'Interne', specialite: 'Pédiatrie', semestre: '1', heure: 2 }, false, null, 'banner'],
    ['médecin MG, 2 h', { statut: 'Medecin', specialite: 'Médecine générale', semestre: '', heure: 2 }, false, null, 'banner'],
    ['urgentiste, 14 h', { statut: 'Medecin', specialite: "Médecine d'urgence", semestre: '', heure: 14 }, true, 'specialite', 'banner'],
    ['urgentiste, 2 h', { statut: 'Medecin', specialite: "Médecine d'urgence", semestre: '', heure: 2 }, true, 'specialite', 'banner'],
    ['interne MG semestre 1, 2 h, mis en veille', { ...INTERNE_MG, semestre: '1', heure: 2, snoozeMs: 60 * 1000 }, false, null, 'banner'],
    ['borne 22 h, hors fenêtre', { ...INTERNE_MG, semestre: '1', heure: 22 }, false, null, 'banner'],
    ['borne 23 h, dans la fenêtre', { ...INTERNE_MG, semestre: '1', heure: 23 }, true, 'interne_mg_nuit', 'banner-nuit'],
    ['borne 4 h, dans la fenêtre', { ...INTERNE_MG, semestre: '1', heure: 4 }, true, 'interne_mg_nuit', 'banner-nuit'],
    ['borne 5 h, hors fenêtre', { ...INTERNE_MG, semestre: '1', heure: 5 }, false, null, 'banner'],
];

let echecs = 0;
for (const [nom, profil, attenduAffiche, attenduPublic, attenduSrc] of CAS) {
    let r;
    try {
        r = jouer(profil);
    } catch (e) {
        console.log(`  ECHEC  ${nom} : exception ${e.message}`);
        echecs += 1;
        continue;
    }
    if (r.redirections.length) {
        console.log(`  ECHEC  ${nom} : redirigé vers ${r.redirections[0]}, le cas ne teste rien`);
        echecs += 1;
        continue;
    }
    if (r.affiche !== attenduAffiche || r.public !== attenduPublic || r.src !== attenduSrc) {
        console.log(`  ECHEC  ${nom} : affiché=${r.affiche} public=${r.public} src=${r.src}, attendu ${attenduAffiche} / ${attenduPublic} / ${attenduSrc}`);
        echecs += 1;
        continue;
    }
    console.log(`  ok     ${nom}`);
}

if (echecs) {
    console.error(`\n${echecs} cas en échec sur ${CAS.length}.`);
    process.exit(1);
}
console.log(`\n${CAS.length} cas vérifiés.`);
