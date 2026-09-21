#!/usr/bin/env node
/**
 * Les scripts qui redirigent depuis le head (`ab-test.js`, `belgium-redirect.js`)
 * affectent `location.href` sans arrêter la page : le navigateur continue de
 * l'afficher jusqu'à ce que la suivante arrive. Ils la cachent donc eux-mêmes
 * pendant ce temps, sans compter sur un autre script.
 *
 * Ce qui doit tenir :
 *   - redirection : page cachée AVANT l'affectation de `location.href` ;
 *   - navigation qui n'aboutit pas : page réaffichée au bout du délai ;
 *   - retour arrière depuis le cache (pageshow persisted) : réaffichée tout de
 *     suite ; un pageshow ordinaire ne change rien ;
 *   - pas de redirection : rien n'est caché, aucune minuterie.
 *
 * Usage : node test/redirect-hide.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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

function env(source, { chemin, stockage = {}, hasard = 0.5 }) {
    const proprietes = {};
    const style = {
        setProperty(nom, valeur, priorite) { proprietes[nom] = { valeur, priorite }; },
        removeProperty(nom) { delete proprietes[nom]; },
    };
    const cachee = () => !!proprietes.opacity && proprietes.opacity.valeur === '0'
        && proprietes.opacity.priorite === 'important';

    const trace = { href: null, cacheeAuDepart: null };
    const location = {
        pathname: chemin,
        get href() { return 'https://www.ordotype.fr' + chemin; },
        set href(url) { trace.href = url; trace.cacheeAuDepart = cachee(); },
    };

    const ecouteurs = {};
    const win = {
        location,
        addEventListener(type, fn) { (ecouteurs[type] = ecouteurs[type] || []).push(fn); },
    };

    const h = horloge();
    const sauvegarde = {
        window: global.window, document: global.document, localStorage: global.localStorage,
        setTimeout: global.setTimeout, console: global.console, random: Math.random,
    };
    global.window = win;
    global.document = { documentElement: { style } };
    global.localStorage = {
        getItem(k) { return Object.prototype.hasOwnProperty.call(stockage, k) ? stockage[k] : null; },
        setItem(k, v) { stockage[k] = String(v); },
    };
    global.setTimeout = (fn, d) => h.set(fn, d);
    global.console = { log() {}, warn() {}, error() {} };
    Math.random = () => hasard;

    const restaure = () => {
        Math.random = sauvegarde.random;
        delete sauvegarde.random;
        Object.assign(global, sauvegarde);
    };
    try {
        eval(fs.readFileSync(path.join(ROOT, source), 'utf8'));
    } catch (e) {
        restaure();
        throw e;
    }

    return {
        trace, horloge: h, restaure, cachee, stockage,
        pageshow: (persisted) => (ecouteurs.pageshow || []).forEach((fn) => fn({ persisted })),
    };
}

/** Cas communs à toute redirection effectuée. */
function casRedirection(cible) {
    return [
        ['redirige, page cachée avant l affectation de location.href', (e) => {
            if (e.trace.href !== cible) return 'redirection attendue vers ' + cible + ', obtenu ' + e.trace.href;
            if (!e.trace.cacheeAuDepart) return 'la page était visible au moment de partir';
            if (!e.cachee()) return 'la page n est pas restée cachée';
            return '';
        }],
        ['navigation qui n aboutit pas : réaffichée au bout du délai, pas avant', (e) => {
            e.horloge.avancer(DELAI - 1);
            if (!e.cachee()) return 'réaffichée trop tôt';
            e.horloge.avancer(2);
            if (e.cachee()) return 'PAGE INVISIBLE POUR TOUJOURS si la navigation échoue';
            return '';
        }],
        ['retour depuis le cache : réaffichée tout de suite ; pageshow ordinaire : rien', (e) => {
            e.pageshow(false);
            if (!e.cachee()) return 'un pageshow ordinaire a réaffiché la page';
            e.pageshow(true);
            if (e.cachee()) return 'page restaurée depuis le cache mais toujours cachée';
            return '';
        }],
    ];
}

const casSansRedirection = [
    ['aucune redirection : rien de caché, aucune minuterie', (e) => {
        if (e.trace.href !== null) return 'redirection inattendue vers ' + e.trace.href;
        if (e.cachee()) return 'page cachée sans raison';
        if (e.horloge.enAttente() !== 0) return 'minuterie armée sans raison';
        return '';
    }],
];

const BELGIQUE = JSON.stringify([{ key: 'belgium', activeMemberHasAccess: true }]);
const BELGIQUE_INACTIF = JSON.stringify([{ key: 'belgium', activeMemberHasAccess: false }]);

const SCENARIOS = [];
for (const [source, chemin, cible] of [
    ['pricing/ab-test.js', '/nos-offres', '/nos-offres-v2'],
    ['fin-internat/ab-test.js', '/membership/fin-internat', '/membership/fin-internat-v2'],
]) {
    SCENARIOS.push([source, 'variante B enregistrée', { chemin, stockage: { AB_test_variant: 'B' } }, casRedirection(cible)]);
    SCENARIOS.push([source, 'nouveau visiteur tiré en B', { chemin, hasard: 0.95 }, casRedirection(cible)]);
    SCENARIOS.push([source, 'variante A enregistrée', { chemin, stockage: { AB_test_variant: 'A' } }, casSansRedirection]);
    SCENARIOS.push([source, 'nouveau visiteur tiré en A', { chemin, hasard: 0.1 }, casSansRedirection]);
    SCENARIOS.push([source, 'variante B sur une autre page', { chemin: cible, stockage: { AB_test_variant: 'B' } }, casSansRedirection]);
}
for (const [source, chemin] of [
    ['pricing/belgium-redirect.js', '/nos-offres'],
    ['pricing-v2/belgium-redirect.js', '/nos-offres-v2'],
]) {
    SCENARIOS.push([source, 'membre du groupe Belgique', { chemin, stockage: { ms_groups: BELGIQUE } }, casRedirection('/nos-offres-belgique')]);
    SCENARIOS.push([source, 'groupe Belgique sans accès', { chemin, stockage: { ms_groups: BELGIQUE_INACTIF } }, casSansRedirection]);
    SCENARIOS.push([source, 'sans groupes', { chemin }, casSansRedirection]);
    SCENARIOS.push([source, 'groupes illisibles', { chemin, stockage: { ms_groups: '{pas du json' } }, casSansRedirection]);
}

let echecs = 0;
let total = 0;
for (const [source, contexte, options, liste] of SCENARIOS) {
    for (const [nom, cas] of liste) {
        total += 1;
        let e = null;
        const titre = `${source} [${contexte}] — ${nom}`;
        try {
            e = env(source, Object.assign({}, options, { stockage: Object.assign({}, options.stockage) }));
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
console.log(echecs ? `\n${echecs} cas en échec sur ${total}.` : `\n${total} cas, tous verts`);
process.exit(echecs ? 1 : 0);
