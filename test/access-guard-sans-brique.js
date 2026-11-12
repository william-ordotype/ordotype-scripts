#!/usr/bin/env node
/**
 * Garde de la page « problème de paiement » (probleme-de-paiement/access-guard.js).
 *
 * La brique past due veut dire « le membre a choisi de continuer avec un accès
 * limité » : l'accueil et les fiches ne le renvoient plus vers cette page au
 * prochain impayé. Elle ne se pose que par le bouton de la page. Le garde la
 * posait aussi à tout membre arrivé ici sans impayé, qui perdait ce renvoi pour
 * la suite.
 *
 * Ce qui doit tenir :
 *   - membre à jour, résilié, ou avec un prélèvement SEPA en route : renvoyé à
 *     l'accueil, AUCUN plan ajouté ;
 *   - membre en impayé (plan REQUIRES_PAYMENT, sans SEPA en route) : reste sur la
 *     page, aucun plan ajouté ;
 *   - pas de membre, lecture du membre en échec, `planConnections` absent :
 *     renvoyé à l'accueil, sans erreur ;
 *   - témoin : le garde d'origine (pose de la brique) est détecté.
 *
 * Usage : node test/access-guard-sans-brique.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FICHIER = 'probleme-de-paiement/access-guard.js';
const SEPA_TEMP = 'pln_sepa-temporary-lj4w0oky';
const MG = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';

/** Charge le garde avec un faux Memberstack, déclenche DOMContentLoaded, rend ce qui s'est passé. */
async function passe(source, lecture) {
    const ajouts = [];
    const handlers = [];
    const window = {
        location: { href: 'https://www.ordotype.fr/membership/probleme-de-paiement' },
        $memberstackDom: {
            getCurrentMember: lecture,
            addPlan: (arg) => { ajouts.push(arg); return Promise.resolve({}); },
        },
    };
    const contexte = {
        window,
        document: { addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') handlers.push(fn); } },
        console: { log() {}, error() {}, warn() {} },
    };
    vm.runInNewContext(source, contexte);
    handlers.forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 20));
    const reste = window.location.href === 'https://www.ordotype.fr/membership/probleme-de-paiement';
    return { renvoye: !reste && window.location.href === '/', reste, ajouts };
}

const membre = (plans) => () => Promise.resolve({ data: { id: 'mem_test', planConnections: plans } });

async function cas(source) {
    const r = [];
    let x;
    x = await passe(source, membre([{ planId: MG, status: 'ACTIVE' }]));
    r.push(['membre à jour : renvoyé à l\'accueil', x.renvoye]);
    r.push(['membre à jour : aucun plan ajouté', x.ajouts.length === 0]);
    x = await passe(source, membre([{ planId: MG, status: 'TRIALING' }]));
    r.push(['membre en essai : renvoyé, aucun plan ajouté', x.renvoye && x.ajouts.length === 0]);
    x = await passe(source, membre([{ planId: MG, status: 'CANCELED' }, { planId: 'pln_essai-expir--vr4r0ouk', status: 'ACTIVE' }]));
    r.push(['membre résilié : renvoyé, aucun plan ajouté', x.renvoye && x.ajouts.length === 0]);
    x = await passe(source, membre([{ planId: MG, status: 'REQUIRES_PAYMENT' }, { planId: SEPA_TEMP, status: 'ACTIVE' }]));
    r.push(['impayé avec SEPA en route : renvoyé, aucun plan ajouté', x.renvoye && x.ajouts.length === 0]);
    x = await passe(source, membre([{ planId: MG, status: 'REQUIRES_PAYMENT' }]));
    r.push(['membre en impayé : reste sur la page', x.reste]);
    r.push(['membre en impayé : aucun plan ajouté', x.ajouts.length === 0]);
    x = await passe(source, () => Promise.resolve({ data: null }));
    r.push(['pas de membre : renvoyé', x.renvoye && x.ajouts.length === 0]);
    x = await passe(source, () => Promise.reject(new Error('réseau')));
    r.push(['lecture du membre en échec : renvoyé', x.renvoye && x.ajouts.length === 0]);
    x = await passe(source, () => Promise.resolve({ data: { id: 'mem_test' } }));
    r.push(['planConnections absent : renvoyé, aucun plan ajouté', x.renvoye && x.ajouts.length === 0]);
    return r;
}

(async () => {
    let echecs = 0;
    const source = fs.readFileSync(path.join(ROOT, FICHIER), 'utf8');
    for (const [nom, ok] of await cas(source)) {
        console.log((ok ? '  ok     ' : '  ECHEC  ') + `[${FICHIER}] ${nom}`);
        if (!ok) echecs += 1;
    }
    // Témoin : on remet la pose de la brique avant le renvoi ; le test doit la voir.
    const mutant = source.replace(
        "                window.location.href = '/';\n            } else {",
        "                window.$memberstackDom.addPlan({ planId: 'pln_brique-past-due-os1c808ai' });\n"
        + "                window.location.href = '/';\n            } else {",
    );
    const vu = mutant !== source && (await cas(mutant)).some(([, ok]) => !ok);
    console.log((vu ? '  ok     ' : '  ECHEC  ') + `[${FICHIER}] témoin : pose de la brique détectée`);
    if (!vu) echecs += 1;

    console.log(echecs ? `\n${echecs} échec(s).` : '\ntout est bon');
    process.exit(echecs ? 1 : 0);
})();
