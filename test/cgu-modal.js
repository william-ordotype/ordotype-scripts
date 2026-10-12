#!/usr/bin/env node
/**
 * Fenêtre CGU de l'accueil (#modale-info-indicative) : quand elle s'affiche,
 * qu'elle se ferme toujours, et qu'on voit si quelqu'un reste bloqué derrière.
 *
 * Elle couvre toute la page : affichée sans son bouton « J'ai compris », rien
 * ne pourrait la fermer. Le script doit alors la laisser cachée et le signaler.
 *
 * Mesure : cgu_modal_view / cgu_modal_accept / cgu_modal_leave (GA4), et un
 * signalement si le bouton est entièrement recouvert. Joué avec et sans
 * window.OrdoErrorReporter, comme test/smoke-tracking.js.
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

/** Page chargée, script exécuté (il attend DOMContentLoaded). */
async function page({
    corps = fenetre(), stockage = {}, membre = null, stockageInterdit = false, reporter = true,
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
        w.$memberstackDom = { updateMemberJSON: (x) => { majMembre.push(x); return Promise.resolve(); } };
    }
    for (const [k, v] of Object.entries(stockage)) w.localStorage.setItem(k, v);
    if (stockageInterdit) {
        Object.defineProperty(w, 'localStorage', { get() { throw new Error('SecurityError'); } });
    }
    w.eval(SCRIPT);
    if (w.document.readyState === 'loading') {
        await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
    }
    const el = w.document.querySelector('#modale-info-indicative');
    const bouton = () => w.document.querySelector('#cgu-accepted');
    return {
        w, signalements, evenements, majMembre, horloge,
        affichee: () => !!(el && el.classList.contains('show')),
        cliquer: () => bouton().click(),
        cliquerCgu: () => w.document.querySelector('.cgu-modale_link').dispatchEvent(
            new w.MouseEvent('click', { bubbles: true, cancelable: true })),
        quitter: () => w.dispatchEvent(new w.Event('pagehide')),
        // Bouton à l'écran ; `recouvre(x)` dit ce qu'il y a au point x (0..1 de sa largeur).
        poserBouton: (recouvre) => {
            bouton().getBoundingClientRect = () => ({ left: 100, width: 400, top: 600, height: 44, bottom: 644 });
            w.innerHeight = 800;
            w.document.elementFromPoint = (x) => recouvre((x - 100) / 400);
        },
        controlerAccessibilite: () => minuteries.filter((m) => m.ms === 3000).forEach((m) => m.fn()),
    };
}

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

    // 7. 🔴 Bouton entièrement recouvert 3 s après l'ouverture : signalé.
    p = await P();
    const crisp = p.w.document.querySelector('#crisp');
    p.poserBouton(() => crisp);
    p.controlerAccessibilite();
    verifier('bouton entièrement recouvert : signalé' + suffixe, !r || (p.signalements.length === 1
        && /recouvert par div#crisp\.crisp-bulle/.test(p.signalements[0][1])));

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

    // 11. Membre connecté, acceptation récente côté Memberstack seulement.
    p = await P({ membre: { id: 'mem_test', json: { 'cgu-accepted-date': new Date(T0 - 5 * JOUR).toISOString() } } });
    verifier('membre ayant accepté (Memberstack) : cachée' + suffixe, !p.affichee());

    // 12. Membre connecté sans acceptation : le clic met Memberstack à jour.
    p = await P({ membre: { id: 'mem_test', json: {} } });
    verifier('membre sans acceptation : affichée' + suffixe, p.affichee());
    p.cliquer();
    verifier('membre : clic ferme la fenêtre' + suffixe, !p.affichee());
    verifier('membre : date envoyée à Memberstack' + suffixe,
        p.majMembre.length === 1 && !!p.majMembre[0].json['cgu-accepted-date']);

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
