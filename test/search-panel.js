#!/usr/bin/env node
/**
 * Vérifie shared/search-panel.js contre le HTML RÉEL de l'entête d'une fiche
 * (test/fixtures/entete-fiche.html).
 *
 * La géométrie simulée est celle du site en 390 px : la zone de la flèche
 * (x 16 à 71) chevauche le bord gauche du champ (x 48 à 391).
 *
 * Ce qui doit tenir :
 *   - ordinateur : rien ne change, aucun tirage ;
 *   - à 100 %, tout tirage ouvre le panneau ; témoin quand POURCENT < 100,
 *     coupe-circuit (POURCENT = 0), stockage refusé, moteur de
 *     recherche absent : la loupe garde son lien ;
 *   - moitié panneau : panneau construit au premier appui seulement ; la loupe
 *     l'ouvre sans changer de page ; le champ y est déplacé puis remis ;
 *   - sorties : flèche, bouton retour, Échap, passage en paysage (texte gardé),
 *     Entrée, loupe de droite, résultat choisi ; appli quittée puis reprise ;
 *   - la recherche abandonnée reste visible du moteur (focus perdu avant vidage) ;
 *   - retour sur l'entrée du panneau : rouvert seulement si le moteur est branché ;
 *   - un appui sur le bord du champ ou un appui annulé ne sont PAS des pannes ;
 *     flèche recouverte et fermeture sans effet le sont ;
 *   - le panneau se ferme même si l'entête a changé entre-temps ;
 *   - chaque envoi porte toutes les clés ; une mesure en panne ne casse rien ;
 *     le rapporteur commun est utilisé quand il est là.
 *
 * Usage : node test/search-panel.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'entete-fiche.html'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'shared', 'search-panel.js'), 'utf8');
function withPercent(n) {
    const out = SRC.replace(/var POURCENT = \d+;/, 'var POURCENT = ' + n + ';');
    if (out === SRC && !SRC.includes('var POURCENT = ' + n + ';')) throw new Error('POURCENT introuvable dans search-panel.js');
    return out;
}
const KEYS = ['event', 'element', 'rollout_bucket', 'rollout_percent', 'rollout_reason',
    'reason', 'reason_codes', 'failure_reason', 'time_on_page_sec'];
const ARROW = { left: 16, top: 16, width: 55, height: 44, right: 71, bottom: 60 };
const FIELD = { left: 48, top: 12, width: 343, height: 52, right: 391, bottom: 64 };

async function load(opts) {
    const o = Object.assign({ mobile: true, bucket: '10', engine: true, covered: false, storageBroken: false,
        pushBroken: false, random: 0.5, src: SRC, state: null, reporter: false, variantWriteBroken: false }, opts);
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
    const sideEffects = [];
    const viaReporter = [];
    win.dataLayer = { push: (p) => { if (o.pushBroken) throw new Error('dataLayer cassé'); pushed.push(p); } };
    if (o.reporter) {
        win.OrdoErrorReporter = {
            track: (p) => { viaReporter.push(p); try { win.dataLayer.push(p); } catch (e) { sideEffects.push(e.message); } },
            reportSideEffect: (ctx, e) => sideEffects.push(ctx + ':' + e.message),
        };
    }
    win.clarity = function () { clarity.push([].slice.call(arguments)); };
    const mq = { matches: o.mobile, listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } };
    win.matchMedia = () => mq;
    win.Math.random = () => o.random;
    if (o.bucket !== null) win.localStorage.setItem('ot_search_bucket', o.bucket);
    if (o.variantWriteBroken) {
        const set = win.Storage.prototype.setItem;
        win.Storage.prototype.setItem = function (k, v) {
            if (k === 'ot_search_variant') throw new Error('quota');
            return set.call(this, k, v);
        };
    }
    if (o.storageBroken) {
        Object.defineProperty(win, 'localStorage', { get() { throw new Error('stockage refusé'); } });
    }
    if (o.state) win.history.replaceState(o.state, '');
    win.addEventListener('error', (e) => reported.push({ name: e.error && e.error.name, message: e.message }));
    win.HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.classList.contains('ot-search-back')) return ARROW;
        if (this.id === 'search-bar-nav') return FIELD;
        return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    };
    doc.elementFromPoint = (x) => {
        if (o.covered) return doc.querySelector('.navbar2_container');
        return x < 48 ? doc.querySelector('.ot-search-back img') : doc.getElementById('search-bar-nav');
    };
    if (o.engine) win.eval("var searchBar = document.getElementById('search-bar-nav');");
    win.eval(o.src);
    await new Promise((res) => {
        if (doc.readyState !== 'loading') return res();
        doc.addEventListener('DOMContentLoaded', () => res());
        win.addEventListener('load', () => res());
    });
    return { win, doc, mq, pushed, reported, clarity, sideEffects, viaReporter };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (win) => new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => r())));
const panelOpen = (doc) => !!doc.querySelector('.ot-search-panel.is-open');
const events = (pushed, name) => pushed.filter((p) => p.event === name);
const blocking = (reported) => reported.filter((r) => r.name === 'SearchPanelBlocked');
function tapLoupe(win, doc) {
    const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.getElementById('logo-finder-mobile').dispatchEvent(ev);
    return ev.defaultPrevented;
}
function click(win, el) { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); }
function pointer(win, el, x, y) { el.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y })); }
function type(win, input, value) { input.value = value; input.dispatchEvent(new win.Event('input', { bubbles: true })); }
function results(doc, n) {
    const list = doc.createElement('div');
    list.id = 'search-results';
    for (let i = 0; i < n; i++) list.innerHTML += '<a class="search-result" href="#r' + i + '">R' + i + '</a>';
    doc.body.appendChild(list);
    list.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
    return list;
}
const settle = () => wait(30);

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

    console.log('100 % : le tirage le plus haut ouvre aussi le panneau (tirage 99)');
    {
        const { win, doc, pushed } = await load({ bucket: '99' });
        check('panneau ouvert sans changer de page', tapLoupe(win, doc) === true && panelOpen(doc), 'loupe suivie');
        const open = events(pushed, 'search_panel_open')[0];
        check('ouverture comptée, moitié panneau', open && open.rollout_bucket === 'panneau' && open.rollout_percent === '100', JSON.stringify(open));
    }

    console.log('témoin si POURCENT = 50 (tirage 90)');
    {
        const { win, doc, pushed } = await load({ bucket: '90', src: withPercent(50) });
        check('la loupe garde son lien', !tapLoupe(win, doc), 'navigation empêchée');
        check('aucun panneau', !doc.querySelector('.ot-search-panel'), 'panneau créé');
        const open = events(pushed, 'search_panel_open')[0];
        check('ouverture comptée, moitié page', open && open.rollout_bucket === 'page' && open.reason === 'loupe', JSON.stringify(open));
        check('toutes les clés présentes', open && KEYS.every((k) => k in open), open && KEYS.filter((k) => !(k in open)));
        check('variante stockée', win.localStorage.getItem('ot_search_variant') === 'page', win.localStorage.getItem('ot_search_variant'));
    }

    console.log('coupe-circuit POURCENT = 0 (tirage 10)');
    {
        const { win, doc } = await load({ src: withPercent(0) });
        check('la loupe garde son lien', !tapLoupe(win, doc), 'navigation empêchée');
        check('aucun panneau', !doc.querySelector('.ot-search-panel'), 'panneau créé');
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
        check('la loupe garde son lien', !tapLoupe(win, doc), 'navigation empêchée');
        const open = events(pushed, 'search_panel_open')[0];
        check('marqué sans_stockage', open && open.rollout_reason === 'sans_stockage', JSON.stringify(open));
    }

    console.log('écriture de la variante refusée seule');
    {
        const { win, doc, pushed } = await load({ variantWriteBroken: true });
        check('le tirage décide quand même : panneau', tapLoupe(win, doc) === true && panelOpen(doc), 'témoin forcé');
        const open = events(pushed, 'search_panel_open')[0];
        check('moitié et tirage cohérents', open && open.rollout_bucket === 'panneau' && open.rollout_reason === '10', JSON.stringify(open));
    }

    console.log('moteur de recherche absent');
    {
        const { win, doc, pushed, reported } = await load({ engine: false });
        check('la loupe garde son lien', !tapLoupe(win, doc), 'navigation empêchée');
        check('panneau fermé', !panelOpen(doc), 'ouvert');
        const open = events(pushed, 'search_panel_open')[0];
        check('compté comme repli, pas comme blocage', open && open.reason === 'repli' && events(pushed, 'search_panel_problem').length === 0, JSON.stringify(pushed));
        check('aucune alerte', blocking(reported).length === 0, JSON.stringify(reported));
    }

    console.log('panneau : ouverture puis flèche');
    {
        const { win, doc, pushed, reported, clarity } = await load({});
        await wait(50); // une construction différée aurait eu lieu
        check('panneau construit au premier appui seulement', !doc.querySelector('.ot-search-panel'), 'construit au chargement');
        const input = doc.getElementById('search-bar-nav');
        const home = input.parentNode;
        let blurValue = null;
        input.addEventListener('blur', () => { blurValue = input.value; });
        check('la loupe ouvre sur place', tapLoupe(win, doc) === true, 'navigation non empêchée');
        check('panneau ouvert', panelOpen(doc), 'fermé');
        check('champ déplacé dans le panneau', !!input.closest('.ot-search-panel'), 'resté dans l’entête');
        check('champ sélectionné', doc.activeElement === input, doc.activeElement && doc.activeElement.tagName);
        check('entrée d’historique ajoutée', win.history.state && win.history.state.otSearch === 1, JSON.stringify(win.history.state));
        const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
        check('styles sans « inset » et avec repli vh', !/inset:/.test(css) && css.indexOf('100vh') >= 0 && css.indexOf('100vh') < css.indexOf('100dvh'), 'styles non compatibles');
        const open = events(pushed, 'search_panel_open')[0];
        check('ouverture : moitié panneau, loupe', open && open.rollout_bucket === 'panneau' && open.reason === 'loupe', JSON.stringify(open));
        check('toutes les clés présentes', open && KEYS.every((k) => k in open), open && KEYS.filter((k) => !(k in open)));
        await frames(win);
        check('contrôle à l’ouverture : rien de recouvert', events(pushed, 'search_panel_problem').length === 0, JSON.stringify(events(pushed, 'search_panel_problem')));
        type(win, input, 'angine');
        pointer(win, input, 61, 30); // bord gauche du champ, dans la zone de la flèche
        await wait(1700);
        check('appui sur le bord du champ : pas de panne', events(pushed, 'search_panel_problem').length === 0 && blocking(reported).length === 0,
            JSON.stringify(events(pushed, 'search_panel_problem')));
        const back = doc.querySelector('.ot-search-back');
        pointer(win, back, 30, 30);
        click(win, back);
        await settle();
        check('panneau fermé', !panelOpen(doc), 'ouvert');
        check('le moteur voit la recherche abandonnée', blurValue === 'angine', JSON.stringify(blurValue));
        check('champ remis dans l’entête et vidé', input.parentNode === home && input.value === '', input.value);
        check('entrée d’historique retirée', !win.history.state, JSON.stringify(win.history.state));
        const close = events(pushed, 'search_panel_close')[0];
        check('fermeture : fleche, a tapé', close && close.reason === 'fleche' && /tape/.test(close.reason_codes), JSON.stringify(close));
        check('toutes les clés présentes', close && KEYS.every((k) => k in close), close && KEYS.filter((k) => !(k in close)));
        await wait(1600);
        check('aucune alerte', reported.length === 0, JSON.stringify(reported));
        check('séance étiquetée pour les enregistrements', clarity.some((c) => c[0] === 'event' && c[1] === 'search_panel_close_fleche'), JSON.stringify(clarity));
    }

    console.log('panneau : bouton retour, Échap, Entrée, loupe de droite');
    {
        let t = await load({});
        tapLoupe(t.win, t.doc);
        t.win.history.back();
        await settle();
        check('retour : panneau fermé', !panelOpen(t.doc), 'ouvert');
        check('retour : retour_telephone', (events(t.pushed, 'search_panel_close')[0] || {}).reason === 'retour_telephone', JSON.stringify(t.pushed));
        t = await load({});
        tapLoupe(t.win, t.doc);
        t.doc.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle();
        check('Échap : echap', !panelOpen(t.doc) && (events(t.pushed, 'search_panel_close')[0] || {}).reason === 'echap', JSON.stringify(t.pushed));
        t = await load({});
        tapLoupe(t.win, t.doc);
        const input = t.doc.getElementById('search-bar-nav');
        type(t.win, input, 'hta');
        input.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        check('Entrée : page_resultats', (events(t.pushed, 'search_panel_close')[0] || {}).reason === 'page_resultats', JSON.stringify(t.pushed));
        t = await load({});
        tapLoupe(t.win, t.doc);
        type(t.win, t.doc.getElementById('search-bar-nav'), 'hta');
        click(t.win, t.doc.querySelector('.ot-search-go'));
        check('loupe de droite : page_resultats', (events(t.pushed, 'search_panel_close')[0] || {}).reason === 'page_resultats', JSON.stringify(t.pushed));
    }

    console.log('panneau : résultat choisi tôt');
    {
        const { win, doc, pushed } = await load({});
        tapLoupe(win, doc);
        type(win, doc.getElementById('search-bar-nav'), 'hta');
        const list = results(doc, 3);
        click(win, list.querySelector('a')); // avant le relevé différé
        const close = events(pushed, 'search_panel_close')[0];
        check('fermeture : resultat', close && close.reason === 'resultat', JSON.stringify(close));
        check('pas marqué aucun_resultat', close && !/aucun_resultat/.test(close.reason_codes), close && close.reason_codes);
    }

    console.log('panneau : passage en paysage');
    {
        const { win, doc, mq, pushed } = await load({});
        const input = doc.getElementById('search-bar-nav');
        const home = input.parentNode;
        tapLoupe(win, doc);
        type(win, input, 'angine');
        mq.matches = false;
        mq.listeners.forEach((fn) => fn({ matches: false }));
        await settle();
        check('panneau fermé', !panelOpen(doc), 'ouvert');
        check('champ dans l’entête, texte gardé', input.parentNode === home && input.value === 'angine', input.value);
        check('fermeture : rotation', (events(pushed, 'search_panel_close')[0] || {}).reason === 'rotation', JSON.stringify(pushed));
    }

    console.log('panneau : appli quittée puis reprise');
    {
        const { win, doc, pushed } = await load({});
        tapLoupe(win, doc);
        let vis = 'hidden';
        Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => vis });
        doc.dispatchEvent(new win.Event('visibilitychange'));
        vis = 'visible';
        doc.dispatchEvent(new win.Event('visibilitychange'));
        const closes = events(pushed, 'search_panel_close');
        const opens = events(pushed, 'search_panel_open');
        check('fermeture : quitte', closes[0] && closes[0].reason === 'quitte', JSON.stringify(closes));
        check('reprise sans marque de réouverture', opens[1] && opens[1].reason === 'reprise' && opens[1].reason_codes === '', JSON.stringify(opens));
    }

    console.log('panneau : entête modifié pendant l’ouverture');
    {
        const { win, doc } = await load({});
        const input = doc.getElementById('search-bar-nav');
        tapLoupe(win, doc);
        const reset = doc.querySelector('.html-reset-button-navbar');
        reset.parentNode.removeChild(reset);
        click(win, doc.querySelector('.ot-search-back'));
        await settle();
        check('panneau fermé quand même', !panelOpen(doc), 'resté ouvert');
        check('champ revenu dans son formulaire', !!input.closest('#wf-form-search-bar-form-mobile'), 'perdu');
    }

    console.log('retour sur l’entrée du panneau (rechargement)');
    {
        let t = await load({ state: { otSearch: 1 } });
        check('moteur branché : rouvert', panelOpen(t.doc) && (events(t.pushed, 'search_panel_open')[0] || {}).reason === 'retour', JSON.stringify(t.pushed));
        t = await load({ state: { otSearch: 1 }, engine: false });
        await wait(50);
        check('moteur absent : reste fermé', !panelOpen(t.doc), 'ouvert sans moteur');
    }

    console.log('bloqué : flèche recouverte');
    {
        const { win, doc, pushed, reported } = await load({ covered: true });
        tapLoupe(win, doc);
        await frames(win);
        const pb = events(pushed, 'search_panel_problem').map((p) => p.failure_reason);
        check('détectée à l’ouverture', pb.some((r) => /^fleche_recouverte:div\.navbar2_container/.test(r)), JSON.stringify(pb));
        check('alerte bloquante', blocking(reported).some((r) => /fleche_recouverte/.test(r.message)), JSON.stringify(reported));
    }

    console.log('bloqué : appui sur la flèche qui tombe sur l’entête');
    {
        const { win, doc, pushed } = await load({});
        tapLoupe(win, doc);
        pointer(win, doc.querySelector('.navbar2_logo-link'), 30, 30);
        const pb = events(pushed, 'search_panel_problem').map((p) => p.failure_reason);
        check('flèche recouverte détectée à l’appui', pb.some((r) => /^fleche_recouverte:/.test(r)), JSON.stringify(pb));
    }

    console.log('bloqué : la flèche ne ferme plus');
    {
        const { win, doc, pushed, reported } = await load({});
        tapLoupe(win, doc);
        const back = doc.querySelector('.ot-search-back');
        back.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, true);
        pointer(win, back, 30, 30);
        click(win, back);
        await wait(1700);
        check('toujours ouvert', panelOpen(doc), 'fermé');
        const pb = events(pushed, 'search_panel_problem').map((p) => p.failure_reason);
        check('fermeture_sans_effet détectée', pb.indexOf('fermeture_sans_effet') >= 0, JSON.stringify(pb));
        check('alerte bloquante', blocking(reported).some((r) => /fermeture_sans_effet/.test(r.message)), JSON.stringify(reported));
    }

    console.log('appui annulé sur la flèche (défilement)');
    {
        const { win, doc, pushed, reported } = await load({});
        tapLoupe(win, doc);
        pointer(win, doc.querySelector('.ot-search-back'), 30, 30); // pas de clic ensuite
        await wait(1700);
        check('pas de panne', events(pushed, 'search_panel_problem').length === 0 && blocking(reported).length === 0,
            JSON.stringify(events(pushed, 'search_panel_problem')));
    }

    console.log('mesure en panne');
    {
        const { win, doc, reported } = await load({ pushBroken: true });
        check('la loupe ouvre quand même', tapLoupe(win, doc) === true && panelOpen(doc), 'panneau non ouvert');
        // Une exception de mesure au milieu de l'ouverture laisserait le panneau
        // ouvert sans champ sélectionné ni entrée d'historique : le bouton retour
        // quitterait alors la page au lieu de fermer la recherche.
        check('champ sélectionné quand même', doc.activeElement === doc.getElementById('search-bar-nav'), doc.activeElement && doc.activeElement.tagName);
        check('entrée d’historique quand même', win.history.state && win.history.state.otSearch === 1, JSON.stringify(win.history.state));
        win.history.back();
        await settle();
        check('le retour ferme quand même', !panelOpen(doc), 'ouvert');
        check('la panne est signalée', reported.some((r) => /dataLayer cassé/.test(r.message)), JSON.stringify(reported));
    }

    console.log('rapporteur commun présent');
    {
        const { win, doc, sideEffects, viaReporter } = await load({ reporter: true });
        tapLoupe(win, doc);
        check('les envois passent par lui', events(viaReporter, 'search_panel_open').length === 1, JSON.stringify(viaReporter));
        check('aucune panne sans raison', sideEffects.length === 0, JSON.stringify(sideEffects));
        const t = await load({ reporter: true, pushBroken: true });
        tapLoupe(t.win, t.doc);
        check('une panne de mesure lui est confiée, le panneau s’ouvre', t.sideEffects.length > 0 && panelOpen(t.doc), JSON.stringify(t.sideEffects));
    }

    console.log(fail ? `\n${fail} échec(s)` : '\ntout est bon');
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
