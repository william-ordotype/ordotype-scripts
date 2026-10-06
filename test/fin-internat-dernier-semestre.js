#!/usr/bin/env node
/**
 * Bandeau de dernier semestre (#banner-to-hide-fin-internat) : qui le voit, et quand.
 *
 * Usage : node test/fin-internat-dernier-semestre.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const UTILS = lire('shared/memberstack-utils.js');
const NAV = (src) => src.split('window.location.replace(').join('window.__navigate(');
const BANDEAU = '#banner-to-hide-fin-internat';

const PAGES = {
    accueil: NAV(lire('homepage/member-redirects.js')),
    pathologie: NAV(lire('pathology/member-redirects.js')),
};
const COMPTES_A_REBOURS = ['homepage/countdown.js', 'pathology/countdown.js'];

const JOUR = 24 * 60 * 60 * 1000;
const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';
const SPECIAL_500 = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';

const DEBUT = '2026-10-17T00:00:00+02:00';
const FIN = '2026-11-03T00:00:00+01:00';
const t = (iso) => new Date(iso).getTime();
const PENDANT = t('2026-10-20T12:00:00+02:00');

const membre = ({ semestre, specialite = 'Médecine générale', plans = [ASSO], statut = 'Interne' }) => ({
    id: 'mem_test', createdAt: new Date(Date.now() - 400 * JOUR).toISOString(),
    planConnections: plans.map((planId) => ({ planId, status: 'ACTIVE', type: 'SUBSCRIPTION' })),
    customFields: {
        statut, semestre, specialite, prnom: 'Test', 'n-rpps': '12345678901',
        phone: '+33600000000', country: 'France', 'partnership-city': 'Paris', 'mode-dexercice': 'Salarie',
    },
    metaData: {},
});

/** Fenêtre jsdom avec memberstack-utils chargé, l'horloge de la page fixée à `maintenant`. */
function utils(m, maintenant = PENDANT) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    if (w.Date === Date) throw new Error('horloge partagée avec le test');
    w.Date.now = () => maintenant;
    if (m) w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    w.eval(UTILS);
    return w;
}

function bandeaux(page, m, maintenant) {
    const w = utils(m, maintenant);
    const vus = [];
    w.__navigate = () => {};
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); }, on() { return this; }, hide() { return this; } });
    w.dataLayer = [];
    w.eval(PAGES[page]);
    return vus;
}

const final = (semestre, specialite = 'Médecine générale') => utils().OrdoMemberstack.isInFinalSemester(semestre, specialite);
const periode = (maintenant) => utils(null, maintenant).OrdoMemberstack.isFinInternatBannerPeriod();

const CAS = [
    // Règle du dernier semestre
    ['[règle] MG : 6 et 7 en cours, 8 et plus en dernier semestre', () => [
        [final('6'), false, '6'], [final('7'), false, '7'], [final('8'), true, '8'], [final('9'), true, '9'],
    ]],
    ['[règle] FST : « 6 (FST) » et « 6 (SFT) » en dernier semestre, « 5 (FST) » non', () => [
        [final('6 (FST)'), true, '6 (FST)'], [final('6 (SFT)'), true, '6 (SFT)'], [final('6 (fst)'), true, 'casse'],
        [final('5 (FST)'), false, '5 (FST)'],
    ]],
    ['[règle] autres spécialités : durée de la spécialité', () => [
        [final('8', 'Psychiatrie'), false, 'psychiatrie 8'], [final('10', 'Psychiatrie'), true, 'psychiatrie 10'],
        [final('8', "Médecine d'urgence"), true, 'urgence 8'], [final('10', 'Chirurgie générale'), false, 'chirurgie 10'],
        [final('8', ''), true, 'spécialité vide 8'],
    ]],
    ['[règle] valeurs non numériques : jamais', () => [
        [final('Internat terminé'), false, 'Internat terminé'], [final(''), false, 'vide'],
        [final(undefined), false, 'absent'], [final(null), false, 'null'], [final('Autre'), false, 'Autre'],
    ]],
    // Fenêtre d'affichage, heure de Paris
    ['[période] du 17/10 00:00 au 02/11 23:59, heure de Paris', () => [
        [periode(t(DEBUT) - 1), false, 'veille 23:59:59'],
        [periode(t(DEBUT)), true, '17/10 00:00'],
        [periode(PENDANT), true, '20/10'],
        [periode(t('2026-11-02T23:59:59+01:00')), true, '02/11 23:59:59'],
        [periode(t(FIN)), false, '03/11 00:00'],
        [periode(t('2027-05-01T12:00:00+02:00')), false, 'mai 2027'],
    ]],
    ['[période] le compte à rebours finit au même instant que la fenêtre', () => COMPTES_A_REBOURS.map((f) => {
        const m = lire(f).match(/finInternatDeadline = new Date\(["']([^"']+)["']\)/);
        return [m && t(m[1]), t(FIN), f];
    })],
];

for (const page of Object.keys(PAGES)) {
    const voit = (opts, maintenant) => bandeaux(page, membre(opts), maintenant).includes(BANDEAU);
    CAS.push(
        [`[${page}] interne MG en S6 : pas de bandeau`, () => [[voit({ semestre: '6' }), false, 'S6']]],
        [`[${page}] interne MG en S8 : bandeau`, () => [[voit({ semestre: '8' }), true, 'S8']]],
        [`[${page}] interne MG « 6 (FST) » : bandeau`, () => [[voit({ semestre: '6 (FST)' }), true, '6 (FST)']]],
        [`[${page}] interne MG « 5 (FST) » : pas de bandeau`, () => [[voit({ semestre: '5 (FST)' }), false, '5 (FST)']]],
        [`[${page}] « Internat terminé » : pas ce bandeau`, () => [[voit({ semestre: 'Internat terminé' }), false, 'terminé']]],
        [`[${page}] psychiatrie S8 : pas de bandeau`, () => [[voit({ semestre: '8', specialite: 'Psychiatrie' }), false, 'S8']]],
        [`[${page}] « 6 (FST) » avec l'offre spéciale 500 : pas de bandeau`, () => [
            [voit({ semestre: '6 (FST)', plans: [ASSO, SPECIAL_500] }), false, 'offre spéciale'],
        ]],
        [`[${page}] statut Medecin : pas de bandeau`, () => [[voit({ semestre: '8', statut: 'Medecin' }), false, 'Medecin']]],
        [`[${page}] hors période : jamais de bandeau`, () => [
            [voit({ semestre: '6 (FST)' }, t(DEBUT) - 1), false, 'veille'],
            [voit({ semestre: '8' }, t(FIN)), false, 'lendemain du 02/11'],
            [voit({ semestre: '8' }, t(DEBUT)), true, 'premier instant'],
        ]],
    );
}

let echecs = 0;
let verifs = 0;
for (const [nom, cas] of CAS) {
    let resultats;
    try {
        resultats = cas();
    } catch (e) {
        console.log(`  ECHEC  ${nom} : exception ${e.message}`);
        echecs += 1;
        continue;
    }
    verifs += resultats.length;
    const ko = resultats.filter(([obtenu, attendu]) => obtenu !== attendu);
    if (ko.length) {
        echecs += 1;
        console.log(`  ECHEC  ${nom} : ${ko.map(([o, a, quoi]) => `${quoi} (obtenu ${o}, attendu ${a})`).join(' ; ')}`);
    } else {
        console.log(`  ok     ${nom}`);
    }
}
console.log(echecs ? `\n${echecs} cas en échec sur ${CAS.length}.` : `\n${CAS.length} cas, ${verifs} vérifications OK.`);
process.exit(echecs ? 1 : 0);
