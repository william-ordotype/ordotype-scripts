#!/usr/bin/env node
/**
 * Champ de recherche : même dessin partout, avec les couleurs du design system.
 *
 * Trois feuilles dessinent le champ :
 *   - shared/global-styles.css : barre de navigation sur ordinateur et tablette
 *     (classes Webflow search-bar + nav-bar-size, embed .html-reset-button-navbar) ;
 *   - shared/search-panel.js : panneau de la loupe sur téléphone (CSS en chaîne) ;
 *   - search-result/styles.css : en-tête de /search-result sur téléphone.
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
console.log('barre de navigation : shared/global-styles.css');
{
    const css = read('shared/global-styles.css');
    const rs = rules(css);
    const champ = '.search-bar.nav-bar-size';
    check('contour --base-200 au repos', uses(decl(rs, champ, 'border-color'), 'base-200'), decl(rs, champ, 'border-color'));
    check('contour --primary-500 pendant la saisie', uses(decl(rs, champ + ':focus', 'border-color'), 'primary-500'), decl(rs, champ + ':focus', 'border-color'));
    check('fond blanc', white(decl(rs, champ, 'background-color')), decl(rs, champ, 'background-color'));
    check('texte --base-900', uses(decl(rs, champ, 'color'), 'base-900'), decl(rs, champ, 'color'));
    check('invite --base-500', uses(decl(rs, champ + '::placeholder', 'color'), 'base-500'), decl(rs, champ + '::placeholder', 'color'));
    check('loupe grise du site', /6464fa4d45e5736b95f15198_search\.svg/.test(decl(rs, champ, 'background-image')), decl(rs, champ, 'background-image'));
    check('croix masquée tant que le champ est vide',
        decl(rs, '#search-bar-nav:placeholder-shown + .html-reset-button-navbar', 'display') === 'none', 'règle absente');
    check('croix centrée sur le champ', decl(rs, '.html-reset-button-navbar', 'top') === '50%' &&
        /translateY\(-50%\)/.test(decl(rs, '.html-reset-button-navbar', 'transform')), decl(rs, '.html-reset-button-navbar', 'transform'));
    check('croix cerclée, trait --base-500 (#0C0E16 à 50 %)', /%230C0E16' stroke-opacity='\.5'/.test(css), 'dessin de la croix');
    const bloc = rs.filter((r) => /search-bar\.nav-bar-size|reset-button-navbar/.test(r.selectorText)).map((r) => r.cssText).join('\n');
    check('aucune couleur en dur dans le dessin du champ', hardColors(bloc).length === 0, hardColors(bloc).join(' '));
}

// --- Panneau de la loupe (téléphone)
console.log('panneau mobile : shared/search-panel.js');
{
    const src = read('shared/search-panel.js');
    const m = src.match(/var CSS =([\s\S]*?);\n/);
    const css = m ? new Function('return (' + m[1] + ');')() : '';
    check('CSS du panneau trouvée', css.length > 0, 'var CSS introuvable');
    const rs = rules(css);
    check('contour --base-200 au repos', uses(decl(rs, '.ot-search-form', 'box-shadow'), 'base-200'), decl(rs, '.ot-search-form', 'box-shadow'));
    check('contour --primary-500 pendant la saisie', uses(decl(rs, '.ot-search-form:focus-within', 'box-shadow'), 'primary-500'),
        decl(rs, '.ot-search-form:focus-within', 'box-shadow'));
    check('fond blanc', white(decl(rs, '.ot-search-form', 'background')) || white(decl(rs, '.ot-search-form', 'background-color')),
        decl(rs, '.ot-search-form', 'background'));
    check('rayon de 4px', decl(rs, '.ot-search-form', 'border-radius') === '4px', decl(rs, '.ot-search-form', 'border-radius'));
    check('texte --base-900', uses(decl(rs, '.ot-search-panel .ot-search-input', 'color'), 'base-900'), decl(rs, '.ot-search-panel .ot-search-input', 'color'));
    check('invite --base-500', uses(decl(rs, '.ot-search-panel .ot-search-input::placeholder', 'color'), 'base-500'), 'règle absente');
    check('croix --base-500', uses(decl(rs, '.ot-search-clear', 'color'), 'base-500'), decl(rs, '.ot-search-clear', 'color'));
    check('loupe pleine (trait --base-500 de l’image)', !decl(rs, '.ot-search-icon', 'opacity'), decl(rs, '.ot-search-icon', 'opacity'));
    check('invite « Rechercher », comme sur ordinateur', /input\.placeholder = "Rechercher"/.test(src), 'texte de l’invite');
    const sansFond = css.replace(/\.ot-search-panel\.is-open\{[^}]*\}/, ''); // le fond blanc plein écran du panneau
    check('aucune couleur en dur', hardColors(sansFond).length === 0, hardColors(sansFond).join(' '));
}

// --- /search-result (téléphone)
console.log('/search-result mobile : search-result/styles.css');
{
    const css = read('search-result/styles.css');
    const rs = rules(css);
    const w = '.search-block-results .search-form-wrapper';
    check('contour --base-200 au repos', uses(decl(rs, w, 'box-shadow'), 'base-200'), decl(rs, w, 'box-shadow'));
    check('contour --primary-500 pendant la saisie', uses(decl(rs, w + ':focus-within', 'box-shadow'), 'primary-500'), decl(rs, w + ':focus-within', 'box-shadow'));
    check('fond blanc', white(decl(rs, w, 'background')) || white(decl(rs, w, 'background-color')), decl(rs, w, 'background'));
    check('rayon de 4px', decl(rs, w, 'border-radius') === '4px', decl(rs, w, 'border-radius'));
    check('texte --base-900', uses(decl(rs, '.search-block-results #search-bar-main', 'color'), 'base-900'), 'couleur du texte');
    check('invite --base-500', uses(decl(rs, '.search-block-results #search-bar-main::placeholder', 'color'), 'base-500'), 'couleur de l’invite');
    check('croix --base-500', uses(decl(rs, '.search-block-results .main-reset-button', 'color'), 'base-500'), 'couleur de la croix');
    check('aucune couleur en dur', hardColors(css).length === 0, hardColors(css).join(' '));
}

console.log(failed ? '\n' + failed + ' échec(s)' : '\ntout est bon');
process.exit(failed ? 1 : 0);
