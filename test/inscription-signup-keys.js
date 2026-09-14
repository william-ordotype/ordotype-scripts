#!/usr/bin/env node
/**
 * Les clés d'inscription suivent l'offre affichée, jamais une offre vue avant.
 *
 * Chaque page /inscription/<offre> dépose dans le localStorage le commentaire,
 * le type de compte, la ville partenaire, la durée et le mode d'exercice de
 * l'offre. /membership/mes-informations les recopie ensuite dans Memberstack.
 *
 * Le piège : une offre qui n'a pas de valeur pour un champ ne remplaçait pas
 * celle laissée par une offre consultée plus tôt. Un visiteur qui parcourt
 * plusieurs offres avant de s'inscrire recevait donc le commentaire ou la
 * durée d'une autre offre. Ce test rejoue ce parcours, puis la synchronisation
 * de mes-informations, pour vérifier ce qui arrive réellement dans Memberstack.
 *
 * Usage : node test/inscription-signup-keys.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const LOADER = fs.readFileSync(path.join(ROOT, 'inscription/loader.js'), 'utf8');
const SYNC = fs.readFileSync(path.join(ROOT, 'mes-informations/memberstack-sync.js'), 'utf8');

const KEYS = ['signup-comment', 'signup-type-de-compte', 'signup-partnership-city', 'signup-duree-offre', 'signup-mode-dexercice', 'signup-statut', 'signup-specialite'];

// Les syncFields de la page mes-informations par défaut (voir mes-informations/README.md).
const SYNC_FIELDS = [
    { key: 'signup-comment', msField: 'comment' },
    { key: 'signup-type-de-compte', msField: 'type-de-compte' },
    { key: 'signup-partnership-city', msField: 'partnership-city' },
    { key: 'signup-duree-offre', msField: 'duree-de-loffre' },
    { key: 'signup-mode-dexercice', msField: 'mode-dexercice' },
];
const FILL_ONLY_FIELDS = [
    { key: 'signup-statut', msField: 'statut' },
    { key: 'signup-specialite', msField: 'specialite' },
];

// Trois offres telles que Webflow rend leur INSCRIPTION_CONFIG : un champ vide arrive en "".
const OFFRE_AVEC_DUREE = { comment: 'Maison de santé A', typeDeCompte: 'MSP', partnershipCity: 'Maison de santé A', dureeOffre: 'Compte 3 mois', modeDexercice: '', statut: 'Interne', specialite: "Médecine d'urgence" };
const OFFRE_AVEC_COMMENTAIRE = { comment: 'Hôpital B', typeDeCompte: 'AP-HP', partnershipCity: '', dureeOffre: '', modeDexercice: '', statut: '', specialite: '' };
const OFFRE_FINALE = { comment: '', typeDeCompte: 'Association C', partnershipCity: 'Association C retraités', dureeOffre: '', modeDexercice: 'Retraité', statut: 'Medecin', specialite: 'Médecine générale' };

function nouvellePage(url, stockage) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only', virtualConsole });
    Object.entries(stockage).forEach(([k, v]) => dom.window.localStorage.setItem(k, v));
    return { w: dom.window, erreurs };
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

/** Affiche successivement des pages d'offre dans le même navigateur. */
async function parcourir(configs, stockage = {}) {
    for (const config of configs) {
        const { w } = nouvellePage('https://www.ordotype.fr/inscription/offre', stockage);
        if (config !== undefined) w.INSCRIPTION_CONFIG = config;
        w.eval(LOADER);
        await attendre();
        stockage = lireStockage(w);
    }
    return stockage;
}

/** Rejoue la synchronisation de mes-informations pour un compte tout juste créé. */
async function synchroniser(stockage) {
    const { w } = nouvellePage('https://www.ordotype.fr/membership/mes-informations', stockage);
    const envoye = {};
    w.OrdoMesInfos = { config: { forceStatut: null, syncFields: SYNC_FIELDS, fillOnlyFields: FILL_ONLY_FIELDS } };
    w.$memberstackDom = {
        getCurrentMember: async () => ({ data: { id: 'mem_test', createdAt: new Date().toISOString(), customFields: {} } }),
        updateMember: async (p) => { Object.assign(envoye, p.customFields); },
    };
    w.eval(SYNC);
    await attendre();
    return envoye;
}

const CAS = [
    ['parcours de trois offres : seules les valeurs de la dernière restent', async () => {
        const s = await parcourir([OFFRE_AVEC_DUREE, OFFRE_AVEC_COMMENTAIRE, OFFRE_FINALE]);
        return [
            [s['signup-comment'], undefined, 'commentaire'],
            [s['signup-type-de-compte'], 'Association C', 'type de compte'],
            [s['signup-partnership-city'], 'Association C retraités', 'ville partenaire'],
            [s['signup-duree-offre'], undefined, 'durée'],
            [s['signup-mode-dexercice'], 'Retraité', 'mode d\'exercice'],
            [s['signup-statut'], 'Medecin', 'statut'],
            [s['signup-specialite'], 'Médecine générale', 'spécialité'],
        ];
    }],
    ['une offre sans statut ni spécialité efface ceux d\'une offre vue avant', async () => {
        const s = await parcourir([OFFRE_AVEC_DUREE, OFFRE_AVEC_COMMENTAIRE]);
        return [
            [s['signup-statut'], undefined, 'statut'],
            [s['signup-specialite'], undefined, 'spécialité'],
        ];
    }],
    ['après ce parcours, Memberstack ne reçoit rien des offres précédentes', async () => {
        const envoye = await synchroniser(await parcourir([OFFRE_AVEC_DUREE, OFFRE_AVEC_COMMENTAIRE, OFFRE_FINALE]));
        return [
            ['comment' in envoye, false, 'commentaire envoyé'],
            ['duree-de-loffre' in envoye, false, 'durée envoyée'],
            [envoye['type-de-compte'], 'Association C', 'type de compte envoyé'],
            [envoye['mode-dexercice'], 'Retraité', 'mode d\'exercice envoyé'],
            [envoye.statut, 'Medecin', 'statut envoyé'],
            [envoye.specialite, 'Médecine générale', 'spécialité envoyée'],
        ];
    }],
    ['une offre qui a toutes ses valeurs les pose toutes', async () => {
        const s = await parcourir([OFFRE_AVEC_DUREE]);
        return [
            [s['signup-comment'], 'Maison de santé A', 'commentaire'],
            [s['signup-type-de-compte'], 'MSP', 'type de compte'],
            [s['signup-partnership-city'], 'Maison de santé A', 'ville partenaire'],
            [s['signup-duree-offre'], 'Compte 3 mois', 'durée'],
        ];
    }],
    ['page sans INSCRIPTION_CONFIG : les clés déjà posées ne sont pas touchées', async () => {
        const avant = await parcourir([OFFRE_AVEC_DUREE]);
        const s = await parcourir([undefined], avant);
        return KEYS.map((k) => [s[k], avant[k], k]);
    }],
    ['les autres clés du localStorage ne sont pas touchées', async () => {
        const s = await parcourir([OFFRE_FINALE], { userId: 'rec123', 'signup-price-id': 'price_x' });
        return [
            [s.userId, 'rec123', 'userId'],
            [s['signup-price-id'], 'price_x', 'signup-price-id'],
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
