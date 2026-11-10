#!/usr/bin/env node
/**
 * Mes informations : une valeur déjà enregistrée n'est pas réécrite.
 *
 * Chaque `updateMember` déclenche un `member.updated` chez Memberstack, même
 * quand rien ne change.
 * Avant : memberstack-sync.js recopiait chaque clé du localStorage sans la
 * comparer, et partnership-city.js écrivait dès qu'une ville était en
 * mémoire, toujours avec `statut: 'Interne'`. Sur la page des associations,
 * les deux écrivaient `airtablerecordid` depuis la même clé `userId`.
 *
 * Ce qui doit tenir :
 *   - memberstack-sync.js n'envoie que les champs dont la valeur diffère de la
 *     fiche ; rien du tout si tout est déjà en place, et la clé est consommée ;
 *   - partnership-city.js attend memberstack-sync.js (borné), compare à ce
 *     qu'il vient d'écrire et n'envoie que ce qui change ;
 *   - page des associations : une seule écriture par chargement, sauf quand
 *     les deux scripts ont chacun un vrai changement (deux écritures, aucun
 *     champ envoyé deux fois) ;
 *   - ce qui change est écrit comme avant ; une écriture ratée de
 *     memberstack-sync.js est rattrapée par partnership-city.js ;
 *   - un memberstack-sync.js qui ne finit jamais ne bloque pas la ville.
 *
 * Usage : node test/mes-infos-sans-reecriture.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SYNC = fs.readFileSync(path.join(ROOT, 'mes-informations/memberstack-sync.js'), 'utf8');
const CITY = fs.readFileSync(path.join(ROOT, 'mes-informations/partnership-city.js'), 'utf8');

const ASSOS = { syncFields: [{ key: 'userId', msField: 'airtablerecordid' }], enablePartnershipCity: true };
const MES_INFOS = {
    syncFields: [
        { key: 'signup-comment', msField: 'comment' },
        { key: 'signup-type-de-compte', msField: 'type-de-compte' },
        { key: 'userId', msField: 'airtablerecordid' },
    ],
};

/**
 * @param scripts  ['sync'] ou ['sync', 'city'] : évalués dans cet ordre, comme le chargeur
 * @param ms       { echecs, bloque, cacheAJour } : la 1re écriture rejetée `echecs` fois,
 *                 jamais résolue (`bloque`), fiche relue à jour après une écriture
 */
async function jouer({ scripts, config, champs = {}, stockage = {}, session = null, ms = {}, attente = 80 }) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://www.ordotype.fr/membership/mes-informations-internes-assos',
        runScripts: 'outside-only',
        virtualConsole,
    });
    const w = dom.window;
    // Le délai d'attente de partnership-city.js (15 s) ramené à 40 ms.
    const vraiSetTimeout = w.setTimeout.bind(w);
    w.setTimeout = (fn, delai) => vraiSetTimeout(fn, delai === 15000 ? 40 : delai);
    Object.entries(stockage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    if (session) w.sessionStorage.setItem('signup-partnership-city', session);

    const fiche = { id: 'mem_test', createdAt: new Date().toISOString(), customFields: Object.assign({}, champs) };
    const ecrits = [];
    let rejets = ms.echecs || 0;
    w.$memberstackDom = {
        getCurrentMember: async () => ({ data: JSON.parse(JSON.stringify(fiche)) }),
        updateMember: (p) => {
            if (ms.bloque && !ecrits.length && !rejets) { rejets = -1; return new Promise(() => {}); }
            if (rejets > 0) { rejets -= 1; return Promise.reject(new Error('réseau')); }
            ecrits.push(Object.assign({}, p.customFields));
            if (ms.cacheAJour) Object.assign(fiche.customFields, p.customFields);
            return Promise.resolve({ data: fiche });
        },
    };
    w.OrdoErrorReporter = { report() {}, reportNetwork() {} };
    w.console.log = () => {};
    w.console.warn = () => {};
    w.console.error = () => {};
    w.OrdoMesInfos = { config: Object.assign({ syncFields: [], fillOnlyFields: [] }, config) };

    if (scripts.includes('sync')) w.eval(SYNC);
    if (scripts.includes('city')) w.eval(CITY);
    await new Promise((r) => setTimeout(r, attente));

    let fin = null;
    if (w.OrdoMesInfos.syncDone) {
        fin = await Promise.race([w.OrdoMesInfos.syncDone, new Promise((r) => setTimeout(() => r('en attente'), 5))]);
    }
    const cles = {};
    for (let i = 0; i < w.localStorage.length; i++) cles[w.localStorage.key(i)] = w.localStorage.getItem(w.localStorage.key(i));
    const r = {
        ecrits,
        fin,
        erreurs,
        cle: (k) => (Object.prototype.hasOwnProperty.call(cles, k) ? cles[k] : null),
        session: w.sessionStorage.getItem('signup-partnership-city'),
    };
    w.close();
    return r;
}

const json = (v) => JSON.stringify(v);
const sansDoublon = (r) => {
    const vus = {};
    r.ecrits.forEach((c) => Object.keys(c).forEach((k) => { vus[k] = (vus[k] || 0) + 1; }));
    return Object.keys(vus).filter((k) => vus[k] > 1).join(',');
};

const CAS = [
    // --- memberstack-sync.js seul ---------------------------------------------------------
    ['sync : valeurs déjà enregistrées, aucune écriture, clés consommées', async () => {
        const r = await jouer({
            scripts: ['sync'], config: MES_INFOS,
            champs: { comment: 'Asso X', 'type-de-compte': 'Interne', airtablerecordid: 'rec1' },
            stockage: { 'signup-comment': 'Asso X', 'signup-type-de-compte': 'Interne', userId: 'rec1' },
        });
        return [
            [r.ecrits.length, 0, 'écritures'],
            [r.cle('signup-comment'), null, 'clé comment'],
            [r.cle('userId'), null, 'clé userId'],
            [json(r.fin), '{}', 'fin annoncée, rien écrit'],
        ];
    }],
    ['sync : seul le champ qui change part', async () => {
        const r = await jouer({
            scripts: ['sync'], config: MES_INFOS,
            champs: { comment: 'Asso X', 'type-de-compte': 'Interne', airtablerecordid: 'rec1' },
            stockage: { 'signup-comment': 'Asso X', 'signup-type-de-compte': 'Remplaçant', userId: 'rec1' },
        });
        return [
            [json(r.ecrits), json([{ 'type-de-compte': 'Remplaçant' }]), 'écrit'],
            [r.cle('signup-type-de-compte'), null, 'clé consommée après écriture'],
            [r.cle('signup-comment'), null, 'clé inchangée consommée'],
            [json(r.fin), json({ 'type-de-compte': 'Remplaçant' }), 'fin annoncée avec les champs écrits'],
        ];
    }],
    ['sync : champ absent de la fiche, écrit comme avant', async () => {
        const r = await jouer({ scripts: ['sync'], config: MES_INFOS, champs: {}, stockage: { 'signup-comment': 'Asso X' } });
        return [[json(r.ecrits), json([{ comment: 'Asso X' }]), 'écrit']];
    }],
    ['sync : différence de casse ou d espace, c est un changement', async () => {
        const r = await jouer({ scripts: ['sync'], config: MES_INFOS, champs: { comment: 'asso x' }, stockage: { 'signup-comment': 'Asso X' } });
        return [[json(r.ecrits), json([{ comment: 'Asso X' }]), 'écrit']];
    }],
    ['sync : écriture ratée, fin annoncée sans champ', async () => {
        const r = await jouer({ scripts: ['sync'], config: MES_INFOS, champs: {}, stockage: { 'signup-comment': 'Asso X' }, ms: { echecs: 1 } });
        return [[json(r.fin), '{}', 'fin'], [r.cle('signup-comment'), 'Asso X', 'clé gardée pour la prochaine fois']];
    }],

    // --- partnership-city.js seul ----------------------------------------------------------
    ['ville : déjà enregistrée, statut Interne : rien écrit, mémoire vidée', async () => {
        const r = await jouer({ scripts: ['city'], config: ASSOS, champs: { 'partnership-city': 'Lyon', statut: 'Interne' }, session: 'Lyon' });
        return [[r.ecrits.length, 0, 'écritures'], [r.session, null, 'sessionStorage vidé']];
    }],
    ['ville : déjà enregistrée, statut vide : seul le statut part', async () => {
        const r = await jouer({ scripts: ['city'], config: ASSOS, champs: { 'partnership-city': 'Lyon' }, session: 'Lyon' });
        return [[json(r.ecrits), json([{ statut: 'Interne' }]), 'écrit']];
    }],
    ['ville : changée, statut déjà Interne : seule la ville part', async () => {
        const r = await jouer({ scripts: ['city'], config: ASSOS, champs: { 'partnership-city': 'Nancy', statut: 'Interne' }, session: 'Lyon' });
        return [[json(r.ecrits), json([{ 'partnership-city': 'Lyon' }]), 'écrit']];
    }],
    ['ville : statut « interne » en minuscules, rien réécrit', async () => {
        const r = await jouer({ scripts: ['city'], config: ASSOS, champs: { 'partnership-city': 'Lyon', statut: 'interne' }, session: 'Lyon' });
        return [[r.ecrits.length, 0, 'écritures']];
    }],
    ['ville : statut Médecin, la ville impose toujours Interne', async () => {
        const r = await jouer({ scripts: ['city'], config: ASSOS, champs: { 'partnership-city': 'Lyon', statut: 'Médecin' }, session: 'Lyon' });
        return [[json(r.ecrits), json([{ statut: 'Interne' }]), 'écrit']];
    }],
    ['ville : userId identique, rien écrit, clé retirée', async () => {
        const r = await jouer({
            scripts: ['city'], config: ASSOS, champs: { 'partnership-city': 'Lyon', statut: 'Interne', airtablerecordid: 'rec1' },
            session: 'Lyon', stockage: { userId: 'rec1' },
        });
        return [[r.ecrits.length, 0, 'écritures'], [r.cle('userId'), null, 'clé userId']];
    }],

    // --- La page des associations : les deux scripts ----------------------------------------
    ['page assos : tout déjà enregistré, aucune écriture (avant : deux)', async () => {
        const r = await jouer({
            scripts: ['sync', 'city'], config: ASSOS,
            champs: { 'partnership-city': 'Lyon', statut: 'Interne', airtablerecordid: 'rec1' },
            session: 'Lyon', stockage: { userId: 'rec1' },
        });
        return [[r.ecrits.length, 0, 'écritures'], [r.session, null, 'sessionStorage vidé'], [r.cle('userId'), null, 'clé userId']];
    }],
    ['page assos : seul airtablerecordid change, une écriture (avant : deux)', async () => {
        const r = await jouer({
            scripts: ['sync', 'city'], config: ASSOS,
            champs: { 'partnership-city': 'Lyon', statut: 'Interne', airtablerecordid: 'rec0' },
            session: 'Lyon', stockage: { userId: 'rec1' }, ms: { cacheAJour: true },
        });
        return [[json(r.ecrits), json([{ airtablerecordid: 'rec1' }]), 'écrit']];
    }],
    ['même champ par les deux scripts, fiche relue périmée : une seule écriture', async () => {
        // getCurrentMember rend encore l'ancienne fiche après l'écriture de
        // memberstack-sync.js : la ville compare avec ce qu'il annonce avoir écrit.
        const r = await jouer({
            scripts: ['sync', 'city'],
            config: { syncFields: [{ key: 'signup-partnership-city', msField: 'partnership-city' }], enablePartnershipCity: true },
            champs: { statut: 'Interne' },
            session: 'Lyon', stockage: { 'signup-partnership-city': 'Lyon' }, ms: { cacheAJour: false },
        });
        return [[json(r.ecrits), json([{ 'partnership-city': 'Lyon' }]), 'écrit'], [r.session, null, 'sessionStorage vidé']];
    }],
    ['page assos : nouvel inscrit, ville et statut seuls, une écriture', async () => {
        const r = await jouer({ scripts: ['sync', 'city'], config: ASSOS, champs: {}, session: 'Lyon' });
        return [[json(r.ecrits), json([{ statut: 'Interne', 'partnership-city': 'Lyon' }]), 'écrit']];
    }],
    ['page assos : deux vrais changements, deux écritures, aucun champ en double', async () => {
        const r = await jouer({
            scripts: ['sync', 'city'], config: ASSOS,
            champs: { statut: 'Interne', airtablerecordid: 'rec0' },
            session: 'Lyon', stockage: { userId: 'rec1' },
        });
        return [
            [r.ecrits.length, 2, 'écritures'],
            [sansDoublon(r), '', 'champ envoyé deux fois'],
            [json(Object.assign({}, ...r.ecrits)), json({ airtablerecordid: 'rec1', 'partnership-city': 'Lyon' }), 'champs écrits'],
        ];
    }],
    ['page assos : écriture de memberstack-sync ratée, airtablerecordid rattrapé par la ville', async () => {
        const r = await jouer({
            scripts: ['sync', 'city'], config: ASSOS,
            champs: { 'partnership-city': 'Lyon', statut: 'Interne', airtablerecordid: 'rec0' },
            session: 'Lyon', stockage: { userId: 'rec1' }, ms: { echecs: 1 },
        });
        return [[json(r.ecrits), json([{ airtablerecordid: 'rec1' }]), 'écrit'], [r.cle('userId'), null, 'clé userId']];
    }],
    ['page assos : memberstack-sync ne finit jamais, la ville part après le délai', async () => {
        const r = await jouer({
            scripts: ['sync', 'city'], config: ASSOS,
            champs: { statut: 'Interne', airtablerecordid: 'rec0' },
            session: 'Lyon', stockage: { userId: 'rec1' }, ms: { bloque: true }, attente: 200,
        });
        return [
            [r.fin, 'en attente', 'memberstack-sync toujours en cours'],
            [r.ecrits.some((c) => c['partnership-city'] === 'Lyon'), true, 'ville écrite'],
            [r.erreurs.length, 0, `erreurs ${r.erreurs.join(' | ')}`],
        ];
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
