#!/usr/bin/env node
/**
 * Fiche pathologie : les classes renommées dans le Designer (format Client-First, novembre 2026)
 * restent lues sous les deux noms par les scripts de la fiche, le temps de la transition
 * (le Sandbox garde les anciens noms tant qu'il n'est pas aligné sur la prod).
 *
 * Règle vérifiée : dans pathology/*.js et pathology/styles.css, toute chaîne ou liste de
 * sélecteurs qui cite un ancien nom cite aussi le sélecteur équivalent avec le nouveau nom,
 * et tout élément créé par script (className) porte les deux noms.
 *
 * Usage : node test/fiche-classes-deux-noms.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NOMS = {
    'pathologies_tab': 'pathologie_tabs', 'pathologies_tab_col-left': 'pathologie_tab-col-left',
    'pathologies_tab_col-right': 'pathologie_tab-col-right', 'pat_tabs-link': 'pathologie_tab-link',
    'sb_holder': 'subnav_holder', 'premium-content-component': 'paywall_component',
    'rc_hidden_warning_wrapper': 'paywall_warning-wrapper', 'rc_premium_hidden_warning': 'paywall_warning',
    'rappels-cliniques-content': 'rappels-cliniques_content', 'rc-wrapper': 'rappels-cliniques_wrapper',
    'redac-and-ref': 'sources_component', 'sources-internal-grid': 'sources_grid', 'sources-div': 'sources_column',
    'sources-collection-list-wrapper': 'sources_list', 'collection-list': 'sources_collection',
    'collection-item-11': 'sources_item', 'author-bio-text-block': 'sources_author-bio',
    'auteur-ref-html': 'sources_author-html', 'tooltip-ipp-block-wrapper': 'tooltip-ipp_wrapper',
    'tooltip-ipp-popup': 'tooltip-ipp_popup',
};
const ANCIEN = new RegExp('\\.(' + Object.keys(NOMS).sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[-]/g, '\\-')).join('|') + ')(?![\\w-])', 'g');
const nouveau = (sel) => sel.replace(ANCIEN, (m, n) => '.' + NOMS[n]);

let failed = 0;
function check(label, ok, detail) {
    console.log((ok ? '  OK  ' : '  KO  ') + label + (ok ? '' : ' -> ' + detail));
    if (!ok) failed++;
}

const dir = path.join(ROOT, 'pathology');
for (const f of fs.readdirSync(dir).filter((x) => /\.(js|css)$/.test(x))) {
    let src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const listes = [];
    if (f.endsWith('.css')) {
        src.replace(/([^{}@;]+)\{/g, (m, prelude) => { listes.push(prelude); return m; });
    } else {
        src = src.replace(/^\s*\/\/.*$/gm, '');
        src.replace(/(['"])(\.[^'"\n]*?)\1/g, (m, q, s) => { listes.push(s); return m; });
        src.replace(/className\s*=\s*(['"])([\w -]+)\1/g, (m, q, s) => {
            const noms = s.split(/\s+/);
            noms.filter((n) => NOMS[n]).forEach((n) =>
                check(`${f} : élément créé avec « ${n} » porte aussi « ${NOMS[n]} »`, noms.includes(NOMS[n]), s));
            return m;
        });
    }
    for (const liste of listes) {
        const sels = liste.split(',').map((s) => s.trim()).filter(Boolean);
        for (const s of sels.filter((x) => ANCIEN.test(x))) {
            ANCIEN.lastIndex = 0;
            check(`${f} : « ${s.slice(0, 70)} » a son double`, sels.includes(nouveau(s)), nouveau(s));
        }
        ANCIEN.lastIndex = 0;
    }
}

console.log(failed ? `\n${failed} échec(s)` : '\ntout est bon');
process.exit(failed ? 1 : 0);
