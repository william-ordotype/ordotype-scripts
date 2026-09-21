#!/usr/bin/env node
/**
 * La page de tarifs part à `opacity: 0` et c'est le service de redirection
 * géographique qui la révèle, soit en répondant, soit en échouant. Une requête
 * qui ne fait NI l'un NI l'autre - ce qu'un filtrage réseau produit très bien,
 * en tenant la connexion ouverte sans jamais répondre - laissait donc la page
 * invisible pour toujours, sans erreur et sans signalement.
 *
 * Ce qui doit tenir :
 *   - service qui répond : révélée tout de suite, comme avant ;
 *   - service qui répond en demandant une redirection : la page reste cachée
 *     le temps prévu, le filet ne la révèle pas plus tôt et ne signale rien ;
 *   - script en erreur : révélée tout de suite, rien à signaler ;
 *   - service MUET : révélée au bout du délai, et signalée, sinon personne ne
 *     saurait jamais que des visiteurs regardent une page blanche ;
 *   - une réponse arrivée après le filet ne révèle pas deux fois ;
 *   - aucune minuterie ne survit : le délai est borné, pas simplement long.
 *
 * Un appareil réglé sur un fuseau français (métropole ou outre-mer) n'est pas
 * censé être redirigé : la page n'est jamais cachée, donc il n'y a ni attente,
 * ni délai de secours, ni signalement. Le service est quand même appelé, pour
 * qu'il puisse encore rediriger l'exception. Un fuseau illisible garde le
 * comportement prudent : page cachée jusqu'à la réponse.
 *
 * La liste des fuseaux est lue dans chaque fichier : toutes les copies doivent
 * porter la même, chaque nom doit être un fuseau que le moteur Intl reconnaît
 * sous ce nom exact, et les cas « fuseau français » sont rejoués sur chacun.
 *
 * Le fuseau est imposé par le test : sans cela, le résultat dépendrait de
 * l'heure de la machine qui le lance.
 *
 * Les cas sont rejoués sur chaque copie du fichier.
 *
 * Usage : node test/geo-redirect-reveal.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
    'pricing/geo-redirect.js',
    'pricing-v2/geo-redirect.js',
    'fin-internat/geo-redirect.js',
    'fin-internat-v2/geo-redirect.js',
    'signup-rempla/geo-redirect.js',
    'signup-rempla-v2/geo-redirect.js',
    'syndicats-dinternes/geo-redirect.js',
];
const DELAI = 5000;
const FUSEAU_ETRANGER = 'Africa/Casablanca';
const ILLISIBLE = { illisible: true };
const SANS_INTL = { sansIntl: true };
const IntlReel = Intl;

/** La liste FRENCH_TIME_ZONES telle qu'écrite dans le fichier, null si absente. */
function fuseauxDe(source) {
    const texte = fs.readFileSync(path.join(ROOT, source), 'utf8');
    const bloc = /FRENCH_TIME_ZONES = \[([^\]]*)\]/.exec(texte);
    if (!bloc) return null;
    return bloc[1].split(',').map((z) => z.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

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

function intlSimule(fuseau) {
    if (fuseau === SANS_INTL) return undefined;
    return {
        DateTimeFormat() {
            if (fuseau === ILLISIBLE) throw new RangeError('Intl indisponible');
            return { resolvedOptions: () => ({ timeZone: fuseau }) };
        },
    };
}

function env(source, fuseau) {
    const trace = { signalements: [] };
    const style = { id: null, innerHTML: null };
    let balise = null;
    const inseres = [];

    const tete = {
        insertAdjacentHTML(_ou, html) {
            style.id = /id="([^"]+)"/.exec(html)[1];
            style.innerHTML = /<style[^>]*>([^<]*)</.exec(html)[1];
        },
        parentNode: { insertBefore(el) { inseres.push(el); } },
    };

    const doc = {
        referrer: '',
        getElementsByTagName() { return [tete]; },
        getElementById(id) { return id === style.id ? style : null; },
        createElement() { balise = {}; return balise; },
    };

    const win = {
        location: 'https://www.ordotype.fr/nos-offres',
        OrdoErrorReporter: {
            reportNetwork(contexte, err) { trace.signalements.push(contexte + ': ' + err.message); },
        },
    };

    const h = horloge();
    const sauvegarde = {
        window: global.window, document: global.document,
        setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, console: global.console,
        Intl: global.Intl,
    };
    global.window = win;
    global.document = doc;
    global.setTimeout = (fn, d) => h.set(fn, d);
    global.clearTimeout = (id) => h.clear(id);
    global.console = { log() {}, warn() {}, error() {} };
    global.Intl = intlSimule(fuseau === undefined ? FUSEAU_ETRANGER : fuseau);

    const restaure = () => Object.assign(global, sauvegarde);
    try {
        eval(fs.readFileSync(path.join(ROOT, source), 'utf8'));
    } catch (e) {
        restaure();
        throw e;
    }

    const rappel = Object.keys(win).find((k) => /^georedirect\d+loaded$/.test(k));
    return {
        trace, style, horloge: h, restaure,
        visible: () => style.id === null || /opacity:1\.0/.test(style.innerHTML),
        cachee: () => style.id !== null,
        serviceAppele: () => inseres.some((el) => el === balise && /\/gr\?id=/.test(el.src)),
        repondre: (redirect) => win[rappel](redirect),
        echouer: () => balise.onerror(),
    };
}

const CAS = [
    ['cachée dès le chargement, délai de secours armé, service appelé', (e) => {
        if (!e.cachee()) return 'page montrée alors qu une redirection peut suivre';
        if (e.visible()) return 'page visible avant la réponse du service';
        if (e.horloge.enAttente() !== 1) return 'le délai de secours n est pas armé';
        if (!e.serviceAppele()) return 'le service n est pas inséré dans la page';
        return '';
    }],

    ['service qui répond : révélée tout de suite', (e) => {
        e.repondre(false);
        e.horloge.avancer(1);
        if (!e.visible()) return 'la page reste cachée alors que le service a répondu';
        if (e.trace.signalements.length !== 0) return 'une réponse normale ne vaut pas un signalement';
        if (e.horloge.enAttente() !== 0) return 'le filet n a pas été désarmé';
        return '';
    }],

    ['redirection demandée : cachée le temps prévu, révélée ensuite, sans signalement', (e) => {
        e.repondre(true);
        e.horloge.avancer(DELAI - 1);
        if (e.visible()) return 'révélée trop tôt : le visiteur voit la mauvaise page avant de partir';
        e.horloge.avancer(2);
        if (!e.visible()) return 'jamais révélée alors que la redirection n a pas eu lieu';
        if (e.trace.signalements.length !== 0) return 'le filet a signalé alors que le service a répondu';
        return '';
    }],

    ['script en erreur : révélée tout de suite, rien à signaler', (e) => {
        e.echouer();
        if (!e.visible()) return 'la page reste cachée alors que le service est injoignable';
        if (e.trace.signalements.length !== 0) return 'un échec franc est déjà visible ailleurs';
        if (e.horloge.enAttente() !== 0) return 'le filet n a pas été désarmé';
        return '';
    }],

    ['service MUET : révélée au bout du délai, et signalée', (e) => {
        e.horloge.avancer(DELAI - 1);
        if (e.visible()) return 'révélée avant le délai';
        if (e.trace.signalements.length !== 0) return 'signalé avant le délai';
        e.horloge.avancer(2);
        if (!e.visible()) return 'PAGE INVISIBLE POUR TOUJOURS : c est le bug que ce test existe pour attraper';
        if (e.trace.signalements.length !== 1) return 'personne n apprend que des visiteurs voient une page blanche';
        if (!/silent after 5000 ms/.test(e.trace.signalements[0])) {
            return 'le message ne dit pas ce qui s est passé : ' + e.trace.signalements[0];
        }
        if (e.horloge.enAttente() !== 0) return 'une minuterie survit au filet';
        return '';
    }],

    ['réponse arrivée après le filet : ne révèle pas deux fois', (e) => {
        e.horloge.avancer(DELAI + 1);
        const avant = e.trace.signalements.length;
        e.repondre(false);
        e.horloge.avancer(10);
        if (!e.visible()) return 'la page a été recachée';
        if (e.trace.signalements.length !== avant) return 'signalé une seconde fois';
        return '';
    }],

    ['aucun signalement possible sans le canal du dépôt : rien ne casse', (e) => {
        delete global.window.OrdoErrorReporter;
        e.horloge.avancer(DELAI + 1);
        if (!e.visible()) return 'le filet a échoué faute de canal de signalement';
        return '';
    }],
];

// Appareil réglé sur un fuseau français : aucun de ces cas ne doit cacher la
// page, ni armer le délai de secours, ni signaler quoi que ce soit.
const CAS_FRANCE = [
    ['jamais cachée, service appelé quand même, aucune minuterie', (e) => {
        if (e.cachee()) return 'la page est cachée alors que la redirection ne concerne pas ce visiteur';
        if (!e.serviceAppele()) return 'le service n est plus appelé : plus aucune redirection possible';
        if (e.horloge.enAttente() !== 0) return 'un délai de secours est armé pour une page déjà visible';
        return '';
    }],

    ['service MUET : rien à signaler, la page n a jamais attendu', (e) => {
        e.horloge.avancer(DELAI * 2);
        if (e.cachee()) return 'page cachée';
        if (e.trace.signalements.length !== 0) return 'signalement pour une page qui n a jamais été cachée';
        return '';
    }],

    ['réponse, redirection ou échec du service : rien ne casse', (e) => {
        e.repondre(true);
        e.horloge.avancer(DELAI + 1);
        e.repondre(false);
        e.horloge.avancer(1);
        e.echouer();
        if (e.cachee()) return 'page cachée';
        if (e.trace.signalements.length !== 0) return 'signalement inattendu';
        if (e.horloge.enAttente() !== 0) return 'une minuterie survit';
        return '';
    }],
];

// Fuseau illisible : on ne sait pas, donc on garde la prudence d'avant.
const CAS_ILLISIBLE = [
    ['cachée et délai de secours armé, comme avant', (e) => {
        if (!e.cachee()) return 'page montrée sans savoir si une redirection va suivre';
        if (e.visible()) return 'page visible avant la réponse du service';
        if (e.horloge.enAttente() !== 1) return 'le délai de secours n est pas armé';
        e.horloge.avancer(DELAI + 1);
        if (!e.visible()) return 'jamais révélée';
        return '';
    }],
];

function scenarios(source) {
    return [[FUSEAU_ETRANGER, CAS]]
        .concat((fuseauxDe(source) || []).map((z) => [z, CAS_FRANCE]))
        .concat([[ILLISIBLE, CAS_ILLISIBLE], [SANS_INTL, CAS_ILLISIBLE], ['', CAS_ILLISIBLE]]);
}

/** Même liste partout, métropole incluse, et des noms que Intl rend tels quels. */
function controlerListes() {
    const soucis = [];
    const reference = fuseauxDe(SOURCES[0]) || [];
    if (reference.indexOf('Europe/Paris') === -1) soucis.push(`${SOURCES[0]} : Europe/Paris absent`);
    if (reference.indexOf(FUSEAU_ETRANGER) !== -1) soucis.push(`${SOURCES[0]} : le fuseau étranger du test est dans la liste`);
    for (const src of SOURCES.slice(1)) {
        const liste = fuseauxDe(src);
        if (liste === null) {
            soucis.push(`${src} : liste FRENCH_TIME_ZONES introuvable`);
        } else if (liste.join('|') !== reference.join('|')) {
            soucis.push(`${src} : liste différente de ${SOURCES[0]}\n        ${liste.join(', ')}`);
        }
    }
    for (const z of reference) {
        let rendu = null;
        try {
            rendu = new IntlReel.DateTimeFormat('en', { timeZone: z }).resolvedOptions().timeZone;
        } catch (err) {
            rendu = 'inconnu (' + err.message + ')';
        }
        if (rendu !== z) soucis.push(`fuseau ${z} : Intl rend ${rendu}`);
    }
    return soucis;
}

function libelle(fuseau) {
    if (fuseau === ILLISIBLE) return 'Intl en erreur';
    if (fuseau === SANS_INTL) return 'sans Intl';
    return fuseau === '' ? 'fuseau vide' : fuseau;
}

let echecs = 0;
let total = 1;
const soucisListes = controlerListes();
if (soucisListes.length) {
    echecs += 1;
    console.log('FAIL  listes de fuseaux\n      ' + soucisListes.join('\n      '));
} else {
    console.log(`ok    listes de fuseaux identiques dans les ${SOURCES.length} fichiers, noms reconnus par Intl`);
}
for (const src of SOURCES) {
    for (const [fuseau, liste] of scenarios(src)) for (const [nom, cas] of liste) {
        total += 1;
        let e = null;
        const titre = `${src} [${libelle(fuseau)}] — ${nom}`;
        try {
            e = env(src, fuseau);
            const souci = cas(e);
            e.restaure();
            if (souci) { echecs += 1; console.log(`FAIL  ${titre}\n      ${souci}`); }
            else console.log(`ok    ${titre}`);
        } catch (err) {
            if (e) e.restaure();
            echecs += 1;
            console.log(`FAIL  ${titre}\n      exception : ${err.message}`);
        }
    }
}
console.log(echecs ? `\n${echecs} cas en échec sur ${total}.` : `\n${total} cas sur ${SOURCES.length} fichiers, tous verts`);
process.exit(echecs ? 1 : 0);
