#!/usr/bin/env node
/**
 * Vérifie shared/search-panel.js contre le HTML RÉEL de l'entête d'une fiche
 * (test/fixtures/entete-fiche.html).
 *
 * Ce qui doit tenir :
 *   - ordinateur : rien ne change, aucun tirage ;
 *   - moitié témoin, coupe-circuit (POURCENT = 0), stockage refusé, moteur de
 *     recherche absent : la loupe garde son lien ;
 *   - moitié panneau : la loupe ouvre le panneau sans changer de page, le champ
 *     de l'entête y est déplacé puis remis à sa place ;
 *   - toutes les sorties ferment le panneau et laissent sur la page : flèche,
 *     bouton retour (historique), Échap ; un résultat choisi termine la séance ;
 *   - chaque envoi porte toutes les clés ;
 *   - flèche recouverte et fermeture sans effet sont signalées comme bloquantes ;
 *   - une mesure en panne ne casse pas le panneau.
 *
 * Usage : node test/search-panel.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'entete-fiche.html'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'shared', 'search-panel.js'), 'utf8');
const KEYS = ['event', 'element', 'rollout_bucket', 'rollout_percent', 'rollout_reason',
    'reason', 'reason_codes', 'failure_reason', 'time_on_page_sec'];

async function load(opts) {
    const o = Object.assign({ mobile: true, bucket: '10', engine: true, covered: false,
        storageBroken: false, pushBroken: false, random: 0.5, src: SRC }, opts);
    const dom = new JSDOM(html, {
        url: 'https://www.ordotype.fr/pathologies/exemple',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole: new VirtualConsole(),
    });
    const win = dom.window;
    const doc = win.document;
    const pushed = [];
    const reported = [];
    const clarity = [];
    win.dataLayer = { push: (p) => { if (o.pushBroken) throw new Error('dataLayer cassé'); pushed.push(p); } };
    win.clarity = function () { clarity.push([].slice.call(arguments)); };
    win.matchMedia = () => ({ matches: o.mobile });
    win.Math.random = () => o.random;
    if (o.bucket !== null) win.localStorage.setItem('ot_search_bucket', o.bucket);
    if (o.storageBroken) {
        Object.defineProperty(win, 'localStorage', { get() { throw new Error('stockage refusé'); } });
    }
    win.addEventListener('error', (e) => reported.push({ name: e.error && e.error.name, message: e.message }));
    // Géométrie : jsdom ne calcule pas la mise en page. Flèche à gauche, champ à droite.
    win.HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.classList.contains('ot-search-back')) return { left: 0, top: 0, width: 44, height: 44, right: 44, bottom: 44 };
        if (this.id === 'search-bar-nav') return { left: 60, top: 0, width: 300, height: 44, right: 360, bottom: 44 };
        return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    };
    doc.elementFromPoint = (x) => {
        if (o.covered) return doc.querySelector('.navbar2_container');
        return x < 50 ? doc.querySelector('.ot-search-back img') : doc.getElementById('search-bar-nav');
    };
    if (o.engine) win.eval("var searchBar = document.getElementById('search-bar-nav');");
    win.eval(o.src);
    // jsdom laisse readyState à 'loading' : le script attend DOMContentLoaded,
    // exactement comme sur la vraie page.
    await new Promise((res) => {
        if (doc.readyState !== 'loading') return res();
        doc.addEventListener('DOMContentLoaded', () => res());
        win.addEventListener('load', () => res());
    });
    return { win, doc, pushed, reported, clarity };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (win) => new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => r())));
const panelOpen = (doc) => !!doc.querySelector('.ot-search-panel.is-open');
const events = (pushed, name) => pushed.filter((p) => p.event === name);
function tapLoupe(win, doc) {
    const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('logo-finder-mobile').dispatchEvent(ev);
    return ev.defaultPrevented;
}
async function popped() { await wait(30); }

let fail = 0;
function check(label, cond, detail) {
    console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : '  → ' + detail));
    if (!cond) fail++;
}

async function main() {
    console.log('ordinateur');
    {
        const { win, doc } = await load({ mobile: false, bucket: null });
        check('aucun panneau', !doc.querySelector('.ot-search-panel'), 'panneau créé');
        check('aucun tirage stocké', win.localStorage.getItem('ot_search_bucket') === null, win.localStorage.getItem('ot_search_bucket'));
    }

    console.log('moitié témoin (tirage 90)');
    {
        const { win, doc, pushed } = await load({ bucket: '90' });
        check('aucun panneau', !doc.querySelector('.ot-search-panel'), 'panneau créé');
        const prevented = tapLoupe(win, doc);
        check('la loupe garde son lien', !prevented, 'navigation empêchée');
        const open = events(pushed, 'search_panel_open')[0];
        check('ouverture comptée, moitié page', open && open.rollout_bucket === 'page' && open.reason === 'loupe', JSON.stringify(open));
        check('toutes les clés présentes', open && KEYS.every((k) => k in open), open && KEYS.filter((k) => !(k in open)));
        check('variante stockée', win.localStorage.getItem('ot_search_variant') === 'page', win.localStorage.getItem('ot_search_variant'));
    }

    console.log('coupe-circuit POURCENT = 0 (tirage 10)');
    {
        const { win, doc } = await load({ src: SRC.replace('var POURCENT = 50;', 'var POURCENT = 0;') });
        check('aucun panneau', !doc.querySelector('.ot-search-panel'), 'panneau créé');
        check('la loupe garde son lien', !tapLoupe(win, doc), 'navigation empêchée');
    }

    console.log('tirage neuf');
    {
        const { win } = await load({ bucket: null, random: 0.3 });
        check('tirage 30 stocké', win.localStorage.getItem('ot_search_bucket') === '30', win.localStorage.getItem('ot_search_bucket'));
        check('variante panneau', win.localStorage.getItem('ot_search_variant') === 'panneau', win.localStorage.getItem('ot_search_variant'));
    }

    console.log('stockage refusé');
    {
        const { win, doc, pushed } = await load({ storageBroken: true });
        check('aucun panneau', !doc.querySelector('.ot-search-panel'), 'panneau créé');
        check('la loupe garde son lien', !tapLoupe(win, doc), 'navigation empêchée');
        const open = events(pushed, 'search_panel_open')[0];
        check('marqué sans_stockage', open && open.rollout_reason === 'sans_stockage', JSON.stringify(open));
    }

    console.log('moteur de recherche absent');
    {
        const { win, doc, pushed, reported } = await load({ engine: false });
        check('la loupe garde son lien', !tapLoupe(win, doc), 'navigation empêchée');
        check('panneau fermé', !panelOpen(doc), 'ouvert');
        const pb = events(pushed, 'search_panel_problem')[0];
        check('problème moteur_absent', pb && pb.failure_reason === 'moteur_absent', JSON.stringify(pb));
        check('pas signalé comme bloquant', !reported.some((r) => r.name === 'SearchPanelBlocked'), JSON.stringify(reported));
    }

    console.log('panneau : ouverture puis flèche');
    {
        const { win, doc, pushed, reported, clarity } = await load({});
        const input = doc.getElementById('search-bar-nav');
        const home = input.parentNode;
        check('la loupe ouvre sur place', tapLoupe(win, doc) === true, 'navigation non empêchée');
        check('panneau ouvert', panelOpen(doc), 'fermé');
        check('champ déplacé dans le panneau', !!input.closest('.ot-search-panel'), 'resté dans l’entête');
        check('champ sélectionné', doc.activeElement === input, doc.activeElement && doc.activeElement.tagName);
        check('entrée d’historique ajoutée', win.history.state && win.history.state.otSearch === 1, JSON.stringify(win.history.state));
        const open = events(pushed, 'search_panel_open')[0];
        check('ouverture : moitié panneau, loupe', open && open.rollout_bucket === 'panneau' && open.reason === 'loupe', JSON.stringify(open));
        check('toutes les clés présentes', open && KEYS.every((k) => k in open), open && KEYS.filter((k) => !(k in open)));
        await frames(win);
        check('contrôle à l’ouverture : rien de recouvert', events(pushed, 'search_panel_problem').length === 0, JSON.stringify(events(pushed, 'search_panel_problem')));
        input.value = 'angine';
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        doc.querySelector('.ot-search-back').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await popped(win);
        check('panneau fermé', !panelOpen(doc), 'ouvert');
        check('champ remis dans l’entête', input.parentNode === home, 'ailleurs');
        check('champ vidé', input.value === '', input.value);
        check('entrée d’historique retirée', !win.history.state, JSON.stringify(win.history.state));
        const close = events(pushed, 'search_panel_close')[0];
        check('fermeture : fleche, a tapé', close && close.reason === 'fleche' && /tape/.test(close.reason_codes), JSON.stringify(close));
        check('toutes les clés présentes', close && KEYS.every((k) => k in close), close && KEYS.filter((k) => !(k in close)));
        check('aucune erreur signalée', reported.length === 0, JSON.stringify(reported));
        check('séance étiquetée pour les enregistrements', clarity.some((c) => c[0] === 'event' && c[1] === 'search_panel_close_fleche'), JSON.stringify(clarity));
    }

    console.log('panneau : bouton retour du téléphone');
    {
        const { win, doc, pushed } = await load({});
        tapLoupe(win, doc);
        win.history.back();
        await popped(win);
        check('panneau fermé', !panelOpen(doc), 'ouvert');
        const close = events(pushed, 'search_panel_close')[0];
        check('fermeture : retour_telephone', close && close.reason === 'retour_telephone', JSON.stringify(close));
    }

    console.log('panneau : Échap');
    {
        const { win, doc, pushed } = await load({});
        tapLoupe(win, doc);
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await popped(win);
        check('panneau fermé', !panelOpen(doc), 'ouvert');
        const close = events(pushed, 'search_panel_close')[0];
        check('fermeture : echap', close && close.reason === 'echap', JSON.stringify(close));
    }

    console.log('panneau : résultat choisi');
    {
        const { win, doc, pushed } = await load({});
        tapLoupe(win, doc);
        const list = doc.createElement('div');
        list.id = 'search-results';
        list.innerHTML = '<a class="search-result" href="#r">Angine</a>';
        doc.body.appendChild(list);
        const a = list.querySelector('a');
        a.addEventListener('click', (e) => e.preventDefault());
        a.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        const close = events(pushed, 'search_panel_close')[0];
        check('fermeture : resultat', close && close.reason === 'resultat', JSON.stringify(close));
    }

    console.log('bloqué : flèche recouverte');
    {
        const { win, doc, pushed, reported } = await load({ covered: true });
        tapLoupe(win, doc);
        await frames(win);
        const pb = events(pushed, 'search_panel_problem').map((p) => p.failure_reason);
        check('flèche recouverte détectée à l’ouverture', pb.some((r) => /^fleche_recouverte:div\.navbar2_container/.test(r)), JSON.stringify(pb));
        check('signalée comme bloquante', reported.some((r) => r.name === 'SearchPanelBlocked' && /fleche_recouverte/.test(r.message)), JSON.stringify(reported));
    }

    console.log('bloqué : la flèche ne ferme plus');
    {
        const { win, doc, pushed, reported } = await load({});
        tapLoupe(win, doc);
        const back = doc.querySelector('.ot-search-back');
        back.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, true);
        const pd = new win.MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 });
        back.dispatchEvent(pd);
        back.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await wait(1700);
        check('toujours ouvert', panelOpen(doc), 'fermé');
        const pb = events(pushed, 'search_panel_problem').map((p) => p.failure_reason);
        check('fermeture_sans_effet détectée', pb.indexOf('fermeture_sans_effet') >= 0, JSON.stringify(pb));
        check('signalée comme bloquante', reported.some((r) => r.name === 'SearchPanelBlocked' && /fermeture_sans_effet/.test(r.message)), JSON.stringify(reported));
    }

    console.log('mesure en panne');
    {
        const { win, doc, reported } = await load({ pushBroken: true });
        check('la loupe ouvre quand même', tapLoupe(win, doc) === true && panelOpen(doc), 'panneau non ouvert');
        // Une exception de mesure en plein milieu de l'ouverture laisserait le panneau
        // ouvert mais sans champ sélectionné ni entrée d'historique : le bouton retour
        // quitterait alors la page au lieu de fermer la recherche.
        check('champ sélectionné quand même', doc.activeElement === doc.getElementById('search-bar-nav'), doc.activeElement && doc.activeElement.tagName);
        check('entrée d’historique quand même', win.history.state && win.history.state.otSearch === 1, JSON.stringify(win.history.state));
        win.history.back();
        await popped(win);
        check('le retour ferme quand même', !panelOpen(doc), 'ouvert');
        check('la panne est signalée', reported.some((r) => /dataLayer cassé/.test(r.message)), JSON.stringify(reported));
    }

    console.log(fail ? `\n${fail} échec(s)` : '\ntout est bon');
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
