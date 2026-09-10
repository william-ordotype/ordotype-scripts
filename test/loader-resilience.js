#!/usr/bin/env node
/**
 * Vérifie qu'un chargeur survit à la défaillance d'une dépendance tierce.
 *
 * Le contexte : les dépendances du champ téléphone viennent de cdnjs, et on a
 * mesuré qu'elles n'arrivent pas toujours. Le 2026-09-10, une alerte réelle a
 * montré la BIBLIOTHÈQUE elle-même absente sur `/membership/compte`. Or trois
 * chargeurs enchaînaient des `await` dans un seul `try` : le même échec y
 * faisait sortir du bloc et **plus rien ne se chargeait ensuite** — bandeaux,
 * redirections, synchronisation Memberstack, Crisp.
 *
 * Pire, la feuille de style n'avait pas de `onerror` : une feuille qui
 * n'arrive jamais laissait la promesse EN SUSPENS pour toujours. Pas d'erreur,
 * pas de trace, une page silencieusement inerte. Et c'est invisible en
 * supervision, puisque le script qui sait signaler est justement celui qui ne
 * se charge pas.
 *
 * Ce qui doit tenir, pour chaque chargeur :
 *   - tout se charge quand tout va bien, et dans le bon ordre ;
 *   - la bibliothèque tierce en ÉCHEC n'empêche aucun autre script ;
 *   - la feuille de style en échec non plus ;
 *   - la feuille de style QUI NE RÉPOND JAMAIS non plus : c'est le cas qui
 *     n'était couvert par rien, et le seul qui soit totalement muet ;
 *   - `phone-input.js` est chargé MÊME quand ses dépendances ont manqué,
 *     parce que c'est lui qui sait le dire.
 *
 * Usage : node test/loader-resilience.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REEL = console;

/**
 * Horloge virtuelle : les délais sont respectés, donc assertables. Sans elle,
 * le cas « la feuille ne répond jamais » demanderait d'attendre 8 secondes
 * pour de vrai, et personne ne lancerait la suite.
 */
function horloge() {
    let maintenant = 0;
    let suivant = 0;
    const timers = new Map();

    return {
        set(fn, delai) {
            suivant += 1;
            timers.set(suivant, { fn, a: maintenant + (delai || 0) });
            return suivant;
        },
        clear(id) { timers.delete(id); },
        avancer(ms) {
            const fin = maintenant + ms;
            for (;;) {
                let choisi = null;
                timers.forEach((v, k) => {
                    if (v.a <= fin && (choisi === null || v.a < choisi[1].a)) choisi = [k, v];
                });
                if (choisi === null) break;
                timers.delete(choisi[0]);
                maintenant = choisi[1].a;
                choisi[1].fn();
            }
            maintenant = fin;
        },
        enAttente() { return timers.size; },
    };
}

/** Ce que chaque chargeur attend de son environnement, et ce qu'on exige. */
const CHARGEURS = [
    {
        source: 'homepage/loader.js',
        marqueur: '/homepage/loader.js',
        // Les scripts qui doivent survivre à une panne du champ téléphone.
        essentiels: ['homepage/core.js', 'homepage/member-redirects.js', 'homepage/cgu-modal.js'],
        phone: 'mes-informations/phone-input.js',
    },
    {
        source: 'mes-informations/loader.js',
        marqueur: '/mes-informations/loader.js',
        essentiels: ['mes-informations/memberstack-sync.js', 'mes-informations/required-if-visible.js'],
        phone: 'mes-informations/phone-input.js',
    },
    {
        source: 'mes-informations-cms/loader.js',
        marqueur: '/mes-informations-cms/loader.js',
        essentiels: ['mes-informations-cms/memberstack-sync.js', 'mes-informations-cms/location-store.js'],
        phone: 'mes-informations/phone-input.js',
    },
    {
        source: 'account/loader.js',
        marqueur: '/account/loader.js',
        essentiels: ['account/core.js', 'account/subscriptions.js'],
        phone: 'account/phone-input.js',
    },
];

/**
 * @param {object} opts
 *   panne  : 'aucune' | 'lib' | 'css' | 'cssMuette'
 *     - 'lib'       : intlTelInput.min.js répond par une erreur
 *     - 'css'       : la feuille de style répond par une erreur
 *     - 'cssMuette' : la feuille ne répond JAMAIS, ni load ni error
 */
function env(chargeur, opts) {
    const charges = [];
    const sauvegarde = {
        window: global.window, document: global.document, console: global.console,
        localStorage: global.localStorage, setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
    };

    const estCSSTel = (u) => /intlTelInput\.min\.css$/.test(u);
    const estLibTel = (u) => /intlTelInput\.min\.js$/.test(u);

    const tete = {
        appendChild(el) {
            const url = el.src || el.href;
            charges.push(url);
            if (el.href && estCSSTel(url) && opts.panne === 'cssMuette') return; // jamais de verdict
            setImmediate(() => {
                const casse = (el.href && estCSSTel(url) && opts.panne === 'css')
                    || (el.src && estLibTel(url) && opts.panne === 'lib');
                if (casse) { if (el.onerror) el.onerror(); return; }
                if (el.onload) el.onload();
            });
        },
    };

    const doc = {
        readyState: 'complete',
        head: tete,
        body: tete,
        addEventListener() {},
        createElement() { return {}; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        getElementById() { return null; },
        // Le chargeur lit sa propre balise pour propager son pin.
        getElementsByTagName() {
            return [{ src: 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@testpin' + chargeur.marqueur }];
        },
    };

    const win = {
        location: { hostname: 'www.ordotype.fr', href: 'https://www.ordotype.fr/' },
        dataLayer: [],
        OrdoMemberstack: { memberId: 'mem_test' },
        MES_INFOS_CONFIG: {},
        addEventListener() {},
    };

    const h = horloge();
    global.window = win;
    global.document = doc;
    global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    global.console = { log() {}, warn() {}, error() {}, info() {} };
    global.setTimeout = (fn, d) => h.set(fn, d);
    global.clearTimeout = (id) => h.clear(id);

    const poignee = {
        charges,
        horloge: h,
        restaure() { Object.assign(global, sauvegarde); },
        /** Un fichier du dépôt a-t-il été demandé ? (indépendant du pin) */
        aCharge(suffixe) { return charges.some((u) => u.endsWith('/' + suffixe)); },
    };

    // Publiée AVANT l'évaluation : si le fichier ne s'analyse pas, `eval` lève
    // ici, et sans cette poignée la console factice resterait en place pour
    // tout le reste de la suite, qui échouerait alors SANS AFFICHER UNE LIGNE.
    courant = poignee;

    eval(fs.readFileSync(path.join(ROOT, chargeur.source), 'utf8'));

    return poignee;
}

let courant = null;

// Laisse les promesses ET les setImmediate se dérouler. Les chargeurs
// enchaînent jusqu'à une dizaine d'étapes, chacune sur un tour de boucle.
const repos = async (tours = 60) => {
    for (let i = 0; i < tours; i++) await new Promise((r) => setImmediate(r));
};

const CAS = [
    ['tout va bien : les essentiels et le champ sont chargés', async (c) => {
        const e = env(c, { panne: 'aucune' });
        await repos();
        for (const f of c.essentiels) if (!e.aCharge(f)) return f + ' non chargé alors que tout va bien';
        if (!e.aCharge(c.phone)) return c.phone + ' non chargé alors que tout va bien';
        return '';
    }],

    ['bibliothèque tierce EN ÉCHEC : les essentiels passent quand même', async (c) => {
        const e = env(c, { panne: 'lib' });
        await repos();
        const perdus = c.essentiels.filter((f) => !e.aCharge(f));
        if (perdus.length) {
            return 'la page est amputée pour un défaut de formatage de numéro : ' + perdus.join(', ');
        }
        return '';
    }],

    ['bibliothèque tierce EN ÉCHEC : phone-input est chargé quand même', async (c) => {
        const e = env(c, { panne: 'lib' });
        await repos();
        if (!e.aCharge(c.phone)) {
            return 'écarté avec ses dépendances : c est pourtant LUI qui sait signaler leur absence';
        }
        return '';
    }],

    ['feuille de style EN ÉCHEC : les essentiels passent quand même', async (c) => {
        const e = env(c, { panne: 'css' });
        await repos();
        const perdus = c.essentiels.filter((f) => !e.aCharge(f));
        if (perdus.length) return 'page amputée par une feuille de style absente : ' + perdus.join(', ');
        return '';
    }],

    ['feuille de style QUI NE RÉPOND JAMAIS : la sortie de secours est BORNÉE', async (c) => {
        const e = env(c, { panne: 'cssMuette' });
        await repos();
        // 🔴 Le cas décisif, et le seul totalement muet : un filtrage réseau
        // peut tenir la requête ouverte sans jamais répondre NI échouer, donc
        // ni `onload` ni `onerror` ne partent. Sans délai, rien ne se débloque.
        e.horloge.avancer(8000);
        await repos();
        const perdus = c.essentiels.filter((f) => !e.aCharge(f));
        if (perdus.length) {
            return 'promesse en suspens pour toujours, page inerte SANS AUCUNE TRACE : ' + perdus.join(', ');
        }
        if (e.horloge.enAttente() !== 0) return 'une minuterie reste armée après la sortie de secours';
        return '';
    }],

    ['feuille de style qui répond : aucune minuterie ne survit', async (c) => {
        const e = env(c, { panne: 'aucune' });
        await repos();
        if (e.horloge.enAttente() !== 0) {
            return 'minuterie non annulée : elle retiendrait la page en mémoire pour rien';
        }
        return '';
    }],
];

(async () => {
    let echecs = 0;
    let joues = 0;
    let courant = null;

    for (const c of CHARGEURS) {
        for (const [nom, fn] of CAS) {
            joues += 1;
            let probleme;
            try {
                probleme = await fn(c);
            } catch (err) {
                probleme = 'exception : ' + err.message;
            } finally {
                if (courant) courant.restaure();
                Object.assign(global, { console: REEL });
            }
            if (probleme) {
                echecs += 1;
                REEL.error('FAIL  ' + c.source + ' — ' + nom + '\n      ' + probleme);
            } else {
                REEL.log('ok    ' + c.source + ' — ' + nom);
            }
        }
    }

    if (echecs) {
        REEL.error('\n' + echecs + ' cas en échec sur ' + joues);
        process.exit(1);
    }
    REEL.log('\n' + joues + ' cas (' + CAS.length + ' × ' + CHARGEURS.length + '), tous verts');
})();
