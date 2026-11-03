#!/usr/bin/env node
/**
 * Valeurs Memberstack avec ou sans accents (passage aux accents en base, 11/2026).
 *
 * Les fiches passent de « Medecin », « Remplacant », « Autre professionnel de sante »
 * à « Médecin », « Remplaçant », « Autre professionnel de santé ». Pendant et après
 * la bascule, les deux formes doivent donner le même résultat :
 *   - accueil et fiches : bandeaux d'essai gratuit des remplaçants ;
 *   - accueil : redirection « spécialité manquante » d'un médecin sans spécialité ;
 *   - Mon compte, mes-informations, mes-informations CMS : un « Autre professionnel
 *     de santé » voit le mode d'exercice et pas la spécialité.
 * Témoins : un salarié n'a pas le bandeau remplaçant ; un interne garde ses règles.
 *
 * Usage : node test/valeurs-accentuees.js
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
// Hors des campagnes datées (fin d'internat, Docteur Junior).
const MAINTENANT = new Date('2026-12-01T12:00:00+01:00').getTime();
const ESSAI_GRATUIT = 'pln_essai-gratuit-5e4s0o0r';
const SPECIAL_500 = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';

const membre = ({ statut = 'Medecin', mode = 'Remplacant', specialite = 'Médecine générale', plans = [ESSAI_GRATUIT], switchIlYa = 30 } = {}) => ({
    id: 'mem_test', createdAt: new Date(MAINTENANT - 400 * JOUR).toISOString(),
    planConnections: plans.map((p) => ({ type: 'SUBSCRIPTION', planId: p, status: 'ACTIVE' })),
    customFields: {
        statut, specialite, semestre: '', prnom: 'Test', 'n-rpps': '12345678901', phone: '+33600000000',
        country: 'France', 'partnership-city': 'Paris', 'mode-dexercice': mode,
        'date-de-switch': new Date(MAINTENANT - switchIlYa * JOUR).toISOString(),
    },
    metaData: {},
});

function page(nom, m) {
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
    const vus = [];
    const redirections = [];
    w.__navigate = (u) => redirections.push(u);
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); return this; } });
    w.dataLayer = [];
    w.eval(PAGES[nom]);
    return { vus, redirections };
}

const SELECTEURS = '<select id="mon-statut-2"><option value="">Mon statut</option></select>' +
    '<div id="semestre-selector"></div><div id="mode-exercice-selector"></div><div id="specialite-selector"></div>';

/** Visibilité (mode d'exercice, spécialité) après un des trois scripts de sélecteurs, pour `statut`. */
async function selecteurs(fichier, statut) {
    const dom = new JSDOM('<!doctype html><body>' + SELECTEURS + '</body>', {
        url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const membreMs = { id: 'mem_test', customFields: { statut } };
    w.OrdoAccount = { member: membreMs };
    w.OrdoMesInfos = { member: membreMs, config: { showStatutSelectors: true } };
    w.$memberstackDom = { getCurrentMember: async () => ({ data: membreMs }) };
    w.eval(lire(fichier));
    await new Promise((r) => setTimeout(r, 20));
    const vu = (id) => w.document.getElementById(id).style.display !== 'none';
    const r = { mode: vu('mode-exercice-selector'), specialite: vu('specialite-selector') };
    w.close();
    return r;
}

const FICHIERS_SELECTEURS = ['account/status-selectors.js', 'mes-informations/statut-selectors.js', 'mes-informations-cms/statut-selectors.js'];

const CAS = [
    ...['Remplacant', 'Remplaçant'].map((mode) => [`[accueil] essai gratuit, « ${mode} » : bandeau remplaçant`, () => {
        const { vus } = page('accueil', membre({ mode }));
        return [
            [vus.includes('#banner-to-hide-essai-gratuit-new-rempla'), true, 'bandeau remplaçant'],
            [vus.includes('#banner-to-hide-essai-gratuit-new'), false, 'bandeau praticien'],
        ];
    }]),
    ...['Remplacant', 'Remplaçant'].map((mode) => [`[accueil] essai gratuit récent, « ${mode} » : bandeau remplaçant bleu`, () => {
        const { vus } = page('accueil', membre({ mode, switchIlYa: 3 }));
        return [[vus.includes('#banner-to-hide-essai-gratuit-blue-rempla'), true, 'bandeau remplaçant bleu']];
    }]),
    ['[accueil] témoin : essai gratuit, « Salarié » : bandeau praticien', () => {
        const { vus } = page('accueil', membre({ mode: 'Salarié' }));
        return [[vus.includes('#banner-to-hide-essai-gratuit-new'), true, 'bandeau praticien']];
    }],
    ...['Remplacant', 'Remplaçant'].map((mode) => [`[fiche] essai gratuit, « ${mode} » : bandeau remplaçant`, () => {
        const { vus } = page('fiche', membre({ mode }));
        return [
            [vus.includes('#essai-gratuit-banner-rempla'), true, 'bandeau remplaçant'],
            [vus.includes('#essai-gratuit-banner'), false, 'bandeau praticien'],
        ];
    }]),
    ['[fiche] témoin : essai gratuit, « Salarie » : bandeau praticien', () => {
        const { vus } = page('fiche', membre({ mode: 'Salarie' }));
        return [[vus.includes('#essai-gratuit-banner'), true, 'bandeau praticien']];
    }],
    ...['Medecin', 'Médecin'].map((statut) => [`[accueil] « ${statut} » sans spécialité : redirigé vers la spécialité manquante`, () => {
        const { redirections } = page('accueil', membre({ statut, mode: 'Liberal', specialite: '', plans: [SPECIAL_500] }));
        return [[redirections[0], '/membership/specialite-medicale-manquante', 'redirection']];
    }]),
    ...FICHIERS_SELECTEURS.flatMap((fichier) => [
        ...['Autre professionnel de sante', 'Autre professionnel de santé'].map((statut) => [`[${fichier}] « ${statut} » : mode d'exercice, pas de spécialité`, async () => {
            const r = await selecteurs(fichier, statut);
            return [[r.mode, true, 'mode d\'exercice'], [r.specialite, false, 'spécialité']];
        }]),
        [`[${fichier}] témoin « Interne » : spécialité, pas de mode d'exercice`, async () => {
            const r = await selecteurs(fichier, 'Interne');
            return [[r.mode, false, 'mode d\'exercice'], [r.specialite, true, 'spécialité']];
        }],
        [`[${fichier}] témoin « Médecin » : les deux`, async () => {
            const r = await selecteurs(fichier, 'Médecin');
            return [[r.mode, true, 'mode d\'exercice'], [r.specialite, true, 'spécialité']];
        }],
    ]),
];

(async () => {
    let echecs = 0;
    for (const [nom, cas] of CAS) {
        let verifs;
        try {
            verifs = await cas();
        } catch (e) {
            console.log(`  ECHEC  ${nom} : exception ${e.message}`);
            echecs += 1;
            continue;
        }
        const rates = verifs.filter(([obtenu, attendu]) => obtenu !== attendu);
        if (rates.length) {
            rates.forEach(([obtenu, attendu, quoi]) =>
                console.log(`  ECHEC  ${nom} : ${quoi} = ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`));
            echecs += 1;
        } else {
            console.log(`  ok     ${nom}`);
        }
    }
    console.log(echecs ? `\n${echecs} cas en échec` : `\n${CAS.length} cas OK`);
    process.exit(echecs ? 1 : 0);
})();
