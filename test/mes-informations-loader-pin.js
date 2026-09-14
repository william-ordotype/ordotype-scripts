#!/usr/bin/env node
/**
 * Le chargeur de mes-informations charge ses scripts depuis sa propre version.
 *
 * Une page peut épingler le chargeur sur un commit pour ne pas dépendre du
 * cache de @main. Si le chargeur allait ensuite chercher ses scripts sur @main,
 * l'épingle ne protégerait que lui : core.js et les autres pourraient rester
 * dans une ancienne version. Ce test vérifie que toutes les URL chargées
 * suivent la version du chargeur, et que @main reste le comportement par
 * défaut.
 *
 * Usage : node test/mes-informations-loader-pin.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const LOADER = fs.readFileSync(path.join(ROOT, 'mes-informations/loader.js'), 'utf8');
const REPO = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts';

const attendre = () => new Promise((r) => setTimeout(r, 50));

/** Rejoue le chargeur comme s'il avait été servi depuis `srcChargeur`. */
async function charger(srcChargeur, config = {}) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/membership/mes-informations',
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const charges = [];
    Object.defineProperty(w.document, 'currentScript', {
        configurable: true,
        get: () => (srcChargeur === null ? null : { src: srcChargeur }),
    });
    // Aucun réseau : chaque élément ajouté est noté puis déclaré chargé.
    w.document.head.appendChild = (el) => {
        charges.push(el.src || el.href);
        setTimeout(() => el.onload && el.onload(), 0);
        return el;
    };
    w.MES_INFOS_CONFIG = config;
    w.eval(LOADER);
    await attendre();
    w.close();
    return charges.filter((u) => u.startsWith(REPO));
}

const CAS = [
    ['chargeur épinglé sur un commit : tous ses scripts suivent ce commit', async () => {
        const urls = await charger(`${REPO}@072c89c/mes-informations/loader.js`, { enableCheckout: true, enablePartnershipCity: true });
        return [
            [urls.length > 0, true, 'scripts chargés'],
            [urls.every((u) => u.startsWith(`${REPO}@072c89c/`)), true, 'toutes les URL sur @072c89c'],
            [urls.includes(`${REPO}@072c89c/mes-informations/core.js`), true, 'core.js épinglé'],
            [urls.includes(`${REPO}@072c89c/shared/memberstack-utils.js`), true, 'shared épinglé'],
            [urls.includes(`${REPO}@072c89c/mes-informations/checkout.js`), true, 'script conditionnel épinglé'],
        ];
    }],
    ['chargeur sur @main : comportement inchangé', async () => {
        const urls = await charger(`${REPO}@main/mes-informations/loader.js`);
        return [
            [urls.length > 0, true, 'scripts chargés'],
            [urls.every((u) => u.startsWith(`${REPO}@main/`)), true, 'toutes les URL sur @main'],
        ];
    }],
    ['origine inconnue ou introuvable : repli sur @main', async () => {
        const inconnue = await charger('https://exemple.test/loader.js');
        const absente = await charger(null);
        return [
            [inconnue.every((u) => u.startsWith(`${REPO}@main/`)) && inconnue.length > 0, true, 'src inconnue'],
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
