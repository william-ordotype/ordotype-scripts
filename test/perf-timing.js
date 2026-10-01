#!/usr/bin/env node
/**
 * Perf Timing : les temps de chargement de la page sont attachés comme mesures à
 * la transaction « pageload » active de Sentry, lue par window.__SENTRY__.
 *
 * Vérifie :
 *  - les 15 mesures attendues, arrondies, au bon format (nom, valeur, unité) ;
 *  - rien n'est ajouté si la transaction n'est pas enregistrée (non tirée) ;
 *  - rien ne casse sans Sentry, ou si Sentry lève une erreur ;
 *  - une sous-transaction renvoie à sa racine ;
 *  - un fichier absent ne produit pas de mesure, et la dernière arrivée ne
 *    compte que les fichiers présents ;
 *  - les valeurs négatives ou non numériques sont ignorées ;
 *  - le script s'exécute aussi s'il arrive après le DOMContentLoaded.
 *
 * Usage : node test/perf-timing.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'shared', 'perf-timing.js'), 'utf8');

const NAV = { requestStart: 10.2, responseStart: 80.6, responseEnd: 95.4, domInteractive: 210.7 };
const RESSOURCES = [
    { name: 'https://cdn.prod.website-files.com/604b9ac88b080efc7ce802bd/css/ordotype.webflow.shared.248ef3378.min.css', responseEnd: 160.4, duration: 60.2 },
    { name: 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@eac6c21/shared/global-styles.css', responseEnd: 120.1, duration: 20.9 },
    { name: 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@ad8295a/ordonnances/styles.css', responseEnd: 118.5, duration: 19.5 },
    { name: 'https://cdn.jsdelivr.net/gh/Ordotype/ordotype-auth-cdn@4.5.13/auth-bundle.js', responseEnd: 140.2, duration: 40.4 },
    { name: 'https://static.memberstack.com/scripts/v2/memberstack.js', responseEnd: 175.8, duration: 75.1 },
    { name: 'https://cdn.prod.website-files.com/604b9ac88b080efc7ce802bd/js/webflow.8de601f7.js', responseEnd: 400, duration: 300 },
];

function monter({ sentry = 'enregistre', ressources = RESSOURCES, nav = NAV, etat = 'loading', leve = false } = {}) {
    const erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://www.ordotype.fr/ordonnances-types/test', runScripts: 'outside-only', virtualConsole: vc,
    });
    const w = dom.window;
    const evenements = [];
    const racine = {
        isRecording: () => sentry !== 'non-tire',
        addEvent: (nom, attributs) => { if (leve) throw new Error('Sentry'); evenements.push([nom, attributs]); },
    };
    const span = sentry === 'enfant' ? { _sentryRootSpan: racine, addEvent: () => evenements.push(['enfant']) } : racine;
    if (sentry !== 'absent') {
        w.__SENTRY__ = { version: '10.23.0', '10.23.0': { stack: { getScope: () => ({ _sentrySpan: span }) } } };
    }
    Object.defineProperty(w, 'performance', {
        configurable: true,
        value: { getEntriesByType: (t) => (t === 'navigation' ? [nav] : t === 'resource' ? ressources : []) },
    });
    Object.defineProperty(w.document, 'readyState', { configurable: true, get: () => etat });
    w.eval(SRC);
    return { w, evenements, erreurs };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
// jsdom déclenche lui-même DOMContentLoaded, une fois, juste après la création
// du document : on l'attend au lieu d'en envoyer un second.
async function declencher() {
    await attendre(30);
}

const cas = [];
function verifier(nom, obtenu, attendu) {
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    cas.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
}
const versObjet = (evs) => Object.fromEntries(evs.map(([n, a]) => [n, a && a['sentry.measurement_value']]));

(async () => {
    {
        const ctx = monter();
        verifier('rien avant le DOMContentLoaded', ctx.evenements.length, 0);
        await declencher();
        verifier('15 mesures attachées', ctx.evenements.length, 15);
        verifier('valeurs arrondies', versObjet(ctx.evenements), {
            ordo_embed: 0, ordo_html_wait: 70, ordo_html_end: 95, ordo_dom_interactive: 211,
            ordo_css_webflow_end: 160, ordo_css_webflow_dur: 60, ordo_css_global_end: 120, ordo_css_global_dur: 21,
            ordo_css_page_end: 119, ordo_css_page_dur: 20, ordo_js_auth_end: 140, ordo_js_auth_dur: 40,
            ordo_js_memberstack_end: 176, ordo_js_memberstack_dur: 75, ordo_blocking_end: 176,
        });
        verifier('unités', [ctx.evenements[0][1]['sentry.measurement_unit'], ctx.evenements[1][1]['sentry.measurement_unit']], ['none', 'millisecond']);
        verifier('aucune erreur', ctx.erreurs, []);
    }
    {
        const ctx = monter({ sentry: 'non-tire' }); await declencher();
        verifier('transaction non tirée : rien ajouté', ctx.evenements.length, 0);
    }
    {
        const ctx = monter({ sentry: 'absent' }); await declencher();
        verifier('sans Sentry : aucune erreur', ctx.erreurs, []);
    }
    {
        const ctx = monter({ leve: true }); await declencher();
        verifier('Sentry lève une erreur : rien ne remonte', ctx.erreurs, []);
    }
    {
        const ctx = monter({ sentry: 'enfant' }); await declencher();
        verifier('sous-transaction : mesures sur la racine', [ctx.evenements.length, ctx.evenements.some((e) => e[0] === 'enfant')], [15, false]);
    }
    {
        const sansMemberstack = RESSOURCES.filter((r) => !/memberstack/.test(r.name));
        const ctx = monter({ ressources: sansMemberstack }); await declencher();
        const o = versObjet(ctx.evenements);
        verifier('fichier absent : pas de mesure', ['ordo_js_memberstack_end' in o, 'ordo_js_memberstack_dur' in o], [false, false]);
        verifier('fichier absent : dernière arrivée parmi les présents', o.ordo_blocking_end, 160);
    }
    {
        const ctx = monter({ nav: { requestStart: 50, responseStart: 20, responseEnd: NaN, domInteractive: 100 } }); await declencher();
        const o = versObjet(ctx.evenements);
        verifier('valeur négative ou non numérique ignorée', ['ordo_html_wait' in o, 'ordo_html_end' in o, o.ordo_dom_interactive], [false, false, 100]);
    }
    {
        const ctx = monter({ etat: 'interactive' }); await attendre(20);
        verifier('script arrivé après le DOMContentLoaded : mesures quand même', ctx.evenements.length, 15);
    }
    const echecs = cas.filter((ok) => !ok).length;
    console.log(`\n${cas.length - echecs}/${cas.length} vérifications passées`);
    process.exit(echecs ? 1 : 0);
})();
