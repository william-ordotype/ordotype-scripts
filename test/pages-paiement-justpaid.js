#!/usr/bin/env node
/**
 * Pages de paiement et délai de grâce `justPaidTs`.
 *
 * Afficher une page de paiement n'est pas un paiement. Ces pages posaient `justPaidTs`
 * à l'affichage pour que l'accueil et les fiches n'y renvoient pas l'impayé à chaque
 * clic ; ce `justPaidTs` masquait aussi le bandeau « paiement échoué » pendant 24 h
 * après une simple visite. Depuis le 20/10/2026, ce rôle est tenu par le repère
 * `paymentPageSeenTs`, qui ne masque aucun bandeau.
 *
 * Ce qui doit tenir, pour probleme-de-paiement(-cb) et moyen-de-paiement(-cb) :
 *   - charger la page ne pose PAS `justPaidTs` ;
 *   - charger la page pose le repère `paymentPageSeenTs` (l'accueil et les fiches ne
 *     renvoient plus ici pendant 24 h, sans masquer le bandeau) ;
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

function affiche(source, avant, cle = 'justPaidTs') {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://www.ordotype.fr/membership/probleme-de-paiement', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    if (avant !== undefined) w.localStorage.setItem('justPaidTs', avant);
    try { w.eval(source); } catch (e) { /* le chargement des scripts partagés n'est pas l'objet de ce test */ }
    return w.localStorage.getItem(cle);
}

function cas(source) {
    const deja = '1700000000000';
    return [
        ['affichage sans paiement : pas de justPaidTs', affiche(source) === null],
        ['vrai paiement déjà posé : gardé tel quel', affiche(source, deja) === deja],
        ['affichage : repère paymentPageSeenTs posé', /^\d{13}$/.test(affiche(source, undefined, 'paymentPageSeenTs') || '')],
    ];
}

let echecs = 0;
for (const f of CHARGEURS) {
    const source = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [nom, ok] of cas(source)) {
        console.log((ok ? '  ok     ' : '  ECHEC  ') + `[${f}] ${nom}`);
        if (!ok) echecs += 1;
    }
    // Témoins : on remet la pose de justPaidTs à l'affichage, puis on retire le
    // repère ; le test doit voir chacun des deux.
    const mutant = source.replace("    'use strict';\n", "    'use strict';\n" + ANCIEN);
    const vu = mutant !== source && cas(mutant).some(([, ok]) => !ok);
    console.log((vu ? '  ok     ' : '  ECHEC  ') + `[${f}] témoin : pose de justPaidTs à l'affichage détectée`);
    if (!vu) echecs += 1;
    const sansRepere = source.replace("localStorage.setItem('paymentPageSeenTs', String(Date.now()));", '');
    const vuRepere = sansRepere !== source && cas(sansRepere).some(([, ok]) => !ok);
    console.log((vuRepere ? '  ok     ' : '  ECHEC  ') + `[${f}] témoin : repère retiré détecté`);
    if (!vuRepere) echecs += 1;
}

console.log(echecs ? `\n${echecs} échec(s).` : '\ntout est bon');
process.exit(echecs ? 1 : 0);
