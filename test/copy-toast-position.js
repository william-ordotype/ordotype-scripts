#!/usr/bin/env node
/**
 * Copy Toast Position : au clic sur « Copier », le message « copiée » est placé
 * au milieu de la partie visible du cadre copié, avec le texte de ce cadre.
 *
 * Vérifie :
 *  - cadre entièrement visible : message au milieu du cadre, centré en largeur ;
 *  - cadre plus haut que l'écran : milieu de la partie visible ;
 *  - cadre hors de l'écran : message gardé à 40 px du bord ;
 *  - le bouton des conseils patients d'une ordonnance vise leur cadre ;
 *  - page conseil patient : cadre français, ou arabe s'il est seul affiché ;
 *  - dans le cadre d'une fiche, la partie hors de l'écran parent est exclue ;
 *  - texte : « Conseil patient copié » pour le bouton des conseils patients d'une
 *    ordonnance, puis retour au texte de la page pour le bouton de l'ordonnance ;
 *  - un clic ailleurs ne touche à rien ; sans cadre ni message, rien ne casse.
 *
 * Usage : node test/copy-toast-position.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'shared', 'copy-toast-position.js'), 'utf8');

// boites : { id: [top, bottom, left, right] } ; une boîte absente du rendu vaut null.
function monter({ html, boites = {}, hauteur = 900, largeur = 1440, cadre = null, toast = true, texte = 'Ordonnance copiée' } = {}) {
    const erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(`<!doctype html><html><body>
        ${toast ? `<div class="toast_component centered"><div x-ordo-utils="toast-component-common" class="hidden"><div class="toast-message-copy"><div class="div-block-392"></div><div class="padding-left padding-small"><p class="text-weight-semibold no-margin">${texte}</p></div></div></div></div>` : ''}
        ${html}
        <a id="ailleurs" href="#">Autre</a>
    </body></html>`, { url: 'https://www.ordotype.fr/ordonnances-types/test', runScripts: 'outside-only', virtualConsole: vc });
    const w = dom.window;
    Object.defineProperty(w, 'innerHeight', { configurable: true, value: hauteur });
    Object.defineProperty(w.document.documentElement, 'clientWidth', { configurable: true, value: largeur });
    for (const [id, r] of Object.entries(boites)) {
        const el = w.document.getElementById(id);
        el.getClientRects = () => (r ? [{}] : []);
        el.getBoundingClientRect = () => (r ? { top: r[0], bottom: r[1], left: r[2], right: r[3], width: r[3] - r[2], height: r[1] - r[0] } : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    }
    if (cadre) {
        Object.defineProperty(w, 'frameElement', { configurable: true, value: { getBoundingClientRect: () => ({ top: cadre.top }) } });
        Object.defineProperty(w, 'parent', { configurable: true, value: { innerHeight: cadre.parentHeight } });
    }
    w.eval(SRC);
    const cliquer = (sel) => w.document.querySelector(sel).click();
    const style = () => {
        const c = w.document.querySelector('.toast_component.centered');
        return c ? { top: c.style.top, bottom: c.style.bottom, left: c.style.left, right: c.style.right } : null;
    };
    const message = () => w.document.querySelector('.toast-message-copy p').textContent;
    return { w, cliquer, style, message, erreurs };
}

const ORDO = `<div id="ordo-to-be-copied" data-ordo-copy="subject"></div>
    <a data-ordo-copy="trigger" href="#">Copier</a>
    <div id="printableArea"></div>
    <a id="copy-button-fcp" href="#">Copier</a>`;
const CP = `<div id="printableArea_CP"></div><div id="printableArea_CP_AR"></div>
    <a id="copy-button" href="#">Copier</a>`;

const cas = [];
function verifier(nom, obtenu, attendu) {
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    cas.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
}

{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [200, 500, 300, 1140], printableArea: [600, 1200, 300, 1140] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('ordonnance visible : milieu du cadre', ctx.style(), { top: '350px', bottom: 'auto', left: '300px', right: '300px' });
}
{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [-1800, 700, 300, 1140], printableArea: [800, 1400, 300, 1140] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('ordonnance plus haute que l\'écran : milieu de la partie visible', ctx.style().top, '350px');
}
{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [-900, -500, 300, 1140], printableArea: [100, 700, 300, 1140] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('ordonnance au-dessus de l\'écran : message à 40 px du haut', ctx.style().top, '40px');
}
{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [1000, 1300, 300, 1140], printableArea: [1400, 1900, 300, 1140] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('ordonnance sous l\'écran : message à 40 px du bas', ctx.style().top, '860px');
}
{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [-600, -300, 300, 1140], printableArea: [-100, 700, 300, 1140] } });
    ctx.cliquer('#copy-button-fcp');
    verifier('bouton des conseils patients : leur cadre, pas l\'ordonnance', ctx.style().top, '350px');
}
{
    const ctx = monter({ html: CP, boites: { printableArea_CP: [100, 700, 20, 370], printableArea_CP_AR: null }, largeur: 390, hauteur: 844 });
    ctx.cliquer('#copy-button');
    verifier('conseil patient : cadre français, centré en largeur', ctx.style(), { top: '400px', bottom: 'auto', left: '20px', right: '20px' });
}
{
    const ctx = monter({ html: CP, boites: { printableArea_CP: null, printableArea_CP_AR: [200, 400, 20, 370] }, largeur: 390, hauteur: 844 });
    ctx.cliquer('#copy-button');
    verifier('conseil patient en arabe seul affiché : cadre arabe', ctx.style().top, '300px');
}
{
    // Cadre de fiche de 600 px, 300 px sous le haut d'un écran de 657 px : 357 px visibles.
    const ctx = monter({ html: ORDO, hauteur: 600, largeur: 700, cadre: { top: 300, parentHeight: 657 }, boites: { 'ordo-to-be-copied': [100, 580, 50, 650], printableArea: [700, 1200, 50, 650] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('dans une fiche : milieu de la partie visible à l\'écran', ctx.style().top, '229px');
}
{
    // Cadre de fiche remonté de 200 px au-dessus de l'écran parent.
    const ctx = monter({ html: ORDO, hauteur: 600, largeur: 700, cadre: { top: -200, parentHeight: 900 }, boites: { 'ordo-to-be-copied': [100, 500, 50, 650], printableArea: [700, 1200, 50, 650] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('dans une fiche remontée : le haut caché est exclu', ctx.style().top, '350px');
}
{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [200, 500, 300, 1140], printableArea: [600, 1200, 300, 1140] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    const avant = ctx.message();
    ctx.cliquer('#copy-button-fcp');
    const cp = ctx.message();
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('texte : ordonnance, puis conseil patient, puis de nouveau ordonnance', [avant, cp, ctx.message()], ['Ordonnance copiée', 'Conseil patient copié', 'Ordonnance copiée']);
}
{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [200, 500, 300, 1140], printableArea: [600, 1200, 300, 1140] } });
    ctx.cliquer('#copy-button-fcp');
    verifier('texte : bouton des conseils patients cliqué en premier', ctx.message(), 'Conseil patient copié');
}
{
    const ctx = monter({ html: CP, texte: 'Conseil patient copié', boites: { printableArea_CP: [100, 700, 20, 370], printableArea_CP_AR: null }, largeur: 390, hauteur: 844 });
    ctx.cliquer('#copy-button');
    verifier('texte : page conseil patient, texte de la page gardé', ctx.message(), 'Conseil patient copié');
}
{
    const ctx = monter({ html: ORDO, boites: { 'ordo-to-be-copied': [200, 500, 300, 1140], printableArea: [600, 1200, 300, 1140] } });
    ctx.cliquer('#ailleurs');
    verifier('clic ailleurs : position inchangée', ctx.style(), { top: '', bottom: '', left: '', right: '' });
}
{
    const ctx = monter({ html: ORDO, toast: false, boites: { 'ordo-to-be-copied': [200, 500, 300, 1140], printableArea: [600, 1200, 300, 1140] } });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('sans message dans la page : aucune erreur', ctx.erreurs, []);
}
{
    const ctx = monter({ html: '<a data-ordo-copy="trigger" href="#">Copier</a>' });
    ctx.cliquer('[data-ordo-copy="trigger"]');
    verifier('sans cadre : position inchangée, aucune erreur', [ctx.style().top, ctx.erreurs], ['', []]);
}

const echecs = cas.filter((ok) => !ok).length;
console.log(`\n${cas.length - echecs}/${cas.length} vérifications passées`);
process.exit(echecs ? 1 : 0);
