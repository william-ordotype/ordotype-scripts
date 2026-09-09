#!/usr/bin/env node
/**
 * Vérifie la règle de `reportNetwork` dans le fichier partagé.
 *
 * Ce qui doit tenir :
 *   - page vivante : une requête sans réponse est signalée comme avant ;
 *   - page partie ou passée en arrière-plan : elle ne l'est plus, parce que
 *     c'est la page qui a emporté la requête, pas le service qui a lâché ;
 *   - retour au premier plan : la page redevient bavarde, sans quoi un simple
 *     changement d'onglet la rendrait muette pour le reste de sa vie ;
 *   - `report()` n'est PAS concerné : une vraie erreur survenue pendant un
 *     déchargement doit continuer de passer.
 *
 * Usage : node test/error-reporter-network.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REAL = console;

function env() {
    const sent = [];
    const listeners = {};
    const win = {
        addEventListener(type, fn) { listeners[type] = fn; },
        location: { href: 'https://www.ordotype.fr/membership/compte' },
    };
    const doc = {
        visibilityState: 'visible',
        addEventListener(type, fn) { listeners['doc:' + type] = fn; },
    };
    global.window = win;
    global.document = doc;
    global.navigator = { userAgent: 'test' };
    global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    global.fetch = (url, opts) => { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true }); };
    global.console = { log() {}, warn() {}, error() {}, info() {} };
    eval(fs.readFileSync(path.join(ROOT, 'shared/error-reporter.js'), 'utf8'));
    global.console = REAL;
    return { win, doc, listeners, sent };
}

const CASES = [
    ['page vivante : la panne réseau est signalée', (e) => {
        const rendu = e.win.OrdoErrorReporter.reportNetwork('Mod', new TypeError('Load failed'));
        if (rendu !== true) return 'reportNetwork aurait dû signaler';
        if (e.sent.length !== 1) return 'aucun envoi';
        return '';
    }],
    ['page qui part : la panne réseau est écartée', (e) => {
        e.listeners.pagehide();
        const rendu = e.win.OrdoErrorReporter.reportNetwork('Mod', new TypeError('Load failed'));
        if (rendu !== false) return 'reportNetwork aurait dû écarter';
        if (e.sent.length !== 0) return 'un envoi est parti alors que la page s en allait';
        return '';
    }],
    ['arrière-plan : écartée aussi', (e) => {
        e.doc.visibilityState = 'hidden';
        e.listeners['doc:visibilitychange']();
        e.win.OrdoErrorReporter.reportNetwork('Mod', new TypeError('Load failed'));
        if (e.sent.length !== 0) return 'un envoi est parti depuis l arrière-plan';
        return '';
    }],
    ['retour au premier plan : la page redevient bavarde', (e) => {
        e.doc.visibilityState = 'hidden';
        e.listeners['doc:visibilitychange']();
        e.doc.visibilityState = 'visible';
        e.listeners['doc:visibilitychange']();
        e.win.OrdoErrorReporter.reportNetwork('Mod', new TypeError('Load failed'));
        if (e.sent.length !== 1) return 'la page est restée muette après son retour';
        return '';
    }],
    ['retour du cache de navigation : idem', (e) => {
        e.listeners.pagehide();
        e.listeners.pageshow();
        e.win.OrdoErrorReporter.reportNetwork('Mod', new TypeError('Load failed'));
        if (e.sent.length !== 1) return 'la page est restée muette après un retour arrière';
        return '';
    }],
    ['report() passe même quand la page s en va', (e) => {
        e.listeners.pagehide();
        e.win.OrdoErrorReporter.report('Mod', new Error('vraie panne'));
        if (e.sent.length !== 1) return 'un incident réel a été perdu';
        if (e.sent[0].context !== 'Mod') return 'contexte perdu';
        return '';
    }],
];

let failures = 0;
for (const [nom, verifier] of CASES) {
    let why;
    try { why = verifier(env()); } catch (err) { why = 'harnais : ' + err.message; }
    REAL.log((why ? '  KO  ' : '  OK  ') + nom + (why ? '  → ' + why : ''));
    if (why) failures++;
}
REAL.log(failures === 0 ? '\nerror-reporter réseau : OK' : `\nerror-reporter réseau : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
