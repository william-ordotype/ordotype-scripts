#!/usr/bin/env node
/**
 * Vérifie que le champ téléphone survit à l'absence des aides de formatage.
 *
 * Le contexte : intl-tel-input 17.0.8 répond à un échec de chargement de son
 * fichier `utils.js` en appelant sur chaque instance une méthode qui n'existe
 * pas dans cette version. L'exception part de l'intérieur de la bibliothèque,
 * dans le gestionnaire d'erreur d'une balise script qu'elle a créée : elle est
 * donc INCATCHABLE depuis notre code. La seule parade est de ne pas emprunter
 * ce chemin, donc de charger `utils.js` nous-mêmes et de ne PAS passer
 * l'option `utilsScript`.
 *
 * Ce qui doit tenir :
 *   - `utilsScript` n'est jamais passé à la bibliothèque ;
 *   - les aides sont chargées AVANT la construction de l'instance, sans quoi
 *     l'exemple affiché dans le champ reste non formaté ;
 *   - aides indisponibles : l'initialisation a quand même lieu, et la frappe
 *     ne lève pas et n'efface pas ce que la personne a tapé ;
 *   - bibliothèque absente : l'attente s'arrête au lieu de sonder la page
 *     jusqu'à sa fermeture.
 *
 * Usage : node test/phone-input-utils.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REAL = console;

/**
 * @param {object} opts
 *   utilsLoad : 'ok' | 'fail'      sort du chargement des aides
 *   library   : bool               window.intlTelInput est-il présent
 */
function env(opts) {
    const trace = {
        initOptions: null,
        utilsAuMomentDuInit: null,
        initCount: 0,
        scriptsCharges: [],
        minuteries: 0,
        avertissements: [],
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
        intlTelInputUtils: undefined,
        intlTelInput: null,
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
            trace.scriptsCharges.push(script.src);
            // Le chargement est asynchrone dans un navigateur.
            queueMicrotask(() => {
                if (opts.utilsLoad === 'ok') {
                    win.intlTelInputUtils = { numberFormat: { INTERNATIONAL: 1 } };
                    script.onload();
                } else {
                    script.onerror();
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

    global.window = win;
    global.document = doc;
    global.setTimeout = (fn) => {
        trace.minuteries += 1;
        // On ne rejoue pas la boucle indéfiniment : une seule relance suffit à
        // prouver qu'elle est bornée, le compteur dit le reste.
        if (trace.minuteries < 500) fn();
        return trace.minuteries;
    };
    global.console = {
        log() {}, error() {}, info() {},
        warn(...a) { trace.avertissements.push(a.join(' ')); },
    };

    eval(fs.readFileSync(path.join(ROOT, 'mes-informations/phone-input.js'), 'utf8'));

    // La console factice reste en place : le chargement des aides se résout
    // APRÈS le retour de cette fonction, et c'est là que part l'avertissement
    // qu'on veut observer. Le lanceur la remet en place après chaque cas.
    return { trace, input, win };
}

// Laisse les promesses et micro-tâches se dérouler.
const repos = () => new Promise((r) => setImmediate(r));

const CAS = [
    ['utilsScript n est jamais passé à la bibliothèque', async () => {
        const e = env({ utilsLoad: 'ok' });
        await repos();
        if (e.trace.initCount !== 1) return 'la bibliothèque aurait dû être initialisée une fois';
        if ('utilsScript' in e.trace.initOptions) {
            return 'utilsScript est repassé à la bibliothèque, le chemin cassé redevient possible';
        }
        return '';
    }],

    ['les aides sont chargées AVANT la construction de l instance', async () => {
        const e = env({ utilsLoad: 'ok' });
        await repos();
        if (e.trace.scriptsCharges.length !== 1) return 'les aides n ont pas été chargées';
        if (!/utils\.js$/.test(e.trace.scriptsCharges[0])) return 'ce n est pas utils.js qui a été chargé';
        if (e.trace.utilsAuMomentDuInit !== true) {
            return 'instance construite avant les aides : l exemple affiché resterait non formaté';
        }
        return '';
    }],

    ['aides disponibles : la frappe formate', async () => {
        const e = env({ utilsLoad: 'ok' });
        await repos();
        e.input.value = '0612345678';
        e.input.listeners.keyup();
        if (e.input.value !== '+33 6 12 34 56 78') return 'le numéro n a pas été formaté';
        return '';
    }],

    ['aides bloquées : on initialise quand même', async () => {
        const e = env({ utilsLoad: 'fail' });
        await repos();
        if (e.trace.initCount !== 1) return 'le champ n a pas été initialisé alors que seules les aides manquent';
        if (!e.trace.avertissements.some((m) => /Formatting helpers unavailable/.test(m))) {
            return 'aucun avertissement sur les aides manquantes';
        }
        return '';
    }],

    ['aides bloquées : la frappe ne lève pas et garde la saisie', async () => {
        const e = env({ utilsLoad: 'fail' });
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

    ['bibliothèque absente : l attente s arrête', async () => {
        const e = env({ utilsLoad: 'ok', library: false });
        await repos();
        if (e.trace.minuteries === 0) return 'aucune tentative, le champ ne serait jamais initialisé';
        if (e.trace.minuteries >= 500) return 'la boucle d attente n est pas bornée';
        if (!e.trace.avertissements.some((m) => /did not load/.test(m))) {
            return 'l abandon n est pas signalé';
        }
        return '';
    }],

    ['aucun champ téléphone : rien n est chargé', async () => {
        const e = env({ utilsLoad: 'ok', inputs: 0 });
        await repos();
        if (e.trace.scriptsCharges.length !== 0) {
            return 'utils.js est chargé sur une page sans champ téléphone';
        }
        if (e.trace.initCount !== 0) return 'la bibliothèque a été initialisée sans champ';
        return '';
    }],
];

(async () => {
    let echecs = 0;
    for (const [nom, fn] of CAS) {
        let probleme;
        try {
            probleme = await fn();
        } catch (err) {
            probleme = 'exception : ' + err.message;
        } finally {
            global.console = REAL;
        }
        if (probleme) {
            echecs += 1;
            console.error('FAIL  ' + nom + '\n      ' + probleme);
        } else {
            console.log('ok    ' + nom);
        }
    }
    if (echecs) {
        console.error('\n' + echecs + ' cas en échec');
        process.exit(1);
    }
    console.log('\n' + CAS.length + ' cas, tous verts');
})();
