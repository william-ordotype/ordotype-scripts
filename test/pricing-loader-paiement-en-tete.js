#!/usr/bin/env node
/**
 * Chargeurs de /nos-offres (pricing/) et /nos-offres-v2 (pricing-v2/) : tout est
 * demandé en même temps, s'exécute dans l'ordre, et le paiement passe en tête
 * (juste après memberstack-utils et error-reporter). Il n'attend donc plus le
 * téléchargement des scripts d'onglets ou de page de retour, qui passaient
 * avant lui un par un. Un fichier en erreur est sauté, les suivants tournent, et
 * l'échec est signalé une fois la file finie.
 *
 * Le navigateur est simulé comme dans test/loader-resilience.js : un script
 * `async = false` s'exécute dans l'ordre d'insertion dès que lui et ceux d'avant
 * sont arrivés, un script en erreur est retiré de la file. Horloge virtuelle.
 *
 * Usage : node test/pricing-loader-paiement-en-tete.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/';

const CHARGEURS = {
  pricing: {
    fichier: 'pricing/loader.js',
    ordre: ['shared/memberstack-utils.js', 'shared/error-reporter.js', 'pricing/stripe-checkout.js',
      'pricing/core.js', 'pricing/hash-tabs.js', 'pricing/tabs-bg.js', 'pricing/ga4-events.js'],
  },
  'pricing-v2': {
    fichier: 'pricing-v2/loader.js',
    ordre: ['shared/memberstack-utils.js', 'shared/error-reporter.js', 'pricing-v2/stripe-checkout.js',
      'pricing-v2/core.js', 'pricing-v2/tabs-bg.js'],
  },
};

// reseau[nom] = { issue: 'ok' | 'erreur', delai } ; 10 ms et 'ok' par défaut.
async function rejouer(cle, reseau = {}) {
  const def = CHARGEURS[cle];
  const dom = new JSDOM('<!doctype html><head></head><body></body>', {
    url: 'https://www.ordotype.fr/nos-offres', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  w.console.log = () => {};
  w.console.error = () => {};
  let maintenant = 0;
  let numero = 0;
  const minuteries = new Map();
  w.setTimeout = (fn, ms) => { numero += 1; minuteries.set(numero, { quand: maintenant + (ms || 0), fn, n: numero }); return numero; };

  const ajouts = [];
  const executions = [];
  const rapports = [];
  const file = [];
  function vider() {
    while (file.length && file[0].etat !== 'attente') {
      const tete = file.shift();
      if (tete.etat === 'erreur') { if (tete.el.onerror) tete.el.onerror(); continue; }
      executions.push({ n: tete.n, t: maintenant });
      if (tete.n === 'shared/error-reporter.js') {
        w.OrdoErrorReporter = { reportNetwork: (ctx, err) => rapports.push(`${ctx}: ${err.message}`) };
      }
      if (tete.el.onload) tete.el.onload();
    }
  }
  w.document.head.appendChild = (el) => {
    const n = el.src.startsWith(BASE) ? el.src.slice(BASE.length) : el.src;
    const { issue = 'ok', delai = 10 } = reseau[n] || {};
    ajouts.push({ n, t: maintenant, async: el.async });
    const entree = { el, n, etat: 'attente' };
    file.push(entree);
    w.setTimeout(() => { entree.etat = issue === 'erreur' ? 'erreur' : 'pret'; vider(); }, delai);
    return el;
  };

  w.eval(lire(def.fichier));
  for (;;) {
    await new Promise((r) => setImmediate(r));
    const prochaine = [...minuteries.values()].sort((a, b) => a.quand - b.quand || a.n - b.n)[0];
    if (!prochaine) break;
    minuteries.delete(prochaine.n);
    maintenant = Math.max(maintenant, prochaine.quand);
    prochaine.fn();
  }
  w.close();
  const instant = (n) => (executions.find((e) => e.n === n) || {}).t;
  return { def, ajouts, executions: executions.map((e) => e.n), rapports, instant };
}

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test('bloc de file identique à celui des autres chargeurs (homepage/loader.js)', async () => {
  const bloc = (src) => src.slice(src.indexOf('// --- Loader queue'), src.indexOf('// --- End of loader queue ---'));
  const reference = bloc(lire('homepage/loader.js'));
  assert.ok(reference.length > 100);
  for (const def of Object.values(CHARGEURS)) assert.strictEqual(bloc(lire(def.fichier)), reference, def.fichier);
});

for (const cle of Object.keys(CHARGEURS)) {
  test(`${cle} : tout est demandé d'un coup, en async = false, et s'exécute dans l'ordre`, async () => {
    const r = await rejouer(cle);
    assert.deepStrictEqual(r.ajouts.map((a) => a.n), r.def.ordre);
    assert.ok(r.ajouts.every((a) => a.t === 0), 'tous demandés à t = 0');
    assert.ok(r.ajouts.every((a) => a.async === false), 'async = false');
    assert.deepStrictEqual(r.executions, r.def.ordre);
    assert.deepStrictEqual(r.rapports, []);
  });

  test(`${cle} : le paiement n'attend pas les scripts lents qui viennent après lui`, async () => {
    const lents = {};
    for (const n of r_apres(cle)) lents[n] = { delai: 800 };
    const r = await rejouer(cle, lents);
    const paiement = r.def.ordre[2];
    assert.strictEqual(r.instant(paiement), 10, `paiement exécuté à ${r.instant(paiement)} ms`);
    assert.deepStrictEqual(r.executions, r.def.ordre);
  });

  test(`${cle} : un script après le paiement en erreur → sauté, les autres tournent, un rapport`, async () => {
    const cible = r_apres(cle)[0];
    const r = await rejouer(cle, { [cible]: { issue: 'erreur' } });
    assert.deepStrictEqual(r.executions, CHARGEURS[cle].ordre.filter((n) => n !== cible));
    assert.strictEqual(r.rapports.length, 1);
    assert.ok(r.rapports[0].includes(cible), r.rapports[0]);
  });

  test(`${cle} : error-reporter en erreur → le paiement tourne quand même`, async () => {
    const r = await rejouer(cle, { 'shared/error-reporter.js': { issue: 'erreur' } });
    assert.ok(r.executions.includes(CHARGEURS[cle].ordre[2]));
    assert.strictEqual(r.executions.length, CHARGEURS[cle].ordre.length - 1);
  });
}

function r_apres(cle) {
  return CHARGEURS[cle].ordre.slice(3);
}

(async () => {
  let ko = 0;
  for (const { nom, fn } of cas) {
    try {
      await fn();
      console.log(`ok   ${nom}`);
    } catch (e) {
      ko += 1;
      console.log(`FAIL ${nom}\n     ${e.message}`);
    }
  }
  console.log(`\n${cas.length - ko}/${cas.length} cas passent`);
  process.exit(ko ? 1 : 0);
})();
