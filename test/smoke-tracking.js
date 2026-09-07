#!/usr/bin/env node
/**
 * Vérifie qu'un événement atteint RÉELLEMENT window.dataLayer, pour chaque
 * script du dépôt qui en pousse un.
 *
 * `node --check` ne voit qu'une syntaxe : il a laissé passer un `track()` qui
 * s'appelait lui-même, donc cinq fichiers qui ne poussaient plus rien tout en
 * étant parfaitement valides. Ce test exécute le code.
 *
 * Chaque cas est joué DEUX fois :
 *   - avec window.OrdoErrorReporter présent (page servie par un loader)
 *   - sans (page qui embarque le script directement, ou error-reporter.js
 *     encore en cache CDN dans une version antérieure à 1.1.0)
 *
 * Usage : node test/smoke-tracking.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REAL = console;

function makeEnv(withReporter) {
    const pushed = [];
    const reported = [];
    const dataLayer = [];
    dataLayer.push = function (p) { pushed.push(p); return Array.prototype.push.call(this, p); };

    const win = {
        dataLayer,
        location: { pathname: '/x', href: 'https://www.ordotype.fr/x', origin: 'https://www.ordotype.fr' },
        addEventListener() {}, removeEventListener() {},
        dispatchEvent() {}, setTimeout, clearTimeout, setInterval, clearInterval,
    };
    if (withReporter) {
        win.OrdoErrorReporter = {
            report(c, e) { reported.push(c); },
            reportSideEffect(c, e) { reported.push(c + ': ' + (e && e.message)); },
            track(p) { win.dataLayer.push(p); },
        };
    }
    return { win, pushed, reported };
}

function run(file, withReporter, drive, pathname) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const { win, pushed, reported } = makeEnv(withReporter);
    if (pathname) { win.location.pathname = pathname; win.location.href = 'https://www.ordotype.fr' + pathname; }
    const listeners = {};
    global.window = win;
    global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    global.document = {
        readyState: 'complete',
        cookie: '',
        addEventListener: (t, f) => { listeners[t] = f; },
        removeEventListener() {},
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    global.navigator = { sendBeacon: () => true };
    global.location = win.location;
    // jQuery : certains scripts s'y attachent ; on capture le handler pour le déclencher.
    const jq = (sel) => ({ on: (evt, fn) => { listeners['jq:' + evt] = fn; }, length: 1 });
    global.$ = jq; global.jQuery = jq;
    global.ErrorEvent = class { constructor(t, o) { Object.assign(this, o); } };
    global.CustomEvent = class { constructor(t, o) { Object.assign(this, o); } };
    global.fetch = () => Promise.resolve({ ok: true, status: 200, clone() { return this; }, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    global.XMLHttpRequest = function () { this.open = () => {}; this.send = () => {}; this.addEventListener = () => {}; };
    const quiet = { log() {}, warn() {}, error() {}, info() {} };
    global.console = quiet;
    try {
        eval(src);
        if (drive) drive({ win, listeners });
    } catch (e) {
        global.console = REAL;
        return { ok: false, why: e.constructor.name + ': ' + e.message, pushed, reported };
    }
    global.console = REAL;
    return { ok: pushed.length > 0, why: pushed.length ? '' : 'aucun événement poussé', pushed, reported };
}

// (fichier, déclencheur, émet-il forcément un événement ?)
const CASES = [
    ['successful-login/ga4-events.js', null, true, null],
    ['pricing/ga4-events.js', null, true, '/nos-offres'],
    ['mes-informations/ga4-events.js', null, true, '/membership/mes-informations'],
    ['connexion-2fa/ga4-events.js', null, true, '/membership/connexion-2fa'],
    ['conseils-patients/tracking.js', ({ listeners }) => {
        const h = listeners['jq:click']; if (h) h({ preventDefault() {} });
    }, true, null],
    ['ordonnances/duplicates-cleaner.js', null, false, null],
];

let failures = 0;
for (const [file, drive, mustEmit, pathname] of CASES) {
    for (const withReporter of [true, false]) {
        const label = file + (withReporter ? '  [avec reporter]' : '  [sans reporter]');
        let r;
        try { r = run(file, withReporter, drive, pathname); }
        catch (e) { r = { ok: false, why: 'harnais: ' + e.message, pushed: [] }; }
        if (!r.ok && r.why === 'aucun événement poussé' && !mustEmit) {
            // certains scripts n'émettent que sur interaction : on ne peut rien conclure
            REAL.log('  --  ' + label + '  (pas d\'émission au chargement, non couvert)');
            continue;
        }
        REAL.log((r.ok ? '  OK  ' : '  KO  ') + label + (r.ok ? '' : '  → ' + r.why));
        if (!r.ok) failures++;
    }
}

REAL.log(failures === 0 ? '\nsmoke tracking : OK' : `\nsmoke tracking : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
