#!/usr/bin/env node
/**
 * Pathologie : une iframe hors des onglets (ajoutée par un script tiers) ne
 * fait pas planter le gestionnaire de chargement, et une iframe d'onglet envoie
 * toujours `iframeLoaded` avec le bon type.
 *
 * jQuery est simulé : seules les méthodes appelées par le script existent.
 *
 * Usage : node test/iframe-handler-hors-onglet.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pathology', 'iframe-handler.js'), 'utf8');

const HTML = `<!doctype html><html><body>
  <iframe id="tiers" src="about:blank"></iframe>
  <div class="pathologies_tab">
    <div class="loading-spinner"></div>
    <div class="w-tab-pane" data-w-tab="Conseil patient">
      <div class="pathologies_tab_col-right">
        <iframe id="iframe_conseils-patient" src="about:blank"></iframe>
      </div>
    </div>
    <div class="w-tab-pane" data-w-tab="Traitements">
      <div class="pathologies_tab_col-right">
        <iframe id="iframe_traitements" src="about:blank"></iframe>
      </div>
    </div>
  </div>
</body></html>`;

function monter() {
    const erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(HTML, { url: 'https://www.ordotype.fr/pathologies/test', runScripts: 'outside-only', virtualConsole: vc });
    const w = dom.window;
    const appels = { spinnerCache: 0, envois: [] };

    const $ = (sel) => {
        const els = typeof sel === 'string' ? Array.from(w.document.querySelectorAll(sel)) : [sel];
        const api = {
            length: els.length,
            0: els[0],
            ready(fn) { fn(); return api; },
            on(type, fn) { els.forEach((el) => el.addEventListener(type, (ev) => fn(ev))); return api; },
            click() { return api; },
            css() { return undefined; },
            hide() { if (sel === '.pathologies_tab .loading-spinner') appels.spinnerCache++; return api; },
            show() { return api; },
            removeClass() { return api; },
            slideToggle() { return api; },
        };
        return api;
    };
    w.jQuery = w.$ = $;
    w.pathologyId = 'patho-1';

    // `about:blank` a une autre origine : on intercepte l'envoi pour le compter.
    w.eval(SRC.replace(
        'var iframeOrigin = new URL(iframe.src).origin;',
        'window.__envoi(data); var iframeOrigin = new URL(iframe.src).origin;'
    ));
    w.__envoi = (data) => appels.envois.push(data);
    return { w, appels, erreurs };
}

const cas = [];
function verifier(nom, obtenu, attendu) {
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    cas.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
}

{
    const { w, appels, erreurs } = monter();
    w.document.getElementById('tiers').dispatchEvent(new w.Event('load'));
    verifier('iframe hors onglet : aucune erreur', erreurs, []);
    verifier('iframe hors onglet : spinner des onglets intact', appels.spinnerCache, 0);
    verifier('iframe hors onglet : rien envoyé', appels.envois.length, 0);
    verifier('iframe hors onglet : pas marquée chargée', w.document.getElementById('tiers').dataset.loaded, undefined);
}

{
    const { w, appels, erreurs } = monter();
    w.document.getElementById('iframe_conseils-patient').dispatchEvent(new w.Event('load'));
    w.document.getElementById('iframe_traitements').dispatchEvent(new w.Event('load'));
    verifier('iframes d\'onglet : aucune erreur', erreurs, []);
    verifier('iframes d\'onglet : spinner caché', appels.spinnerCache, 2);
    verifier('iframes d\'onglet : types envoyés', appels.envois.map((d) => d.prescriptionType), ['recommendation', 'prescription']);
    verifier('iframes d\'onglet : marquées chargées', w.document.getElementById('iframe_traitements').dataset.loaded, '1');
}

const ko = cas.filter((c) => !c).length;
console.log(ko ? `\n${ko} échec(s)` : `\n${cas.length} vérifications OK`);
process.exitCode = ko ? 1 : 0;
