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
 *   - un champ JAMAIS montré ne charge RIEN de tiers : ni la bibliothèque, ni
 *     sa feuille de style, ni les aides. Sur l'accueil, le bandeau téléphone
 *     ne s'ouvre que pour les membres sans numéro, et c'est un script chargé
 *     APRÈS celui-ci qui l'ouvre : tous les autres visiteurs payaient 48 Ko
 *     et le risque de panne pour une interface qu'ils ne verront pas ;
 *   - la feuille de style ne retient jamais le champ et ne vaut pas de
 *     signalement : sans elle il reste un champ utilisable, sans drapeaux ;
 *   - bibliothèque en échec, en suspens, ou servie sans se définir : borné,
 *     signalé, et rien n'est construit plutôt qu'une page qui attend ;
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
 *   - bibliothèque déjà présente : elle n'est pas redemandée.
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
 *   libLoad   : 'ok' | 'fail' | 'stall' | 'late' | 'muette'  sort du
 *               chargement de la bibliothèque ('muette' = le fichier répond
 *               sans rien définir, 'late' = il arrive après le délai)
 *   cssLoad   : 'ok' | 'fail' | 'stall'  sort de la feuille de style
 *   library   : false = elle n'arrive jamais ; 'deja' = déjà sur la page
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
        biblio: [],
        feuille: [],
        ordre: [],
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

    function faireBibliotheque() {
        return (el, options) => {
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

    /**
     * Sort du chargement de la bibliothèque : 'ok' (défaut), 'fail', 'stall',
     * ou 'muette' pour le fichier qui répond mais ne définit rien. `library`
     * garde son ancien sens : `false` = elle n'arrive jamais, `'deja'` = elle
     * est déjà là et ne doit donc pas être redemandée.
     */
    const libLoad = opts.library === false ? 'fail' : (opts.libLoad || 'ok');
    if (opts.library === 'deja') win.intlTelInput = faireBibliotheque();

    /**
     * Un gestionnaire manquant est une ABSENCE à nommer, pas une exception :
     * sans ça, le cas qui vérifie qu'un `onerror` est posé échouerait sur
     * « el.onerror is not a function » et la raison serait perdue.
     */
    function appeler(el, quoi) {
        if (typeof el[quoi] === 'function') el[quoi]();
        else trace.avertissements.push('gestionnaire ' + quoi + ' absent sur ' + (el.src || el.href));
    }

    /**
     * `scripts` ne garde que les AIDES (`utils.js`), comme avant : la
     * bibliothèque et sa feuille de style ont leurs propres traces, sinon
     * chaque cas devrait compter des requêtes qui ne l'intéressent pas.
     */
    const conteneur = {
        appendChild(el) {
            const url = el.src || el.href || '';

            if (/intlTelInput\.min\.css$/.test(url)) {
                trace.feuille.push({ href: el.href, rel: el.rel });
                trace.ordre.push('feuille');
                if (opts.cssLoad === 'stall') return;
                queueMicrotask(() => {
                    if (opts.cssLoad === 'fail') appeler(el, 'onerror');
                    else appeler(el, 'onload');
                });
                return;
            }

            if (/intlTelInput\.min\.js$/.test(url)) {
                trace.biblio.push({ src: el.src, crossOrigin: el.crossOrigin });
                trace.ordre.push('biblio');
                if (libLoad === 'stall') return;
                // 'late' : le fichier arrive APRÈS le délai, comme un réseau
                // très lent. La balise est toujours dans la page.
                if (libLoad === 'late') {
                    global.setTimeout(() => {
                        win.intlTelInput = faireBibliotheque();
                        appeler(el, 'onload');
                    }, 20000);
                    return;
                }
                queueMicrotask(() => {
                    if (libLoad === 'fail') {
                        appeler(el, 'onerror');
                        return;
                    }
                    if (libLoad !== 'muette') win.intlTelInput = faireBibliotheque();
                    appeler(el, 'onload');
                });
                return;
            }

            trace.scripts.push({ src: el.src, crossOrigin: el.crossOrigin });
            trace.ordre.push('aides');
            if (opts.utilsLoad === 'stall') return; // ni load ni error, jamais
            queueMicrotask(() => {
                if (opts.utilsLoad === 'fail') {
                    appeler(el, 'onerror');
                } else {
                    win.intlTelInputUtils = { numberFormat: { INTERNATIONAL: 1 } };
                    appeler(el, 'onload');
                }
            });
        },
    };

    const doc = {
        readyState: 'complete',
        body: conteneur,
        head: conteneur,
        addEventListener() {},
        createElement(tag) { return { tagName: (tag || '').toUpperCase() }; },
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
        const e = env(src, { utilsLoad: 'stall' });
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

    ['bibliothèque en échec : rien n est construit, l abandon est signalé', async (src) => {
        const e = env(src, { utilsLoad: 'ok', library: false });
        e.horloge.avancer(60000);
        await repos();
        if (e.trace.initCount !== 0) return 'construit sans bibliothèque';
        if (e.horloge.enAttente() !== 0) return 'une minuterie survit à l echec';
        if (e.trace.scripts.length !== 0) return 'les aides ont été demandées sans bibliothèque';
        if (!e.trace.signalements.some((m) => /intl-tel-input unavailable/.test(m))) {
            return 'l abandon n est pas signalé';
        }
        return '';
    }],

    ['bibliothèque en suspens : le délai est borné et signalé', async (src) => {
        const e = env(src, { utilsLoad: 'ok', libLoad: 'stall' });
        await repos();
        if (e.trace.signalements.length !== 0) return 'signalé avant la fin du délai';
        e.horloge.avancer(15000);
        await repos();
        if (!e.trace.signalements.some((m) => /timed out/.test(m))) {
            return 'une requête tenue ouverte ne remonte jamais';
        }
        if (e.trace.initCount !== 0) return 'construit sans bibliothèque';
        if (e.horloge.enAttente() !== 0) return 'la minuterie n est pas bornée';
        return '';
    }],

    ['bibliothèque qui répond sans se définir : signalée, rien n est construit', async (src) => {
        const e = env(src, { utilsLoad: 'ok', libLoad: 'muette' });
        await repos();
        if (e.trace.initCount !== 0) return 'construit alors que la bibliothèque est absente du global';
        if (!e.trace.signalements.some((m) => /without defining itself/.test(m))) {
            return 'un fichier qui arrive vide passe inaperçu';
        }
        return '';
    }],

    ['bibliothèque déjà présente : aucune nouvelle requête', async (src) => {
        const e = env(src, { utilsLoad: 'ok', library: 'deja' });
        await repos();
        if (e.trace.biblio.length !== 0) return 'bibliothèque redemandée alors qu elle est déjà là';
        if (e.trace.feuille.length !== 1) return 'sans la feuille, le champ est construit sans drapeaux';
        if (e.trace.initCount !== 1) return 'le court-circuit ne construit pas le champ';
        return '';
    }],

    ['feuille de style en échec : le champ est construit, rien n est signalé', async (src) => {
        const e = env(src, { utilsLoad: 'ok', cssLoad: 'fail' });
        await repos();
        if (e.trace.initCount !== 1) return 'la feuille de style a retenu le champ';
        if (e.trace.signalements.length !== 0) return 'un champ sans drapeaux ne vaut pas un signalement';
        if (!e.trace.avertissements.some((m) => /Stylesheet unavailable/.test(m))) {
            return 'même la console ne le dit pas';
        }
        return '';
    }],

    ['feuille de style en suspens : l attente est bornée, le champ finit par être construit', async (src) => {
        const e = env(src, { utilsLoad: 'ok', cssLoad: 'stall' });
        await repos();
        if (e.trace.initCount !== 0) return 'construit avant que la feuille ait pu s appliquer';
        e.horloge.avancer(2000);
        await repos();
        if (e.trace.initCount !== 1) return 'une feuille jamais servie gèle le champ pour toujours';
        if (e.trace.signalements.length !== 0) return 'une feuille absente ne vaut pas un signalement';
        return '';
    }],

    ['la feuille est demandée AVANT la bibliothèque, et le champ l attend', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.feuille.length !== 1) return 'feuille non demandée';
        if (e.trace.initCount !== 1) return 'champ non construit';
        // La bibliothèque mesure le drapeau avec les règles appliquées pour
        // calculer le retrait du champ : construire avant la feuille laisse le
        // numéro sous le drapeau pour toute la vie de la page.
        if (e.trace.ordre.indexOf('feuille') > e.trace.ordre.indexOf('biblio')) {
            return 'la bibliothèque est partie avant la feuille';
        }
        return '';
    }],

    ['bibliothèque en retard : le champ est construit quand elle arrive', async (src) => {
        const e = env(src, { utilsLoad: 'ok', libLoad: 'late' });
        await repos();
        e.horloge.avancer(15000);
        await repos();
        if (!e.trace.signalements.some((m) => /timed out/.test(m))) return 'le retard n est pas signalé';
        if (e.trace.initCount !== 0) return 'construit alors que la bibliothèque n est pas là';
        e.horloge.avancer(10000);
        await repos();
        if (e.trace.initCount !== 1) return 'la bibliothèque arrivée en retard ne construit plus rien';
        if (e.trace.scripts.length !== 1) return 'les aides ne suivent pas la construction tardive';
        return '';
    }],

    ['la balise de la bibliothèque porte crossOrigin', async (src) => {
        const e = env(src, { utilsLoad: 'ok' });
        await repos();
        if (e.trace.biblio.length !== 1) return 'bibliothèque non demandée';
        if (e.trace.biblio[0].crossOrigin !== 'anonymous') {
            return 'sans crossOrigin, une erreur de la bibliothèque remonte nue';
        }
        if (e.trace.feuille.length !== 1) return 'feuille de style non demandée';
        return '';
    }],

    ['champ JAMAIS montré : aucune requête tierce du tout', async (src) => {
        const e = env(src, { utilsLoad: 'ok', observer: 'cache' });
        await repos();
        if (e.trace.biblio.length !== 0 || e.trace.feuille.length !== 0) {
            return '48 Ko demandés pour un champ que le visiteur ne voit pas';
        }
        if (e.trace.scripts.length !== 0) {
            return '247 Ko chargés pour un champ que le visiteur ne voit pas';
        }
        if (e.trace.signalements.length !== 0) {
            return 'un champ jamais montré ne peut pas être dégradé : il n y a rien à signaler';
        }
        // Le champ n'est pas construit non plus : sans les aides, le
        // normalisateur d'envoi ne faisait rien de toute façon, et la
        // construction exigeait la bibliothèque, donc la requête.
        if (e.trace.initCount !== 0) return 'la bibliothèque a été demandée pour construire un champ caché';
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
