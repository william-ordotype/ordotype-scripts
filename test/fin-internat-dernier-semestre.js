#!/usr/bin/env node
/**
 * Bandeau de dernier semestre (#banner-to-hide-fin-internat) : qui le verrait une fois le bloc décommenté.
 *
 * Le bloc est commenté entre deux bascules de semestre. Le test le décommente pour vérifier
 * la règle réelle, et vérifie aussi que la version livrée ne l'affiche à personne.
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

/** Retire le commentaire qui entoure le bloc du bandeau, et lui seul. */
function decommente(src) {
    const i = src.indexOf(`'${BANDEAU}'`);
    const debut = src.lastIndexOf('/*', i);
    const fin = src.indexOf('*/', i);
    if (i === -1 || debut === -1 || fin === -1 || !/^\/\*\s*else if \(/.test(src.slice(debut))) {
        throw new Error('bloc du bandeau introuvable');
    }
    return src.slice(0, debut) + src.slice(debut + 2, fin) + src.slice(fin + 2);
}

const PAGES = {
    accueil: lire('homepage/member-redirects.js'),
    pathologie: lire('pathology/member-redirects.js'),
};

const JOUR = 24 * 60 * 60 * 1000;
const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';
const SPECIAL_500 = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';

const membre = ({ semestre, specialite = 'Médecine générale', plans = [ASSO], statut = 'Interne' }) => ({
    id: 'mem_test', createdAt: new Date(Date.now() - 400 * JOUR).toISOString(),
    planConnections: plans.map((planId) => ({ planId, status: 'ACTIVE', type: 'SUBSCRIPTION' })),
    customFields: {
        statut, semestre, specialite, prnom: 'Test', 'n-rpps': '12345678901',
        phone: '+33600000000', country: 'France', 'partnership-city': 'Paris', 'mode-dexercice': 'Salarie',
    },
    metaData: {},
});

function utils(m) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    if (m) w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    w.eval(UTILS);
    return w;
}

/** Bandeaux affichés par la page, avec le bloc décommenté ou tel que livré. */
function bandeaux(page, m, { livre = false } = {}) {
    const w = utils(m);
    const vus = [];
    w.__navigate = () => {};
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); }, on() { return this; }, hide() { return this; } });
    w.dataLayer = [];
    w.eval(NAV(livre ? PAGES[page] : decommente(PAGES[page])));
    return vus;
}

const final = (semestre, specialite = 'Médecine générale') => utils().OrdoMemberstack.isInFinalSemester(semestre, specialite);

const CAS = [
    // Règle
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
];

for (const page of Object.keys(PAGES)) {
    const voit = (opts, livre) => bandeaux(page, membre(opts), { livre }).includes(BANDEAU);
    CAS.push(
        [`[${page}] interne MG en S6 : pas de bandeau`, () => [[voit({ semestre: '6' }), false, 'S6']]],
        [`[${page}] interne MG en S8 : bandeau`, () => [[voit({ semestre: '8' }), true, 'S8']]],
        [`[${page}] interne MG « 6 (FST) » : bandeau`, () => [[voit({ semestre: '6 (FST)' }), true, '6 (FST)']]],
        [`[${page}] interne MG « 5 (FST) » : pas de bandeau`, () => [[voit({ semestre: '5 (FST)' }), false, '5 (FST)']]],
        [`[${page}] psychiatrie S8 : pas de bandeau`, () => [[voit({ semestre: '8', specialite: 'Psychiatrie' }), false, 'S8']]],
        [`[${page}] « 6 (FST) » avec l'offre spéciale 500 : pas de bandeau`, () => [
            [voit({ semestre: '6 (FST)', plans: [ASSO, SPECIAL_500] }), false, 'offre spéciale'],
        ]],
        [`[${page}] statut Medecin : pas de bandeau`, () => [[voit({ semestre: '8', statut: 'Medecin' }), false, 'Medecin']]],
        [`[${page}] version livrée (bloc commenté) : bandeau jamais affiché`, () => [
            [voit({ semestre: '6 (FST)' }, true), false, '6 (FST)'], [voit({ semestre: '8' }, true), false, 'S8'],
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
