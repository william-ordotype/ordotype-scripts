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
 * Les cas sont rejoués sur les 4 copies du fichier.
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
];
const DELAI = 5000;

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

function env(source) {
    const trace = { signalements: [] };
    const style = { id: null, innerHTML: null };
    let balise = null;

    const tete = {
        insertAdjacentHTML(_ou, html) {
            style.id = /id="([^"]+)"/.exec(html)[1];
            style.innerHTML = /<style[^>]*>([^<]*)</.exec(html)[1];
        },
        parentNode: { insertBefore() {} },
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
    };
    global.window = win;
    global.document = doc;
    global.setTimeout = (fn, d) => h.set(fn, d);
    global.clearTimeout = (id) => h.clear(id);
    global.console = { log() {}, warn() {}, error() {} };

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
        visible: () => /opacity:1\.0/.test(style.innerHTML),
        repondre: (redirect) => win[rappel](redirect),
        echouer: () => balise.onerror(),
    };
}

const CAS = [
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

let echecs = 0;
for (const src of SOURCES) {
    for (const [nom, cas] of CAS) {
        let e = null;
        try {
            e = env(src);
            const souci = cas(e);
            e.restaure();
            if (souci) { echecs += 1; console.log(`FAIL  ${src} — ${nom}\n      ${souci}`); }
            else console.log(`ok    ${src} — ${nom}`);
        } catch (err) {
            if (e) e.restaure();
            echecs += 1;
            console.log(`FAIL  ${src} — ${nom}\n      exception : ${err.message}`);
        }
    }
}
console.log(echecs ? `\n${echecs} cas en échec.` : `\n${SOURCES.length * CAS.length} cas (${CAS.length} × ${SOURCES.length}), tous verts`);
process.exit(echecs ? 1 : 0);
