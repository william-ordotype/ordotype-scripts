#!/usr/bin/env node
/**
 * Bandeau « abonnement en pause » de la home (homepage/member-redirects.js).
 *
 * Le délai de grâce de 24 h (localStorage `justPaidTs`) coupait toute la suite
 * du script, bandeau pause compris : un membre qui venait de mettre son
 * abonnement en pause ne voyait pas le bandeau pendant 24 h.
 *
 * Ce qui doit tenir :
 *   - pause en cours, sans délai de grâce : bandeau affiché, date de reprise écrite ;
 *   - pause en cours, PENDANT le délai de grâce : bandeau affiché aussi ;
 *   - pendant le délai de grâce, le bandeau « paiement échoué » n'est plus touché
 *     ici : Memberstack l'affiche seul et homepage/loader.js le masque dès le
 *     chargement (test/just-paid-ts.js) ;
 *   - pause terminée (date passée) ou date illisible : pas de bandeau ;
 *   - pas de membre connecté : pas de bandeau.
 *   - 🔴 PENDANT le délai de grâce, AUCUNE redirection (pause ou pas) : Memberstack
 *     peut avoir du retard sur un paiement qui vient de passer. Mesuré avec la vraie
 *     memberstack-utils sur un essai gratuit sans prénom : sans délai, il est
 *     redirigé vers le formulaire (témoin). Un impayé, lui, n'est plus jamais
 *     redirigé vers la page de paiement (20/10/2026). Les bandeaux d'information
 *     restent affichés (test/bandeaux-priorite.js).
 *
 * Usage : node test/member-redirects-pause.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'homepage', 'member-redirects.js'), 'utf8');
const HTML = '<!doctype html><html><body>'
    + '<div id="banner-to-hide-paused" style="display:none"><span id="banner-to-hide-paused-date"></span></div>'
    + '<div id="banner-to-hide-canceled" style="display:flex"></div>'
    + '<div id="banner-to-hide-payment-failed" style="display:flex"></div>'
    + '</body></html>';

const JOUR = 24 * 60 * 60 * 1000;

function load({ pauseEnd, justPaidAgo, member = { id: 'mem_test', createdAt: '2025-01-01T00:00:00Z' } }) {
    const dom = new JSDOM(HTML, { url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const win = dom.window;
    const doc = win.document;
    if (justPaidAgo !== undefined) win.localStorage.setItem('justPaidTs', String(Date.now() - justPaidAgo));
    // jQuery réduit au strict nécessaire : $(sélecteur).css({...})
    win.jQuery = function (sel) {
        const els = typeof sel === 'string' ? Array.from(doc.querySelectorAll(sel)) : [];
        return { css(o) { els.forEach((el) => Object.assign(el.style, o)); return this; } };
    };
    win.OrdoMemberstack = {
        member,
        metaData: pauseEnd === undefined ? {} : { 'pause-end-date': pauseEnd },
        safeDate: () => null,
        safeDateFromValue: () => null,
    };
    try { win.eval(SRC); } catch (e) { /* la suite du script (hors pause) n'est pas l'objet de ce test */ }
    return { doc };
}

const shown = (doc, id) => doc.getElementById(id).style.display;
let fail = 0;
function check(label, cond, detail) {
    console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : '  → ' + detail));
    if (!cond) fail++;
}

const futur = new Date(Date.now() + 30 * JOUR).toISOString();
const passe = new Date(Date.now() - 2 * JOUR).toISOString();

console.log('pause en cours, sans délai de grâce');
{
    const { doc } = load({ pauseEnd: futur });
    check('bandeau pause affiché', shown(doc, 'banner-to-hide-paused') === 'flex', shown(doc, 'banner-to-hide-paused'));
    check('date de reprise écrite', doc.getElementById('banner-to-hide-paused-date').textContent.length > 0, 'vide');
    check('bandeau « résilié » masqué', shown(doc, 'banner-to-hide-canceled') === 'none', shown(doc, 'banner-to-hide-canceled'));
}

console.log('pause en cours, pendant le délai de grâce (justPaidTs il y a 1 h)');
{
    const { doc } = load({ pauseEnd: futur, justPaidAgo: 60 * 60 * 1000 });
    check('bandeau pause affiché', shown(doc, 'banner-to-hide-paused') === 'flex', shown(doc, 'banner-to-hide-paused'));
    check('bandeau « paiement échoué » laissé au chargeur (pas touché ici)', shown(doc, 'banner-to-hide-payment-failed') === 'flex', shown(doc, 'banner-to-hide-payment-failed'));
}

console.log('pas en pause, pendant le délai de grâce');
{
    const { doc } = load({ justPaidAgo: 60 * 60 * 1000 });
    check('pas de bandeau pause', shown(doc, 'banner-to-hide-paused') === 'none', shown(doc, 'banner-to-hide-paused'));
}

console.log('pause terminée');
{
    const { doc } = load({ pauseEnd: passe, justPaidAgo: 60 * 60 * 1000 });
    check('pas de bandeau pause', shown(doc, 'banner-to-hide-paused') === 'none', shown(doc, 'banner-to-hide-paused'));
}

console.log('date de reprise illisible');
{
    const { doc } = load({ pauseEnd: 'pas une date', justPaidAgo: 60 * 60 * 1000 });
    check('pas de bandeau pause', shown(doc, 'banner-to-hide-paused') === 'none', shown(doc, 'banner-to-hide-paused'));
}

console.log('pas de membre connecté');
{
    const { doc } = load({ pauseEnd: futur, justPaidAgo: 60 * 60 * 1000, member: null });
    check('pas de bandeau pause', shown(doc, 'banner-to-hide-paused') === 'none', shown(doc, 'banner-to-hide-paused'));
}

// Page réelle : vraie memberstack-utils, membre dans `_ms-mem`, redirections relevées.
const UTILS = fs.readFileSync(path.join(ROOT, 'shared', 'memberstack-utils.js'), 'utf8');
const SRC_NAV = SRC.split('window.location.replace(').join('window.__navigate(');
const IMPAYE = [{ planId: 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60', status: 'REQUIRES_PAYMENT', type: 'SUBSCRIPTION' }];
const ESSAI_SANS_PRENOM = [{ planId: 'pln_essai-gratuit-5e4s0o0r', status: 'ACTIVE', type: 'SUBSCRIPTION' }];
function pageReelle({ justPaidAgo, pauseEnd, plans = IMPAYE, prnom = 'Test' }) {
    const dom = new JSDOM(HTML, { url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const win = dom.window;
    const doc = win.document;
    win.localStorage.setItem('_ms-mem', JSON.stringify({
        id: 'mem_test', createdAt: '2025-01-01T00:00:00Z',
        planConnections: plans,
        customFields: { statut: 'Medecin', specialite: 'Médecine générale', prnom, phone: '+33600000000', country: 'France' },
        metaData: pauseEnd === undefined ? {} : { 'pause-end-date': pauseEnd },
    }));
    if (justPaidAgo !== undefined) win.localStorage.setItem('justPaidTs', String(Date.now() - justPaidAgo));
    win.eval(UTILS);
    const redirections = [];
    win.__navigate = (u) => redirections.push(u);
    win.jQuery = function (sel) {
        const els = typeof sel === 'string' ? Array.from(doc.querySelectorAll(sel)) : [];
        return { css(o) { els.forEach((el) => Object.assign(el.style, o)); return this; } };
    };
    win.dataLayer = [];
    win.eval(SRC_NAV);
    return { doc, redirections };
}

console.log('délai de grâce = aucune redirection');
{
    const pasPause = pageReelle({ justPaidAgo: 60 * 60 * 1000 });
    check('impayé, pas en pause : aucune redirection', pasPause.redirections.length === 0, pasPause.redirections.join(', '));
    const enPause = pageReelle({ pauseEnd: futur, justPaidAgo: 60 * 60 * 1000 });
    check('en pause : aucune redirection', enPause.redirections.length === 0, enPause.redirections.join(', '));
    check('en pause : bandeau pause affiché', shown(enPause.doc, 'banner-to-hide-paused') === 'flex', shown(enPause.doc, 'banner-to-hide-paused'));
    const essaiGrace = pageReelle({ justPaidAgo: 60 * 60 * 1000, plans: ESSAI_SANS_PRENOM, prnom: '' });
    check('essai gratuit sans prénom, pendant le délai : aucune redirection', essaiGrace.redirections.length === 0, essaiGrace.redirections.join(', '));
    const essaiExpire = pageReelle({ justPaidAgo: 25 * 60 * 60 * 1000, plans: ESSAI_SANS_PRENOM, prnom: '' });
    check('témoin : grâce expirée (25 h), redirection vers le formulaire', essaiExpire.redirections[0] === '/membership/mes-informations', essaiExpire.redirections.join(', ') || 'aucune : le témoin ne mesure rien');
    const impayeExpire = pageReelle({ justPaidAgo: 25 * 60 * 60 * 1000 });
    check('impayé, grâce expirée (25 h) : toujours aucune redirection vers le paiement', impayeExpire.redirections.length === 0, impayeExpire.redirections.join(', '));
}

if (fail) { console.log(fail + ' échec(s)'); process.exit(1); }
console.log('tout est bon');
