#!/usr/bin/env node
/**
 * Mes informations (associations d'internes) : ville partenaire après l'inscription.
 *   - ville trouvée (sessionStorage ou cookie) : enregistrée avec le statut Interne ;
 *   - aucune ville trouvée et aucune enregistrée : signalé une fois, le champ
 *     ville n'est pas écrit ; le statut Interne est posé s'il manque ;
 *   - aucune ville trouvée mais une ville déjà enregistrée : rien n'est écrit,
 *     rien n'est signalé.
 *
 * Usage : node test/partnership-city.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'mes-informations/partnership-city.js'), 'utf8');

async function jouer({ champs = {}, session = null, cookie = null, echecs = 0 }) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://www.ordotype.fr/membership/mes-informations-internes-assos',
        runScripts: 'outside-only',
        virtualConsole,
    });
    const w = dom.window;
    if (session) w.sessionStorage.setItem('signup-partnership-city', session);
    if (cookie) w.document.cookie = 'signup-partnership-city=' + encodeURIComponent(cookie) + '; path=/';
    const ecrits = [];
    const signales = [];
    let restants = echecs;
    w.$memberstackDom = {
        getCurrentMember: () => Promise.resolve({ data: { id: 'mem_test', customFields: champs } }),
        updateMember: (p) => {
            if (restants > 0) { restants -= 1; return Promise.reject(new Error('réseau')); }
            ecrits.push(p.customFields);
            return Promise.resolve({ data: {} });
        },
    };
    w.OrdoErrorReporter = { report: (ctx, err) => signales.push(`${ctx}: ${err && err.message ? err.message : err}`) };
    w.eval(SCRIPT);
    await new Promise((r) => setTimeout(r, 20 + echecs * 1100));
    const r = { ecrits, signales, session: w.sessionStorage.getItem('signup-partnership-city'), erreurs };
    w.close();
    return r;
}

const ecritVille = (r) => r.ecrits.some((c) => Object.prototype.hasOwnProperty.call(c, 'partnership-city'));
const sansErreur = (r) => [r.erreurs.length, 0, `erreurs ${r.erreurs.join(' | ')}`];

const CAS = [
    ['ville en sessionStorage : enregistrée avec le statut Interne', async () => {
        const r = await jouer({ session: 'Lyon' });
        return [
            [JSON.stringify(r.ecrits), JSON.stringify([{ statut: 'Interne', 'partnership-city': 'Lyon' }]), 'écrit'],
            [r.signales.length, 0, 'signalements'],
            [r.session, null, 'sessionStorage vidé'],
            sansErreur(r),
        ];
    }],
    ['ville en cookie : enregistrée', async () => {
        const r = await jouer({ cookie: 'Nancy' });
        return [[r.ecrits.length === 1 && r.ecrits[0]['partnership-city'], 'Nancy', 'ville écrite']];
    }],
    ['aucune ville, aucune enregistrée : signalé, pas de valeur de débogage', async () => {
        const r = await jouer({ champs: {} });
        return [
            [ecritVille(r), false, 'ville écrite'],
            [JSON.stringify(r.ecrits), JSON.stringify([{ statut: 'Interne' }]), 'écrit'],
            [r.signales.length, 1, 'signalements'],
            sansErreur(r),
        ];
    }],
    ['aucune ville, statut déjà Interne : signalé, rien écrit', async () => {
        const r = await jouer({ champs: { statut: 'Interne' } });
        return [[r.ecrits.length, 0, 'écritures'], [r.signales.length, 1, 'signalements']];
    }],
    ['aucune ville, ancien marqueur enregistré : signalé, marqueur non réécrit', async () => {
        const r = await jouer({ champs: { 'partnership-city': 'DBG__READ_MISS_ALL_2025-01-01T00:00:00.000Z', statut: 'Interne' } });
        return [[ecritVille(r), false, 'ville écrite'], [r.signales.length, 1, 'signalements']];
    }],
    ['aucune ville, ville déjà enregistrée : rien écrit, rien signalé', async () => {
        const r = await jouer({ champs: { 'partnership-city': 'Lyon', statut: 'Interne' } });
        return [[r.ecrits.length, 0, 'écritures'], [r.signales.length, 0, 'signalements']];
    }],
    ['aucune ville, première écriture en échec : signalé une seule fois', async () => {
        const r = await jouer({ champs: {}, echecs: 1 });
        return [[r.signales.length, 1, 'signalements'], [r.ecrits.length, 1, 'écritures réussies']];
    }],
];

(async () => {
let echecs = 0;
for (const [nom, cas] of CAS) {
    let verifs;
    try {
        verifs = await cas();
    } catch (e) {
        console.log(`  ECHEC  ${nom} : exception ${e.message}`);
        echecs += 1;
        continue;
    }
    const rates = verifs.filter(([obtenu, attendu]) => obtenu !== attendu);
    if (rates.length) {
        rates.forEach(([obtenu, attendu, quoi]) =>
            console.log(`  ECHEC  ${nom} : ${quoi} = ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`));
        echecs += 1;
    } else {
        console.log(`  ok     ${nom}`);
    }
}
console.log(echecs ? `\n${echecs} cas en échec` : `\n${CAS.length} cas OK`);
process.exit(echecs ? 1 : 0);
})();
