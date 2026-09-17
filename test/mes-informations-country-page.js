#!/usr/bin/env node
/**
 * Mes informations : redirection vers la page pays depuis les pages statiques.
 *
 * Usage : node test/mes-informations-country-page.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'mes-informations/loader.js'), 'utf8');
const NAVIGATION = 'window.location.replace(';
if (SOURCE.split(NAVIGATION).length !== 2) {
    console.error(`le chargeur doit appeler ${NAVIGATION} exactement une fois`);
    process.exit(1);
}
const LOADER = SOURCE.replace(NAVIGATION, 'window.__navigate(');
const REPO = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function charger({ membre, sdk = 'ok', config = {}, url = 'https://www.ordotype.fr/membership/mes-informations', attente = 60 }) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url,
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const charges = [];
    const navigations = [];
    Object.defineProperty(w.document, 'currentScript', {
        configurable: true,
        get: () => ({ src: `${REPO}@main/mes-informations/loader.js` }),
    });
    w.document.head.appendChild = (el) => {
        charges.push(el.src || el.href);
        setTimeout(() => el.onload && el.onload(), 0);
        return el;
    };
    w.__navigate = (cible) => navigations.push(cible);
    w.MES_INFOS_CONFIG = config;
    if (sdk === 'ok') w.$memberstackDom = { getCurrentMember: async () => ({ data: membre }) };
    if (sdk === 'erreur') w.$memberstackDom = { getCurrentMember: async () => { throw new Error('401'); } };
    if (sdk === 'muet') w.$memberstackDom = { getCurrentMember: () => new Promise(() => {}) };
    w.eval(LOADER);
    await attendre(attente);
    w.close();
    return { navigations, charges: charges.filter((u) => u && u.startsWith(REPO)) };
}

const plan = (planId, status = 'ACTIVE') => ({ planId, status });
const membre = ({ plans = [], statut, country } = {}) => ({
    id: 'mem_test',
    planConnections: plans,
    customFields: Object.assign({}, statut === undefined ? {} : { statut }, country === undefined ? {} : { country }),
});
const ASSISTANT_BE = 'pln_praticien-belgique-gratuit--eif0fox';
const MVES_LU = 'pln_module-m-decine-g-n-rale-mves--ayrm059e';
const COMPTE_INTERNE = 'pln_compte-interne-sy4j0oft';
const MG_FR = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';

const renvoye = (r, cible) => [
    [r.navigations.length, 1, 'une seule redirection'],
    [r.navigations[0], cible, 'page pays'],
    [r.charges.length, 0, 'aucun script chargé'],
];
const reste = (r) => [
    [r.navigations.length, 0, 'aucune redirection'],
    [r.charges.length > 0, true, 'scripts chargés'],
];

const CAS = [
    ['plan Assistant (Belgique) : page assistant-belgique, paramètres gardés', async () => renvoye(
        await charger({ membre: membre({ plans: [plan(ASSISTANT_BE)] }), url: 'https://www.ordotype.fr/membership/mes-informations?fromCheckout=true#haut' }),
        '/mes-informations/assistant-belgique?fromCheckout=true#haut',
    )],
    ['plan MVES (Luxembourg) : page mves-luxembourg', async () => renvoye(
        await charger({ membre: membre({ plans: [plan(MVES_LU, 'TRIALING')] }) }),
        '/mes-informations/mves-luxembourg',
    )],
    ['statut « Médecin assistant » sans plan pays : page suisse', async () => renvoye(
        await charger({ membre: membre({ statut: 'Médecin assistant' }) }),
        '/mes-informations/medecin-assistant-suisse',
    )],
    ['statut « Assistant » : page belge', async () => renvoye(
        await charger({ membre: membre({ statut: ' Assistant ', plans: [plan(MG_FR)] }) }),
        '/mes-informations/assistant-belgique',
    )],
    ['compte interne, pays Suisse : page suisse', async () => renvoye(
        await charger({ membre: membre({ plans: [plan(COMPTE_INTERNE)], statut: 'Interne', country: 'Switzerland' }), url: 'https://www.ordotype.fr/membership/mes-informations-internes' }),
        '/mes-informations/medecin-assistant-suisse',
    )],
    ['compte interne, pays Belgique : page belge', async () => renvoye(
        await charger({ membre: membre({ plans: [plan(COMPTE_INTERNE)], statut: '', country: 'Belgium' }) }),
        '/mes-informations/assistant-belgique',
    )],
    ['compte interne, pays France : aucune redirection', async () => reste(
        await charger({ membre: membre({ plans: [plan(COMPTE_INTERNE)], statut: 'Interne', country: 'France' }) }),
    )],
    ['praticien MG au Luxembourg : aucune redirection (seuls les plans interne suivent le pays)', async () => reste(
        await charger({ membre: membre({ plans: [plan(MG_FR)], statut: 'Medecin', country: 'Luxembourg' }) }),
    )],
    ['plan Assistant résilié, statut Interne en France : aucune redirection', async () => reste(
        await charger({ membre: membre({ plans: [plan(ASSISTANT_BE, 'CANCELED')], statut: 'Interne', country: 'France' }) }),
    )],
    ['page de paiement SEPA : jamais redirigée', async () => reste(
        await charger({ membre: membre({ plans: [plan(ASSISTANT_BE)] }), config: { enableCheckout: true } }),
    )],
    ['page praticien (délai de grâce après paiement) : jamais redirigée', async () => reste(
        await charger({ membre: membre({ statut: 'MEVS' }), config: { setJustPaidTs: true } }),
    )],
    ['page ville partenaire : jamais redirigée', async () => reste(
        await charger({ membre: membre({ plans: [plan(COMPTE_INTERNE)], country: 'Luxembourg' }), config: { enablePartnershipCity: true } }),
    )],
    ['membre déconnecté : chargement normal', async () => reste(await charger({ membre: null }))],
    ['sans SDK Memberstack : chargement normal', async () => reste(await charger({ sdk: 'absent' }))],
    ['SDK en erreur : chargement normal', async () => reste(await charger({ sdk: 'erreur' }))],
    ['SDK muet : chargement normal après le délai', async () => {
        const avant = await charger({ sdk: 'muet', attente: 200 });
        const apres = await charger({ sdk: 'muet', attente: 3300 });
        return [
            [avant.charges.length, 0, 'rien chargé pendant l\'attente'],
            [apres.navigations.length, 0, 'aucune redirection'],
            [apres.charges.length > 0, true, 'scripts chargés après le délai'],
        ];
    }],
];

(async () => {
    let echecs = 0;
    for (const [nom, cas] of CAS) {
        const verifs = await cas();
        const ko = verifs.filter(([obtenu, attendu]) => obtenu !== attendu);
        if (ko.length) {
            echecs += 1;
            console.log(`✗ ${nom}`);
            ko.forEach(([obtenu, attendu, quoi]) => console.log(`    ${quoi} : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`));
        } else {
            console.log(`✓ ${nom}`);
        }
    }
    console.log(echecs ? `\n${echecs} cas en échec sur ${CAS.length}` : `\n${CAS.length} cas OK`);
    process.exit(echecs ? 1 : 0);
})();
