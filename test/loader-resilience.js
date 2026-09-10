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
 *   - et surtout, ni l'une ni l'autre QUAND ELLES NE RÉPONDENT JAMAIS. C'est
 *     le cas décisif : `onerror` ne le voit pas, `try/catch` ne peut rien
 *     contre une promesse qui ne se dénoue pas, et il est totalement muet ;
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
 *   panne  : 'aucune' | 'lib' | 'libMuette' | 'css' | 'cssMuette'
 *     - 'lib'       : intlTelInput.min.js répond par une erreur
 *     - 'libMuette' : la bibliothèque ne répond JAMAIS, ni load ni error
 *     - 'css'       : la feuille de style répond par une erreur
 *     - 'cssMuette' : la feuille ne répond JAMAIS, ni load ni error
 *     - 'crisp'     : crisp-loader.js (autre dépôt) répond par une erreur
 */
function env(chargeur, opts) {
    const charges = [];
    const sauvegarde = {
        window: global.window, document: global.document, console: global.console,
        localStorage: global.localStorage, setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
    };

    const executes = [];
    const estCSSTel = (u) => /intlTelInput\.min\.css$/.test(u);
    const estLibTel = (u) => /intlTelInput\.min\.js$/.test(u);

    /** Quel sort le réseau réserve à cette URL : 'ok' | 'erreur' | 'muet'. */
    function sort(el, url) {
        if (el.href && estCSSTel(url)) {
            if (opts.panne === 'css') return 'erreur';
            if (opts.panne === 'cssMuette') return 'muet';
        }
        if (el.src && estLibTel(url)) {
            if (opts.panne === 'lib') return 'erreur';
            if (opts.panne === 'libMuette') return 'muet';
        }
        // Crisp vient d'un AUTRE dépôt, servi @main : même exposition qu'un
        // tiers, et il était le seul `await` nu entre deux blocs protégés.
        if (el.src && /crisp-loader\.js$/.test(url) && opts.panne === 'crisp') return 'erreur';
        return 'ok';
    }

    function delivrer(el, url, verdict) {
        if (verdict === 'muet') return;
        if (verdict === 'erreur') { if (el.onerror) el.onerror(); return; }
        executes.push(url);
        if (el.onload) el.onload();
    }

    /**
     * 🔴 `script.async = false` = exécution dans l'ORDRE D'INSERTION. Un script
     * en échec est retiré de la file et les suivants passent ; un script qui ne
     * répond JAMAIS gare la file derrière lui. Ne pas modéliser ça, c'est
     * certifier une robustesse que le code n'a pas : les fichiers seraient
     * comptés comme exécutés alors qu'ils sont seulement téléchargés.
     */
    const file = [];
    function vider() {
        while (file.length) {
            const t = file[0];
            if (t.verdict === 'muet') return; // la file reste garée, comme dans un vrai navigateur
            file.shift();
            delivrer(t.el, t.url, t.verdict);
        }
    }

    const tete = {
        appendChild(el) {
            const url = el.src || el.href;
            charges.push(url);
            const verdict = sort(el, url);
            if (el.src && el.async === false) {
                file.push({ el, url, verdict });
                setImmediate(vider);
                return;
            }
            setImmediate(() => delivrer(el, url, verdict));
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
        executes,
        horloge: h,
        restaure() { Object.assign(global, sauvegarde); },
        /**
         * 🔴 A-t-il été EXÉCUTÉ, pas seulement demandé. La nuance décide de
         * tout sur `account/loader.js`, qui insère tout d'un coup : les six
         * cas y passeraient même sans la moindre gestion d'erreur, puisque
         * toutes les URL atterrissent dans `charges` avant le premier verdict.
         */
        aExecute(suffixe) { return executes.some((u) => u.endsWith('/' + suffixe)); },
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
        for (const f of c.essentiels) if (!e.aExecute(f)) return f + ' non chargé alors que tout va bien';
        if (!e.aExecute(c.phone)) return c.phone + ' non chargé alors que tout va bien';
        return '';
    }],

    ['bibliothèque tierce EN ÉCHEC : les essentiels passent quand même', async (c) => {
        const e = env(c, { panne: 'lib' });
        await repos();
        const perdus = c.essentiels.filter((f) => !e.aExecute(f));
        if (perdus.length) {
            return 'la page est amputée pour un défaut de formatage de numéro : ' + perdus.join(', ');
        }
        return '';
    }],

    ['bibliothèque tierce EN ÉCHEC : phone-input est chargé quand même', async (c) => {
        const e = env(c, { panne: 'lib' });
        await repos();
        if (!e.aExecute(c.phone)) {
            return 'écarté avec ses dépendances : c est pourtant LUI qui sait signaler leur absence';
        }
        return '';
    }],

    ['feuille de style EN ÉCHEC : les essentiels passent quand même', async (c) => {
        const e = env(c, { panne: 'css' });
        await repos();
        const perdus = c.essentiels.filter((f) => !e.aExecute(f));
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
        const perdus = c.essentiels.filter((f) => !e.aExecute(f));
        if (perdus.length) {
            return 'promesse en suspens pour toujours, page inerte SANS AUCUNE TRACE : ' + perdus.join(', ');
        }
        if (e.horloge.enAttente() !== 0) return 'une minuterie reste armée après la sortie de secours';
        return '';
    }],

    ['bibliothèque tierce QUI NE RÉPOND JAMAIS : les essentiels passent quand même', async (c) => {
        // 🔴 Le cas le plus grave, et celui qu'un `onerror` ne voit PAS. Un
        // `try/catch` n'y peut rien non plus : une promesse en suspens ne
        // rejette jamais. C'est aussi celui qui gare la file d'exécution
        // ordonnée d'`account/loader.js` derrière un script téléchargé mais
        // jamais exécuté.
        const e = env(c, { panne: 'libMuette' });
        await repos();
        const perdus = c.essentiels.filter((f) => !e.aExecute(f));
        if (perdus.length) {
            return 'page inerte derrière une requête tierce qui ne répond pas : ' + perdus.join(', ');
        }
        return '';
    }],

    ['bibliothèque tierce QUI NE RÉPOND JAMAIS : phone-input finit par arriver', async (c) => {
        const e = env(c, { panne: 'libMuette' });
        await repos();
        e.horloge.avancer(15000);
        await repos();
        if (!e.aExecute(c.phone)) {
            return 'aucun délai : le seul script capable de signaler la panne n arrive jamais';
        }
        return '';
    }],

    ['feuille de style EN ÉCHEC : phone-input arrive sans attendre le délai', async (c) => {
        // Sans `onerror` sur la feuille, cette promesse ne se dénoue qu'au
        // bout des 8 s : le seul script capable de signaler la panne arriverait
        // avec 8 secondes de retard, ou jamais si le délai saute aussi.
        const e = env(c, { panne: 'css' });
        await repos();
        if (!e.aExecute(c.phone)) return 'phone-input retenu par une feuille de style absente';
        return '';
    }],

    ['feuille de style MUETTE : phone-input arrive après le délai, pas jamais', async (c) => {
        const e = env(c, { panne: 'cssMuette' });
        await repos();
        e.horloge.avancer(8000);
        await repos();
        if (!e.aExecute(c.phone)) return 'aucune sortie de secours sur la feuille de style';
        return '';
    }],

    ['Crisp EN ÉCHEC : les essentiels passent quand même', async (c) => {
        const e = env(c, { panne: 'crisp' });
        await repos();
        const perdus = c.essentiels.filter((f) => !e.aExecute(f));
        if (perdus.length) {
            return 'page amputée par un chargeur d un AUTRE dépôt : ' + perdus.join(', ');
        }
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

// 🔴 Un rejet non géré tue le processus avec un code 1 et PAS UNE LIGNE : le
// même silence que celui qu'on corrige. On le rend bruyant.
process.on('unhandledRejection', (err) => {
    REEL.error('FAIL  rejet non géré : ' + (err && err.message ? err.message : err));
    process.exit(1);
});

(async () => {
    let echecs = 0;
    let joues = 0;

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
