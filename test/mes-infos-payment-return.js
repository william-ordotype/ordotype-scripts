#!/usr/bin/env node
/**
 * mes-informations/payment-return.js : au retour d'un paiement, un visiteur sans
 * session voit « Paiement bien reçu » et un bouton de connexion, à la place de la
 * carte vide (Memberstack retire le formulaire de profil quand personne n'est
 * connecté). Un membre connecté, ou une ouverture hors paiement, ne voit rien de
 * nouveau.
 *
 * Témoin : `SCRIPT=<fichier> node test/mes-infos-payment-return.js` rejoue un
 * autre payment-return.js.
 *
 * Usage : node test/mes-infos-payment-return.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'mes-informations/core.js'), 'utf8');
const SCRIPT = fs.readFileSync(process.env.SCRIPT || path.join(ROOT, 'mes-informations/payment-return.js'), 'utf8');
const BASE = 'https://www.ordotype.fr/membership/';
const RETOUR = 'mes-informations-praticien?ordo_checkout=cs_live_a1B2c3';

// Carte de la page, telle que servie par Webflow.
const CARTE = '<div class="inscr-p_card"><div class="inscr-p_form-block w-form">'
    + '<form data-ms-form="profile" class="inscription_form"><div class="inscr-p_head">'
    + '<h2 class="heading-h1-docs">Mes informations</h2></div>'
    + '<input type="submit" class="button w-button" value="Continuer"></form>'
    + '<div class="w-form-done"></div><div class="w-form-fail"></div></div></div>'
    + '<div class="inscr-p_help">Un souci d’inscription ?</div>';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const DECONNECTE = () => Promise.resolve({ data: null });
const CONNECTE = () => Promise.resolve({ data: { id: 'mem_test' } });

/**
 * Rejoue core.js puis payment-return.js sur `adresse`.
 * `membre` : réponse de getCurrentMember ; `sdkApres` : délai d'arrivée du SDK
 * (null = jamais) ; `corps` : HTML de la page ; `avant(w)` : réglage avant scripts.
 */
async function rejouer(adresse, { membre = DECONNECTE, sdkApres = 0, corps = CARTE, avant, executions = 1, apres } = {}) {
    const logs = [];
    const vc = new VirtualConsole();
    ['log', 'warn', 'error'].forEach((t) => vc.on(t, (...a) => logs.push(t + ': ' + a.join(' '))));
    const dom = new JSDOM('<!doctype html><body>' + corps + '</body>', {
        url: BASE + adresse,
        runScripts: 'outside-only',
        virtualConsole: vc,
    });
    const w = dom.window;
    let appels = 0;
    const signalements = [];
    const sdk = { getCurrentMember: () => { appels++; return membre(); } };
    w.OrdoErrorReporter = { reportSideEffect: (ctx, err) => signalements.push(ctx + ': ' + err.message) };
    if (sdkApres === 0) w.$memberstackDom = sdk;
    else if (sdkApres !== null) setTimeout(() => { w.$memberstackDom = sdk; }, sdkApres);
    if (avant) avant(w);
    const rejets = [];
    w.addEventListener('unhandledrejection', (e) => rejets.push(e.reason));
    let erreur = null;
    try {
        w.eval(CORE);
        for (let i = 0; i < executions; i++) w.eval(SCRIPT);
    } catch (e) { erreur = e; }
    await attendre(sdkApres > 0 ? sdkApres + 400 : 50);
    if (apres) await apres(w);
    const blocs = w.document.querySelectorAll('[data-ordo-payment-return]');
    const bloc = blocs[0] || null;
    const lien = bloc && bloc.querySelector('a');
    const r = {
        affiche: blocs.length > 0,
        nombre: blocs.length,
        dansCarte: Boolean(bloc && bloc.parentNode.classList.contains('inscr-p_card')),
        avantFormulaire: Boolean(bloc && bloc.nextElementSibling && bloc.nextElementSibling.classList.contains('inscr-p_form-block')),
        titre: bloc && bloc.querySelector('h2').textContent,
        phrase: bloc && bloc.querySelector('p').textContent,
        lien: lien && lien.getAttribute('href'),
        bouton: lien && lien.textContent,
        classes: bloc && [bloc.className, bloc.querySelector('.inscr-p_head') && 'inscr-p_head', lien.className].join(' | '),
        appels, signalements, erreur, rejets, logs, w,
    };
    return r;
}

const CAS = [
    ['non connecté au retour Stripe : message dans la carte, avant le formulaire', async () => {
        const r = await rejouer(RETOUR);
        return [
            [r.affiche, true, 'affiché'],
            [r.dansCarte, true, 'dans la carte'],
            [r.avantFormulaire, true, 'avant l’enveloppe du formulaire'],
            [r.titre, 'Paiement bien reçu', 'titre'],
            [r.phrase, 'Connectez-vous pour terminer votre inscription.', 'phrase'],
            [r.bouton, 'Se connecter', 'bouton'],
            [r.lien, '/membership/login-ms', 'lien'],
            [r.classes, 'inscription_form | inscr-p_head | button w-button', 'classes de la page'],
        ];
    }],
    ['formulaire déjà retiré par Memberstack : message dans l’enveloppe restante', async () => {
        const r = await rejouer(RETOUR, { avant: (w) => w.document.querySelector('form').remove() });
        return [[r.affiche, true, 'affiché'], [r.avantFormulaire, true, 'avant l’enveloppe'], [r.signalements.length, 0, 'signalements']];
    }],
    ['formulaire retiré après l’affichage : le message reste', async () => {
        const r = await rejouer(RETOUR, { apres: async (w) => { w.document.querySelector('form').remove(); await attendre(10); } });
        return [[r.affiche, true, 'affiché']];
    }],
    ['membre connecté au retour Stripe : rien', async () => {
        const r = await rejouer(RETOUR, { membre: CONNECTE });
        return [[r.affiche, false, 'affiché'], [r.appels, 1, 'getCurrentMember appelé']];
    }],
    ['membre connecté, réponse sans enveloppe data : rien', async () => {
        const r = await rejouer(RETOUR, { membre: () => Promise.resolve({ id: 'mem_test' }) });
        return [[r.affiche, false, 'affiché']];
    }],
    ['ouverture hors paiement, non connecté : rien, Memberstack pas interrogé', async () => {
        const r = await rejouer('mes-informations-praticien');
        return [[r.affiche, false, 'affiché'], [r.appels, 0, 'getCurrentMember appelé']];
    }],
    ['gabarit Stripe non remplacé ou ordo_checkout sans cs_ : rien', async () => [
        [(await rejouer('mes-informations-praticien?ordo_checkout=%7BCHECKOUT_SESSION_ID%7D')).affiche, false, 'gabarit'],
        [(await rejouer('mes-informations-praticien?ordo_checkout=x')).affiche, false, 'x'],
    ]],
    ['retour Memberstack (fromCheckout=true), non connecté : message', async () => {
        const r = await rejouer('mes-informations-praticien?forceRefetch=true&fromCheckout=true');
        return [[r.affiche, true, 'affiché']];
    }],
    ['clic sur « Se connecter » : locat remis sur l’adresse de la page', async () => {
        const r = await rejouer(RETOUR);
        r.w.localStorage.setItem('locat', 'https://www.ordotype.fr/pathologies/autre-onglet');
        const lien = r.w.document.querySelector('[data-ordo-payment-return] a');
        lien.addEventListener('click', (e) => e.preventDefault());
        lien.click();
        return [[r.w.localStorage.getItem('locat'), BASE + RETOUR, 'locat']];
    }],
    ['SDK Memberstack arrivé en retard : message', async () => {
        const r = await rejouer(RETOUR, { sdkApres: 300 });
        return [[r.affiche, true, 'affiché']];
    }],
    ['SDK Memberstack jamais arrivé : rien, pas d’erreur', async () => {
        const r = await rejouer(RETOUR, {
            sdkApres: null,
            avant: (w) => { const t = w.setTimeout; w.setTimeout = (f) => t(f, 0); },
        });
        await attendre(100);
        return [
            [r.affiche, false, 'affiché'],
            [r.erreur, null, 'erreur'],
            [r.logs.some((l) => /SDK not available/.test(l)), true, 'avertissement en console'],
        ];
    }],
    ['getCurrentMember rejette : rien, pas de rejet non géré', async () => {
        const r = await rejouer(RETOUR, { membre: () => Promise.reject(new Error('réseau')) });
        return [[r.affiche, false, 'affiché'], [r.rejets.length, 0, 'rejets non gérés'], [r.erreur, null, 'erreur']];
    }],
    ['script exécuté deux fois : un seul message', async () => {
        const r = await rejouer(RETOUR, { executions: 2 });
        return [[r.nombre, 1, 'messages']];
    }],
    ['page sans enveloppe de formulaire : signalé une fois, pas d’erreur', async () => {
        const r = await rejouer(RETOUR, { corps: '<div class="inscr-p_card"></div>' });
        return [[r.affiche, false, 'affiché'], [r.signalements.length, 1, 'signalements'], [r.erreur, null, 'erreur']];
    }],
    ['stockage refusé : message affiché, clic sans erreur', async () => {
        const r = await rejouer(RETOUR, { avant: (w) => { w.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); }; } });
        let erreurClic = null;
        try {
            const lien = r.w.document.querySelector('[data-ordo-payment-return] a');
            lien.addEventListener('click', (e) => e.preventDefault());
            lien.click();
        } catch (e) { erreurClic = e; }
        return [[r.affiche, true, 'affiché'], [r.erreur, null, 'erreur'], [erreurClic, null, 'erreur au clic']];
    }],
];

(async () => {
    let echecs = 0;
    for (const [nom, cas] of CAS) {
        let verifs;
        try { verifs = await cas(); } catch (e) { verifs = [[e.message, 'pas d’exception', 'exception']]; }
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
})();
