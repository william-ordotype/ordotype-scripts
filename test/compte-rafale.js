#!/usr/bin/env node
/**
 * Mon compte : au-delà de 8 chargements en 30 s dans le même navigateur, le chargeur
 * diffère ses scripts (et donc leurs appels serveur) de 3 s, ou jusqu'au premier geste,
 * et signale la rafale à Sentry au plus une fois par heure. Une visite ordinaire, un
 * stockage illisible ou un historique abîmé : les scripts partent tout de suite.
 *
 * Cas réel : une app macOS a rechargé /membership/compte 13 607 fois du 22 au 24/10/2026,
 * chaque chargement appelant le portail Stripe et la liste des abonnements.
 *
 * L'horloge et les minuteries sont virtuelles ; les scripts ajoutés au <head> sont notés,
 * pas exécutés.
 *
 * Usage : node test/compte-rafale.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const LOADER = fs.readFileSync(path.join(ROOT, 'account/loader.js'), 'utf8');
const BALISE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@abc1234/account/loader.js';
const CLE = 'ordo_compte_chargements';
const SIGNAL = 'ordo_compte_rafale_signalee';
const T0 = 1800000000000;

/**
 * Charge le chargeur à l'instant T0 + `a`. `historique` = décalages (ms, négatifs) des
 * chargements précédents, ou une valeur brute à écrire telle quelle. `stockage` :
 * 'ok' | 'illisible'. `sentry` : false pour une page sans client Sentry.
 */
function charger({ historique = [], brut, signal, stockage = 'ok', sentry = true } = {}) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/membership/compte',
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    let maintenant = T0;
    w.Date.now = () => maintenant;
    let numero = 0;
    const minuteries = new Map();
    w.setTimeout = (fn, ms) => { numero += 1; minuteries.set(numero, { quand: maintenant + (ms || 0), fn }); return numero; };
    w.clearTimeout = (id) => { minuteries.delete(id); };
    w.console.log = () => {};
    w.console.warn = () => {};

    if (brut !== undefined) w.localStorage.setItem(CLE, brut);
    else if (historique.length) w.localStorage.setItem(CLE, JSON.stringify(historique.map((d) => T0 + d)));
    if (signal !== undefined) w.localStorage.setItem(SIGNAL, String(T0 + signal));
    if (stockage === 'illisible') {
        Object.defineProperty(w, 'localStorage', { configurable: true, get() { throw new w.DOMException('refusé', 'SecurityError'); } });
    }

    const messages = [];
    if (sentry) {
        const client = { captureMessage: (msg, niveau, indice) => messages.push({ msg, niveau, indice }) };
        w.__SENTRY__ = { version: '9.0.0', '9.0.0': { defaultCurrentScope: { getClient: () => client } } };
    }

    const ajouts = [];
    const balise = w.document.createElement('script');
    balise.src = BALISE;
    w.document.head.appendChild(balise);
    w.document.head.appendChild = (el) => { ajouts.push({ src: el.src, t: maintenant - T0 }); return el; };

    let exception = null;
    try { w.eval(LOADER); } catch (e) { exception = e; }

    return {
        w,
        ajouts,
        messages,
        exception,
        rolloutPose: typeof w.OrdoRollout === 'object' && w.OrdoRollout !== null,
        avancer(ms) {
            const fin = maintenant + ms;
            for (;;) {
                const prochaine = [...minuteries.entries()].sort((a, b) => a[1].quand - b[1].quand)[0];
                if (!prochaine || prochaine[1].quand > fin) break;
                minuteries.delete(prochaine[0]);
                maintenant = prochaine[1].quand;
                prochaine[1].fn();
            }
            maintenant = fin;
        },
        geste(type) { w.dispatchEvent(new w.Event(type)); },
        stocke() { return JSON.parse(w.localStorage.getItem(CLE)); },
        signalStocke() { return w.localStorage.getItem(SIGNAL); },
    };
}

const parti = (p) => p.ajouts.some((a) => /\/shared\/memberstack-utils\.js$/.test(a.src));
const premier = (p) => (p.ajouts[0] || {}).t;
const sept = [-29000, -25000, -20000, -15000, -10000, -5000, -1000];

const CAS = [
    ['visite ordinaire : scripts tout de suite, rien à Sentry, chargement noté', () => {
        const p = charger();
        return [
            [parti(p), true, 'scripts ajoutés'],
            [premier(p), 0, 'à t = 0'],
            [p.messages.length, 0, 'aucun message Sentry'],
            [JSON.stringify(p.stocke()), JSON.stringify([T0]), 'un chargement noté'],
        ];
    }],
    ['7e chargement en 30 s : pas encore une rafale', () => {
        const p = charger({ historique: sept.slice(1) });
        return [[premier(p), 0, 'scripts à t = 0'], [p.messages.length, 0, 'aucun message']];
    }],
    ['8e chargement en 30 s : scripts différés de 3 s, OrdoRollout posé tout de suite', () => {
        const p = charger({ historique: sept });
        const avant = p.ajouts.length;
        p.avancer(2999);
        const juste = p.ajouts.length;
        p.avancer(1);
        return [
            [p.rolloutPose, true, 'window.OrdoRollout posé (l\'en-tête ne conclut pas à un chargeur absent)'],
            [avant, 0, 'rien à t = 0'],
            [juste, 0, 'rien à 2 999 ms'],
            [premier(p), 3000, 'scripts à 3 000 ms'],
            [p.exception, null, 'aucune exception'],
        ];
    }],
    ['rafale : un message Sentry « warning », sans e-mail, signal noté', () => {
        const p = charger({ historique: sept });
        const m = p.messages[0] || { indice: { captureContext: {} } };
        const ctx = m.indice.captureContext;
        return [
            [p.messages.length, 1, 'un message'],
            [m.msg, 'Mon compte : rafale de chargements', 'titre fixe (un seul ticket Sentry)'],
            [m.niveau, 'warning', 'niveau'],
            [ctx.tags && ctx.tags.context, 'CompteRafale', 'étiquette context'],
            [ctx.extra && ctx.extra.chargements, 8, 'nombre de chargements'],
            [JSON.stringify(ctx).indexOf('@'), -1, 'aucune adresse'],
            [p.signalStocke(), String(T0), 'instant du signal noté'],
        ];
    }],
    ['rafale : un geste lance les scripts sans attendre, une seule fois', () => {
        const p = charger({ historique: sept });
        p.avancer(500);
        p.geste('pointerdown');
        const apresGeste = p.ajouts.length;
        p.geste('keydown');
        p.avancer(5000);
        return [
            [premier(p), 500, 'scripts au geste (500 ms)'],
            [p.ajouts.length, apresGeste, 'ni le 2e geste ni la minuterie ne relancent'],
        ];
    }],
    ['rafale : chaque geste suivi lance les scripts', () => {
        return ['keydown', 'touchstart', 'wheel'].map((g) => {
            const p = charger({ historique: sept });
            p.avancer(100);
            p.geste(g);
            return [premier(p), 100, g];
        });
    }],
    ['signal envoyé il y a 10 min : pas de second message ; il y a 2 h : un nouveau', () => {
        const recent = charger({ historique: sept, signal: -600000 });
        const vieux = charger({ historique: sept, signal: -7200000 });
        const futur = charger({ historique: sept, signal: 600000 });
        return [
            [recent.messages.length, 0, '10 min : rien'],
            [recent.signalStocke(), String(T0 - 600000), '10 min : instant inchangé'],
            [vieux.messages.length, 1, '2 h : un message'],
            [futur.messages.length, 1, 'horloge revenue en arrière : un message'],
        ];
    }],
    ['chargements de plus de 30 s : oubliés, plus de rafale', () => {
        const p = charger({ historique: [-90000, -80000, -70000, -60000, -50000, -40000, -31000, -30000] });
        return [
            [premier(p), 0, 'scripts à t = 0'],
            [JSON.stringify(p.stocke()), JSON.stringify([T0]), 'seul ce chargement reste'],
        ];
    }],
    ['instants dans le futur (horloge revenue en arrière) : ignorés', () => {
        const p = charger({ historique: [1000, 2000, 3000, 4000, 5000, 6000, 7000] });
        return [[premier(p), 0, 'scripts à t = 0'], [p.stocke().length, 1, 'un seul instant gardé']];
    }],
    ['historique abîmé (texte, objet, valeurs non numériques) : scripts tout de suite, réécrit', () => {
        return [['pas du json', 'texte'], ['{"a":1}', 'objet'], [JSON.stringify(['x', null, T0 - 1000]), 'mélange']].map(([brut, quoi]) => {
            const p = charger({ brut });
            return [premier(p) === 0 && Array.isArray(p.stocke()) && p.stocke().every((t) => typeof t === 'number'), true, quoi];
        });
    }],
    ['stockage illisible : comme avant, scripts tout de suite, aucune exception', () => {
        const p = charger({ stockage: 'illisible' });
        return [
            [premier(p), 0, 'scripts à t = 0'],
            [p.exception, null, 'aucune exception'],
            [p.messages.length, 0, 'aucun message'],
        ];
    }],
    ['rafale sans client Sentry : scripts différés quand même, aucune exception, signal non noté', () => {
        const p = charger({ historique: sept, sentry: false });
        p.avancer(3000);
        return [
            [premier(p), 3000, 'scripts à 3 000 ms'],
            [p.exception, null, 'aucune exception'],
            [p.signalStocke(), null, 'signal non noté (il partira au prochain chargement avec Sentry)'],
        ];
    }],
    ['historique borné : 100 chargements rapprochés gardent au plus 16 instants', () => {
        const historique = [];
        for (let i = 99; i >= 1; i--) historique.push(-i * 100);
        const p = charger({ historique });
        return [[p.stocke().length, 16, 'longueur'], [p.stocke()[15], T0, 'le plus récent en dernier']];
    }],
];

const rejets = [];
process.on('unhandledRejection', (e) => rejets.push(e && e.message));

(async () => {
    let echecs = 0;
    let verifs = 0;
    for (const [nomCas, cas] of CAS) {
        let resultats;
        try {
            resultats = await cas();
        } catch (e) {
            echecs += 1;
            console.log(`  ECHEC  ${nomCas} : exception ${e.message}`);
            continue;
        }
        verifs += resultats.length;
        const ko = resultats.filter(([obtenu, attendu]) => obtenu !== attendu);
        if (ko.length) {
            echecs += 1;
            console.log(`  ECHEC  ${nomCas} : ${ko.map(([o, a, quoi]) => `${quoi} (obtenu ${o}, attendu ${a})`).join(' ; ')}`);
        } else {
            console.log(`  ok     ${nomCas}`);
        }
    }
    if (rejets.length) {
        echecs += 1;
        console.log(`  ECHEC  rejets non gérés : ${rejets.length} (${rejets[0]})`);
    }
    console.log(echecs ? `\n${echecs} cas en échec sur ${CAS.length}.` : `\n${CAS.length} cas, ${verifs} vérifications OK.`);
    process.exit(echecs ? 1 : 0);
})();
