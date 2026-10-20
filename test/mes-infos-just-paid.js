#!/usr/bin/env node
/**
 * mes-informations/core.js ne pose justPaidTs qu'au retour d'un vrai paiement.
 *
 * La page praticien-sepa s'affiche avant le paiement et la page praticien peut
 * être rouverte plus tard : la pose à l'affichage donnait 24 h sans redirection
 * ni bandeau de facturation à un membre qui n'avait rien payé. Ce test rejoue
 * core.js sur les adresses vues dans GA4 (retour Stripe `ordo_checkout=cs_…`,
 * retour Memberstack `fromCheckout=true`) et sur les ouvertures hors paiement.
 *
 * Témoin : `CORE=<fichier> node test/mes-infos-just-paid.js` rejoue un autre
 * core.js (l'ancien doit échouer sur les cas hors paiement).
 *
 * Usage : node test/mes-infos-just-paid.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(process.env.CORE || path.join(ROOT, 'mes-informations/core.js'), 'utf8');
const BASE = 'https://www.ordotype.fr/membership/';
const PRATICIEN = { forceStatut: 'Medecin', setJustPaidTs: true };
const PRATICIEN_SEPA = { forceStatut: 'Medecin', setJustPaidTs: true, enableCheckout: true };

/** Rejoue core.js sur `adresse` et rend la valeur de justPaidTs (null si absente). */
function poser(adresse, config, { refusStockage = false } = {}) {
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: BASE + adresse,
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    if (refusStockage) {
        w.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    }
    w.MES_INFOS_CONFIG = config;
    let erreur = null;
    try { w.eval(CORE); } catch (e) { erreur = e; }
    const valeur = w.localStorage.getItem('justPaidTs');
    const expose = Boolean(w.OrdoMesInfos);
    w.close();
    return { valeur, erreur, expose };
}

const CAS = [
    ['retour Stripe (ordo_checkout=cs_…) sur la page praticien : pose', () =>
        [[poser('mes-informations-praticien?ordo_checkout=cs_live_a1B2c3', PRATICIEN).valeur !== null, true]]],
    ['retour Memberstack (fromCheckout=true) sur la page praticien : pose', () =>
        [[poser('mes-informations-praticien?forceRefetch=true&fromCheckout=true&msPriceId=prc_x', PRATICIEN).valeur !== null, true]]],
    ['page praticien rouverte sans paramètre : pas de pose', () =>
        [[poser('mes-informations-praticien', PRATICIEN).valeur, null]]],
    ['page praticien-sepa affichée avant le paiement : pas de pose', () =>
        [[poser('mes-informations-praticien-sepa', PRATICIEN_SEPA).valeur, null]]],
    ['gabarit Stripe non remplacé ({CHECKOUT_SESSION_ID}) : pas de pose', () =>
        [[poser('mes-informations-praticien?ordo_checkout=%7BCHECKOUT_SESSION_ID%7D', PRATICIEN).valeur, null]]],
    ['ordo_checkout vide ou sans cs_ : pas de pose', () => [
        [poser('mes-informations-praticien?ordo_checkout=', PRATICIEN).valeur, null, 'vide'],
        [poser('mes-informations-praticien?ordo_checkout=x', PRATICIEN).valeur, null, 'x'],
    ]],
    ['fromCheckout autre que true : pas de pose', () =>
        [[poser('mes-informations-praticien?fromCheckout=false', PRATICIEN).valeur, null]]],
    ['page sans setJustPaidTs, même au retour de paiement : pas de pose', () =>
        [[poser('mes-informations?ordo_checkout=cs_live_a1B2c3', { syncFields: [] }).valeur, null]]],
    ['stockage refusé : pas d’erreur, OrdoMesInfos exposé', () => {
        const r = poser('mes-informations-praticien?ordo_checkout=cs_live_a1B2c3', PRATICIEN, { refusStockage: true });
        return [[r.erreur, null, 'erreur'], [r.expose, true, 'OrdoMesInfos']];
    }],
];

let echecs = 0;
for (const [nom, cas] of CAS) {
    const verifs = cas();
    const ko = verifs.filter(([obtenu, attendu]) => obtenu !== attendu);
    if (ko.length) {
        echecs++;
        console.log(`✗ ${nom}`);
        ko.forEach(([obtenu, attendu, quoi]) => console.log(`    ${quoi || 'valeur'} : obtenu ${obtenu}, attendu ${attendu}`));
    } else {
        console.log(`✓ ${nom}`);
    }
}
console.log(`\n${CAS.length - echecs}/${CAS.length}`);
process.exit(echecs ? 1 : 0);
