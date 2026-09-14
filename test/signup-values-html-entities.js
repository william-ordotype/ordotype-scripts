#!/usr/bin/env node
/**
 * Les valeurs d'offre arrivent dans Memberstack en texte réel, jamais échappées.
 *
 * Webflow écrit les champs CMS dans INSCRIPTION_CONFIG sous forme échappée
 * (« l&#39;Abbé », « d&#x27;exercice »). Stockées telles quelles, elles
 * finissaient dans Memberstack avec l'entité : une ville « SAU CH Pont l&#39;Abbé »,
 * et un mode d'exercice « Autre mode d&#x27;exercice » qui ne correspond à aucune
 * option de la liste du formulaire.
 *
 * Vérifié ici : le chargeur décode avant de stocker, y compris un double
 * échappement, et la synchronisation décode une valeur échappée déjà présente
 * dans le navigateur avant de l'écrire.
 *
 * Usage : node test/signup-values-html-entities.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const LOADER = fs.readFileSync(path.join(ROOT, 'inscription/loader.js'), 'utf8');
const SYNC = fs.readFileSync(path.join(ROOT, 'mes-informations/memberstack-sync.js'), 'utf8');

const attendre = () => new Promise((r) => setTimeout(r, 40));

function page(url) {
    const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    return dom.window;
}

async function charger(config) {
    const w = page('https://www.ordotype.fr/inscription/offre');
    w.document.head.appendChild = (el) => el;
    w.INSCRIPTION_CONFIG = config;
    w.eval(LOADER);
    await attendre();
    const lire = (k) => w.localStorage.getItem(k);
    const r = {
        city: lire('signup-partnership-city'),
        comment: lire('signup-comment'),
        mode: lire('signup-mode-dexercice'),
        type: lire('signup-type-de-compte'),
    };
    w.close();
    return r;
}

async function synchroniser(stockage) {
    const w = page('https://www.ordotype.fr/membership/mes-informations');
    Object.entries(stockage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    const envoye = {};
    w.OrdoMesInfos = { config: {
        forceStatut: null,
        syncFields: [{ key: 'signup-comment', msField: 'comment' }, { key: 'signup-partnership-city', msField: 'partnership-city' }],
        fillOnlyFields: [{ key: 'signup-mode-dexercice', msField: 'mode-dexercice' }],
    } };
    w.$memberstackDom = {
        getCurrentMember: async () => ({ data: { id: 'mem_1', createdAt: new Date().toISOString(), customFields: {} } }),
        updateMember: async (p) => { Object.assign(envoye, p.customFields); },
    };
    w.eval(SYNC);
    await attendre();
    w.close();
    return envoye;
}

const CAS = [
    ['chargeur : apostrophes échappées décodées avant stockage', async () => {
        const r = await charger({
            partnershipCity: 'SAU CH Pont l&#39;Abbé',
            comment: 'PADHUE Vrac issue d&#x27;un grand groupe PADHUE',
            modeDexercice: 'Autre mode d&#x27;exercice',
            typeDeCompte: 'SAU Gratuit',
        });
        return [
            [r.city, "SAU CH Pont l'Abbé", 'ville'],
            [r.comment, "PADHUE Vrac issue d'un grand groupe PADHUE", 'commentaire'],
            [r.mode, "Autre mode d'exercice", "mode d'exercice"],
            [r.type, 'SAU Gratuit', 'valeur sans entité inchangée'],
        ];
    }],
    ['chargeur : double échappement décodé', async () => {
        const r = await charger({ partnershipCity: 'SAU CH Pont l&amp;#39;Abbé' });
        return [[r.city, "SAU CH Pont l'Abbé", 'ville']];
    }],
    ['chargeur : une vraie esperluette et un chevron restent du texte', async () => {
        const r = await charger({ comment: 'A &amp; B &lt;test&gt;' });
        return [[r.comment, 'A & B <test>', 'commentaire']];
    }],
    ['synchronisation : valeur échappée déjà dans le navigateur écrite décodée', async () => {
        const envoye = await synchroniser({
            'signup-comment': 'PADHUE Vrac issue d&#39;un grand groupe PADHUE',
            'signup-partnership-city': 'SAU CH Pont l&#39;Abbé',
            'signup-mode-dexercice': 'Autre mode d&#x27;exercice',
        });
        return [
            [envoye.comment, "PADHUE Vrac issue d'un grand groupe PADHUE", 'commentaire'],
            [envoye['partnership-city'], "SAU CH Pont l'Abbé", 'ville'],
            [envoye['mode-dexercice'], "Autre mode d'exercice", "mode d'exercice"],
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
