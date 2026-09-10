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
 *   - le champ est construit SANS attendre les aides. C'est du DOM, sans
 *     réseau, et il porte le sélecteur de pays ET le normalisateur d'envoi :
 *     le retenir laisserait une boîte de texte nue au moment précis où le
 *     membre s'en sert, et un envoi pendant cette fenêtre partirait avec un
 *     numéro brut. Un champ caché par CSS reste envoyable, donc il compte ;
 *   - un champ JAMAIS montré ne charge PAS les aides. Elles pèsent huit fois
 *     la bibliothèque et arrivent en bout de chaîne : les chercher pour une
 *     interface que le visiteur ne verra pas, c'est acheter la panne sans
 *     acheter la fonction. Sur l'accueil, le bandeau téléphone ne s'ouvre que
 *     pour les membres sans numéro, et c'est un script chargé APRÈS celui-ci
 *     qui l'ouvre ;
 *   - les aides arrivées après coup reprennent la main : `getNumber` les relit
 *     sur le global au moment de l'appel. Sans ça, différer casserait l'envoi ;
 *   - aides absentes, en échec ou EN SUSPENS : le champ reste utilisable. Un
 *     filtrage réseau peut tenir la requête ouverte sans jamais répondre ni
 *     échouer, et le délai est le seul témoin de ce cas-là ;
 *   - sans observateur, ou sur un navigateur dont l'entrée n'a pas
 *     `isIntersecting`, tout se charge comme avant plutôt que jamais ;
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
 *   observer  : 'visible' (défaut) | 'cache' | 'absent'  ce que voit
 *               l'IntersectionObserver, ou son absence pure et simple
 */
function env(source, opts) {
    const trace = {
        initOptions: null,
        utilsAuMomentDuInit: null,
        initCount: 0,
        scripts: [],
        avertissements: [],
        signalements: [],
        observers: [],
        observerOptions: null,
        debranchements: 0,
    };

    /**
     * Le formulaire est réel ici, sans quoi l'écouteur `submit` n'est jamais
     * posé et la garantie qui compte le plus - un numéro normalisé à l'envoi -
     * ne serait vérifiée par rien.
     */
    function faireInput() {
        const form = { listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
        return {
            value: '',
            form,
            attrs: { 'ms-code-phone-number': 'fr,be' },
            listeners: {},
            getAttribute(n) { return this.attrs[n]; },
            addEventListener(t, fn) { this.listeners[t] = fn; },
            closest() { return form; },
        };
    }

    const combien = opts.inputs === 0 ? 0 : (opts.inputs || 1);
    const inputs = [];
    for (let n = 0; n < combien; n++) inputs.push(faireInput());
    const input = inputs[0];
    inputs.forEach = Array.prototype.forEach.bind(inputs);

    const win = {
        intlTelInputUtils: opts.utilsLoad === 'deja' ? { numberFormat: { INTERNATIONAL: 1 } } : undefined,
        intlTelInput: null,
        OrdoErrorReporter: {
            reportNetwork(contexte, err) { trace.signalements.push(contexte + ': ' + err.message); },
        },
    };

    /**
     * Observateur factice. Il rend son verdict de façon ASYNCHRONE, comme le
     * vrai : un observateur synchrone masquerait toute erreur d'ordre entre la
     * mise en observation et le déclenchement.
     */
    function fauxObserver(cb, options) {
        trace.observerOptions = options;
        const self = {
            cibles: [],
            debranche: false,
            /**
             * 🔴 Le vrai observateur rend TOUJOURS un premier verdict, y compris
             * « pas visible » pour un élément dans un bloc `display:none`. Ne
             * livrer que les verdicts positifs rendrait le harnais aveugle au
             * pire des défauts possibles ici : un code qui ne lit pas
             * `isIntersecting` et se déclenche donc sur ce premier appel, ce
             * qui annulerait tout le différé sans casser un seul cas.
             */
            observe(el) {
                self.cibles.push(el);
                const visible = opts.observer !== 'cache';
                queueMicrotask(() => {
                    if (self.debranche) return;
                    self.livrer(visible);
                });
            },
            disconnect() {
                self.debranche = true;
                trace.debranchements += 1;
            },
            /** Le champ apparaît (ouverture du bandeau, défilement). */
            montrer() {
                if (self.debranche) return;
                self.livrer(true);
            },
            /**
             * Un lot déjà mis en file AVANT le `disconnect()`, livré après lui.
             * La spécification l'autorise (c'est la raison d'être de
             * `takeRecords`), donc `disconnect()` seul ne garantit pas qu'on ne
             * sera rappelé qu'une fois : sans garde côté appelant, le champ
             * serait reconstruit et les aides rechargées.
             */
            montrerEnRetard() {
                self.livrer(true);
            },
            /**
             * `isIntersecting` est arrivé dans l'entrée APRÈS l'observateur
             * lui-même : un navigateur peut exposer le constructeur - donc
             * échapper au repli - et laisser la propriété indéfinie. Ce mode
             * rejoue ce navigateur-là, où seul le ratio dit la vérité.
             */
            livrer(isIntersecting) {
                const sansDrapeau = opts.observer === 'ratio-seul';
                cb(self.cibles.map((el) => ({
                    target: el,
                    isIntersecting: sansDrapeau ? undefined : isIntersecting,
                    intersectionRatio: isIntersecting ? 1 : 0,
                })), self);
            },
        };
        trace.observers.push(self);
        return self;
    }

    if (opts.observer !== 'absent') win.IntersectionObserver = fauxObserver;

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

    // 🔴 Publié AVANT l'évaluation, et pas après. Si le fichier ne s'analyse
    // pas, `eval` lève ici : sans cette poignée, le lanceur n'a rien à
    // restaurer, la console factice reste en place pour tout le reste de la
    // suite, et 36 cas échouent SANS AFFICHER UNE LIGNE — un code de sortie 1
    // muet, qu'on prend pour n'importe quoi d'autre.
    courant = { trace, input, win, horloge: h, restaure() { Object.assign(global, sauvegarde); } };

    // La console factice et l'horloge restent en place le temps du cas : le
    // chargement des aides se résout APRÈS le retour de cette fonction. Le
    // lanceur remet les vrais globaux ensuite, sans quoi un `setTimeout`
    // synthétique survivrait au fichier et contaminerait la suite.
    eval(fs.readFileSync(path.join(ROOT, source), 'utf8'));

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

    ['le champ est construit SANS attendre les aides', async (src) => {
        const e = env(src, { utilsLoad: 'stall', observer: 'cache' });
        await repos();
        if (e.trace.initCount !== 1) {
            return 'champ non construit : une boîte de texte nue au moment où le membre s en sert';
        }
        if (typeof e.input.listeners.keyup !== 'function') return 'écouteur de frappe non posé';
        if (typeof e.input.form.listeners.submit !== 'function') {
            return 'écouteur d envoi non posé : un envoi partirait avec un numéro non normalisé';
        }
        return '';
    }],

    ['ce sont bien les aides qui sont chargées, avec crossOrigin', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.scripts.length !== 1) return 'les aides n ont pas été chargées';
        if (!/utils\.js$/.test(e.trace.scripts[0].src)) return 'ce n est pas utils.js qui a été chargé';
        return '';
    }],

    ['aides arrivées APRÈS la construction : l envoi est normalisé', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.utilsAuMomentDuInit !== false) {
            return 'ce cas ne prouve rien si les aides étaient déjà là à la construction';
        }
        e.input.value = '0612345678';
        e.input.form.listeners.submit();
        if (e.input.value !== '+33 6 12 34 56 78') {
            return 'getNumber ne relit pas les aides au moment de l appel : le différé casserait l envoi';
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

    ['deux champs : les deux sont observés et les deux sont construits', async (src) => {
        const e = env(src, { utilsLoad: 'ok', inputs: 2 });
        await repos();
        if (e.trace.initCount !== 2) return 'un seul des deux champs a été construit';
        if (e.trace.observers[0].cibles.length !== 2) {
            return 'un seul champ observé : le second n ouvrirait jamais le chargement des aides';
        }
        if (e.trace.scripts.length !== 1) return 'les aides ont été chargées deux fois';
        return '';
    }],

    ['navigateur sans isIntersecting : le ratio suffit', async (src) => {
        const e = env(src, { utilsLoad: 'ok', observer: 'ratio-seul' });
        await repos();
        if (e.trace.scripts.length !== 1) {
            return 'aides jamais chargées : le champ resterait sans formatage, en silence';
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
        if (e.trace.initCount !== 1) return 'le champ doit être construit sans attendre les aides';
        // Encadré des DEUX côtés. Le délai ne retient plus la construction : il
        // ne sert QUE de témoin, et c'est justement pour ça qu'il est fragile.
        // Trop court, il signale un simple réseau lent comme une panne ; trop
        // long, il ne signale plus rien d'utile. Ne vérifier que « ça finit par
        // sortir » laisserait passer un délai ramené à zéro.
        e.horloge.avancer(7999);
        await repos();
        if (e.trace.signalements.length !== 0) return 'stagnation signalée avant le délai annoncé';
        e.horloge.avancer(1);
        await repos();
        if (!e.trace.signalements.some((m) => /timed out/.test(m))) return 'le délai dépassé n est pas signalé';
        return '';
    }],

    ['requête en suspens : le délai est borné, pas simplement long', async (src) => {
        const e = env(src, { utilsLoad: 'stall' });
        await repos();
        e.horloge.avancer(30000);
        await repos();
        if (e.trace.signalements.length !== 1) return 'la stagnation est signalée plus d une fois';
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

    ['champ JAMAIS montré : aucune aide chargée, mais le champ EST prêt', async (src) => {
        const e = env(src, { utilsLoad: 'ok', observer: 'cache' });
        await repos();
        if (e.trace.scripts.length !== 0) {
            return '247 Ko chargés pour un champ que le visiteur ne voit pas';
        }
        if (e.trace.signalements.length !== 0) {
            return 'un champ jamais montré ne peut pas être dégradé : il n y a rien à signaler';
        }
        // Un champ caché par CSS reste dans le formulaire et part à l'envoi.
        // Ne pas le construire enverrait sa valeur brute.
        if (e.trace.initCount !== 1) return 'le champ n est pas construit alors qu il reste envoyable';
        return '';
    }],

    ['c est bien le CHAMP qui est observé, pas un ancêtre', async (src) => {
        const e = env(src, { utilsLoad: 'ok', observer: 'cache' });
        await repos();
        if (e.trace.observers.length !== 1) return 'aucun observateur posé';
        if (e.trace.observers[0].cibles[0] !== e.input) {
            return 'observer autre chose que le champ ne dit pas si le champ est visible';
        }
        return '';
    }],

    ['champ montré ensuite : les aides partent à ce moment-là', async (src) => {
        const e = env(src, { utilsLoad: 'ok', observer: 'cache' });
        await repos();
        e.trace.observers[0].montrer();
        await repos();
        if (e.trace.scripts.length !== 1) return 'les aides n ont pas été chargées à l ouverture';
        e.input.value = '0612345678';
        e.input.listeners.keyup();
        if (e.input.value !== '+33 6 12 34 56 78') {
            return 'le formatage ne reprend pas une fois les aides arrivées';
        }
        return '';
    }],

    ['l observateur est débranché dès le premier verdict positif', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.debranchements !== 1) return 'observateur laissé branché pour la vie de la page';
        return '';
    }],

    ['lot livré APRÈS le débranchement : ni second appel, ni seconde alerte', async (src) => {
        // 🔴 Sur le chemin nominal cette garde est INVISIBLE : `loadUtils`
        // court-circuite dès que les aides sont là, donc un second passage ne
        // recharge rien de toute façon. C'est en ÉCHEC qu'elle porte, puisque
        // rien ne court-circuite plus : sans elle, un lot en retard relance la
        // requête et poste une seconde alerte pour un seul incident.
        const e = env(src, { utilsLoad: 'fail' });
        await repos();
        // La spécification autorise la livraison d un lot déjà en file au
        // moment du `disconnect()` : c'est la raison d être de `takeRecords`.
        e.trace.observers[0].montrerEnRetard();
        await repos();
        if (e.trace.scripts.length !== 1) return 'requête relancée par un lot en retard';
        if (e.trace.signalements.length !== 1) {
            return 'une seconde alerte est partie pour un seul incident';
        }
        return '';
    }],

    ['la marge de déclenchement est conservée', async (src) => {
        const e = env(src, { utilsLoad: 'ok', observer: 'cache' });
        await repos();
        if (!e.trace.observerOptions || e.trace.observerOptions.rootMargin !== '200px') {
            return 'sans marge, un champ sous la ligne de flottaison charge ses aides trop tard';
        }
        return '';
    }],

    ['sans IntersectionObserver : comportement d avant', async (src) => {
        const e = env(src, { utilsLoad: 'ok', observer: 'absent' });
        await repos();
        if (e.trace.scripts.length !== 1) return 'le repli ne charge pas les aides';
        if (e.trace.initCount !== 1) return 'le repli ne construit pas le champ';
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
