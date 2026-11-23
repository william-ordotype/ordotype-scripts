#!/usr/bin/env node
/**
 * Chargeurs de la fiche, de l'ordonnance, du conseil patient et de l'accueil :
 * leurs scripts viennent de la même adresse jsDelivr que le chargeur lui-même.
 *
 * Si cdn.jsdelivr.net tombe, le plan de sauvetage bascule les balises des
 * chargeurs sur fastly.jsdelivr.net (mêmes fichiers). Avant ce test, les
 * chargeurs avaient cdn.jsdelivr.net écrit en dur : leurs scripts (bouton
 * Copier, ouverture des ordonnances…) restaient en panne après la bascule.
 * Une origine qui n'est pas jsDelivr retombe sur cdn.jsdelivr.net.
 *
 * Usage : node test/loader-host-jsdelivr.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CHARGEURS = ['pathology/loader.js', 'ordonnances/loader.js', 'conseils-patients/loader.js', 'homepage/loader.js'];
const CAS = [
    { origine: 'https://cdn.jsdelivr.net', attendu: 'https://cdn.jsdelivr.net' },
    { origine: 'https://fastly.jsdelivr.net', attendu: 'https://fastly.jsdelivr.net' },
    { origine: 'https://gcore.jsdelivr.net', attendu: 'https://gcore.jsdelivr.net' },
    { origine: 'https://exemple.org', attendu: 'https://cdn.jsdelivr.net' },
];

let echecs = 0;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    for (const fichier of CHARGEURS) {
        const code = fs.readFileSync(path.join(ROOT, fichier), 'utf8');
        for (const { origine, attendu } of CAS) {
            const balise = `${origine}/gh/william-ordotype/ordotype-scripts@abc1234/${fichier}`;
            const dom = new JSDOM(`<!doctype html><html><head><script src="${balise}"></script></head><body></body></html>`, {
                url: 'https://www.ordotype.fr/pathologies/angine-2',
                runScripts: 'outside-only',
                virtualConsole: new VirtualConsole(),
            });
            const w = dom.window;
            const vus = [];
            const origCreate = w.document.createElement.bind(w.document);
            w.document.createElement = (tag, ...rest) => {
                const el = origCreate(tag, ...rest);
                if (String(tag).toLowerCase() === 'script' || String(tag).toLowerCase() === 'link') {
                    const garde = (url) => { if (url) vus.push(String(url)); };
                    const proto = Object.getPrototypeOf(el);
                    for (const prop of ['src', 'href']) {
                        const desc = Object.getOwnPropertyDescriptor(proto, prop);
                        if (!desc) continue;
                        Object.defineProperty(el, prop, {
                            configurable: true,
                            get() { return desc.get.call(this); },
                            set(v) { garde(v); desc.set.call(this, v); },
                        });
                    }
                }
                return el;
            };
            try { w.eval(code); } catch (e) { /* une erreur après l'injection ne change pas le verdict */ }
            await attendre(30);
            const depot = vus.filter((u) => u.includes('/gh/william-ordotype/ordotype-scripts@'));
            const mauvais = depot.filter((u) => !u.startsWith(attendu + '/'));
            const ok = depot.length > 0 && mauvais.length === 0;
            if (!ok) echecs++;
            console.log(`${ok ? 'ok  ' : 'ÉCHEC'} ${fichier} servi par ${origine} : ${depot.length} script(s)` +
                (mauvais.length ? `, dont ${mauvais.length} ailleurs que ${attendu} (${mauvais[0]})` : depot.length ? '' : ', aucun script chargé'));
            w.close();
        }
    }
    if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
    console.log('\nTous les chargeurs suivent leur adresse jsDelivr.');
})();
