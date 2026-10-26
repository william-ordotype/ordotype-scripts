#!/usr/bin/env node
/**
 * Bandeaux « carte expirée » et « carte qui expire bientôt » retirés de l'accueil et
 * des fiches (26/10/2026, homepage/ et pathology/member-redirects.js).
 *
 * Pourquoi : la date d'expiration de la carte (`cb`, écrite par Make 259766)
 * n'annonce pas un refus. Mesure du 24/10/2026 : sur 109 membres prélevés sur une
 * carte « expirée », 94 l'ont été avec succès après la date (la banque renouvelle
 * la carte sous le même numéro), 2 seulement ont eu un refus `expired_card`. Un vrai
 * refus passe par l'impayé (redirection vers la page de paiement, bandeau rouge).
 *
 * Ce qui doit tenir, sur les deux pages :
 *   - `cb` passé, dans 10 jours, dans 45 jours, dans 120 jours, `SEPA`, `Link`,
 *     `Amex`, abonnement actif ou en essai : aucun bandeau carte ;
 *   - le bandeau d'après dans l'ordre prend la place : RPPS (accueil), Docteur
 *     Junior (fiche) ;
 *   - impayé avec une carte « expirée » : redirection vers la page de paiement,
 *     comme avant ;
 *   - pause avec une carte « expirée » : bandeau pause seul à l'accueil, rien sur
 *     les fiches (la fiche affichait « carte expirée » à un membre en pause).
 *
 * Vraie memberstack-utils, membre dans `_ms-mem`, horloge de la page figée.
 *
 * Usage : node test/bandeaux-carte-retires.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const UTILS = lire('shared/memberstack-utils.js');
const NAV = (src) => src.split('window.location.replace(').join('window.__navigate(');
const PAGES = {
    accueil: NAV(lire('homepage/member-redirects.js')),
    fiche: NAV(lire('pathology/member-redirects.js')),
};

const JOUR = 24 * 60 * 60 * 1000;
// Fin d'internat (17/10 → 03/11) et Docteur Junior (15/10 → 16/11) ouverts.
const MIDI = new Date('2026-10-20T12:00:00+02:00').getTime();
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';
const SPECIAL_500 = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';
const IMPAYE = '/membership/probleme-de-paiement';

const CARTE = ['#banner-to-hide-cb-expired', '#banner-to-hide-cb-expires-soon', '#pathologie-cb-expired-click', '#pathologie-cb-expires-soon-click'];
const CB = {
    'passée (09/2026)': '2026-09-01',
    'dans 10 jours': iso(MIDI + 10 * JOUR),
    'dans 45 jours': iso(MIDI + 45 * JOUR),
    'dans 120 jours': iso(MIDI + 120 * JOUR),
    SEPA: 'SEPA',
    Link: 'Link',
    Amex: 'Amex',
};

const plan = (p) => (typeof p === 'string' ? { planId: p, status: 'ACTIVE' } : p);
// Praticien MG installé, RPPS et téléphone renseignés : aucun autre bandeau.
const membre = ({
    statut = 'Medecin', semestre = '', plans = [SPECIAL_500], rpps = '12345678901',
    cb = '', metaData = {},
} = {}) => ({
    id: 'mem_test', createdAt: new Date(MIDI - 400 * JOUR).toISOString(),
    planConnections: plans.map(plan).map((c) => ({ type: 'SUBSCRIPTION', ...c })),
    customFields: {
        statut, specialite: 'Médecine générale', semestre, prnom: 'Test', 'n-rpps': rpps,
        phone: '+33600000000', cb, country: 'France', 'partnership-city': 'Paris',
        'mode-dexercice': 'Installe', 'date-de-switch': iso(MIDI - 300 * JOUR),
    },
    metaData,
});

function page(nom, m) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const D = w.Date;
    w.Date = class extends D {
        constructor(...a) { if (a.length) super(...a); else super(MIDI); }
        static now() { return MIDI; }
    };
    w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    w.eval(UTILS);
    const vus = [];
    const redirections = [];
    w.__navigate = (u) => redirections.push(u);
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); return this; } });
    w.dataLayer = [];
    w.eval(PAGES[nom]);
    w.close();
    return { vus, redirections, carte: vus.filter((s) => CARTE.includes(s)) };
}

const CAS = [];
for (const nom of ['accueil', 'fiche']) {
    for (const [quand, cb] of Object.entries(CB)) {
        CAS.push([`[${nom}] carte ${quand}, abonnement actif : aucun bandeau`, () => {
            const p = page(nom, membre({ cb }));
            return [[p.carte.length, 0, 'bandeau carte'], [p.vus.length, 0, 'bandeaux'], [p.redirections.length, 0, 'redirections']];
        }]);
    }
    CAS.push([`[${nom}] carte passée, abonnement en essai (TRIALING) : aucun bandeau carte`, () => {
        const p = page(nom, membre({ cb: CB['passée (09/2026)'], plans: [{ planId: SPECIAL_500, status: 'TRIALING' }] }));
        return [[p.carte.length, 0, 'bandeau carte']];
    }]);
    CAS.push([`[${nom}] impayé avec une carte passée : redirection vers la page de paiement, aucun bandeau carte`, () => {
        const p = page(nom, membre({ cb: CB['passée (09/2026)'], plans: [{ planId: SPECIAL_500, status: 'REQUIRES_PAYMENT' }] }));
        return [[p.redirections[0], IMPAYE, 'redirection'], [p.carte.length, 0, 'bandeau carte']];
    }]);
}
CAS.push(['[accueil] interne S5 sans RPPS, carte passée : bandeau RPPS à la place', () => {
    const p = page('accueil', membre({ statut: 'Interne', semestre: '5', rpps: '', plans: [ASSO], cb: CB['passée (09/2026)'] }));
    return [[p.vus.includes('#banner-to-hide-rpps-interne'), true, 'RPPS'], [p.carte.length, 0, 'bandeau carte']];
}]);
CAS.push(['[fiche] interne MG S6 (Docteur Junior), carte passée : bandeau Docteur Junior à la place', () => {
    const p = page('fiche', membre({ statut: 'Interne', semestre: '6', plans: [ASSO], cb: CB['passée (09/2026)'] }));
    return [[p.vus.includes('#banner-to-hide-docteur-junior'), true, 'Docteur Junior'], [p.carte.length, 0, 'bandeau carte']];
}]);
CAS.push(['[accueil] pause en cours, carte passée : bandeau pause seul', () => {
    const p = page('accueil', membre({ cb: CB['passée (09/2026)'], metaData: { 'pause-end-date': iso(MIDI + 30 * JOUR) } }));
    return [[p.vus.join(), '#banner-to-hide-paused', 'bandeaux']];
}]);
CAS.push(['[fiche] pause en cours, carte passée : aucun bandeau carte', () => {
    const p = page('fiche', membre({ cb: CB['passée (09/2026)'], metaData: { 'pause-end-date': iso(MIDI + 30 * JOUR) } }));
    return [[p.carte.length, 0, 'bandeau carte']];
}]);

let echecs = 0;
for (const [nom, cas] of CAS) {
    let verifs;
    try {
        verifs = cas();
    } catch (e) {
        echecs++;
        console.log('✗ ' + nom + '\n    ' + e.stack.split('\n').slice(0, 3).join('\n    '));
        continue;
    }
    const rates = verifs.filter(([obtenu, attendu]) => obtenu !== attendu);
    if (rates.length) {
        echecs++;
        console.log('✗ ' + nom);
        for (const [obtenu, attendu, quoi] of rates) console.log(`    ${quoi} : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);
    } else {
        console.log('✓ ' + nom);
    }
}
console.log(`\n${CAS.length - echecs}/${CAS.length} cas`);
process.exit(echecs ? 1 : 0);
