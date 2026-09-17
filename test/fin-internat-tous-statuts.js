#!/usr/bin/env node
/**
 * Fin d'internat : redirection selon le plan et le semestre, quel que soit le statut.
 *
 * Usage : node test/fin-internat-tous-statuts.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FICHIERS = {
    accueil: fs.readFileSync(path.join(ROOT, 'homepage/member-redirects.js'), 'utf8'),
    pathologie: fs.readFileSync(path.join(ROOT, 'pathology/member-redirects.js'), 'utf8'),
};

const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';
const MG_FR = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';
const MG_BE = 'pln_praticien-belgique-2p70qka';
const PADHUE = 'pln_padhue-mo12g06h7';
const ETABLISSEMENT = 'pln_compte-tablissement-vl2600lp';
const PLANS_INTERNE = [
    'pln_brique-google-internes-paris-i31as0w8p',
    'pln_compte-interne-img-nl410oxc',
    'pln_compte-interne-sy4j0oft',
    ASSO,
    'pln_compte-interne-derni-re-ann-e-9f4o0oyy',
    'pln_sau-interne-811d0aht',
];

const FIN = '/membership/fin-internat';
const BANDEAU = '#banner-to-hide-signup-internat-termine';

/** Rejoue un des deux fichiers avec un membre donné. */
function jouer(fichier, { statut, semestre = 'Internat terminé', plans, jours = 60 }) {
    const redirections = [];
    const affiches = [];
    const jq = (selecteur) => ({ css(regles) { if (regles && regles.display === 'flex') affiches.push(selecteur); } });
    const store = {};
    const ms = {
        member: { id: 'mem_test', createdAt: '2025-01-01T10:00:00.000Z' },
        metaData: {},
        planConnections: plans.map(([planId, status = 'ACTIVE']) => ({ planId, status, type: 'SUBSCRIPTION' })),
        ALLOWED_INTERN_PLAN_IDS: PLANS_INTERNE,
        customFields: {
            statut, semestre,
            specialite: 'Médecine générale', prnom: 'Test', 'n-rpps': '12345678901', phone: '+33600000000',
            country: 'France', 'partnership-city': 'Paris', 'mode-dexercice': 'Salarie',
        },
        safeDate() { return new Date(); },
        safeDateFromValue() { return new Date(); },
        daysSince() { return jours; },
        daysUntil() { return null; },
        isFrenchTerritory() { return true; },
        hasPlan() { return false; },
        getRequiredSemester() { return 6; },
    };
    const win = {
        OrdoMemberstack: ms,
        dataLayer: { push() {} },
        location: { replace(u) { redirections.push(u); }, pathname: '/', href: 'https://www.ordotype.fr/' },
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    };
    const contexte = {
        window: win,
        jQuery: jq,
        document: { getElementById: () => null, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] },
        localStorage: win.localStorage,
        console: { log() {}, warn() {}, error() {} },
        setTimeout: () => 0,
    };
    contexte.globalThis = contexte;
    vm.runInNewContext(FICHIERS[fichier], contexte);
    return { coupe: redirections.includes(FIN), bandeau: affiches.includes(BANDEAU), redirections };
}

const coupe = (attendu) => (r) => [[r.coupe, attendu, attendu ? 'renvoyé vers fin-internat' : 'pas de renvoi vers fin-internat']];

const CAS = [
    ['Interne, internat terminé, plan asso', { statut: 'Interne', plans: [[ASSO]] }, coupe(true)],
    ['Medecin, internat terminé, plan asso', { statut: 'Medecin', plans: [[ASSO]] }, coupe(true)],
    ['Assistant (Belgique), internat terminé', { statut: 'Assistant', plans: [[ASSO]] }, coupe(true)],
    ['MEVS (Luxembourg), internat terminé', { statut: 'MEVS', plans: [[ASSO]] }, coupe(true)],
    ['Médecin assistant (Suisse), internat terminé', { statut: 'Médecin assistant', plans: [[ASSO]] }, coupe(true)],
    ['statut vide, internat terminé', { statut: '', plans: [[ASSO]] }, coupe(true)],
    ['Medecin avec plan MG FR actif : épargné', { statut: 'Medecin', plans: [[ASSO], [MG_FR]] }, coupe(false)],
    ['Interne avec plan MG Belgique actif : épargné', { statut: 'Interne', plans: [[ASSO], [MG_BE]] }, coupe(false)],
    ['Interne avec offre PADHUE : épargné', { statut: 'Interne', plans: [[ASSO], [PADHUE]] }, coupe(false)],
    ['Interne avec compte établissement : épargné', { statut: 'Interne', plans: [[ASSO], [ETABLISSEMENT]] }, coupe(false)],
    ['plan MG FR résilié : ne protège plus', { statut: 'Medecin', plans: [[ASSO], [MG_FR, 'CANCELED']] }, coupe(true)],
    ['Medecin semestre 6 : pas de coupure', { statut: 'Medecin', semestre: '6', plans: [[ASSO]] }, coupe(false)],
    ['Medecin inscrit depuis 5 jours : bandeau, pas de coupure', { statut: 'Medecin', plans: [[ASSO]], jours: 5 }, (r) => [
        [r.coupe, false, 'pas de renvoi vers fin-internat'],
        [r.bandeau, true, 'bandeau internat terminé'],
    ]],
];

let echecs = 0;
let verifs = 0;
for (const [nom, profil, attendus] of CAS) {
    for (const fichier of Object.keys(FICHIERS)) {
        let r;
        try {
            r = jouer(fichier, profil);
        } catch (e) {
            console.log(`  ECHEC  [${fichier}] ${nom} : exception ${e.message}`);
            echecs += 1;
            continue;
        }
        const ko = attendus(r).filter(([obtenu, attendu]) => obtenu !== attendu);
        verifs += 1;
        if (ko.length) {
            echecs += 1;
            console.log(`  ECHEC  [${fichier}] ${nom} : ${ko.map(([o, a, quoi]) => `${quoi} (obtenu ${o}, attendu ${a})`).join(' ; ')} ; redirections ${JSON.stringify(r.redirections)}`);
        } else {
            console.log(`  ok     [${fichier}] ${nom}`);
        }
    }
}
console.log(echecs ? `\n${echecs} échec(s) sur ${verifs} cas.` : `\n${verifs} cas vérifiés.`);
process.exit(echecs ? 1 : 0);
