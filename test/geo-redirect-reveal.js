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
 * redirigé : la page n'est jamais cachée et le service n'est PAS appelé. Geo
 * Targetly compte une vue à chaque appel, redirigé ou non ; l'appeler pour
 * 95 % de visiteurs qui restent sur place consommait le quota pour rien.
 * Un membre connecté dont les abonnements vivants sont tous en euros n'est pas
 * redirigé non plus, quel que soit son fuseau : la devise de l'abonnement prime
 * sur le pays (Stripe refuserait une autre devise). Un abonné hors euro garde
 * l'appel, et la garde du paiement le renvoie vers la page de sa devise.
 * /nos-offres-belgique garde l'appel pour tout le monde : elle partage
 * l'identifiant de /nos-offres et ses règles peuvent viser la France.
 * Un fuseau illisible, vide ou UTC garde le comportement prudent : page cachée
 * jusqu'à la réponse. Une donnée de membre illisible aussi : service appelé.
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

function env(source, fuseau, options) {
    const opts = options || {};
    const trace = { signalements: [], journal: [] };
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

    const chemin = opts.chemin || '/nos-offres';
    const adresse = 'https://www.ordotype.fr' + chemin;
    const win = {
        location: { href: adresse, pathname: chemin, toString() { return adresse; } },
        localStorage: {
            getItem(cle) {
                if (opts.stockageCasse) throw new Error('SecurityError');
                return cle === '_ms-mem' && opts.membre !== undefined ? opts.membre : null;
            },
        },
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
    global.console = { log(m) { trace.journal.push(String(m)); }, warn() {}, error() {} };
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
        baliseCreee: () => balise !== null,
        adresseEnvoyee: () => (balise && balise.src) || '',
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

// Fuseau français ou abonné en euros : aucun appel, donc aucune vue consommée,
// page jamais cachée, aucune minuterie, rien à signaler.
function casSansAppel(raison) {
    return [
        ['aucun appel au service, jamais cachée, aucune minuterie', (e) => {
            if (e.baliseCreee() || e.serviceAppele()) return 'le service est appelé : une vue consommée pour rien';
            if (e.cachee()) return 'la page est cachée alors qu aucune réponse ne viendra la révéler';
            if (!e.visible()) return 'page invisible';
            if (e.horloge.enAttente() !== 0) return 'une minuterie est armée pour une page déjà visible';
            if (!e.trace.journal.some((l) => l.indexOf('No geo call: ' + raison) !== -1)) {
                return 'la raison « ' + raison + ' » n est pas tracée : ' + e.trace.journal.join(' | ');
            }
            return '';
        }],
        ['longtemps après : toujours visible, rien à signaler', (e) => {
            e.horloge.avancer(DELAI * 2);
            if (e.cachee()) return 'page cachée';
            if (e.trace.signalements.length !== 0) return 'signalement pour une page qui n a jamais été cachée';
            return '';
        }],
    ];
}
const CAS_FRANCE = casSansAppel('French time zone');
const CAS_ABONNE_EURO = casSansAppel('euro subscriber');

// /nos-offres-belgique en fuseau français : l'appel est gardé, mais la page
// n'est pas cachée (comportement d'avant pour ce fuseau).
const CAS_FRANCE_AVEC_APPEL = [
    ['jamais cachée, service appelé, aucune minuterie', (e) => {
        if (e.cachee()) return 'la page est cachée alors que la redirection ne concerne pas ce visiteur';
        if (!e.serviceAppele()) return 'le service n est pas appelé sur une page qui doit le garder';
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

function membre(...connexions) {
    return JSON.stringify({ id: 'mem_test', planConnections: connexions });
}
function abo(devise, statut, actif) {
    return { status: statut || 'ACTIVE', active: actif === undefined ? true : actif, payment: { currency: devise } };
}
const GRATUIT = { status: 'ACTIVE', active: true, payment: null };
const BELGE = '/nos-offres-belgique';

// Le service doit être appelé quand l'adresse envoyée est celle de la page.
const CAS_ADRESSE = [
    ['adresse de la page transmise au service', (e) => {
        const attendu = encodeURIComponent('https://www.ordotype.fr/nos-offres');
        if (e.adresseEnvoyee().indexOf('&winurl=' + attendu) === -1) return 'winurl faux : ' + e.adresseEnvoyee();
        return '';
    }],
];

function scenarios(source) {
    return [[FUSEAU_ETRANGER, CAS], [FUSEAU_ETRANGER, CAS_ADRESSE], ['UTC', CAS]]
        .concat((fuseauxDe(source) || []).map((z) => [z, CAS_FRANCE]))
        .concat([[ILLISIBLE, CAS_ILLISIBLE], [SANS_INTL, CAS_ILLISIBLE], ['', CAS_ILLISIBLE]])
        .concat([
            [FUSEAU_ETRANGER, CAS_ABONNE_EURO, { membre: membre(abo('eur')) }, 'abonné euros'],
            [FUSEAU_ETRANGER, CAS_ABONNE_EURO, { membre: membre(abo('EUR', 'TRIALING')) }, 'essai en euros'],
            [FUSEAU_ETRANGER, CAS_ABONNE_EURO, { membre: membre(abo('eur', 'PAST_DUE', false)) }, 'impayé en euros'],
            [FUSEAU_ETRANGER, CAS_ABONNE_EURO, { membre: membre(GRATUIT, abo('eur')) }, 'gratuit + euros'],
            [FUSEAU_ETRANGER, CAS, { membre: membre(abo('mad')) }, 'abonné dirhams'],
            [FUSEAU_ETRANGER, CAS, { membre: membre(abo('eur'), abo('mad')) }, 'euros + dirhams'],
            [FUSEAU_ETRANGER, CAS, { membre: membre(abo('eur', 'CANCELED', false)) }, 'euros résilié'],
            [FUSEAU_ETRANGER, CAS, { membre: membre(GRATUIT) }, 'gratuit seul'],
            [FUSEAU_ETRANGER, CAS, { membre: JSON.stringify({ id: 'mem_test' }) }, 'sans plans'],
            [FUSEAU_ETRANGER, CAS, { membre: '{' }, 'membre illisible'],
            [FUSEAU_ETRANGER, CAS, { stockageCasse: true }, 'stockage refusé'],
            ['Europe/Paris', CAS_FRANCE, { membre: membre(abo('mad')) }, 'abonné dirhams'],
            ['Europe/Paris', CAS_FRANCE_AVEC_APPEL, { chemin: BELGE }, 'page belge'],
            ['Europe/Paris', CAS_FRANCE_AVEC_APPEL, { chemin: BELGE + '/' }, 'page belge, barre finale'],
            [FUSEAU_ETRANGER, CAS, { chemin: BELGE, membre: membre(abo('eur')) }, 'page belge, abonné euros'],
            ['Europe/Brussels', CAS, { chemin: BELGE }, 'page belge'],
        ]);
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
    const decision = (src) => {
        const texte = fs.readFileSync(path.join(ROOT, src), 'utf8');
        const bloc = /var ALWAYS_ASK_PATHS[\s\S]*?var hidden = [^\n]*\n/.exec(texte);
        return bloc ? bloc[0].replace(/^[ \t]+/gm, '') : null;
    };
    const decisionReference = decision(SOURCES[0]);
    if (decisionReference === null) soucis.push(`${SOURCES[0]} : bloc de décision introuvable`);
    for (const src of SOURCES.slice(1)) {
        if (decision(src) !== decisionReference) soucis.push(`${src} : bloc de décision différent de ${SOURCES[0]}`);
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
    for (const [fuseau, liste, options, etiquette] of scenarios(src)) for (const [nom, cas] of liste) {
        total += 1;
        let e = null;
        const titre = `${src} [${libelle(fuseau)}${etiquette ? ', ' + etiquette : ''}] : ${nom}`;
        try {
            e = env(src, fuseau, options);
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
