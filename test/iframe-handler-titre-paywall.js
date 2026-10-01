#!/usr/bin/env node
/**
 * Pathologie : le titre posé sur le paywall au clic reprend le nom de la ligne
 * comme du TEXTE. Un nom qui contient « < » suivi d'une lettre, ou du balisage,
 * s'affiche tel quel : aucune balise n'est créée, rien n'est interprété.
 *
 * Trois noms, en bureau et en mobile :
 *  - « < » suivi d'un espace (forme courante des noms) ;
 *  - « < » collé à une lettre, que l'ancien code prenait pour une balise ;
 *  - du balisage complet (image avec gestionnaire d'erreur).
 *
 * jQuery est simulé : seules les méthodes appelées par le script existent.
 *
 * Usage : node test/iframe-handler-titre-paywall.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pathology', 'iframe-handler.js'), 'utf8');

const NOMS = [
    'Diabète - Glargine objectif < 7 % - 1 mois',
    'Diabète - Glargine objectif <HbA1c> 7 % - 1 mois',
    'Diabète <img src=x onerror="window.__execute = true">',
];

const HTML = `<!doctype html><html><body>
  <div class="rappels-cliniques-content">
    <div class="rc_hidden_warning_wrapper" style="display:block">Réservé aux abonnés</div>
  </div>
  <div class="pathologies_tab">
    <div class="w-tab-pane" data-w-tab="Traitements">
      <div class="pathologies_tab_col-left">
        <div class="w-dyn-list"><div role="list" class="w-dyn-items">
          <div role="listitem" class="w-dyn-item">
            <div id="ligne" class="content-item" data-collection-slug="ordonnances-types" data-iframe-slug="ordo" data-iframe-id="iframe_traitements">
              <div class="w-embed w-iframe"><div class="iframe-meta" style="display: none;" data-iframe-slug="ordo" data-collection-slug="ordonnances-types"></div></div>
              <a href="/ordonnances-types/ordo" class="content-item_name">à remplacer</a>
              <img class="tab_right-icon"><div class="loading-spinner"></div>
            </div>
          </div>
        </div></div>
      </div>
      <div class="pathologies_tab_col-right"><iframe id="iframe_traitements"></iframe></div>
    </div>
  </div>
</body></html>`;

function fabriquerJQuery(w) {
    const enNoeuds = (x) => {
        if (typeof x === 'string') return [];
        if (x && x.nodeType) return [x];
        return Array.from({ length: x.length }, (_, i) => x[i]);
    };
    function envelopper(els) {
        const api = {
            length: els.length,
            find(sel) { return envelopper(els.flatMap((el) => Array.from(el.querySelectorAll(sel)))); },
            first() { return envelopper(els.slice(0, 1)); },
            text(val) {
                if (val === undefined) return els.map((el) => el.textContent).join('');
                els.forEach((el) => { el.textContent = val; });
                return api;
            },
            hide() { els.forEach((el) => { el.style.display = 'none'; }); return api; },
            show() { els.forEach((el) => { el.style.display = ''; }); return api; },
            css(prop, val) {
                if (val === undefined) return els[0] ? (els[0].style[prop] || w.getComputedStyle(els[0])[prop]) : undefined;
                els.forEach((el) => { el.style[prop] = val; });
                return api;
            },
            removeAttr(nom) { els.forEach((el) => el.removeAttribute(nom)); return api; },
            addClass(c) { els.forEach((el) => el.classList.add(c)); return api; },
            removeClass(c) { els.forEach((el) => el.classList.remove(c)); return api; },
            append(x) { els.forEach((el) => enNoeuds(x).forEach((n) => el.appendChild(n))); return api; },
            prepend(x) {
                els.forEach((el) => {
                    if (typeof x === 'string') el.insertAdjacentHTML('afterbegin', x);
                    else enNoeuds(x).forEach((n) => el.insertBefore(n, el.firstChild));
                });
                return api;
            },
            after(x) { els.forEach((el) => enNoeuds(x).forEach((n) => el.after(n))); return api; },
            clone() { return envelopper(els.map((el) => el.cloneNode(true))); },
            next(sel) { return envelopper(els.map((el) => el.nextElementSibling).filter((n) => n && (!sel || n.matches(sel)))); },
            parent() { return envelopper(els.map((el) => el.parentElement).filter(Boolean)); },
            remove() { els.forEach((el) => el.remove()); return api; },
            on(type, fn) { els.forEach((el) => el.addEventListener(type, fn)); return api; },
            click(fn) { if (fn) els.forEach((el) => el.addEventListener('click', fn)); return api; },
            ready(fn) { fn(); return api; },
            slideToggle() { return api; },
        };
        els.forEach((el, i) => { api[i] = el; });
        return api;
    }
    return (x) => {
        if (typeof x === 'string' && x.trim().startsWith('<')) {
            const boite = w.document.createElement('div');
            boite.innerHTML = x.trim();
            return envelopper(Array.from(boite.children));
        }
        if (typeof x === 'string') return envelopper(Array.from(w.document.querySelectorAll(x)));
        if (x && typeof x.find === 'function') return x;
        return envelopper(x ? [x] : []);
    };
}

function monter(nom, mobile) {
    const erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(HTML, { url: 'https://www.ordotype.fr/pathologies/test', runScripts: 'outside-only', virtualConsole: vc });
    const w = dom.window;
    if (mobile) Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
    w.document.querySelector('#ligne .content-item_name').textContent = nom;
    w.OrdoErrorReporter = { report() {} };
    w.jQuery = w.$ = fabriquerJQuery(w);
    w.eval(SRC);
    return { w, d: w.document, erreurs };
}

const cas = [];
function verifier(nom, obtenu, attendu) {
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    cas.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
}

for (const mobile of [false, true]) {
    const ecran = mobile ? 'mobile' : 'bureau';
    NOMS.forEach((nom, i) => {
        const { w, d, erreurs } = monter(nom, mobile);
        w.document.getElementById('ligne').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
        const titres = d.querySelectorAll('.job-post-title-ordo-display');
        const titre = titres[titres.length - 1];
        verifier(`${ecran}, nom ${i + 1} : un titre posé`, titres.length, 1);
        verifier(`${ecran}, nom ${i + 1} : texte identique au nom`, titre && titre.textContent, nom);
        verifier(`${ecran}, nom ${i + 1} : aucune balise dans le titre`, titre && titre.children.length, 0);
        verifier(`${ecran}, nom ${i + 1} : aucune image créée hors de la ligne`,
            Array.from(d.querySelectorAll('img')).filter((im) => !im.classList.contains('tab_right-icon')).length, 0);
        if (mobile) {
            const sous = d.getElementById('ligne').nextElementSibling;
            verifier(`${ecran}, nom ${i + 1} : paywall posé sous la ligne`, !!(sous && sous.classList.contains('rc_hidden_warning_wrapper')), true);
        }
        verifier(`${ecran}, nom ${i + 1} : aucune erreur`, erreurs, []);
        w.close();
    });
}

const echecs = cas.filter((ok) => !ok).length;
console.log(`\n${cas.length - echecs}/${cas.length} vérifications passées`);
process.exit(echecs ? 1 : 0);
