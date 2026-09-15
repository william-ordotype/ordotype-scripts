#!/usr/bin/env node
/**
 * Le statut imposé par config.forceStatut.
 *
 * Une page peut imposer un statut au membre connecté. Selon le statut imposé,
 * il ne remplace pas n'importe quelle valeur :
 *   - « Interne » ne remplace qu'un statut vide ;
 *   - « Paramédical » ne remplace qu'un statut vide ou « IDE » ;
 *   - « Medecin » remplace tout statut différent, comme avant.
 * Un statut qui n'est pas remplacé reste tel quel, et les autres champs de la
 * page sont recopiés normalement.
 *
 * Usage : node test/force-statut.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SYNC = fs.readFileSync(path.join(ROOT, 'mes-informations/memberstack-sync.js'), 'utf8');

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function jouer({ membre, config, stockage = {} }) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://www.ordotype.fr/membership/mes-informations-internes',
        runScripts: 'outside-only',
        virtualConsole,
    });
    const w = dom.window;
    Object.entries(stockage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    const envoye = {};
    let appels = 0;
    w.OrdoMesInfos = { config };
    w.$memberstackDom = {
        getCurrentMember: async () => ({ data: membre }),
        updateMember: async (p) => {
            appels += 1;
            Object.assign(envoye, p.customFields);
        },
    };
    w.eval(SYNC);
    await attendre();
    const r = { envoye, appels, erreurs, cleUserId: w.localStorage.getItem('userId') };
    w.close();
    return r;
}

const membre = (statut) => ({ id: 'm1', createdAt: new Date().toISOString(), customFields: statut === undefined ? {} : { statut } });
const interne = { forceStatut: 'Interne', syncFields: [] };
const medecin = { forceStatut: 'Medecin', syncFields: [] };
const paramedical = { forceStatut: 'Paramédical', syncFields: [] };

const CAS = [
    ['Interne imposé, statut vide : passe Interne', async () => {
        const r = await jouer({ membre: membre(''), config: interne });
        return [[r.envoye.statut, 'Interne', 'statut envoyé']];
    }],
    ['Interne imposé, statut absent : passe Interne', async () => {
        const r = await jouer({ membre: membre(undefined), config: interne });
        return [[r.envoye.statut, 'Interne', 'statut envoyé']];
    }],
    ['Interne imposé, Résident : conservé, aucun appel', async () => {
        const r = await jouer({ membre: membre('Résident'), config: interne });
        return [[r.appels, 0, 'appels à Memberstack'], ['statut' in r.envoye, false, 'statut non envoyé']];
    }],
    ['Interne imposé, Medecin : statut conservé, aucun appel', async () => {
        const r = await jouer({ membre: membre('Medecin'), config: interne });
        return [[r.appels, 0, 'appels à Memberstack'], ['statut' in r.envoye, false, 'statut non envoyé']];
    }],
    ['Interne imposé, autre statut : conservé', async () => {
        const r = await jouer({ membre: membre('Autre professionnel de sante'), config: interne });
        return [[r.appels, 0, 'appels à Memberstack']];
    }],
    ['Interne imposé, déjà Interne : aucun appel', async () => {
        const r = await jouer({ membre: membre('Interne'), config: interne });
        return [[r.appels, 0, 'appels à Memberstack']];
    }],
    ['Interne imposé, Medecin, autre champ à recopier : champ recopié, statut conservé', async () => {
        const r = await jouer({
            membre: membre('Medecin'),
            config: { forceStatut: 'Interne', syncFields: [{ key: 'userId', msField: 'airtablerecordid' }] },
            stockage: { userId: 'mem_autre' },
        });
        return [
            [r.envoye.airtablerecordid, 'mem_autre', 'champ recopié'],
            ['statut' in r.envoye, false, 'statut non envoyé'],
            [r.cleUserId, null, 'clé consommée'],
        ];
    }],
    ['Medecin imposé, PADHUE : passe Medecin', async () => {
        const r = await jouer({ membre: membre('PADHUE'), config: medecin });
        return [[r.envoye.statut, 'Medecin', 'statut envoyé']];
    }],
    ['Medecin imposé, Interne : passe Medecin', async () => {
        const r = await jouer({ membre: membre('Interne'), config: medecin });
        return [[r.envoye.statut, 'Medecin', 'statut envoyé']];
    }],
    ['Medecin imposé, déjà Medecin : aucun appel', async () => {
        const r = await jouer({ membre: membre('Medecin'), config: medecin });
        return [[r.appels, 0, 'appels à Memberstack']];
    }],
    ['Paramédical imposé, IDE : passe Paramédical', async () => {
        const r = await jouer({ membre: membre('IDE'), config: paramedical });
        return [[r.envoye.statut, 'Paramédical', 'statut envoyé']];
    }],
    ['Paramédical imposé, Medecin : conservé', async () => {
        const r = await jouer({ membre: membre('Medecin'), config: paramedical });
        return [[r.appels, 0, 'appels à Memberstack']];
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
        } else {
            console.log(`  ok     ${nom}`);
        }
    }
    console.log(echecs ? `\n${echecs} cas en échec` : `\n${CAS.length} cas OK`);
    process.exit(echecs ? 1 : 0);
})();
