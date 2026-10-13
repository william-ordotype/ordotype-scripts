#!/usr/bin/env node
/**
 * Fenêtre CGU de l'accueil (#modale-info-indicative) : quand elle s'affiche,
 * qu'elle se ferme toujours, et qu'on voit si quelqu'un reste bloqué derrière.
 *
 * Elle couvre toute la page : affichée sans son bouton « J'ai compris », rien
 * ne pourrait la fermer. Le script doit alors la laisser cachée et le signaler.
 *
 * Mesure : cgu_modal_view / cgu_modal_accept / cgu_modal_leave /
 * cgu_modal_masquee / cgu_modal_contournee (GA4), et un signalement si le
 * bouton est entièrement recouvert alors que la fenêtre est au premier plan
 * (« recouvert »), ou si la fenêtre n'est pas au premier plan (sans ce mot).
 * Joué avec et sans window.OrdoErrorReporter, comme test/smoke-tracking.js.
 *
 * Usage : node test/cgu-modal.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '..', 'homepage/cgu-modal.js'), 'utf8');
const JOUR = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-10-12T12:00:00Z');

// Fenêtre telle que posée dans le Designer.
const BOUTON = '<a id="cgu-accepted" href="#" class="button"><div>J’ai compris</div></a>';
const fenetre = (bouton = BOUTON) => '<div id="modale-info-indicative" ms-code-element-temporary="block"'
    + ' class="cgu-modale_component"><div class="cgu-modale_card"><p>Texte'
    + ' <a class="cgu-modale_link" href="/cgu-cgv">CGU-CGV</a></p>' + bouton + '</div></div>'
    + '<div id="crisp" class="crisp-bulle"></div>';

/**
 * Page chargée, script exécuté (il attend DOMContentLoaded).
 * `membre` : contenu de _ms-mem ; `jsonMembre` : ce que rend getMemberJSON()
 * (une Error = la promesse est rejetée).
 */
async function page({
    corps = fenetre(), stockage = {}, membre = null, jsonMembre = {}, stockageInterdit = false, reporter = true,
} = {}) {
    const dom = new JSDOM(`<!doctype html><body>${corps}</body>`, {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    if (w.Date === Date) throw new Error('horloge partagée avec le test');
    const horloge = { t: T0 };
    w.Date.now = () => horloge.t;
    const minuteries = [];
    w.setTimeout = (fn, ms) => { minuteries.push({ fn, ms }); return minuteries.length; };

    const signalements = [];
    const evenements = [];
    const majMembre = [];
    const lecturesJson = [];
    // Écouteurs de clic du document, pour simuler un vrai clic (isTrusted).
    const ecouteursClic = [];
    const ajouter = w.document.addEventListener.bind(w.document);
    w.document.addEventListener = (type, fn, opts) => {
        if (type === 'click') ecouteursClic.push(fn);
        return ajouter(type, fn, opts);
    };
    w.dataLayer = [];
    w.dataLayer.push = (x) => { evenements.push(x.event); return 0; };
    if (reporter) {
        w.OrdoErrorReporter = {
            report: (contexte, err) => signalements.push([contexte, String(err && err.message)]),
            reportSideEffect: (contexte, err) => signalements.push([contexte, String(err && err.message)]),
            track: (p) => w.dataLayer.push(p),
        };
    }
    if (membre) {
        w.localStorage.setItem('_ms-mem', JSON.stringify(membre));
        w.$memberstackDom = {
            getMemberJSON: () => {
                lecturesJson.push(1);
                return jsonMembre instanceof Error ? Promise.reject(jsonMembre) : Promise.resolve({ data: jsonMembre });
            },
            updateMemberJSON: (x) => { majMembre.push(x); return Promise.resolve(); },
        };
    }
    for (const [k, v] of Object.entries(stockage)) w.localStorage.setItem(k, v);
    if (stockageInterdit) {
        Object.defineProperty(w, 'localStorage', { get() { throw new Error('SecurityError'); } });
    }
    w.eval(SCRIPT);
    if (w.document.readyState === 'loading') {
        await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
    }
    await new Promise((r) => setImmediate(r)); // réponse de getMemberJSON()
    const el = w.document.querySelector('#modale-info-indicative');
    const bouton = () => w.document.querySelector('#cgu-accepted');
    return {
        w, el, signalements, evenements, majMembre, lecturesJson, horloge,
        affichee: () => !!(el && el.classList.contains('show')),
        cliquer: () => bouton().click(),
        cliquerCgu: () => w.document.querySelector('.cgu-modale_link').dispatchEvent(
            new w.MouseEvent('click', { bubbles: true, cancelable: true })),
        // Vrai clic de l'utilisateur sur `cible` (un .click() du script n'est pas isTrusted).
        clicReel: (cible) => ecouteursClic.forEach((fn) => fn({ isTrusted: true, target: cible })),
        quitter: () => w.dispatchEvent(new w.Event('pagehide')),
        // Bouton à l'écran (y 600-644) ; `recouvre(x)` dit ce qu'il y a au point x
        // (0..1 de sa largeur), `coins` ce qu'il y a aux coins de l'écran
        // (la fenêtre elle-même quand elle est au premier plan).
        poserBouton: (recouvre, coins = el) => {
            bouton().getBoundingClientRect = () => ({ left: 100, width: 400, top: 600, height: 44, bottom: 644 });
            w.innerHeight = 800;
            w.document.elementFromPoint = (x, y) => (y > 600 && y < 644 ? recouvre((x - 100) / 400) : coins);
        },
        controlerAccessibilite: () => minuteries.filter((m) => m.ms === 3000).forEach((m) => m.fn()),
    };
}

const recouvert = (s) => /recouvert/i.test(s[1]);
const AUJOURDHUI = new Date(T0).toISOString().slice(0, 10);

let echecs = 0;
function verifier(nom, ok) {
    console.log(`${ok ? '✓' : '✗'} ${nom}`);
    if (!ok) echecs += 1;
}

async function cas(avecReporter) {
    const r = avecReporter;
    const suffixe = r ? '' : ' (sans OrdoErrorReporter)';
    const P = (o = {}) => page({ ...o, reporter: r });

    // 1. Première visite : la fenêtre s'affiche, le bouton la ferme, tout est mesuré.
    let p = await P();
    verifier('première visite : affichée' + suffixe, p.affichee());
    verifier('affichage mesuré (cgu_modal_view)' + suffixe, p.evenements.join() === 'cgu_modal_view');
    p.cliquer();
    verifier('clic sur « J’ai compris » : fermée' + suffixe, !p.affichee());
    verifier('clic : date enregistrée' + suffixe, !!p.w.localStorage.getItem('cgu-accepted-date'));
    verifier('acceptation mesurée (cgu_modal_accept)' + suffixe,
        p.evenements.join() === 'cgu_modal_view,cgu_modal_accept');
    p.horloge.t += 60000;
    p.quitter();
    verifier('départ après acceptation : pas de cgu_modal_leave' + suffixe, !p.evenements.includes('cgu_modal_leave'));
    verifier('cas normal : aucun signalement' + suffixe, p.signalements.length === 0);

    // 2. Acceptée il y a 10 jours : rien, et rien de mesuré.
    p = await P({ stockage: { 'cgu-accepted-date': new Date(T0 - 10 * JOUR).toISOString() } });
    verifier('acceptée il y a 10 jours : cachée' + suffixe, !p.affichee());
    verifier('acceptée il y a 10 jours : aucun événement' + suffixe, p.evenements.length === 0);

    // 3. Acceptée il y a 100 jours : de nouveau.
    p = await P({ stockage: { 'cgu-accepted-date': new Date(T0 - 100 * JOUR).toISOString() } });
    verifier('acceptée il y a 100 jours : affichée' + suffixe, p.affichee());

    // 4. 🔴 Partie sans accepter après 3 s ou plus : quelqu'un de peut-être bloqué.
    p = await P();
    p.horloge.t += 45000;
    p.quitter();
    p.quitter();
    verifier('départ sans accepter (45 s) : cgu_modal_leave, une seule fois' + suffixe,
        p.evenements.join() === 'cgu_modal_view,cgu_modal_leave');

    // 5. Partie en moins de 3 s (redirection, rebond) : pas compté.
    p = await P();
    p.horloge.t += 1500;
    p.quitter();
    verifier('départ en 1,5 s : pas de cgu_modal_leave' + suffixe, !p.evenements.includes('cgu_modal_leave'));

    // 6. Partie lire les CGU : pas un blocage.
    p = await P();
    p.cliquerCgu();
    p.horloge.t += 20000;
    p.quitter();
    verifier('départ vers les CGU : pas de cgu_modal_leave' + suffixe, !p.evenements.includes('cgu_modal_leave'));

    // 7. 🔴 Fenêtre au premier plan, bouton entièrement recouvert 3 s après l'ouverture : signalé.
    p = await P();
    const crisp = p.w.document.querySelector('#crisp');
    p.w.visualViewport = { width: 390, height: 664, offsetTop: 0, scale: 1 };
    p.poserBouton(() => crisp);
    p.controlerAccessibilite();
    verifier('bouton entièrement recouvert : signalé « recouvert »' + suffixe, !r || (p.signalements.length === 1
        && /recouvert par div#crisp\.crisp-bulle/.test(p.signalements[0][1])));
    verifier('recouvert : contexte joint (écran, zone visible, coins, style)' + suffixe, !r || (p.signalements.length === 1
        && /écran \d+x800, défilement \d+, zone visible 390x664 décalage 0 zoom 1, coins div#modale-info-indicative/
            .test(p.signalements[0][1])
        && /visibility:visible opacity:1 pointer-events:\S* display:/.test(p.signalements[0][1])));
    verifier('recouvert : pas de cgu_modal_masquee' + suffixe, !p.evenements.includes('cgu_modal_masquee'));

    // 7b. 🔴 Fenêtre neutralisée par le navigateur (visibility:hidden) : le bouton comme les
    // coins tombent sur la page. Personne de bloqué : jamais « recouvert ».
    p = await P();
    p.el.style.visibility = 'hidden';
    const page1 = p.w.document.querySelector('#crisp');
    p.poserBouton(() => page1, page1);
    p.controlerAccessibilite();
    verifier('fenêtre masquée : jamais « recouvert »' + suffixe, !p.signalements.some(recouvert));
    verifier('fenêtre masquée : signalée à part, une fois, avec son style' + suffixe, !r
        || (p.signalements.length === 1 && p.signalements[0][0] === 'CGUModal'
            && /pas au premier plan/.test(p.signalements[0][1]) && /visibility:hidden/.test(p.signalements[0][1])));
    verifier('fenêtre masquée : cgu_modal_masquee' + suffixe,
        p.evenements.join() === 'cgu_modal_view,cgu_modal_masquee');
    p.horloge.t += 60000;
    p.quitter();
    verifier('fenêtre masquée : départ pas compté comme bloqué' + suffixe, !p.evenements.includes('cgu_modal_leave'));

    // 7c. Masquée, déjà signalée aujourd'hui dans ce navigateur : mesurée, pas resignalée.
    p = await P({ stockage: { 'cgu-modal-masquee-signalee': AUJOURDHUI } });
    p.poserBouton(() => page1, page1);
    p.controlerAccessibilite();
    verifier('masquée déjà signalée aujourd’hui : pas de signalement' + suffixe, p.signalements.length === 0);
    verifier('masquée déjà signalée aujourd’hui : mesurée quand même' + suffixe,
        p.evenements.includes('cgu_modal_masquee'));

    // 7d. Masquée alors que la carte dépasse l'écran (petit téléphone) : vue quand même.
    p = await P();
    p.poserBouton(() => page1, page1);
    p.w.innerHeight = 400;
    p.controlerAccessibilite();
    verifier('masquée, bouton hors écran : cgu_modal_masquee' + suffixe, p.evenements.includes('cgu_modal_masquee'));

    // 7e. 🔴 Vrai clic sur la page à travers la fenêtre ouverte : contournée, et plus de
    // « recouvert » même si la fenêtre repasse au premier plan.
    p = await P();
    p.poserBouton(() => page1, page1);
    p.clicReel(page1);
    p.clicReel(page1);
    verifier('clic à travers la fenêtre : cgu_modal_contournee, une fois' + suffixe,
        p.evenements.join() === 'cgu_modal_view,cgu_modal_contournee');
    p.poserBouton(() => crisp);
    p.controlerAccessibilite();
    verifier('contournée puis recouvert : aucun signalement' + suffixe, p.signalements.length === 0);
    p.horloge.t += 60000;
    p.quitter();
    verifier('contournée : départ pas compté comme bloqué' + suffixe, !p.evenements.includes('cgu_modal_leave'));

    // 7f. Clic sur un élément AU-DESSUS de la fenêtre (bulle de chat), fenêtre au premier plan :
    // pas contournée, l'alerte reste.
    p = await P();
    p.poserBouton(() => crisp);
    p.clicReel(crisp);
    verifier('clic sur un élément au-dessus de la fenêtre : pas contournée' + suffixe,
        !p.evenements.includes('cgu_modal_contournee'));
    p.controlerAccessibilite();
    verifier('… et le bouton recouvert reste signalé' + suffixe, !r || (p.signalements.length === 1
        && recouvert(p.signalements[0])));

    // 7g. Clic déclenché par un script (pas isTrusted), ou dans la fenêtre : pas contournée.
    p = await P();
    p.poserBouton(() => page1, page1);
    page1.click();
    p.clicReel(p.el);
    verifier('clic de script ou dans la fenêtre : pas contournée' + suffixe,
        !p.evenements.includes('cgu_modal_contournee'));

    // 8. Recouvert au centre seulement : le reste du bouton marche, pas d'alerte.
    p = await P();
    const b = p.w.document.querySelector('#cgu-accepted');
    p.poserBouton((x) => (x > 0.3 && x < 0.7 ? crisp : b.firstChild));
    p.controlerAccessibilite();
    verifier('recouvert au centre seulement : pas de signalement' + suffixe, p.signalements.length === 0);

    // 9. Fermée avant le contrôle : rien à contrôler.
    p = await P();
    p.cliquer();
    p.poserBouton(() => crisp);
    p.controlerAccessibilite();
    verifier('fermée avant le contrôle : pas de signalement' + suffixe, p.signalements.length === 0);

    // 10. Bouton hors de l'écran (petit écran, la fenêtre défile) : pas d'alerte.
    p = await P();
    p.poserBouton(() => crisp);
    p.w.innerHeight = 400;
    p.controlerAccessibilite();
    verifier('bouton hors écran : pas de signalement' + suffixe, p.signalements.length === 0);

    // 11. Membre ayant accepté sur un autre appareil : le cache _ms-mem n'a pas de
    // champ json, la date vient de getMemberJSON().
    const recente = new Date(T0 - 5 * JOUR).toISOString();
    const ancienne = new Date(T0 - 100 * JOUR).toISOString();
    p = await P({ membre: { id: 'mem_test' }, jsonMembre: { 'cgu-accepted-date': recente } });
    verifier('membre ayant accepté ailleurs (JSON Memberstack) : cachée' + suffixe, !p.affichee());
    verifier('… aucun événement' + suffixe, p.evenements.length === 0);
    verifier('… date recopiée dans ce navigateur' + suffixe, p.w.localStorage.getItem('cgu-accepted-date') === recente);

    // 11b. Date de ce navigateur périmée, JSON Memberstack récent : cachée.
    p = await P({ membre: { id: 'mem_test' }, stockage: { 'cgu-accepted-date': ancienne },
        jsonMembre: { 'cgu-accepted-date': recente } });
    verifier('date locale périmée, JSON récent : cachée' + suffixe, !p.affichee());

    // 11c. Les deux périmées : affichée.
    p = await P({ membre: { id: 'mem_test' }, jsonMembre: { 'cgu-accepted-date': ancienne } });
    verifier('JSON Memberstack périmé : affichée' + suffixe, p.affichee());

    // 11d. Date de ce navigateur récente : pas d'appel à Memberstack.
    p = await P({ membre: { id: 'mem_test' }, stockage: { 'cgu-accepted-date': recente } });
    verifier('date locale récente : cachée sans lire Memberstack' + suffixe,
        !p.affichee() && p.lecturesJson.length === 0);

    // 11e. 🔴 JSON Memberstack illisible : affichée (repli) et signalé, une fois par jour.
    p = await P({ membre: { id: 'mem_test' }, jsonMembre: new Error('réseau') });
    verifier('JSON illisible : affichée' + suffixe, p.affichee());
    verifier('JSON illisible : signalé, sans « recouvert »' + suffixe, !r || (p.signalements.length === 1
        && /JSON Memberstack illisible/.test(p.signalements[0][1]) && !recouvert(p.signalements[0])));
    p = await P({ membre: { id: 'mem_test' }, jsonMembre: new Error('réseau'),
        stockage: { 'cgu-modal-json-signale': AUJOURDHUI } });
    verifier('JSON illisible, déjà signalé aujourd’hui : affichée, pas resignalé' + suffixe,
        p.affichee() && p.signalements.length === 0);

    // 12. Membre sans acceptation : le clic met Memberstack à jour sans perdre ses autres clés.
    p = await P({ membre: { id: 'mem_test' }, jsonMembre: { autre: 'garde' } });
    verifier('membre sans acceptation : affichée' + suffixe, p.affichee());
    p.cliquer();
    verifier('membre : clic ferme la fenêtre' + suffixe, !p.affichee());
    verifier('membre : date envoyée à Memberstack' + suffixe,
        p.majMembre.length === 1 && !!p.majMembre[0].json['cgu-accepted-date']);
    verifier('membre : autres clés du JSON gardées' + suffixe,
        p.majMembre.length === 1 && p.majMembre[0].json.autre === 'garde');

    // 13. Stockage interdit (cookies bloqués) : affichée, et le clic ferme quand même.
    p = await P({ stockageInterdit: true });
    verifier('stockage interdit : affichée' + suffixe, p.affichee());
    p.cliquer();
    verifier('stockage interdit : le clic ferme' + suffixe, !p.affichee());

    // 14. 🔴 Bouton disparu du Designer : jamais affichée, et signalé.
    p = await P({ corps: fenetre('') });
    verifier('sans bouton : fenêtre NON affichée' + suffixe, !p.affichee());
    verifier('sans bouton : aucun cgu_modal_view' + suffixe, p.evenements.length === 0);
    verifier('sans bouton : signalé une fois' + suffixe, !r
        || (p.signalements.length === 1 && p.signalements[0][0] === 'CGUModal'));

    // 15. Bloc retiré de la page (ni fenêtre ni bouton) : silence.
    p = await P({ corps: '<p>accueil</p>' });
    verifier('bloc retiré : aucun signalement ni événement' + suffixe,
        p.signalements.length === 0 && p.evenements.length === 0);
}

(async () => {
    await cas(true);
    await cas(false);
    await new Promise((r) => setTimeout(r, 10));
    if (echecs) {
        console.error(`\n${echecs} échec(s)`);
        process.exit(1);
    }
    console.log('\nTous les cas passent.');
})();
