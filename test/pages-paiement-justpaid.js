#!/usr/bin/env node
/**
 * Pages de paiement et délai de grâce `justPaidTs`.
 *
 * Afficher une page de paiement n'est pas un paiement. Ces pages posaient `justPaidTs`
 * à l'affichage pour casser une boucle de redirection depuis l'accueil et les fiches ;
 * depuis le 20/10/2026 un impayé n'y est plus redirigé, et ce `justPaidTs` masquait le
 * bandeau « paiement échoué » pendant 24 h après une simple visite.
 *
 * Ce qui doit tenir, pour probleme-de-paiement(-cb) et moyen-de-paiement(-cb) :
 *   - charger la page ne pose PAS `justPaidTs` ;
 *   - un `justPaidTs` déjà posé (vrai paiement) n'est ni effacé ni rafraîchi ;
 *   - témoin : le chargeur d'origine (pose à l'affichage) est détecté.
 *
 * Usage : node test/pages-paiement-justpaid.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CHARGEURS = [
    'probleme-de-paiement/loader.js',
    'probleme-de-paiement-cb/loader.js',
    'moyen-de-paiement/loader.js',
    'moyen-de-paiement-cb/loader.js',
];
const ANCIEN = "    localStorage.setItem('justPaidTs', Date.now());\n";

function affiche(source, avant) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://www.ordotype.fr/membership/probleme-de-paiement', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    if (avant !== undefined) w.localStorage.setItem('justPaidTs', avant);
    try { w.eval(source); } catch (e) { /* le chargement des scripts partagés n'est pas l'objet de ce test */ }
    return w.localStorage.getItem('justPaidTs');
}

function cas(source) {
    const deja = '1700000000000';
    return [
        ['affichage sans paiement : pas de justPaidTs', affiche(source) === null],
        ['vrai paiement déjà posé : gardé tel quel', affiche(source, deja) === deja],
    ];
}

let echecs = 0;
for (const f of CHARGEURS) {
    const source = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [nom, ok] of cas(source)) {
        console.log((ok ? '  ok     ' : '  ECHEC  ') + `[${f}] ${nom}`);
        if (!ok) echecs += 1;
    }
    // Témoin : on remet la pose à l'affichage, le test doit la voir.
    const mutant = source.replace("    'use strict';\n", "    'use strict';\n" + ANCIEN);
    const vu = mutant !== source && cas(mutant).some(([, ok]) => !ok);
    console.log((vu ? '  ok     ' : '  ECHEC  ') + `[${f}] témoin : pose à l'affichage détectée`);
    if (!vu) echecs += 1;
}

console.log(echecs ? `\n${echecs} échec(s).` : '\ntout est bon');
process.exit(echecs ? 1 : 0);
