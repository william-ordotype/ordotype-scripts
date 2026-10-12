#!/usr/bin/env node
/**
 * Fenêtre CGU de l'accueil (#modale-info-indicative) : quand elle s'affiche,
 * et qu'elle se ferme toujours.
 *
 * Elle couvre toute la page : affichée sans son bouton « J'ai compris », rien
 * ne pourrait la fermer. Le script doit alors la laisser cachée et le signaler.
 *
 * Usage : node test/cgu-modal.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '..', 'homepage/cgu-modal.js'), 'utf8');
const JOUR = 24 * 60 * 60 * 1000;

// Fenêtre telle que posée dans le Designer.
const BOUTON = '<a id="cgu-accepted" href="#" class="button"><div>J’ai compris</div></a>';
const fenetre = (bouton = BOUTON) => '<div id="modale-info-indicative" ms-code-element-temporary="block"'
    + ' class="cgu-modale_component"><div class="cgu-modale_card"><p>Texte</p>' + bouton + '</div></div>';

/** Page chargée, script exécuté (il attend DOMContentLoaded). */
async function page({ corps = fenetre(), stockage = {}, membre = null, stockageInterdit = false } = {}) {
    const dom = new JSDOM(`<!doctype html><body>${corps}</body>`, {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const signalements = [];
    const majMembre = [];
    w.OrdoErrorReporter = { report: (contexte, err) => signalements.push([contexte, String(err && err.message)]) };
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
    return {
        w, signalements, majMembre,
        affichee: () => !!(el && el.classList.contains('show')),
        cliquer: () => w.document.querySelector('#cgu-accepted').click(),
    };
}

let echecs = 0;
function verifier(nom, ok) {
    console.log(`${ok ? '✓' : '✗'} ${nom}`);
    if (!ok) echecs += 1;
}

(async () => {
    // 1. Première visite : la fenêtre s'affiche et le bouton la ferme.
    let p = await page();
    verifier('première visite : affichée', p.affichee());
    p.cliquer();
    verifier('clic sur « J’ai compris » : fermée', !p.affichee());
    verifier('clic : date enregistrée', !!p.w.localStorage.getItem('cgu-accepted-date'));
    verifier('cas normal : aucun signalement', p.signalements.length === 0);

    // 2. Acceptée il y a 10 jours : rien.
    p = await page({ stockage: { 'cgu-accepted-date': new Date(Date.now() - 10 * JOUR).toISOString() } });
    verifier('acceptée il y a 10 jours : cachée', !p.affichee());

    // 3. Acceptée il y a 100 jours : de nouveau.
    p = await page({ stockage: { 'cgu-accepted-date': new Date(Date.now() - 100 * JOUR).toISOString() } });
    verifier('acceptée il y a 100 jours : affichée', p.affichee());

    // 4. Membre connecté, acceptation récente côté Memberstack seulement.
    const recente = new Date(Date.now() - 5 * JOUR).toISOString();
    p = await page({ membre: { id: 'mem_test', json: { 'cgu-accepted-date': recente } } });
    verifier('membre ayant accepté (Memberstack) : cachée', !p.affichee());

    // 5. Membre connecté sans acceptation : le clic met Memberstack à jour.
    p = await page({ membre: { id: 'mem_test', json: {} } });
    verifier('membre sans acceptation : affichée', p.affichee());
    p.cliquer();
    verifier('membre : clic ferme la fenêtre', !p.affichee());
    verifier('membre : date envoyée à Memberstack',
        p.majMembre.length === 1 && !!p.majMembre[0].json['cgu-accepted-date']);

    // 6. Stockage interdit (cookies bloqués) : affichée, et le clic ferme quand même.
    p = await page({ stockageInterdit: true });
    verifier('stockage interdit : affichée', p.affichee());
    p.cliquer();
    verifier('stockage interdit : le clic ferme', !p.affichee());

    // 7. 🔴 Bouton disparu du Designer : jamais affichée, et signalé.
    p = await page({ corps: fenetre('') });
    verifier('sans bouton : fenêtre NON affichée', !p.affichee());
    verifier('sans bouton : signalé une fois',
        p.signalements.length === 1 && p.signalements[0][0] === 'CGUModal');

    // 8. Bloc retiré de la page (ni fenêtre ni bouton) : silence.
    p = await page({ corps: '<p>accueil</p>' });
    verifier('bloc retiré : aucun signalement', p.signalements.length === 0);

    await new Promise((r) => setTimeout(r, 10));
    if (echecs) {
        console.error(`\n${echecs} échec(s)`);
        process.exit(1);
    }
    console.log('\nTous les cas passent.');
})();
