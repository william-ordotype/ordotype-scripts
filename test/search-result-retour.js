#!/usr/bin/env node
/**
 * Vérifie search-result/retour.js : la flèche de l'en-tête de /search-result
 * revient à la page précédente quand elle est sur le site, sinon mène à
 * l'accueil (avant : « javascript:history.back() », sans effet sans page
 * précédente).
 *
 * Usage : node test/search-result-retour.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'search-result', 'retour.js'), 'utf8');
const HTML = '<!doctype html><html><body><div class="search-block search-block-results">' +
    '<a href="javascript:history.back()" class="search-back-button search-back-button-components w-inline-block"><img alt=""></a>' +
    '</div></body></html>';

async function load({ referrer = '', historyLength = 1, src = SRC } = {}) {
    const dom = new JSDOM(HTML, { url: 'https://www.ordotype.fr/search-result', referrer: referrer || undefined,
        runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const win = dom.window;
    let backs = 0;
    Object.defineProperty(win.history, 'length', { configurable: true, get: () => historyLength });
    win.history.back = () => { backs++; };
    win.eval(src);
    await new Promise((res) => {
        if (win.document.readyState !== 'loading') return res();
        win.document.addEventListener('DOMContentLoaded', () => res());
    });
    const a = win.document.querySelector('.search-back-button');
    const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    return { href: a.getAttribute('href'), prevented: ev.defaultPrevented, backs: () => backs };
}

let fail = 0;
function check(label, cond, detail) {
    console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : '  → ' + detail));
    if (!cond) fail++;
}

async function main() {
console.log('arrivée depuis une page du site');
{
    const r = await load({ referrer: 'https://www.ordotype.fr/pathologies/angine-2', historyLength: 3 });
    check('retour à la page précédente', r.prevented && r.backs() === 1, JSON.stringify({ prevented: r.prevented, backs: r.backs() }));
    check('plus de lien javascript:', r.href === '/', r.href);
}

console.log('arrivée directe (lien ouvert ailleurs, adresse tapée)');
{
    const r = await load({ referrer: '', historyLength: 1 });
    check('mène à l’accueil', r.href === '/' && !r.prevented && r.backs() === 0, JSON.stringify({ href: r.href, prevented: r.prevented, backs: r.backs() }));
}

console.log('arrivée depuis un autre site');
{
    const r = await load({ referrer: 'https://www.google.com/', historyLength: 4 });
    check('mène à l’accueil, ne renvoie pas vers l’autre site', r.href === '/' && !r.prevented && r.backs() === 0, JSON.stringify({ prevented: r.prevented, backs: r.backs() }));
}

console.log('nouvel onglet ouvert depuis le site (historique vide)');
{
    const r = await load({ referrer: 'https://www.ordotype.fr/pathologies/hta', historyLength: 1 });
    check('mène à l’accueil (history.back serait sans effet)', !r.prevented && r.backs() === 0, JSON.stringify({ prevented: r.prevented, backs: r.backs() }));
}

console.log('domaine voisin qui commence pareil');
{
    const r = await load({ referrer: 'https://www.ordotype.fr.example.com/page', historyLength: 3 });
    check('pas pris pour le site', !r.prevented && r.backs() === 0, JSON.stringify({ prevented: r.prevented, backs: r.backs() }));
}

console.log(fail ? `\n${fail} échec(s)` : '\ntout est bon');
process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
