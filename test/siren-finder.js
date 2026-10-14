#!/usr/bin/env node
/**
 * SIREN de facturation électronique dans « Mon profil » (account/siren-finder.js), avec la vraie
 * structure de la page (test/fixtures/compte-profil-securite.html) et profile-overview.js chargé
 * après lui, comme le fait le chargeur. Le serveur (siren-search, siren-select) est simulé.
 *
 * Deux présentations, mêmes comportements : « designer » (la page publiée, classes reprises des
 * gabarits « finder-… » du Designer) et « ancienne » (la même page sans ces gabarits : classes et
 * feuille de style du script).
 *
 * Usage : node test/siren-finder.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FINDER = fs.readFileSync(path.join(ROOT, 'account/siren-finder.js'), 'utf8');
const OVERVIEW = fs.readFileSync(path.join(ROOT, 'account/profile-overview.js'), 'utf8');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-profil-securite.html'), 'utf8');
const SEARCH = 'https://webhooks.ordotype.fr/.netlify/functions/siren-search';
const SELECT = 'https://webhooks.ordotype.fr/.netlify/functions/siren-select';

function luhn(s) {
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    t += d;
  }
  return t % 10 === 0;
}
function withLuhn(base) {
  for (let k = 0; k <= 9; k++) if (luhn(base + k)) return base + k;
  throw new Error('no key');
}
const SIREN = withLuhn('12345678');
const SIREN2 = withLuhn('98765432');

const MEMBRE = {
  id: 'mem_test_1',
  auth: { email: 'claire.martin@exemple.fr' },
  customFields: { prnom: 'Claire', nom: 'Martin', statut: 'Medecin', specialite: 'Médecine générale', 'zip-code': '75011', siret: '' },
  metaData: {}
};
const CABINET = { siren: SIREN, siret: SIREN + '00011', nom: 'CLAIRE MARTIN', libelle_activite: 'Activité des médecins généralistes', code_postal: '75011', commune: 'PARIS', etat: 'A' };
const AUTRE = { siren: SIREN2, nom: 'CABINET DUPONT', libelle_activite: 'Activité des médecins généralistes', code_postal: '75011', commune: 'PARIS', etat: 'A' };
const clone = (o) => JSON.parse(JSON.stringify(o));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

function reply(status, body) {
  return Promise.resolve({ ok: status < 400, status, headers: { get: () => null }, json: () => Promise.resolve(body) });
}

let MODE = 'designer';

/** La page d'avant le Designer : aucun gabarit de recherche, cellule SIRET sans sa combo. */
function sansDesigner(d) {
  const g = d.querySelector('[data-ordo-gabarit="finder"]');
  const groupe = g && g.closest('.compte-v2_gabarits-groupe');
  if (groupe) groupe.remove();
  const cell = d.querySelector('.is-pleine-largeur');
  if (cell) cell.classList.remove('is-pleine-largeur');
}

/**
 * search : (params) => réponse de siren-search (params = query string décodée).
 * select : (body) => réponse de siren-select.
 */
async function page({ member = MEMBRE, overview = true, search, select, mode = MODE, avant } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const SITE_CSS = '.compte-v2_wrap{display:none}.compte-v2_edit{display:none}.compte-v2_edit.is-open{display:block}'
    + '.w-form-done,.w-form-fail{display:none}';
  const dom = new JSDOM(`<!doctype html><html><head><style>${SITE_CSS}</style></head><body><div class="w-tabs">${FIXTURE}</div></body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  if (mode === 'ancienne') sansDesigner(w.document);
  if (avant) avant(w.document);
  const calls = [];
  const pushed = [];
  const reports = [];
  w.dataLayer = [];
  w.dataLayer.push = (p) => { pushed.push(p); return 0; };
  w.OrdoErrorReporter = { report: (ctx, err) => reports.push({ ctx, message: err && err.message }) };
  const m = clone(member);
  w.OrdoAccount = { member: m };
  w.OrdoMemberstack = { member: m, customFields: m.customFields };
  w.localStorage.setItem('_ms-mem', JSON.stringify({ id: m.id, customFields: clone(m.customFields), metaData: {} }));
  w.$memberstackDom = {
    getMemberCookie: () => Promise.resolve('jeton-test'),
    getCurrentMember: () => Promise.resolve({ data: clone(w.OrdoAccount.member) })
  };
  w.fetch = (url, opts) => {
    if (url.indexOf(SEARCH) === 0) {
      const params = Object.fromEntries(new URL(url).searchParams);
      calls.push({ api: 'search', params });
      return search ? search(params) : reply(200, { results: [], total: 0 });
    }
    if (url === SELECT) {
      const body = JSON.parse(opts.body);
      calls.push({ api: 'select', body, headers: opts.headers });
      return select ? select(body) : Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.reject(new TypeError('Failed to fetch'));
  };
  w.console.log = () => {};
  w.console.warn = () => {};
  w.eval(FINDER);
  if (overview) w.eval(OVERVIEW);
  if (w.document.readyState === 'loading') await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  await settle();
  const d = w.document;
  const root = d.querySelector('[data-ordo-finder="siren"]');
  return { w, d, root, calls, pushed, reports, erreurs, member: m };
}

const byText = (scope, sel, re) => [...scope.querySelectorAll(sel)].find((b) => re.test(b.textContent));
const shown = (node) => !!node && !node.hidden && node.style.display !== 'none';
// Recherche par nom renvoyant le cabinet, suggestion vide (première requête de la page).
const nameSearch = (list = [CABINET], total = list.length) => (p) => reply(200, p.mode === 'name' ? { results: list, total } : { results: [] });

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    console.error(`✗ [${MODE}] ${name}\n  ${e.stack}`);
    process.exit(1);
  }
}

(async () => {
  for (const mode of ['designer', 'ancienne']) {
    MODE = mode;

    await test('vide, code postal connu : recherche lancée au chargement, liste avec « C’est moi »', async () => {
      const { root, calls, erreurs } = await page({ search: nameSearch([CABINET, AUTRE], 12) });
      assert.deepStrictEqual(erreurs, []);
      assert.ok(root && shown(root), 'bloc affiché');
      const inputs = root.querySelectorAll('input');
      assert.strictEqual(inputs[0].value, 'Claire Martin');
      assert.strictEqual(inputs[1].value, '75011');
      assert.deepStrictEqual(calls.map((c) => c.params.mode), ['suggest', 'name']);
      const items = root.querySelectorAll('ul > li');
      assert.strictEqual(items.length, 2);
      assert.ok(items[0].querySelector('span').textContent.startsWith('CLAIRE MARTIN, SIREN '));
      assert.ok(byText(items[0], 'button', /C'est moi/));
      assert.ok(/12 résultats, seuls les 2 premiers/.test(root.textContent));
      assert.ok(byText(root, 'button', /Je ne trouve pas mon entreprise/));
    });

    await test('« C’est moi » : écriture serveur, champ SIRET, instantané, encadré « renseigné »', async () => {
      const { w, d, root, calls } = await page({
        search: nameSearch(),
        select: () => reply(200, { siren: SIREN, siret: CABINET.siret, name: 'CLAIRE MARTIN', commune: 'PARIS', source: 'search', name_match: 'yes', stripe: 'ok' })
      });
      byText(root, 'button', /C'est moi/).click();
      await settle();
      const sel = calls.find((c) => c.api === 'select');
      assert.strictEqual(sel.headers.Authorization, 'Bearer jeton-test');
      assert.strictEqual(sel.body.siren, SIREN);
      assert.strictEqual(d.getElementById('SIRET').value, CABINET.siret);
      assert.strictEqual(JSON.parse(w.localStorage.getItem('_ms-mem')).customFields.siret, CABINET.siret);
      assert.ok(/Vos factures électroniques seront adressées au SIREN/.test(root.textContent));
      assert.ok(byText(root, 'button', /Modifier/));
    });

    await test('numéro saisi : contrôle de validité, carte et « Confirmer »', async () => {
      const { d, root, calls } = await page({ search: (p) => reply(200, p.mode === 'number' ? { results: [CABINET] } : { results: [] }) });
      const num = root.querySelectorAll('input')[2];
      const check = byText(root, 'button', /^Vérifier$/);
      num.value = SIREN.slice(0, 8) + String((Number(SIREN[8]) + 1) % 10);
      num.dispatchEvent(new d.defaultView.Event('input'));
      assert.ok(check.disabled, 'clé fausse : bouton inactif');
      assert.ok(/contrôle de validité/.test(root.textContent));
      num.value = SIREN;
      num.dispatchEvent(new d.defaultView.Event('input'));
      assert.ok(!check.disabled);
      assert.ok(!/contrôle de validité/.test(root.textContent), 'numéro corrigé : message retiré');
      assert.strictEqual(root.querySelectorAll('[data-ordo-message]').length, 0);
      check.click();
      await settle();
      assert.ok(calls.some((c) => c.params && c.params.mode === 'number' && c.params.n === SIREN));
      assert.ok(byText(root, 'button', /^Confirmer$/), 'carte avec confirmation');
      assert.ok(/\(active\)/.test(root.textContent));
    });

    await test('nom de la fiche différent : alerte dans la carte', async () => {
      const { d, root } = await page({ search: (p) => reply(200, p.mode === 'number' ? { results: [AUTRE] } : { results: [] }) });
      const num = root.querySelectorAll('input')[2];
      num.value = SIREN2;
      num.dispatchEvent(new d.defaultView.Event('input'));
      byText(root, 'button', /^Vérifier$/).click();
      await settle();
      const alerte = root.querySelector('[data-ordo-message="alerte"]');
      assert.ok(alerte && /Ce numéro correspond à « CABINET DUPONT »/.test(alerte.textContent));
    });

    await test('recherche demandée en panne : message d’erreur, pas de signalement (503 attendu)', async () => {
      const { root, reports } = await page({ search: (p) => (p.mode === 'name' ? reply(400, { error: 'invalid_query' }) : reply(200, { results: [] })) });
      byText(root, 'button', /^Rechercher$/).click();
      await settle();
      const msg = root.querySelector('[data-ordo-message="erreur"]');
      assert.ok(msg && /Recherche impossible avec ces critères/.test(msg.textContent));
      assert.deepStrictEqual(reports, []);
    });

    await test('déjà renseigné : encadré « renseigné », « Modifier » rouvre la recherche', async () => {
      const m = clone(MEMBRE);
      m.customFields.siret = SIREN;
      m.metaData = { 'siren-name': 'CLAIRE MARTIN' };
      const { root, calls } = await page({ member: m });
      assert.ok(/SIREN \d{3} \d{3} \d{3} \(CLAIRE MARTIN\)/.test(root.textContent));
      assert.strictEqual(calls.length, 0, 'aucune recherche');
      byText(root, 'button', /Modifier/).click();
      assert.ok(byText(root, 'button', /^Rechercher$/));
    });

    await test('interne : bloc et cellule masqués', async () => {
      const m = clone(MEMBRE);
      m.customFields.statut = 'Interne';
      const { d, root, calls } = await page({ member: m, overview: false });
      assert.ok(!shown(root));
      assert.strictEqual(d.getElementById('SIRET').parentNode.style.display, 'none');
      assert.strictEqual(calls.length, 0, 'aucune requête SIRENE sans intention');
    });

    await test('nouvelle présentation : le finder est dans sa carte', async () => {
      const { d, root } = await page({ search: nameSearch() });
      assert.strictEqual(root.parentNode, d.querySelector('[data-ordo-siren-slot]'));
    });

    await test('sans la nouvelle présentation : sous le champ SIRET, bandeau d’accueil affiché', async () => {
      const { d, root } = await page({ overview: false, search: nameSearch() });
      assert.strictEqual(root.parentNode, d.getElementById('SIRET').parentNode);
      assert.ok(/Vos factures électroniques ont besoin de votre SIREN/.test(root.textContent));
    });
  }

  MODE = 'designer';

  await test('[designer] classes reprises des gabarits du Designer, aucune feuille injectée, aucun style en ligne', async () => {
    const { d, root } = await page({
      search: (p) => reply(200, p.mode === 'number' ? { results: [CABINET] } : p.mode === 'name' ? { results: [CABINET, AUTRE], total: 2 } : { results: [] })
    });
    assert.strictEqual(d.getElementById('ordo-siren-styles'), null);
    assert.strictEqual(root.className, 'compte-v2_finder is-en-carte', 'variante « carte » du Designer');
    assert.strictEqual(root.querySelector('[data-ordo-finder-bandeau]'), null, 'dans la carte : pas de bandeau');
    const inputs = root.querySelectorAll('input');
    assert.strictEqual(inputs[0].className, 'form-input is-finder-champ w-input');
    assert.strictEqual(inputs[1].className, 'form-input is-finder-champ is-finder-cp w-input');
    assert.strictEqual(inputs[2].className, 'form-input is-finder-champ w-input', 'champ numéro aussi');
    assert.strictEqual(inputs[0].parentNode.className, 'compte-v2_finder-ligne');
    assert.strictEqual(byText(root, 'button', /^Rechercher$/).className, 'button is-gradient w-button');
    assert.strictEqual(root.querySelector('ul').className, 'compte-v2_finder-liste');
    const li = root.querySelector('ul > li');
    assert.strictEqual(li.className, 'compte-v2_finder-item');
    assert.strictEqual(li.querySelector('span').className, 'compte-v2_finder-libelle');
    assert.strictEqual(li.querySelector('button').className, 'button is-grey is-small is-finder-choix w-button');
    assert.strictEqual(root.querySelector('.compte-v2_finder-direct').firstChild.className, 'compte-v2_finder-note is-note-bas');
    assert.strictEqual(byText(root, 'button', /Je ne trouve pas/).className, 'compte-v2_finder-lien');
    const num = inputs[2];
    num.value = SIREN;
    num.dispatchEvent(new d.defaultView.Event('input'));
    byText(root, 'button', /^Vérifier$/).click();
    await settle();
    const card = root.querySelector('.compte-v2_finder-carte');
    assert.ok(card);
    const ok = byText(card, 'button', /^Confirmer$/);
    assert.strictEqual(ok.className, 'button is-gradient is-finder-confirmer w-button');
    assert.strictEqual(ok.getAttribute('style'), null, 'marge dessinée dans le Designer');
    const cell = d.getElementById('SIRET').parentNode;
    assert.ok(!cell.classList.contains('ordo-siren-host'), 'cellule élargie par sa combo du Designer');
  });

  await test('[designer] dans la carte, « Modifier » redessine la recherche sans bandeau', async () => {
    const m = clone(MEMBRE);
    m.customFields.siret = SIREN;
    const { root } = await page({ member: m });
    byText(root, 'button', /Modifier/).click();
    assert.ok(byText(root, 'button', /^Rechercher$/));
    assert.strictEqual(root.querySelector('[data-ordo-finder-bandeau]'), null);
  });

  await test('[designer] hors carte : bandeau et suggestion avec les classes du Designer', async () => {
    const { root } = await page({
      overview: false,
      search: (p) => reply(200, p.mode === 'suggest' ? { results: [CABINET] } : { results: [] })
    });
    assert.strictEqual(root.className, 'compte-v2_finder');
    const bandeau = root.querySelector('[data-ordo-finder-bandeau]');
    assert.strictEqual(bandeau.className, 'compte-v2_finder-bandeau');
    assert.strictEqual(bandeau.querySelector('strong').className, 'compte-v2_finder-titre');
    const card = root.querySelector('.compte-v2_finder-carte');
    assert.ok(card && /Est-ce votre entreprise/.test(card.textContent), 'suggestion');
    const row = byText(card, 'button', /Oui, c'est moi/).parentNode;
    assert.strictEqual(row.className, 'compte-v2_finder-ligne is-finder-haut');
    assert.strictEqual(row.getAttribute('style'), null);
    assert.strictEqual(byText(card, 'button', /^Non$/).className, 'button is-grey w-button');
  });

  await test('[designer] gabarits incomplets : présentation d’origine, signalée', async () => {
    const { d, root, reports } = await page({
      search: nameSearch(),
      avant: (doc) => doc.querySelector('[data-ordo-gabarit="finder-bandeau"]').removeAttribute('data-ordo-gabarit')
    });
    assert.strictEqual(root.className, 'ordo-siren');
    assert.ok(d.getElementById('ordo-siren-styles'));
    assert.deepStrictEqual(reports.map((r) => r.ctx), ['SirenFinder.designer']);
    assert.ok(byText(root, 'button', /C'est moi/), 'recherche utilisable');
  });

  await test('[ancienne] classes et feuille du script, cellule élargie par le script', async () => {
    const { d, root, reports } = await page({ mode: 'ancienne', search: nameSearch() });
    assert.strictEqual(root.className, 'ordo-siren', 'les règles [data-ordo-v2] .ordo-siren de la présentation s’appliquent');
    assert.ok(d.getElementById('ordo-siren-styles'));
    assert.ok(d.getElementById('SIRET').parentNode.classList.contains('ordo-siren-host'));
    assert.deepStrictEqual(reports, []);
  });

  console.log(`siren-finder : ${passed} tests OK`);
})();
