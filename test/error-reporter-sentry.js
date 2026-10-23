#!/usr/bin/env node
/**
 * Vérifie ce que `report()` envoie à Sentry.
 *
 * Ce qui doit tenir :
 *   - Sentry reçoit l'erreur avec memberId et contexte, mais jamais l'adresse
 *     e-mail du membre ;
 *   - Discord reçoit toujours le payload complet, e-mail compris ;
 *   - sans client Sentry sur la page, rien ne casse.
 *
 * Usage : node test/error-reporter-sentry.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REAL = console;
const ADRESSE = 'jean.dupont@example.com';

function env(avecSentry) {
    const sent = [];
    const captured = [];
    const win = {
        addEventListener() {},
        location: { href: 'https://www.ordotype.fr/nos-offres' },
    };
    if (avecSentry) {
        const client = { captureException(err, hint) { captured.push({ err, hint }); } };
        win.__SENTRY__ = { version: '10', 10: { defaultCurrentScope: { getClient: () => client } } };
    }
    global.window = win;
    global.document = { visibilityState: 'visible', addEventListener() {} };
    global.navigator = { userAgent: 'test' };
    global.localStorage = {
        getItem: (k) => k === '_ms-mem'
            ? JSON.stringify({ id: 'mem_test', stripeCustomerId: 'cus_test', auth: { email: ADRESSE } })
            : null,
        setItem() {},
        removeItem() {},
    };
    global.fetch = (url, opts) => { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true }); };
    global.console = { log() {}, warn() {}, error() {}, info() {} };
    eval(fs.readFileSync(path.join(ROOT, 'shared/error-reporter.js'), 'utf8'));
    global.console = REAL;
    return { win, sent, captured };
}

const CASES = [
    ['Sentry : pas d e-mail, memberId gardé', () => {
        const e = env(true);
        e.win.OrdoErrorReporter.report('StripeCheckout (pricing)', new Error('Session API error: 502'));
        if (e.captured.length !== 1) return 'aucune capture Sentry';
        const ctx = e.captured[0].hint.captureContext;
        if (JSON.stringify(ctx).includes('@')) return 'une adresse est partie vers Sentry';
        if ('email' in ctx.extra) return 'la clé email est encore dans extra';
        if (ctx.extra.memberId !== 'mem_test') return 'memberId perdu';
        if (ctx.extra.context !== 'StripeCheckout (pricing)') return 'contexte perdu';
        if (ctx.tags.reporter !== 'OrdoErrorReporter') return 'tag reporter perdu';
        return '';
    }],
    ['Discord : payload complet inchangé', () => {
        const e = env(true);
        e.win.OrdoErrorReporter.report('Mod', new Error('panne'));
        if (e.sent.length !== 1) return 'aucun envoi Discord';
        if (e.sent[0].email !== ADRESSE) return 'Discord a perdu l e-mail';
        if (e.sent[0].memberId !== 'mem_test') return 'Discord a perdu memberId';
        return '';
    }],
    ['sans client Sentry : Discord seul, rien ne casse', () => {
        const e = env(false);
        e.win.OrdoErrorReporter.report('Mod', 'oops');
        if (e.sent.length !== 1) return 'aucun envoi Discord';
        return '';
    }],
];

let failures = 0;
for (const [nom, verifier] of CASES) {
    let why;
    try { why = verifier(); } catch (err) { why = 'harnais : ' + err.message; }
    REAL.log((why ? '  KO  ' : '  OK  ') + nom + (why ? '  → ' + why : ''));
    if (why) failures++;
}
REAL.log(failures === 0 ? '\nerror-reporter Sentry : OK' : `\nerror-reporter Sentry : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
