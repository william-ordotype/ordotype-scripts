#!/usr/bin/env node
/**
 * Pays du membre en anglais ou en français : `isFrenchTerritory` et les bandeaux
 * d'essai gratuit des remplaçants (accueil et fiches), réservés à la France et
 * aux territoires français.
 *
 * Usage : node test/pays-territoires-francais.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
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
const MAINTENANT = new Date('2026-12-01T12:00:00+01:00').getTime();
const ESSAI_GRATUIT = 'pln_essai-gratuit-5e4s0o0r';

const membre = (country) => ({
    id: 'mem_test', createdAt: new Date(MAINTENANT - 400 * JOUR).toISOString(),
    planConnections: [{ type: 'SUBSCRIPTION', planId: ESSAI_GRATUIT, status: 'ACTIVE' }],
    customFields: {
        statut: 'Médecin', specialite: 'Médecine générale', semestre: '', prnom: 'Test', 'n-rpps': '12345678901',
        phone: '+33600000000', country, 'partnership-city': 'Paris', 'mode-dexercice': 'Remplaçant',
        'date-de-switch': new Date(MAINTENANT - 30 * JOUR).toISOString(),
    },
    metaData: {},
});

function fenetre(m) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const D = w.Date;
    w.Date = class extends D {
        constructor(...a) { if (a.length) super(...a); else super(MAINTENANT); }
        static now() { return MAINTENANT; }
    };
    w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    w.eval(UTILS);
    return w;
}

function bandeaux(nom, country) {
    const w = fenetre(membre(country));
    const vus = [];
    w.__navigate = () => {};
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); return this; } });
    w.dataLayer = [];
    w.eval(PAGES[nom]);
    return vus.filter((s) => /rempla/.test(s));
}

let echecs = 0;
function cas(nom, fn) {
    try { fn(); console.log(`  ok  ${nom}`); } catch (e) { echecs += 1; console.log(`  KO  ${nom}\n      ${e.message}`); }
}

const ms = fenetre(membre('France')).OrdoMemberstack;

const FRANCAIS = [
    'France', 'Guadeloupe', 'Martinique', 'Mayotte',
    'Réunion', 'La Réunion', 'French Guiana', 'Guyane française',
    'Saint Barthélemy', 'Saint-Barthélemy', 'Saint-Martin', 'Saint Martin',
    'St. Pierre and Miquelon', 'Saint-Pierre-et-Miquelon',
    'French Polynesia', 'Polynésie française', 'Wallis and Futuna Islands', 'Wallis-et-Futuna',
    'New Caledonia', 'Nouvelle-Calédonie', 'Île Clipperton', 'Terres australes françaises',
    // saisies libres
    'FRANCE', 'france ', ' France', 'la reunion', 'GUYANE FRANÇAISE', 'Guyane', 'saint  martin',
];
const AUTRES = [
    'Belgium', 'Belgique', 'Algeria', 'Algérie', 'Saint-Martin (partie néerlandaise)', 'Sint Maarten',
    'Afrique et Moyen-Orient', 'Pays', '0612345678', '', '   ', null, undefined, 42, {},
];

console.log('isFrenchTerritory');
for (const v of FRANCAIS) cas(`${JSON.stringify(v)} : territoire français`, () => assert.strictEqual(ms.isFrenchTerritory(v), true));
for (const v of AUTRES) cas(`${JSON.stringify(v)} : hors France`, () => assert.strictEqual(ms.isFrenchTerritory(v), false));

console.log('bandeaux remplaçant en essai gratuit');
for (const nom of Object.keys(PAGES)) {
    const temoin = bandeaux(nom, 'Réunion');
    cas(`${nom} : témoin « Réunion » a un bandeau remplaçant`, () => assert.ok(temoin.length > 0));
    for (const v of ['La Réunion', 'Guyane française', 'Saint-Pierre-et-Miquelon', 'FRANCE']) {
        cas(`${nom} : « ${v} » comme « Réunion »`, () => assert.deepStrictEqual(bandeaux(nom, v), temoin));
    }
    for (const v of ['Belgique', 'Belgium']) {
        cas(`${nom} : « ${v} » sans bandeau remplaçant`, () => assert.deepStrictEqual(bandeaux(nom, v), []));
    }
}

if (echecs) { console.log(`\n${echecs} échec(s)`); process.exit(1); }
console.log('\ntous les cas passent');
