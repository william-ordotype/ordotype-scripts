#!/usr/bin/env node
/**
 * Une offre spéciale ne reprend pas les clés d'une offre /inscription vue avant.
 *
 * Une page /inscription/<offre> dépose dans le localStorage la durée, le mode
 * d'exercice, le statut et la spécialité de l'offre. /membership/mes-informations
 * les recopie ensuite dans Memberstack, et c'est aussi là que revient le paiement
 * d'une offre spéciale.
 *
 * Le piège : une offre spéciale n'a aucun de ces champs et ne touchait pas à ces
 * clés. Un visiteur qui avait consulté une offre /inscription puis souscrit une
 * offre spéciale recevait donc la durée, le mode d'exercice, le statut et la
 * spécialité de l'autre offre. Ce test rejoue ce parcours, puis la
 * synchronisation de mes-informations, pour vérifier ce qui arrive dans Memberstack.
 *
 * Usage : node test/offre-speciale-signup-keys.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const INSCRIPTION_LOADER = fs.readFileSync(path.join(ROOT, 'inscription/loader.js'), 'utf8');
const OFFRE_SPECIALE_LOADER = fs.readFileSync(path.join(ROOT, 'inscription-offre-speciale/loader.js'), 'utf8');
const SYNC = fs.readFileSync(path.join(ROOT, 'mes-informations/memberstack-sync.js'), 'utf8');

const CLES_DE_L_OFFRE = ['signup-duree-offre', 'signup-mode-dexercice', 'signup-statut', 'signup-specialite'];

// La configuration de /membership/mes-informations (voir mes-informations/README.md).
const SYNC_FIELDS = [
    { key: 'signup-comment', msField: 'comment' },
    { key: 'signup-type-de-compte', msField: 'type-de-compte' },
    { key: 'userId', msField: 'airtablerecordid' },
    { key: 'signup-partnership-city', msField: 'partnership-city' },
    { key: 'signup-duree-offre', msField: 'duree-de-loffre' },
];
const FILL_ONLY_FIELDS = [
    { key: 'signup-mode-dexercice', msField: 'mode-dexercice' },
    { key: 'signup-statut', msField: 'statut' },
    { key: 'signup-specialite', msField: 'specialite' },
];

const OFFRE_INSCRIPTION = { comment: 'Association A', typeDeCompte: 'Association A', partnershipCity: 'Association A', dureeOffre: 'Compte 3 mois', modeDexercice: 'Retraité', statut: 'Medecin', specialite: 'Médecine générale' };

// Le code de page d'une offre spéciale tel que Webflow le rend : les champs vides arrivent en "".
function codeDePageOffreSpeciale(w) {
    w.COUNTDOWN_CONFIG = { slug: 'offre-test', expiresAutomatically: false };
    w.WINBACK_GATE = false;
    w.CMS_CHECKOUT_CONFIG = {
        priceId: 'price_test',
        couponId: 'coupon_test',
        successUrl: w.location.origin + '/membership/mes-informations',
        cancelUrl: w.location.origin + '/inscription-offre-speciale/offre-test',
        paymentMethods: ['sepa_debit'],
        option: 'offre-speciale',
    };
    w.localStorage.setItem('locat', w.location.href);
    w.localStorage.setItem('signup-type-de-compte', '');
    w.localStorage.setItem('signup-comment', '');
    w.localStorage.setItem('signup-partnership-city', '');
    w.localStorage.setItem('signup-price-id', 'price_test');
    w.localStorage.setItem('signup-coupon-id', 'coupon_test');
    w.localStorage.setItem('signup-cancel-url', w.location.origin + '/inscription-offre-speciale/offre-test');
    w.localStorage.setItem('signup-success-url', w.location.origin + '/membership/mes-informations');
    w.localStorage.setItem('signup-payment-methods', 'sepa_debit');
}

function nouvellePage(url, stockage) {
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM('<!doctype html><head></head><body></body>', { url, runScripts: 'outside-only', virtualConsole });
    Object.entries(stockage).forEach(([k, v]) => dom.window.localStorage.setItem(k, v));
    return dom.window;
}

function lireStockage(w) {
    const out = {};
    for (let i = 0; i < w.localStorage.length; i++) {
        const k = w.localStorage.key(i);
        out[k] = w.localStorage.getItem(k);
    }
    return out;
}

const attendre = () => new Promise((r) => setTimeout(r, 30));

async function voirOffreInscription(stockage) {
    const w = nouvellePage('https://www.ordotype.fr/inscription/offre', stockage);
    w.INSCRIPTION_CONFIG = OFFRE_INSCRIPTION;
    w.eval(INSCRIPTION_LOADER);
    await attendre();
    const s = lireStockage(w);
    w.close();
    return s;
}

async function voirOffreSpeciale(stockage) {
    const w = nouvellePage('https://www.ordotype.fr/inscription-offre-speciale/offre-test', stockage);
    codeDePageOffreSpeciale(w);
    w.eval(OFFRE_SPECIALE_LOADER);
    await attendre();
    const s = lireStockage(w);
    w.close();
    return s;
}

/** Rejoue la synchronisation de mes-informations pour le membre donné. */
async function synchroniser(stockage, membre) {
    const w = nouvellePage('https://www.ordotype.fr/membership/mes-informations', stockage);
    const envoye = {};
    w.OrdoMesInfos = { config: { forceStatut: null, syncFields: SYNC_FIELDS, fillOnlyFields: FILL_ONLY_FIELDS } };
    w.$memberstackDom = {
        getCurrentMember: async () => ({ data: membre }),
        updateMember: async (p) => { Object.assign(envoye, p.customFields); },
    };
    w.eval(SYNC);
    await attendre();
    w.close();
    return envoye;
}

const NOUVEAU_COMPTE = { id: 'mem_nouveau', createdAt: new Date().toISOString(), customFields: {} };
const COMPTE_EXISTANT = { id: 'mem_existant', createdAt: '2024-01-15T10:00:00.000Z', customFields: { 'duree-de-loffre': '', statut: 'Medecin', 'mode-dexercice': 'Liberal' } };

const CAS = [
    ['une offre spéciale efface la durée, le mode d\'exercice, le statut et la spécialité d\'une offre vue avant', async () => {
        const s = await voirOffreSpeciale(await voirOffreInscription({}));
        return CLES_DE_L_OFFRE.map((k) => [s[k], undefined, k]);
    }],
    ['nouveau compte : Memberstack ne reçoit rien de l\'offre vue avant', async () => {
        const envoye = await synchroniser(await voirOffreSpeciale(await voirOffreInscription({})), NOUVEAU_COMPTE);
        return ['duree-de-loffre', 'mode-dexercice', 'statut', 'specialite', 'comment', 'type-de-compte', 'partnership-city']
            .map((champ) => [champ in envoye, false, `${champ} envoyé`]);
    }],
    ['membre existant qui reprend une offre : sa durée d\'offre n\'est pas écrasée', async () => {
        const envoye = await synchroniser(await voirOffreSpeciale(await voirOffreInscription({})), COMPTE_EXISTANT);
        return [['duree-de-loffre' in envoye, false, 'duree-de-loffre envoyé']];
    }],
    ['les clés propres à l\'offre spéciale et les autres clés restent en place', async () => {
        const s = await voirOffreSpeciale({ userId: 'rec123' });
        return [
            [s.userId, 'rec123', 'userId'],
            [s['signup-price-id'], 'price_test', 'signup-price-id'],
            [s['signup-coupon-id'], 'coupon_test', 'signup-coupon-id'],
            [s['signup-success-url'], 'https://www.ordotype.fr/membership/mes-informations', 'signup-success-url'],
            [s['signup-payment-methods'], 'sepa_debit', 'signup-payment-methods'],
        ];
    }],
    ['stockage inaccessible : la page d\'offre fonctionne quand même', async () => {
        const w = nouvellePage('https://www.ordotype.fr/inscription-offre-speciale/offre-test', {});
        w.CMS_CHECKOUT_CONFIG = { priceId: 'price_test' };
        Object.defineProperty(w, 'localStorage', { get() { throw new Error('SecurityError'); } });
        let exception = null;
        try { w.eval(OFFRE_SPECIALE_LOADER); } catch (e) { exception = e.message; }
        await attendre();
        const priceId = w.STRIPE_CHECKOUT_CONFIG && w.STRIPE_CHECKOUT_CONFIG.priceId;
        w.close();
        return [
            [exception, null, 'exception levée'],
            [priceId, 'price_test', 'configuration du paiement'],
        ];
    }],
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
            continue;
        }
        console.log(`  ok     ${nom}`);
    }
    if (echecs) {
        console.error(`\n${echecs} cas en échec sur ${CAS.length}.`);
        process.exit(1);
    }
    console.log(`\n${CAS.length} cas vérifiés.`);
})();
