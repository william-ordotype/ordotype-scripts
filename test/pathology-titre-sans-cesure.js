#!/usr/bin/env node
/**
 * Fiches : césure automatique réservée aux cellules de tableau.
 *
 * Sur téléphone, hyphens: auto sur le titre de la fiche (#206) coupait des
 * mots ordinaires pour remplir la ligne (« Contraceptions fé- / minines »,
 * « d'orien- / tation »). Ce qui doit tenir dans pathology/styles.css :
 *   - titre (.path_header .heading-style-h1) sous 480px : hyphens: manual et
 *     overflow-wrap: anywhere (un mot plus large que l'écran est coupé au
 *     bord, sans faire déborder la page) ;
 *   - hyphens: auto seulement sur les cellules de tableau (td, th), plus le
 *     repli du titre pour les navigateurs sans overflow-wrap: anywhere ;
 *   - les cellules de tableau gardent leur césure (téléphone et tablette).
 * Le rendu réel (lignes, débordement) est vérifié en navigateur.
 *
 * Usage : node test/pathology-titre-sans-cesure.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'pathology/styles.css'), 'utf8');

let failed = 0;
function check(label, ok, detail) {
    console.log((ok ? '  OK  ' : '  KO  ') + label + (ok ? '' : ' -> ' + detail));
    if (!ok) failed++;
}

// Règles à plat avec leur contexte (@media, @supports), lues par le CSSOM de jsdom.
function rules(text) {
    const dom = new JSDOM('<style>' + text + '</style>');
    const out = [];
    (function walk(list, ctx) {
        for (const r of list) {
            if (r.selectorText) out.push({ sel: r.selectorText, ctx, decl: r.style.cssText });
            const cond = r.media ? '@media ' + r.media.mediaText : r.conditionText ? '@supports ' + r.conditionText : null;
            if (r.cssRules && r.cssRules.length) walk(r.cssRules, cond ? ctx.concat(cond) : ctx);
        }
    })(dom.window.document.styleSheets[0].cssRules, []);
    return out;
}
// Dernière valeur d'une propriété dans le texte d'une règle (les doublons de repli comptent).
function last(decl, prop) {
    const m = decl.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g'));
    return m ? m[m.length - 1].replace(/^[;\s]*[\w-]+\s*:\s*/, '').trim() : '';
}

const rs = rules(css);
const TITRE = '.path_header .heading-style-h1';
const telephone = (r) => r.ctx.some((c) => /max-width:\s*479px/.test(c));
const repli = (r) => r.ctx.some((c) => /@supports\s+not\s*\(\s*overflow-wrap:\s*anywhere\s*\)/.test(c));

console.log('Titre de fiche sur téléphone : pas de césure automatique');
{
    const titre = rs.filter((r) => r.sel.split(',').map((s) => s.trim()).includes(TITRE) && telephone(r) && !repli(r));
    check('règle du titre présente sous 480px', titre.length > 0, 'règle absente');
    const t = titre[titre.length - 1] || { decl: '' };
    check('hyphens: manual', last(t.decl, 'hyphens') === 'manual', 'hyphens = ' + last(t.decl, 'hyphens'));
    // Le CSSOM de jsdom écarte les propriétés préfixées : lecture dans le texte du bloc.
    const bloc = (css.match(/@media only screen and \(max-width: 479px\)\s*\{\s*\.path_header \.heading-style-h1\s*\{([^}]*)\}/) || [])[1] || '';
    check('-webkit-hyphens: manual (Safari)', last(bloc, '-webkit-hyphens') === 'manual', '-webkit-hyphens = ' + last(bloc, '-webkit-hyphens'));
    check('overflow-wrap: anywhere (compte dans la largeur minimale du titre)', last(t.decl, 'overflow-wrap') === 'anywhere', 'overflow-wrap = ' + last(t.decl, 'overflow-wrap'));
    const r = rs.filter((x) => x.sel.split(',').map((s) => s.trim()).includes(TITRE) && repli(x));
    check('repli : césure gardée sans overflow-wrap: anywhere', r.length > 0 && last(r[0].decl, 'hyphens') === 'auto', 'règle de repli absente');
}

console.log('hyphens: auto réservé aux cellules de tableau');
{
    const auto = rs.filter((r) => /(^|;)\s*(-webkit-)?hyphens\s*:\s*auto/.test(r.decl) && !repli(r));
    const horsTableau = auto.filter((r) => !r.sel.split(',').every((s) => /\b(td|th)\s*$/.test(s.trim())));
    check('aucune autre règle en hyphens: auto', horsTableau.length === 0, horsTableau.map((r) => r.sel).join(' | '));
    const cellules = auto.filter((r) => /\.rc-html td/.test(r.sel) && /\.rc-html th/.test(r.sel));
    check('cellules de tableau : césure sur téléphone et tablette (2 règles)', cellules.length === 2, cellules.length + ' règle(s)');
}

console.log(failed ? '\n' + failed + ' échec(s)' : '\ntout est bon');
process.exit(failed ? 1 : 0);
