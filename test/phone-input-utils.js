#!/usr/bin/env node
/**
 * Vérifie que le champ téléphone survit à l'absence des aides de formatage.
 *
 * Le contexte : intl-tel-input 17.0.8 répond à un échec de chargement de son
 * fichier `utils.js` en appelant `rejectUtilsScriptPromise` sur chaque
 * instance. Cette méthode n'existe pas dans cette version : la chaîne
 * n'apparaît qu'une fois dans tout le fichier, celle de l'appel. L'exception
 * part donc de l'intérieur de la bibliothèque, dans le gestionnaire d'erreur
 * d'une balise script qu'elle a créée : elle est INCATCHABLE depuis notre
 * code. La seule parade est de ne pas emprunter ce chemin, donc de charger
 * `utils.js` nous-mêmes et de ne PAS passer l'option `utilsScript`.
 *
 * Ce qui doit tenir :
 *   - `utilsScript` n'est jamais passé à la bibliothèque ;
 *   - les aides sont chargées AVANT la construction de l'instance, sans quoi
 *     l'exemple affiché dans le champ reste non formaté ;
 *   - aides absentes, en échec ou EN SUSPENS : le champ est construit quand
 *     même. Un filtrage réseau peut tenir la requête ouverte sans jamais
 *     répondre ni échouer ; attendre `load`/`error` seuls laisserait une
 *     simple boîte de texte, donc pire qu'avant le correctif ;
 *   - sans les aides, la frappe ne lève pas et n'efface pas la saisie ;
 *   - la dégradation est signalée par le canal du dépôt, pas seulement dans
 *     une console que personne ne lit ;
 *   - bibliothèque absente : l'attente s'arrête au lieu de sonder la page
 *     jusqu'à sa fermeture.
 *
 * Les cas sont rejoués sur les DEUX copies servies en production.
 *
 * Usage : node test/phone-input-utils.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
    'mes-informations/phone-input.js',
    'account/phone-input.js',
];

/** Horloge virtuelle : les délais sont respectés, donc assertables. */
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

/**
 * @param {string} source  chemin du fichier à évaluer
 * @param {object} opts
 *   utilsLoad : 'ok' | 'fail' | 'stall' | 'deja'  sort du chargement des aides
 *   library   : bool    window.intlTelInput est-il présent
 *   inputs    : 0       page sans champ téléphone
 */
function env(source, opts) {
    const trace = {
        initOptions: null,
        utilsAuMomentDuInit: null,
        initCount: 0,
        scripts: [],
        avertissements: [],
        signalements: [],
    };

    const input = {
        value: '',
        attrs: { 'ms-code-phone-number': 'fr,be' },
        listeners: {},
        getAttribute(n) { return this.attrs[n]; },
        addEventListener(t, fn) { this.listeners[t] = fn; },
        closest() { return null; },
    };

    const inputs = opts.inputs === 0 ? [] : [input];
    inputs.forEach = Array.prototype.forEach.bind(inputs);

    const win = {
        intlTelInputUtils: opts.utilsLoad === 'deja' ? { numberFormat: { INTERNATIONAL: 1 } } : undefined,
        intlTelInput: null,
        OrdoErrorReporter: {
            reportNetwork(contexte, err) { trace.signalements.push(contexte + ': ' + err.message); },
        },
    };

    if (opts.library !== false) {
        win.intlTelInput = (el, options) => {
            trace.initCount += 1;
            trace.initOptions = options;
            trace.utilsAuMomentDuInit = Boolean(win.intlTelInputUtils);
            return {
                getNumber(format) {
                    if (format !== 1) throw new Error('format inattendu: ' + format);
                    return '+33 6 12 34 56 78';
                },
            };
        };
    }

    const conteneur = {
        appendChild(script) {
            trace.scripts.push({ src: script.src, crossOrigin: script.crossOrigin });
            if (opts.utilsLoad === 'stall') return; // ni load ni error, jamais
            queueMicrotask(() => {
                if (opts.utilsLoad === 'fail') {
                    script.onerror();
                } else {
                    win.intlTelInputUtils = { numberFormat: { INTERNATIONAL: 1 } };
                    script.onload();
                }
            });
        },
    };

    const doc = {
        readyState: 'complete',
        body: conteneur,
        head: conteneur,
        addEventListener() {},
        createElement() { return {}; },
        querySelectorAll() { return inputs; },
    };

    const h = horloge();
    const sauvegarde = {
        window: global.window,
        document: global.document,
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
        console: global.console,
    };

    global.window = win;
    global.document = doc;
    global.setTimeout = (fn, d) => h.set(fn, d);
    global.clearTimeout = (id) => h.clear(id);
    global.console = {
        log() {}, error() {}, info() {},
        warn(...a) { trace.avertissements.push(a.join(' ')); },
    };

    eval(fs.readFileSync(path.join(ROOT, source), 'utf8'));

    // La console factice et l'horloge restent en place le temps du cas : le
    // chargement des aides se résout APRÈS le retour de cette fonction. Le
    // lanceur remet les vrais globaux ensuite, sans quoi un `setTimeout`
    // synthétique survivrait au fichier et contaminerait la suite.
    courant = { trace, input, win, horloge: h, restaure() { Object.assign(global, sauvegarde); } };
    return courant;
}

let courant = null;

// Laisse les promesses et micro-tâches se dérouler.
const repos = () => new Promise((r) => setImmediate(r));

const CAS = [
    ['utilsScript n est jamais passé à la bibliothèque', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.initCount !== 1) return 'la bibliothèque aurait dû être initialisée une fois';
        if ('utilsScript' in e.trace.initOptions) {
            return 'utilsScript est repassé à la bibliothèque, le chemin cassé redevient possible';
        }
        return '';
    }],

    ['les aides sont chargées AVANT la construction de l instance', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.scripts.length !== 1) return 'les aides n ont pas été chargées';
        if (!/utils\.js$/.test(e.trace.scripts[0].src)) return 'ce n est pas utils.js qui a été chargé';
        if (e.trace.utilsAuMomentDuInit !== true) {
            return 'instance construite avant les aides : l exemple affiché resterait non formaté';
        }
        return '';
    }],

    ['la balise porte crossOrigin, sans quoi une erreur remonte nue', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.scripts[0].crossOrigin !== 'anonymous') {
            return 'crossOrigin absent : window.onerror ne verrait qu un « Script error. »';
        }
        return '';
    }],

    ['aides disponibles : la frappe formate', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        e.input.value = '0612345678';
        e.input.listeners.keyup();
        if (e.input.value !== '+33 6 12 34 56 78') return 'le numéro n a pas été formaté';
        return '';
    }],

    ['aides déjà présentes : rien n est rechargé', async (src) => {
        const e = env(src, { utilsLoad: 'deja' });
        await repos();
        if (e.trace.scripts.length !== 0) return 'utils.js rechargé alors qu il est déjà là';
        if (e.trace.initCount !== 1) return 'le court-circuit ne construit pas le champ';
        return '';
    }],

    ['aides en échec : on initialise quand même et on signale', async (src) => {
        const e = env(src, { utilsLoad: 'fail' });
        await repos();
        if (e.trace.initCount !== 1) return 'le champ n a pas été initialisé alors que seules les aides manquent';
        if (!e.trace.signalements.some((m) => /^PhoneInput: /.test(m))) {
            return 'la dégradation n est pas signalée au canal du dépôt';
        }
        return '';
    }],

    ['requête en suspens : le champ est construit quand même', async (src) => {
        const e = env(src, { utilsLoad: 'stall' });
        await repos();
        if (e.trace.initCount !== 0) return 'le champ ne devrait pas être construit avant la fin du délai';
        e.horloge.avancer(8000);
        await repos();
        if (e.trace.initCount !== 1) {
            return 'aucune sortie de secours : le champ reste une simple boîte de texte, pire qu avant';
        }
        if (!e.trace.signalements.some((m) => /timed out/.test(m))) return 'le délai dépassé n est pas signalé';
        return '';
    }],

    ['requête en suspens : le délai est borné, pas simplement long', async (src) => {
        const e = env(src, { utilsLoad: 'stall' });
        await repos();
        e.horloge.avancer(30000);
        await repos();
        if (e.trace.initCount !== 1) return 'le champ n est jamais construit';
        if (e.horloge.enAttente() !== 0) return 'une minuterie reste armée après la sortie de secours';
        return '';
    }],

    ['aides absentes : la frappe ne lève pas et garde la saisie', async (src) => {
        const e = env(src, { utilsLoad: 'fail' });
        await repos();
        e.input.value = '0612345678';
        try {
            e.input.listeners.keyup();
            e.input.listeners.change();
        } catch (err) {
            return 'la frappe a levé : ' + err.message;
        }
        if (e.input.value !== '0612345678') return 'la saisie a été écrasée alors que les aides manquent';
        return '';
    }],

    ['bibliothèque absente : l attente s arrête', async (src) => {
        const e = env(src, { utilsLoad: 'ok', library: false });
        e.horloge.avancer(60000);
        await repos();
        if (e.trace.initCount !== 0) return 'construit sans bibliothèque';
        if (e.horloge.enAttente() !== 0) return 'la boucle d attente n est pas bornée';
        if (!e.trace.signalements.some((m) => /did not load/.test(m))) {
            return 'l abandon n est pas signalé';
        }
        return '';
    }],

    ['aucun champ téléphone : rien n est chargé', async (src) => {
        const e = env(src, { utilsLoad: 'ok', inputs: 0 });
        await repos();
        if (e.trace.scripts.length !== 0) return 'utils.js chargé sur une page sans champ téléphone';
        if (e.trace.initCount !== 0) return 'la bibliothèque a été initialisée sans champ';
        return '';
    }],
];

(async () => {
    let echecs = 0;
    let joues = 0;

    for (const source of SOURCES) {
        for (const [nom, fn] of CAS) {
            joues += 1;
            let probleme;
            try {
                probleme = await fn(source);
            } catch (err) {
                probleme = 'exception : ' + err.message;
            } finally {
                if (courant) courant.restaure();
            }
            if (probleme) {
                echecs += 1;
                console.error('FAIL  ' + source + ' — ' + nom + '\n      ' + probleme);
            } else {
                console.log('ok    ' + source + ' — ' + nom);
            }
        }
    }

    if (echecs) {
        console.error('\n' + echecs + ' cas en échec sur ' + joues);
        process.exit(1);
    }
    console.log('\n' + joues + ' cas (' + CAS.length + ' × ' + SOURCES.length + '), tous verts');
})();
