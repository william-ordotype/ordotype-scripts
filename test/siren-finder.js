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
      assert.strictEqual(num.placeholder, 'SIREN ou SIRET', 'invite courte : entière sur mobile');
      assert.strictEqual(num.getAttribute('aria-label'), 'SIREN ou SIRET');
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
    // Bouton principal en bleu plein, comme les gabarits finder-bouton et finder-confirmer du Designer.
    assert.strictEqual(byText(root, 'button', /^Rechercher$/).className, 'button no-full-width w-button ordo-siren-btn');
  });

  // --- Carte SIREN aussi dans « Abonnements et facturation » (06/11/2026) ---------------------------

  /** La carte posée dans le Designer, entre « Adresse de facturation » et « Factures ». */
  function carteFacturation(doc) {
    const zone = doc.querySelector('[data-ordo-facturation]') || doc.querySelector('[data-w-tab="billing"]');
    const carte = doc.createElement('div');
    carte.setAttribute('data-ordo-siren-carte', 'facturation');
    carte.className = 'compte-v2_card';
    carte.innerHTML = '<div class="compte-v2_card-head is-start"><h3 class="compte-v2_card-title">SIREN de votre activité</h3></div>'
      + '<div class="compte-v2_muted">Nous le demandons dès maintenant…</div><div data-ordo-siren-slot="1" class="compte-v2_edit is-open"></div>';
    zone.insertBefore(carte, zone.querySelector('[data-ordo-section="factures"]'));
  }
  /** Ce que fait Webflow au clic sur un onglet : la classe w--tab-active change de volet. */
  function ouvrir(doc, nom) {
    for (const p of doc.querySelectorAll('.w-tab-pane')) p.classList.toggle('w--tab-active', p.getAttribute('data-w-tab') === nom);
  }
  /** jsdom n'a pas d'IntersectionObserver : on garde les rappels pour simuler l'entrée à l'écran. */
  function ioFactice(doc) {
    const w = doc.defaultView;
    w.__io = [];
    w.IntersectionObserver = function(cb) { this.observe = (el) => w.__io.push({ cb, el }); this.disconnect = () => {}; };
  }
  const aLEcran = (w) => w.__io.forEach((o) => o.cb([{ isIntersecting: true, target: o.el }]));
  const slotProfil = (d) => d.querySelector('[data-ordo-v2="profil"] [data-ordo-siren-slot]');
  const slotFact = (d) => d.querySelector('[data-ordo-siren-carte="facturation"] [data-ordo-siren-slot]');
  const classeFact = (d) => d.documentElement.classList.contains('ordo-siren-facturation');

  await test('[facturation] un seul finder : il suit l’onglet ouvert, aller et retour', async () => {
    const { d, root, erreurs } = await page({ search: nameSearch(), avant: carteFacturation });
    assert.deepStrictEqual(erreurs, []);
    assert.strictEqual(d.querySelectorAll('[data-ordo-finder="siren"]').length, 1);
    assert.strictEqual(root.parentNode, slotProfil(d), 'Mon profil ouvert : finder dans sa carte');
    assert.ok(classeFact(d), 'carte de la Facturation activée');
    ouvrir(d, 'billing');
    await settle();
    assert.strictEqual(root.parentNode, slotFact(d), 'Facturation ouverte : finder dans la carte de la Facturation');
    ouvrir(d, 'information');
    await settle();
    assert.strictEqual(root.parentNode, slotProfil(d), 'retour dans Mon profil');
    assert.strictEqual(d.querySelectorAll('#SIRET').length, 1, 'champ Memberstack jamais copié');
  });

  await test('[facturation] arrivée directe sur #abonnements : le finder est déjà dans la Facturation', async () => {
    const { d, root } = await page({ search: nameSearch(), avant: (doc) => { carteFacturation(doc); ouvrir(doc, 'billing'); } });
    assert.strictEqual(root.parentNode, slotFact(d));
  });

  await test('[facturation] interne : carte de la Facturation jamais activée', async () => {
    const m = clone(MEMBRE);
    m.customFields.statut = 'Interne';
    const { d } = await page({ member: m, avant: carteFacturation });
    assert.ok(!classeFact(d));
  });

  await test('[facturation] le statut passe à Interne dans le formulaire : la carte se cache', async () => {
    const { d } = await page({ search: nameSearch(), avant: carteFacturation });
    assert.ok(classeFact(d));
    const sel = d.getElementById('mon-statut-2');
    assert.ok(sel, 'sélecteur de statut présent dans la page servie');
    if (![...sel.options].some((o) => o.value === 'Interne')) sel.add(new d.defaultView.Option('Interne', 'Interne'));
    sel.value = 'Interne';
    sel.dispatchEvent(new d.defaultView.Event('change'));
    await settle();
    assert.ok(!classeFact(d), 'finder masqué : plus de carte vide en Facturation');
  });

  await test('[facturation] statut Interne relu chez Memberstack : la carte se cache au rendu suivant', async () => {
    const { w, d } = await page({ search: nameSearch(), avant: carteFacturation });
    assert.ok(classeFact(d));
    w.OrdoAccount.member.customFields.statut = 'Interne';
    d.dispatchEvent(new w.Event('ordo:member-updated'));
    await settle();
    assert.ok(!classeFact(d));
  });

  await test('[facturation] sans carte dans le Designer (page actuelle) : rien ne change', async () => {
    const { d, root } = await page({ search: nameSearch() });
    assert.strictEqual(root.parentNode, slotProfil(d));
    assert.ok(!classeFact(d));
    ouvrir(d, 'billing');
    await settle();
    assert.strictEqual(root.parentNode, slotProfil(d));
  });

  await test('[facturation] présentation d’origine (gabarits incomplets) : le finder reste dans Mon profil', async () => {
    const { d, root } = await page({
      search: nameSearch(),
      avant: (doc) => { carteFacturation(doc); doc.querySelector('[data-ordo-gabarit="finder-bandeau"]').removeAttribute('data-ordo-gabarit'); }
    });
    ouvrir(d, 'billing');
    await settle();
    assert.notStrictEqual(root.parentNode, slotFact(d));
    assert.ok(!classeFact(d));
  });

  await test('[facturation] GA4 : chaque événement dit son onglet', async () => {
    const { d, root, pushed } = await page({ search: nameSearch(), avant: carteFacturation });
    const siren = (l) => l.filter((p) => /^siren_/.test(p.event));
    assert.ok(siren(pushed).length > 0);
    // Avant que profile-overview ne place le bloc : « chargement » ; après, l'onglet ouvert (ici Mon profil).
    assert.strictEqual(siren(pushed)[0].onglet, 'chargement', 'ouverture du bloc, avant son placement');
    assert.ok(siren(pushed).every((p) => p.onglet === 'chargement' || p.onglet === 'profil'), JSON.stringify(siren(pushed).map((p) => [p.event, p.onglet])));
    ouvrir(d, 'information');
    await settle();
    const avantProfil = pushed.length;
    const modeNumero = byText(root, 'button', /J'ai mon numéro/) || byText(root, 'a', /J'ai mon numéro/);
    if (modeNumero) modeNumero.click();
    const champP = root.querySelector('input[aria-label="SIREN ou SIRET"]');
    champP.value = SIREN;
    champP.dispatchEvent(new d.defaultView.Event('input'));
    const verifierP = byText(root, 'button', /Vérifier|Rechercher|Valider/);
    if (verifierP) verifierP.click();
    await settle();
    const dansProfil = siren(pushed.slice(avantProfil));
    assert.ok(dansProfil.some((p) => p.event === 'siren_search') && dansProfil.every((p) => p.onglet === 'profil'),
      JSON.stringify(dansProfil.map((p) => [p.event, p.onglet])));
    ouvrir(d, 'billing');
    await settle();
    const avant = pushed.length;
    const num = byText(root, 'button', /J'ai mon numéro/) || byText(root, 'a', /J'ai mon numéro/);
    if (num) num.click();
    const champ = root.querySelector('input[aria-label="SIREN ou SIRET"]');
    champ.value = SIREN;
    champ.dispatchEvent(new d.defaultView.Event('input'));
    const verifier = byText(root, 'button', /Vérifier|Rechercher|Valider/);
    if (verifier) verifier.click();
    await settle();
    const nouveaux = siren(pushed.slice(avant));
    assert.ok(nouveaux.some((p) => p.event === 'siren_search'), 'une recherche par numéro est suivie');
    assert.ok(nouveaux.every((p) => p.onglet === 'facturation'), JSON.stringify(nouveaux.map((p) => [p.event, p.onglet])));
  });

  await test('[facturation] carte vue : une fois par onglet, seulement si le SIREN manque', async () => {
    const { w, d, pushed } = await page({ search: nameSearch(), avant: (doc) => { carteFacturation(doc); ioFactice(doc); } });
    const vues = () => pushed.filter((p) => p.event === 'siren_carte_vue').map((p) => p.onglet);
    aLEcran(w); aLEcran(w);
    assert.deepStrictEqual(vues(), ['profil']);
    ouvrir(d, 'billing');
    await settle();
    aLEcran(w);
    ouvrir(d, 'information');
    await settle();
    aLEcran(w);
    assert.deepStrictEqual(vues(), ['profil', 'facturation']);
    const rempli = clone(MEMBRE);
    rempli.customFields.siret = SIREN;
    const r = await page({ member: rempli, avant: (doc) => { carteFacturation(doc); ioFactice(doc); } });
    aLEcran(r.w);
    assert.ok(!r.pushed.some((p) => p.event === 'siren_carte_vue'), 'SIREN déjà enregistré : pas une carte à remplir');
    const m = clone(MEMBRE);
    m.customFields.statut = 'Interne';
    const i = await page({ member: m, avant: (doc) => { carteFacturation(doc); ioFactice(doc); } });
    aLEcran(i.w);
    assert.ok(!i.pushed.some((p) => p.event === 'siren_carte_vue'), 'interne : bloc caché, rien de vu');
  });

  // --- Carte plus visible tant que le SIREN manque (06/11/2026, variante B) --------------------------

  const aCompleter = (d) => d.documentElement.classList.contains('ordo-siren-a-completer');
  const carteP = (d) => d.querySelector('[data-ordo-v2="profil"] [data-ordo-section="siren"]');
  const carteF = (d) => d.querySelector('[data-ordo-siren-carte="facturation"]');
  const suivante = (n) => n && n.nextElementSibling;
  const ordreProfil = (d) => [...carteP(d).parentNode.children].map((n) => n.getAttribute('data-ordo-section')).filter(Boolean);
  const ordreFact = (d) => [...carteF(d).parentNode.children]
    .map((n) => n.getAttribute('data-ordo-section') || (n.hasAttribute('data-ordo-siren-carte') ? 'SIREN' : null)).filter(Boolean);
  const choisir = () => reply(200, { siren: SIREN, siret: CABINET.siret, name: 'CLAIRE MARTIN', commune: 'PARIS', source: 'search', name_match: 'yes', stripe: 'ok' });

  await test('[visible] SIREN vide : carte en tête de Mon profil, sous « Mes abonnements » en Facturation, badge affiché', async () => {
    const { d, root, erreurs, reports } = await page({ search: nameSearch(), avant: carteFacturation });
    assert.deepStrictEqual(erreurs, []);
    assert.deepStrictEqual(reports, []);
    assert.strictEqual(root.getAttribute('data-ordo-siren-etat'), 'vide');
    assert.strictEqual(ordreProfil(d)[0], 'siren', 'Mon profil : ' + ordreProfil(d));
    assert.strictEqual(suivante(carteP(d)).getAttribute('data-ordo-section'), 'perso');
    assert.deepStrictEqual(ordreFact(d).slice(0, 2), ['abonnements', 'SIREN'], 'Facturation : ' + ordreFact(d));
    assert.ok(aCompleter(d), 'badge « À compléter » visible');
    assert.strictEqual(root.parentNode, slotProfil(d), 'le finder est toujours dans la carte de l’onglet ouvert');
    ouvrir(d, 'billing');
    await settle();
    assert.strictEqual(root.parentNode, slotFact(d));
    assert.deepStrictEqual(ordreFact(d).slice(0, 2), ['abonnements', 'SIREN'], 'un changement d’onglet ne déplace pas les cartes');
  });

  await test('[visible] enregistré : le badge part, la carte reste sous les yeux du membre', async () => {
    const { d, root } = await page({ search: nameSearch(), select: choisir, avant: carteFacturation });
    const avantP = ordreProfil(d).join(), avantF = ordreFact(d).join();
    byText(root, 'button', /C'est moi/).click();
    await settle();
    assert.strictEqual(root.getAttribute('data-ordo-siren-etat'), 'renseigne');
    assert.ok(/SIREN 123 456 78/.test(root.textContent), 'état « Renseigné » affiché');
    assert.ok(!aCompleter(d), 'badge retiré');
    assert.strictEqual(ordreProfil(d).join(), avantP, 'Mon profil : la carte ne bouge pas');
    assert.strictEqual(ordreFact(d).join(), avantF, 'Facturation : la carte ne bouge pas');
    byText(root, 'button', /Modifier/).click();
    await settle();
    assert.strictEqual(root.getAttribute('data-ordo-siren-etat'), 'renseigne', 'rouvrir le formulaire ne remet pas le badge');
    assert.ok(!aCompleter(d));
  });

  await test('[visible] SIREN déjà enregistré : cartes à leur place du Designer, pas de badge', async () => {
    const rempli = clone(MEMBRE);
    rempli.customFields.siret = SIREN;
    const { d, root } = await page({ member: rempli, avant: carteFacturation });
    assert.strictEqual(root.getAttribute('data-ordo-siren-etat'), 'renseigne');
    assert.deepStrictEqual(ordreProfil(d), ['perso', 'contact', 'emails', 'pro', 'siren']);
    assert.deepStrictEqual(ordreFact(d), ['abonnements', 'moyen-de-paiement', 'adresse', 'SIREN', 'factures']);
    assert.ok(!aCompleter(d));
  });

  await test('[visible] valeur héritée invalide : traitée comme vide (carte remontée, badge)', async () => {
    const vieux = clone(MEMBRE);
    vieux.customFields.siret = '123';
    const { d, root } = await page({ member: vieux, search: nameSearch(), avant: carteFacturation });
    assert.strictEqual(root.getAttribute('data-ordo-siren-etat'), 'vide');
    assert.strictEqual(ordreProfil(d)[0], 'siren');
    assert.ok(aCompleter(d));
  });

  await test('[visible] interne : rien ne bouge, pas de badge, même s’il le devient en cours de route', async () => {
    const m = clone(MEMBRE);
    m.customFields.statut = 'Interne';
    const i = await page({ member: m, avant: carteFacturation });
    assert.deepStrictEqual(ordreProfil(i.d), ['perso', 'contact', 'emails', 'pro', 'siren']);
    assert.ok(!aCompleter(i.d));
    const { w, d } = await page({ search: nameSearch(), avant: carteFacturation });
    assert.ok(aCompleter(d));
    w.OrdoAccount.member.customFields.statut = 'Interne';
    d.dispatchEvent(new w.Event('ordo:member-updated'));
    await settle();
    assert.ok(!aCompleter(d), 'statut Interne relu : badge retiré');
  });

  await test('[visible] sans carte Facturation dans le Designer : seule la carte de Mon profil remonte', async () => {
    const { d, erreurs } = await page({ search: nameSearch() });
    assert.deepStrictEqual(erreurs, []);
    assert.strictEqual(ordreProfil(d)[0], 'siren');
    assert.ok(aCompleter(d));
  });

  await test('[visible] présentation d’origine (gabarits incomplets) : rien ne bouge, pas de badge', async () => {
    const { d } = await page({
      search: nameSearch(),
      avant: (doc) => { carteFacturation(doc); doc.querySelector('[data-ordo-gabarit="finder-bandeau"]').removeAttribute('data-ordo-gabarit'); }
    });
    assert.deepStrictEqual(ordreProfil(d), ['perso', 'contact', 'emails', 'pro', 'siren']);
    assert.ok(!aCompleter(d));
  });

  await test('[visible] profile-overview chargé avant que la recherche ne connaisse l’état : la carte remonte quand même', async () => {
    // L'état de la recherche est retenu au chargement, puis posé plus tard (premier rendu tardif).
    const r = await page({
      search: nameSearch(),
      avant: (doc) => {
        carteFacturation(doc);
        const W = doc.defaultView;
        const orig = W.Element.prototype.setAttribute;
        let retenu = null;
        W.Element.prototype.setAttribute = function(k, v) {
          if (k === 'data-ordo-siren-etat' && !W.__libre) { retenu = [this, v]; return; }
          return orig.call(this, k, v);
        };
        W.__poser = () => { W.__libre = true; if (retenu) orig.call(retenu[0], 'data-ordo-siren-etat', retenu[1]); };
      }
    });
    assert.deepStrictEqual(ordreProfil(r.d), ['perso', 'contact', 'emails', 'pro', 'siren'], 'état inconnu : on ne décide rien');
    assert.ok(!aCompleter(r.d));
    r.w.__poser();
    await settle();
    assert.strictEqual(ordreProfil(r.d)[0], 'siren', 'état connu : la carte remonte');
    assert.deepStrictEqual(ordreFact(r.d).slice(0, 2), ['abonnements', 'SIREN']);
    assert.ok(aCompleter(r.d));
  });

  console.log(`siren-finder : ${passed} tests OK`);
})();
