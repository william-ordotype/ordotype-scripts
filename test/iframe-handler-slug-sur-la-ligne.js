#!/usr/bin/env node
/**
 * Pathologie : une ligne de liste rendue sans l'embed caché `.iframe-meta`,
 * mais avec `data-iframe-slug` / `data-collection-slug` sur la ligne elle-même,
 * s'ouvre quand même dans l'iframe de l'onglet.
 *
 * Vérifie aussi que :
 *  - une ligne qui a déjà l'embed n'est pas touchée (même nœud, aucun ajout) ;
 *  - avec le paywall affiché, la ligne sans embed montre le paywall au clic
 *    (les attributs de la ligne sont retirés par init, il faut les avoir lus
 *    avant) ;
 *  - une ligne sans embed ni attributs reste signalée comme cassée, comme avant ;
 *  - le préchargement au `mousedown` marche aussi sur la ligne sans embed.
 *
 * jQuery est simulé : seules les méthodes appelées par le script existent.
 *
 * Usage : node test/iframe-handler-slug-sur-la-ligne.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pathology', 'iframe-handler.js'), 'utf8');
const ORIGINE = 'https://www.ordotype.fr';

function html(paywall) {
    return `<!doctype html><html><body>
  <div class="rappels-cliniques-content">
    <div class="rc_hidden_warning_wrapper" style="display:${paywall ? 'block' : 'none'}">Réservé aux abonnés</div>
  </div>
  <div class="pathologies_tab">
    <div class="w-tab-pane" data-w-tab="Traitements">
      <div class="pathologies_tab_col-left">
        <div class="w-dyn-list">
          <div id="ligne" class="content-item" data-collection-slug="ordonnances-types" data-iframe-slug="ligne-seule" data-iframe-id="iframe_traitements">
            <div class="content-item_name">Ligne seule</div><img class="tab_right-icon"><div class="loading-spinner"></div>
          </div>
          <div id="embed" class="content-item" data-collection-slug="ordonnances-types" data-iframe-slug="avec-embed" data-iframe-id="iframe_traitements">
            <div class="w-embed w-iframe"><div class="iframe-meta" style="display: none;" data-iframe-slug="avec-embed" data-collection-slug="ordonnances-types"></div></div>
            <a href="/ordonnances-types/avec-embed" class="content-item_name">Avec embed</a><img class="tab_right-icon"><div class="loading-spinner"></div>
          </div>
          <div id="vide" class="content-item" data-iframe-id="iframe_traitements">
            <div class="content-item_name">Sans rien</div><img class="tab_right-icon"><div class="loading-spinner"></div>
          </div>
          <div id="perso" class="content-item"><div class="content-item_name">Liste personnelle</div></div>
        </div>
      </div>
      <div class="pathologies_tab_col-right"><iframe id="iframe_traitements"></iframe></div>
    </div>
  </div>
</body></html>`;
}

function fabriquerJQuery(w) {
    const enNoeuds = (x) => (typeof x === 'string' ? [] : Array.from({ length: x.length }, (_, i) => x[i]));
    function envelopper(els) {
        const api = {
            length: els.length,
            find(sel) { return envelopper(els.flatMap((el) => Array.from(el.querySelectorAll(sel)))); },
            first() { return envelopper(els.slice(0, 1)); },
            text() { return els.map((el) => el.textContent).join(''); },
            hide() { els.forEach((el) => { el.style.display = 'none'; }); return api; },
            show() { els.forEach((el) => { el.style.display = ''; }); return api; },
            css(prop, val) {
                if (val === undefined) return els[0] ? (els[0].style[prop] || w.getComputedStyle(els[0])[prop]) : undefined;
                els.forEach((el) => { el.style[prop] = val; });
                return api;
            },
            attr(nom, val) {
                if (val === undefined) return els[0] ? els[0].getAttribute(nom) : undefined;
                els.forEach((el) => el.setAttribute(nom, val));
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
        if (typeof x === 'string') return envelopper(Array.from(w.document.querySelectorAll(x)));
        if (x && typeof x.find === 'function') return x;
        return envelopper(x ? [x] : []);
    };
}

function monter({ paywall }) {
    const erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(html(paywall), { url: ORIGINE + '/pathologies/test', runScripts: 'outside-only', virtualConsole: vc });
    const w = dom.window;
    const signalements = [];
    w.OrdoErrorReporter = { report: (contexte, message) => signalements.push(message) };
    w.jQuery = w.$ = fabriquerJQuery(w);
    w.pathologyId = 'patho-1';
    const metaProd = w.document.querySelector('#embed .iframe-meta');
    const embedAvant = w.document.getElementById('embed').innerHTML;
    w.eval(SRC);
    return { w, d: w.document, signalements, erreurs, metaProd, embedAvant };
}

function cliquer(w, id, type) {
    const el = w.document.getElementById(id);
    const ev = new w.MouseEvent(type || 'click', { bubbles: true, cancelable: true, button: 0 });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
}

const cas = [];
function verifier(nom, obtenu, attendu) {
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    cas.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
}

// Abonné, ligne sans embed : l'ordonnance s'ouvre dans l'iframe.
{
    const { w, d, signalements, erreurs } = monter({ paywall: false });
    const meta = d.querySelectorAll('#ligne .iframe-meta');
    verifier('ligne sans embed : un .iframe-meta reconstruit', meta.length, 1);
    verifier('ligne sans embed : slugs recopiés',
        [meta[0] && meta[0].getAttribute('data-iframe-slug'), meta[0] && meta[0].getAttribute('data-collection-slug')],
        ['ligne-seule', 'ordonnances-types']);
    verifier('ligne sans embed : reconstruit invisible', meta[0] && meta[0].style.display, 'none');
    const annule = cliquer(w, 'ligne');
    verifier('ligne sans embed : clic pris en charge (preventDefault)', annule, true);
    verifier('ligne sans embed : iframe chargée', d.getElementById('iframe_traitements').getAttribute('src'),
        ORIGINE + '/ordonnances-types/ligne-seule');
    verifier('ligne sans embed : ligne active', d.getElementById('ligne').classList.contains('is-active'), true);
    verifier('ligne sans embed : aucun signalement', signalements, []);
    verifier('ligne sans embed : aucune erreur', erreurs, []);
    w.close();
}

// Ligne avec embed (forme actuelle des fiches) : rien n'est modifié.
{
    const { w, d, signalements, metaProd, embedAvant } = monter({ paywall: false });
    verifier('ligne avec embed : même nœud .iframe-meta', d.querySelector('#embed .iframe-meta') === metaProd, true);
    verifier('ligne avec embed : un seul .iframe-meta', d.querySelectorAll('#embed .iframe-meta').length, 1);
    verifier('ligne avec embed : contenu identique', d.getElementById('embed').innerHTML, embedAvant);
    cliquer(w, 'embed');
    verifier('ligne avec embed : iframe chargée', d.getElementById('iframe_traitements').getAttribute('src'),
        ORIGINE + '/ordonnances-types/avec-embed');
    verifier('ligne avec embed : aucun signalement', signalements, []);
    w.close();
}

// Ligne sans embed ni attributs : toujours signalée comme cassée.
{
    const { w, d, signalements } = monter({ paywall: false });
    verifier('ligne vide : rien de reconstruit', d.querySelectorAll('#vide .iframe-meta').length, 0);
    verifier('liste personnelle : rien de reconstruit', d.querySelectorAll('#perso .iframe-meta').length, 0);
    const annule = cliquer(w, 'vide');
    verifier('ligne vide : clic laissé au lien (pas de preventDefault)', annule, false);
    verifier('ligne vide : iframe non chargée', d.getElementById('iframe_traitements').getAttribute('src'), null);
    verifier('ligne vide : un signalement', signalements, ['.iframe-meta not found inside content-item (plain click fell back to link navigation)']);
    w.close();
}

// Paywall affiché : init retire les attributs de la ligne, le clic montre le paywall.
{
    const { w, d, signalements } = monter({ paywall: true });
    verifier('paywall : attributs retirés de la ligne', d.getElementById('ligne').hasAttribute('data-iframe-slug'), false);
    verifier('paywall : .iframe-meta reconstruit avant le retrait', d.querySelectorAll('#ligne .iframe-meta').length, 1);
    cliquer(w, 'ligne');
    const titre = d.querySelector('.pathologies_tab_col-right .job-post-title-ordo-display');
    verifier('paywall : titre de la ligne affiché sur le paywall', titre && titre.textContent.trim(), 'Ligne seule');
    verifier('paywall : iframe non chargée', d.getElementById('iframe_traitements').getAttribute('src'), null);
    verifier('paywall : aucun signalement', signalements, []);
    w.close();
}

// Préchargement au mousedown sur la ligne sans embed.
{
    const { w, d } = monter({ paywall: false });
    cliquer(w, 'ligne', 'mousedown');
    verifier('mousedown : iframe préchargée', d.getElementById('iframe_traitements').getAttribute('src'),
        ORIGINE + '/ordonnances-types/ligne-seule');
    w.close();
}

const echecs = cas.filter((ok) => !ok).length;
console.log(`\n${cas.length - echecs}/${cas.length} vérifications passées`);
process.exit(echecs ? 1 : 0);
