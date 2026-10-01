#!/usr/bin/env node
/**
 * Pathologie : préchargement des pages d'ordonnance et de conseil patient.
 *
 * Vérifie :
 *  - au repos après le chargement, les MAX_PAR_ONGLET premières lignes affichées de
 *    l'onglet ouvert sont préchargées, dans l'ordre, jamais plus de 2 à la fois ;
 *  - les lignes masquées (onglet inactif, sous-onglet inactif, condition Webflow)
 *    et les lignes sans adresse sont ignorées ;
 *  - l'ouverture d'un autre onglet précharge ses lignes, sans redemander les autres ;
 *  - la ligne survolée ou touchée passe en tête de file ;
 *  - rien quand le paywall est affiché ; seulement le survol en économie de données ;
 *  - un échec de téléchargement ne bloque pas la file ;
 *  - quand le navigateur sait faire <link rel="prefetch">, c'est ce qui est utilisé.
 *
 * Usage : node test/pathology-prefetch.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pathology', 'prefetch.js'), 'utf8');

const ligne = (slug, extra = '') => `<div role="listitem" class="w-dyn-item${extra}"><div class="content-item" data-iframe-id="iframe_traitements" data-collection-slug="ordonnances-types" data-iframe-slug="${slug}">`
    + `<div class="w-embed"><div class="iframe-meta" style="display:none" data-iframe-slug="${slug}" data-collection-slug="ordonnances-types"></div></div>`
    + `<div class="content-item_name">${slug}</div></div></div>`;

function html({ paywall = false } = {}) {
    const a = Array.from({ length: 10 }, (_, i) => ligne(`a${i + 1}`)).join('');
    return `<!doctype html><html><head></head><body>
  <div class="rappels-cliniques-content"><div class="rc_hidden_warning_wrapper" style="display:${paywall ? 'block' : 'none'}"></div></div>
  <div class="pathologies_tab w-tabs">
    <div class="w-tab-menu"><a id="lienA" class="w-tab-link w--current" data-w-tab="A">A</a><a id="lienB" class="w-tab-link" data-w-tab="B">B</a></div>
    <div class="w-tab-content">
      <div id="paneA" class="w-tab-pane w--tab-active" data-w-tab="A">
        <div class="w-dyn-list"><div class="w-dyn-items">
          ${ligne('cachee', ' w-condition-invisible')}
          <div class="w-dyn-item"><div class="content-item" data-iframe-id="iframe_traitements"><div class="content-item_name">sans adresse</div></div></div>
          ${a}
        </div></div>
        <div class="w-tabs"><div class="w-tab-content"><div class="w-tab-pane" data-w-tab="sous">${ligne('sous1')}</div></div></div>
      </div>
      <div id="paneB" class="w-tab-pane" data-w-tab="B">${ligne('b1')}${ligne('b2')}${ligne('b3')}</div>
    </div>
  </div>
</body></html>`;
}

function monter({ paywall = false, saveData = false, prefetchNatif = false, echec = [] } = {}) {
    const erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(html({ paywall }), { url: 'https://www.ordotype.fr/pathologies/test', runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
    const w = dom.window;
    const demandes = [];
    let enVol = 0, maxEnVol = 0;
    const enAttente = [];
    w.fetch = (url) => {
        demandes.push(url.replace('https://www.ordotype.fr/ordonnances-types/', ''));
        enVol++; maxEnVol = Math.max(maxEnVol, enVol);
        return new Promise((resolve, reject) => enAttente.push(() => {
            enVol--;
            if (echec.some((s) => url.endsWith('/' + s))) reject(new Error('réseau')); else resolve({ text: () => Promise.resolve('') });
        }));
    };
    w.DOMTokenList.prototype.supports = () => prefetchNatif;
    if (saveData) Object.defineProperty(w.navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } });
    w.requestIdleCallback = (fn) => setTimeout(fn, 0);
    w.console.log = () => {};
    w.eval(SRC);
    const liberer = async () => { while (enAttente.length) { enAttente.shift()(); await new Promise((r) => setTimeout(r, 0)); } };
    return { w, d: w.document, demandes, erreurs, liberer, maxEnVol: () => maxEnVol };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const cas = [];
function verifier(nom, obtenu, attendu) {
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    cas.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
}
const survoler = (c, slug) => c.d.querySelector(`.content-item[data-iframe-slug="${slug}"] .content-item_name`).dispatchEvent(new c.w.MouseEvent('mouseover', { bubbles: true }));
async function ouvrirOngletB(c) {
    c.d.getElementById('paneA').classList.remove('w--tab-active');
    c.d.getElementById('paneB').classList.add('w--tab-active');
    c.d.getElementById('lienB').dispatchEvent(new c.w.MouseEvent('click', { bubbles: true }));
    await attendre(350);
}

(async () => {
    {
        const c = monter();
        await attendre(20);
        verifier('au repos : 2 téléchargements lancés à la fois', c.demandes, ['a1', 'a2']);
        await c.liberer();
        verifier('au repos : les 8 premières lignes affichées, dans l\'ordre', c.demandes, ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
        verifier('jamais plus de 2 à la fois', c.maxEnVol(), 2);
        verifier('lignes masquées et sans adresse ignorées', c.demandes.some((s) => ['cachee', 'sous1', 'b1'].includes(s)), false);
        survoler(c, 'a3'); survoler(c, 'a9'); await c.liberer();
        verifier('survol : ligne déjà demandée non redemandée, ligne nouvelle ajoutée', c.demandes.slice(8), ['a9']);
        await ouvrirOngletB(c); await c.liberer();
        verifier('autre onglet ouvert : ses lignes sont préchargées', c.demandes.slice(9), ['b1', 'b2', 'b3']);
        await ouvrirOngletB(c); await c.liberer();
        verifier('rouvrir l\'onglet : rien de redemandé', c.demandes.length, 12);
        verifier('aucune erreur', c.erreurs, []);
    }
    {
        const c = monter();
        await attendre(20);                 // a1, a2 en vol ; a3..a8 en file
        survoler(c, 'a10');
        await c.liberer();
        verifier('ligne survolée placée en tête de file', c.demandes.slice(0, 3), ['a1', 'a2', 'a10']);
    }
    {
        const c = monter({ paywall: true });
        await attendre(20); survoler(c, 'a1'); await c.liberer();
        verifier('paywall affiché : rien n\'est préchargé', c.demandes, []);
    }
    {
        const c = monter({ saveData: true });
        await attendre(20); await c.liberer();
        verifier('économie de données : pas de préchargement d\'onglet', c.demandes, []);
        survoler(c, 'a4'); await c.liberer();
        verifier('économie de données : la ligne survolée l\'est quand même', c.demandes, ['a4']);
    }
    {
        const c = monter({ echec: ['a1', 'a2'] });
        await attendre(20); await c.liberer();
        verifier('un échec ne bloque pas la file', c.demandes.length, 8);
        verifier('un échec ne produit pas d\'erreur', c.erreurs, []);
    }
    {
        const c = monter({ prefetchNatif: true });
        await attendre(20);
        const liens = () => Array.from(c.d.querySelectorAll('head link[rel="prefetch"]')).map((l) => l.getAttribute('href').replace('https://www.ordotype.fr/ordonnances-types/', ''));
        verifier('prefetch natif : 2 liens posés à la fois', liens(), ['a1', 'a2']);
        c.d.querySelectorAll('head link[rel="prefetch"]').forEach((l) => l.dispatchEvent(new c.w.Event('load')));
        await attendre(5);
        verifier('prefetch natif : la file avance au chargement des liens', liens().length, 4);
        verifier('prefetch natif : fetch n\'est pas utilisé', c.demandes, []);
    }
    const echecs = cas.filter((ok) => !ok).length;
    console.log(`\n${cas.length - echecs}/${cas.length} vérifications passées`);
    process.exit(echecs ? 1 : 0);
})();
