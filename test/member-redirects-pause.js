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
 *   - pendant le délai de grâce, le bandeau « paiement échoué » reste masqué ;
 *   - pause terminée (date passée) ou date illisible : pas de bandeau ;
 *   - pas de membre connecté : pas de bandeau.
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
    check('bandeau « paiement échoué » masqué', shown(doc, 'banner-to-hide-payment-failed') === 'none', shown(doc, 'banner-to-hide-payment-failed'));
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

if (fail) { console.log(fail + ' échec(s)'); process.exit(1); }
console.log('tout est bon');
