#!/usr/bin/env node
/**
 * Le chargeur des pages /inscription charge ses scripts depuis sa propre version.
 *
 * Même règle que mes-informations/loader.js : une page qui épingle le chargeur
 * sur un commit doit obtenir tous ses scripts dans ce commit, y compris
 * upgrade-fields.js. Sinon un script ajouté après l'épingle pourrait manquer ou
 * arriver dans une autre version que le chargeur.
 *
 * Usage : node test/inscription-loader-pin.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const LOADER = fs.readFileSync(path.join(ROOT, 'inscription/loader.js'), 'utf8');
const REPO = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts';

const attendre = () => new Promise((r) => setTimeout(r, 50));

async function charger(srcChargeur) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/inscription/offre',
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const charges = [];
    Object.defineProperty(w.document, 'currentScript', {
        configurable: true,
        get: () => (srcChargeur === null ? null : { src: srcChargeur }),
    });
    w.document.head.appendChild = (el) => {
        charges.push(el.src || el.href);
        setTimeout(() => el.onload && el.onload(), 0);
        return el;
    };
    w.INSCRIPTION_CONFIG = {};
    w.eval(LOADER);
    await attendre();
    w.close();
    return charges.filter((u) => u.startsWith(REPO));
}

const CAS = [
    ['chargeur épinglé : tous les scripts suivent le commit, upgrade-fields.js compris', async () => {
        const urls = await charger(`${REPO}@abc1234/inscription/loader.js`);
        return [
            [urls.length > 0, true, 'scripts chargés'],
            [urls.every((u) => u.startsWith(`${REPO}@abc1234/`)), true, 'toutes les URL sur @abc1234'],
            [urls.includes(`${REPO}@abc1234/inscription/upgrade-fields.js`), true, 'upgrade-fields.js chargé'],
        ];
    }],
    ['chargeur sur @main ou origine inconnue : @main', async () => {
        const main = await charger(`${REPO}@main/inscription/loader.js`);
        const absente = await charger(null);
        return [
            [main.every((u) => u.startsWith(`${REPO}@main/`)) && main.length > 0, true, '@main'],
            [absente.every((u) => u.startsWith(`${REPO}@main/`)) && absente.length > 0, true, 'currentScript absent'],
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
