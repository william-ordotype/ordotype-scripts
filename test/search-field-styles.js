#!/usr/bin/env node
/**
 * Champ de recherche : même dessin partout, avec les couleurs du design system.
 *
 * Trois feuilles dessinent le champ :
 *   - le Designer : barre de navigation sur ordinateur et tablette (combo
 *     search-bar + nav-bar-size, embed .html-reset-button-navbar) ; global-styles.css
 *     n'en garde que la croix masquée quand le champ est vide ;
 *   - le Designer : panneau de la loupe sur téléphone (composant Navbar, classes
 *     search-panel_*) ; search-panel.js n'en garde que la logique ;
 *   - le Designer : en-tête de /search-result sur téléphone ; search-result/styles.css
 *     n'en garde que la marge de page (:has()), la croix masquée champ vide et
 *     la taille de la flèche.
 *
 * Ce qui doit tenir dans les trois :
 *   - blanc, contour --base-200 au repos, --primary-500 pendant la saisie ;
 *   - texte --base-900, invite et croix --base-500, rayon de 4px ;
 *   - croix masquée tant que le champ est vide (:placeholder-shown) ;
 *   - aucune couleur écrite en dur, hors repli d'une variable et du blanc.
 * Le rendu réel (centrage de la croix, géométrie) est vérifié en navigateur.
 *
 * Usage : node test/search-field-styles.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failed = 0;
function check(label, ok, detail) {
    console.log((ok ? '  OK  ' : '  KO  ') + label + (ok ? '' : ' -> ' + detail));
    if (!ok) failed++;
}

// Règles CSS à plat (les @media sont dépliées), lues par le CSSOM de jsdom.
function rules(css) {
    const dom = new JSDOM('<style>' + css + '</style>');
    const out = [];
    (function walk(list) {
        for (const r of list) {
            if (r.selectorText) out.push(r);
            if (r.cssRules && r.cssRules.length) walk(r.cssRules); // @media (une règle simple a une liste vide)
        }
    })(dom.window.document.styleSheets[0].cssRules);
    return out;
}
function decl(rs, selector, prop) {
    const hit = rs.filter((r) => r.selectorText.split(',').map((s) => s.trim()).includes(selector));
    return hit.length ? hit[hit.length - 1].style.getPropertyValue(prop) : '';
}
// Couleurs écrites en dur : tout #hex ou rgb() hors repli de var(), sauf le blanc.
function hardColors(cssText) {
    const sansReplis = cssText.replace(/var\(--[\w-]+\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*\)/g, 'var()');
    return (sansReplis.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []).filter((c) => !/^#fff(fff)?$/i.test(c) && c.replace(/\s/g, '') !== 'rgb(255,255,255)');
}
const white = (v) => /^(#fff(fff)?|rgb\(255, 255, 255\))$/i.test(String(v).trim());
const uses = (value, token) => new RegExp('var\\(--' + token + '\\b').test(value);

// --- Barre de navigation (ordinateur, tablette)
console.log('barre de navigation : dessin dans le Designer, shared/global-styles.css garde la logique seule');
{
    // Le dessin du champ de la barre (combo search-bar + nav-bar-size, états Focus et
    // Placeholder, classe html-reset-button-navbar, croix de l'embed Navbar) vit dans
    // le Designer depuis le 08/10/2026 : le canvas doit montrer le vrai rendu. Une
    // règle ici le surchargerait en silence (vérifié en navigateur sur le site servi).
    const css = read('shared/global-styles.css');
    const rs = rules(css);
    check('croix masquée tant que le champ est vide (le Designer ne sait pas l’exprimer)',
        decl(rs, '#search-bar-nav:placeholder-shown + .html-reset-button-navbar', 'display') === 'none', 'règle absente');
    const dessin = rs.filter((r) => /search-bar\.nav-bar-size|\.html-reset-button-navbar(?![^,]*:placeholder-shown)/.test(r.selectorText) &&
        !/:placeholder-shown/.test(r.selectorText));
    check('aucun dessin du champ ni de la croix hors Designer', dessin.length === 0, dessin.map((r) => r.selectorText).join(' | '));
    check('pas de croix dessinée en fond (elle est dans l’embed)', !/data:image\/svg\+xml/.test(css), 'fond data-URI présent');
}

// --- Panneau de la loupe (téléphone)
console.log('panneau mobile : dessin dans le Designer, shared/search-panel.js garde la logique seule');
{
    // Le panneau est un élément du Designer (composant Navbar, classes search-panel_*)
    // depuis le 08/10/2026 : couleurs, bordure, tailles s'y règlent. La CSS injectée
    // ne garde que ce que le Designer ne sait pas exprimer.
    const src = read('shared/search-panel.js');
    const m = src.match(/var CSS =([\s\S]*?);\n/);
    const css = m ? new Function('return (' + m[1] + ');')() : '';
    check('CSS du panneau trouvée', css.length > 0, 'var CSS introuvable');
    const rs = rules(css);
    check('croix masquée tant que le champ est vide',
        rs.some((r) => /\.search-panel_input:placeholder-shown\s*\+\s*\.search-panel_clear/.test(r.selectorText) && r.style.display === 'none'), 'règle absente');
    const permis = /:placeholder-shown|appearance|overscroll|focus-visible|#search-results/;
    const dessin = rs.filter((r) => /search-panel_/.test(r.selectorText) && !permis.test(r.selectorText + r.style.cssText));
    check('aucun dessin du panneau hors Designer', dessin.length === 0, dessin.map((r) => r.selectorText).join(' | '));
    check('panneau pris dans le Designer, plus construit par le script', /querySelector\("\.search-panel_component"\)/.test(src) && !/createElement\("div"\)/.test(src),
        'le script construit encore le panneau');
    check('invite « Rechercher », comme sur ordinateur', /input\.placeholder = "Rechercher"/.test(src), 'texte de l’invite');
    const sansListe = css.replace(/html\.ot-search-open #search-results[^}]*\}/g, '');
    check('aucune couleur en dur', hardColors(sansListe).length === 0, hardColors(sansListe).join(' '));
}

// --- /search-result (téléphone)
console.log('/search-result mobile : dessin dans le Designer, search-result/styles.css garde la logique seule');
{
    const css = read('search-result/styles.css');
    const rs = rules(css);
    check('croix masquée tant que le champ est vide (le Designer ne sait pas l’exprimer)',
        rs.some((r) => /#search-bar-main:placeholder-shown\s*\+\s*\.search-nav\s+\.main-reset-button/.test(r.selectorText) && r.style.display === 'none'),
        rs.map((r) => r.selectorText).join(' | '));
    check('flèche ramenée à 22px (image sans classe)', decl(rs, '.search-block-results .search-back-button img', 'width') === '22px', 'règle absente');
    check('marge de page reprise par l’en-tête (:has(), absent du Designer)', rs.some((r) => /\.padding-global:has\(\.search-block-results\)/.test(r.selectorText)), 'règle absente');
    const dessin = rs.filter((r) => !/:placeholder-shown/.test(r.selectorText) && !/search-back-button img/.test(r.selectorText) && !/:has\(/.test(r.selectorText));
    check('aucun autre dessin de l’en-tête hors Designer', dessin.length === 0, dessin.map((r) => r.selectorText).join(' | '));
    check('aucune couleur en dur', hardColors(css).length === 0, hardColors(css).join(' '));
}

console.log(failed ? '\n' + failed + ' échec(s)' : '\ntout est bon');
process.exit(failed ? 1 : 0);
