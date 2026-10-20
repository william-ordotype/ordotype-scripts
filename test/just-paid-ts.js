#!/usr/bin/env node
/**
 * Délai de grâce après un paiement (`justPaidTs`, 24 h) et bandeau « paiement échoué ».
 *
 * Memberstack affiche seul ce bandeau (`data-ms-bind:style` sur `has-failed-payment`).
 * Pendant le délai, il doit être masqué dès le chargeur, avant que Memberstack ne
 * l'affiche : masqué plus tard (member-redirects.js, chargé en dernier), il apparaissait
 * quelques secondes puis disparaissait (constaté par William le 20/10/2026).
 *
 * Ce qui doit tenir, pour homepage/loader.js et pathology/loader.js :
 *   - `justPaidTs` posé il y a 1 h : une règle !important masque le bandeau de la page
 *     (accueil `#banner-to-hide-payment-failed`, fiche `#pathologie-banner-payment-failed`) ;
 *   - témoins : posé il y a 25 h, ou absent : aucune règle ;
 *   - la règle l'emporte sur le style que Memberstack pose sur le bandeau.
 *
 * Usage : node test/just-paid-ts.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HEURE = 60 * 60 * 1000;
const REGLE = 'ordo-hide-payment-failed';

const PAGES = {
    accueil: { chargeur: 'homepage/loader.js', bandeau: 'banner-to-hide-payment-failed' },
    fiche: { chargeur: 'pathology/loader.js', bandeau: 'pathologie-banner-payment-failed' },
};

/** Charge le chargeur de `nom` ; `paye` = il y a combien de temps `justPaidTs` a été posé. */
function charge(nom, paye, source) {
    const { chargeur, bandeau } = PAGES[nom];
    const html = '<!doctype html><html><head>'
        + `<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@abc1234/${chargeur}"></script>`
        + `</head><body><div id="${bandeau}" class="hidden"></div></body></html>`;
    const dom = new JSDOM(html, { url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const w = dom.window;
    if (paye !== undefined) w.localStorage.setItem('justPaidTs', String(Date.now() - paye));
    try { w.eval(source || lire(chargeur)); } catch (e) { /* la file de chargement n'est pas l'objet de ce test */ }
    // Ce que fait Memberstack quand le membre est en échec de paiement.
    w.document.getElementById(bandeau).setAttribute('style', 'display:flex');
    const regle = w.document.getElementById(REGLE);
    return {
        regle,
        visible: w.getComputedStyle(w.document.getElementById(bandeau)).display !== 'none',
        cible: Boolean(regle && regle.textContent.includes('#' + bandeau + '{display:none!important}')),
    };
}

function cas(source = {}) {
    const resultats = [];
    for (const nom of Object.keys(PAGES)) {
        const une = charge(nom, HEURE, source[nom]);
        const tard = charge(nom, 25 * HEURE, source[nom]);
        const sans = charge(nom, undefined, source[nom]);
        resultats.push(
            [`[${nom}] payé il y a 1 h : règle !important sur le bon bandeau`, une.cible],
            [`[${nom}] payé il y a 1 h : bandeau masqué malgré le style de Memberstack`, !une.visible],
            [`[${nom}] témoin, payé il y a 25 h : aucune règle, bandeau visible`, une.regle !== null && tard.regle === null && tard.visible],
            [`[${nom}] témoin, sans justPaidTs : aucune règle, bandeau visible`, sans.regle === null && sans.visible],
        );
    }
    return resultats;
}

let echecs = 0;
for (const [nom, ok] of cas()) {
    console.log((ok ? '  ok     ' : '  ECHEC  ') + nom);
    if (!ok) echecs += 1;
}

// Témoins négatifs : le test doit casser si le code casse.
const MUTANTS = [
    ['délai porté à 48 h (le cas 25 h doit échouer)', (s) => s.replace('>= 24 * 60 * 60 * 1000', '>= 48 * 60 * 60 * 1000')],
    ['règle sans !important (le style de Memberstack doit gagner)', (s) => s.replace('{display:none!important}', '{display:none}')],
    ['masquage retiré (le cas 1 h doit échouer)', (s) => s.replace('document.head.appendChild(style);', '')],
];
for (const [quoi, muter] of MUTANTS) {
    const source = {};
    for (const [nom, { chargeur }] of Object.entries(PAGES)) {
        const muté = muter(lire(chargeur));
        if (muté === lire(chargeur)) { console.log(`  ECHEC  mutant « ${quoi} » : rien n'a changé dans ${chargeur}`); echecs += 1; }
        source[nom] = muté;
    }
    const tues = cas(source).filter(([, ok]) => !ok).length;
    console.log((tues ? '  ok     ' : '  ECHEC  ') + `mutant « ${quoi} » détecté par ${tues} cas`);
    if (!tues) echecs += 1;
}

console.log(echecs ? `\n${echecs} échec(s).` : '\ntout est bon');
process.exit(echecs ? 1 : 0);
