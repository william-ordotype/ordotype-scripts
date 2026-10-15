#!/usr/bin/env node
/**
 * Vérification du RPPS dans « Mon profil » (account/rpps-finder.js), avec la vraie structure de
 * la page (test/fixtures/compte-profil-securite.html) et profile-overview.js chargé après lui,
 * comme le fait le chargeur. Le serveur est simulé.
 *
 * Deux présentations, mêmes comportements : « designer » (la page publiée, classes reprises des
 * gabarits « finder-… » du Designer) et « ancienne » (la même page sans ces gabarits : classes et
 * feuille de style du script).
 *
 * Usage : node test/rpps-finder.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FINDER = fs.readFileSync(path.join(ROOT, 'account/rpps-finder.js'), 'utf8');
const OVERVIEW = fs.readFileSync(path.join(ROOT, 'account/profile-overview.js'), 'utf8');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-profil-securite.html'), 'utf8');
const API = 'https://webhooks.ordotype.fr/.netlify/functions/account-rpps';
const STATUS = 'https://webhooks.ordotype.fr/.netlify/functions/annuaire-status';

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
const N1 = withLuhn('1999900001');
const N2 = withLuhn('1999900002');
const BAD = N1.slice(0, 10) + String((Number(N1[10]) + 1) % 10);

const MEMBRE = {
  id: 'mem_test_1',
  auth: { email: 'claire.martin@exemple.fr' },
  customFields: {
    prnom: 'Claire', nom: 'Martin', statut: 'Medecin', 'mode-dexercice': 'Liberal', specialite: 'Médecine générale',
    'n-rpps': N1, 'vat-id': '', phone: '+33612345678', country: 'France', siret: ''
  },
  metaData: {}
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const CLAIRE = { rpps: N1, family: 'MARTIN', given: 'CLAIRE ANNE', profession: 'Médecin', specialty: 'Spécialiste en Médecine générale', category: 'C', name_match: 'yes' };
const PAUL = { rpps: N2, family: 'MARTINEZ', given: 'PAUL', profession: 'Médecin', specialty: 'Ophtalmologie', category: 'C', name_match: 'no' };

function reply(status, body) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

let MODE = 'designer';

/** La page d'avant le Designer : aucun gabarit de recherche. */
function sansDesigner(d) {
  const g = d.querySelector('[data-ordo-gabarit="finder"]');
  const groupe = g && g.closest('.compte-v2_gabarits-groupe');
  if (groupe) groupe.remove();
}

async function page({ member = MEMBRE, overview = true, server = {}, token = 'jeton-test', noV2 = false, mode = MODE, avant, fastPoll = false, delais = false } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const SITE_CSS = '.compte-v2_wrap{display:none}.compte-v2_edit{display:none}.compte-v2_edit.is-open{display:block}'
    + '.compte-v2_card.is-liste.is-2fa{display:none}.w-form-done,.w-form-fail{display:none}'
    + '.form-field-3col{row-gap:1.5rem}';
  const fixture = noV2 ? FIXTURE.replace(/data-ordo-v2="profil"/g, 'data-x="profil"') : FIXTURE;
  const dom = new JSDOM(`<!doctype html><html><head><style>${SITE_CSS}</style></head><body><div class="w-tabs">${fixture}</div></body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  if (mode === 'ancienne') sansDesigner(w.document);
  if (avant) avant(w.document);
  const calls = [];
  const pushed = [];
  const reports = [];
  const events = [];
  const statusCalls = [];
  w.dataLayer = [];
  w.dataLayer.push = (p) => { pushed.push(p); return 0; };
  w.OrdoErrorReporter = {
    report: (ctx, err) => reports.push({ ctx, kind: 'report', message: err && err.message }),
    reportNetwork: (ctx, err) => reports.push({ ctx, kind: 'network', message: err && err.message })
  };
  const m = clone(member);
  w.OrdoAccount = { member: m };
  w.OrdoMemberstack = { member: m, customFields: m.customFields };
  w.localStorage.setItem('_ms-mem', JSON.stringify({ id: m.id, customFields: clone(m.customFields), metaData: {} }));
  w.$memberstackDom = {
    getMemberCookie: () => Promise.resolve(token),
    getCurrentMember: () => Promise.resolve({ data: clone(w.OrdoAccount.member) })
  };
  w.fetch = (url, opts) => {
    // État de l'Annuaire : GET sans corps ; sans réponse prévue, le point d'accès est injoignable.
    if (url === STATUS) {
      statusCalls.push({ url, method: opts.method, headers: opts.headers, credentials: opts.credentials });
      return server.status ? server.status() : Promise.reject(new TypeError('Failed to fetch'));
    }
    const body = JSON.parse(opts.body);
    calls.push({ url, method: opts.method, headers: opts.headers, body });
    const handler = server[body.action];
    if (!handler) return Promise.reject(new TypeError('Failed to fetch'));
    return handler(body);
  };
  w.document.addEventListener('ordo:member-updated', (e) => events.push(e.detail));
  w.console.log = () => {};
  w.console.warn = () => {};
  // delais : délais de 20 ms au lieu de 2 s (état de l'Annuaire) et 15 s (recherche).
  w.eval(delais ? FINDER.replace('STATUS_TIMEOUT_MS = 2000', 'STATUS_TIMEOUT_MS = 20').replace('API_TIMEOUT_MS = 15000', 'API_TIMEOUT_MS = 20') : FINDER);
  // fastPoll : relectures de l'enregistrement du formulaire toutes les 5 ms au lieu de 1,5 s.
  if (overview) w.eval(fastPoll ? OVERVIEW.replace('SAVE_POLL_MS = 1500', 'SAVE_POLL_MS = 5') : OVERVIEW);
  if (w.document.readyState === 'loading') await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  await tick();
  return { w, d: w.document, calls, statusCalls, pushed, reports, erreurs, events, member: m };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }
const visible = (w, el) => !!el && w.getComputedStyle(el).display !== 'none' && !el.hidden;
const ROOT_SEL = '[data-ordo-finder="rpps"]';
const byText = (scope, sel, re) => [...scope.querySelectorAll(sel)].find((b) => re.test(b.textContent));
const steps = (pushed) => pushed.filter((p) => p.event === 'profile_action' && p.profile_action === 'rpps').map((p) => p.profile_step);

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
  await test('non vérifié : invitation discrète sous la ligne RPPS de la carte, aucun appel', async () => {
    const ctx0 = await page();
    const { w, d, calls, erreurs, pushed } = ctx0;
    assert.deepStrictEqual(erreurs, []);
    const root = d.querySelector(ROOT_SEL);
    assert.ok(root, 'bloc créé');
    const row = d.querySelector('[data-ordo-v2="profil"] [data-ordo-champ="n-rpps"]').closest('.compte-v2_field');
    assert.strictEqual(row.nextSibling, root, 'placé juste après la ligne « Numéro RPPS »');
    assert.ok(root.closest('[data-ordo-lecture="pro"]'), 'dans la partie lecture : masqué pendant la modification');
    assert.ok(visible(w, root));
    assert.ok(/pas encore vérifié/.test(root.textContent));
    assert.ok(byText(root, 'button', /Vérifier maintenant/));
    assert.strictEqual(calls.length, 0, 'aucune requête sans intention');
    assert.strictEqual(ctx0.statusCalls.length, 0, 'état de l’Annuaire jamais lu au chargement');
    assert.deepStrictEqual(steps(pushed), ['rpps:pro:shown']);
    assert.ok(!/[—]/.test(root.textContent), 'pas de tiret long');
  });

  await test('déjà vérifié : rien de plus que la coche existante', async () => {
    const m = clone(MEMBRE);
    m.customFields['statut-rpps'] = 'E';
    m.metaData = { 'rpps-tested': '8' + N1 };
    const { w, d, calls, pushed } = await page({ member: m });
    const root = d.querySelector(ROOT_SEL);
    assert.ok(root && !visible(w, root), 'bloc masqué');
    assert.ok(d.querySelector('[data-ordo-v2="profil"] [data-ordo-rpps-verifie]'), 'coche « Vérifié » inchangée');
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(steps(pushed), []);
  });

  await test('statut vérifié pour un AUTRE numéro que celui affiché : pas de coche, invitation à vérifier', async () => {
    const m = clone(MEMBRE);
    m.customFields['statut-rpps'] = 'C';
    m.metaData = { 'rpps-tested': N2 };
    const { w, d, calls } = await page({ member: m });
    const root = d.querySelector(ROOT_SEL);
    assert.ok(root && visible(w, root), 'invitation affichée');
    assert.ok(byText(root, 'button', /Vérifier maintenant/));
    assert.strictEqual(d.querySelectorAll('[data-ordo-rpps-verifie]').length, 0, 'aucune coche');
    assert.strictEqual(calls.length, 0);
  });

  await test('recherche par nom : champs préremplis, jeton, résultats, « C’est moi » seulement sur son nom', async () => {
    const { d, calls, pushed } = await page({ server: { search: () => reply(200, { results: [CLAIRE, PAUL], total: 42 }) } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    const inputs = root.querySelectorAll('input');
    assert.strictEqual(inputs[0].value, 'Martin');
    assert.strictEqual(inputs[1].value, 'Claire');
    assert.strictEqual(inputs[2].value, N1, 'numéro déjà saisi repris');
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, API);
    assert.strictEqual(calls[0].method, 'POST');
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer jeton-test');
    assert.deepStrictEqual(calls[0].body, { action: 'search', family: 'Martin', given: 'Claire', scope: 'medecin' });
    const items = root.querySelectorAll('ul > li');
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].querySelector('span').textContent, `Claire Anne MARTIN, Médecin, Spécialiste en Médecine générale, RPPS ${N1}`);
    assert.ok(byText(items[0], 'button', /C’est moi/));
    assert.ok(!items[1].querySelector('button'), 'pas de bouton sur un autre nom');
    assert.ok(/Nom différent de votre profil/.test(items[1].textContent));
    assert.ok(/42 fiches correspondent/.test(root.textContent));
    assert.deepStrictEqual(steps(pushed), ['rpps:pro:shown', 'rpps:pro:open', 'rpps:pro:search', 'rpps:pro:results']);
  });

  await test('« C’est moi » : écriture serveur, membre, formulaire, instantané et coche à jour', async () => {
    const saved = { ok: true, rpps: N1, category: 'C', family: 'MARTIN', given: 'CLAIRE ANNE', profession: 'Médecin', specialty: 'x', verified_at: '2026-09-28T12:00:00.000Z' };
    const { w, d, calls, pushed, events, member } = await page({ server: {
      search: () => reply(200, { results: [CLAIRE], total: 1 }),
      select: () => reply(200, saved)
    } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    byText(root, 'button', /C’est moi/).click();
    await settle();
    assert.deepStrictEqual(calls[1].body, { action: 'select', rpps: N1, source: 'search' });
    assert.strictEqual(member.customFields['n-rpps'], N1);
    assert.strictEqual(member.customFields['statut-rpps'], 'C');
    assert.strictEqual(member.customFields['date-check-rpps'], saved.verified_at);
    assert.strictEqual(member.metaData['rpps-tested'], N1, 'numéro contrôlé connu de la page');
    assert.strictEqual(d.getElementById('RPPS').value, N1, 'le formulaire renverra le numéro vérifié');
    const snap = JSON.parse(w.localStorage.getItem('_ms-mem'));
    assert.strictEqual(snap.customFields['statut-rpps'], 'C');
    assert.strictEqual(snap.metaData['rpps-tested'], N1);
    assert.deepStrictEqual(events.map((e) => e.source), ['rpps-finder'], 'la présentation est prévenue');
    assert.ok(d.querySelector('[data-ordo-v2="profil"] [data-ordo-champ="n-rpps"] [data-ordo-rpps-verifie]'), 'coche « Vérifié » affichée tout de suite');
    assert.ok(d.querySelector('[data-ordo-rpps-entete] [data-ordo-rpps-verifie]'), 'coche dans l’en-tête aussi');
    assert.ok(/Numéro RPPS vérifié dans l’Annuaire santé/.test(root.textContent));
    assert.ok(steps(pushed).includes('rpps:pro:saved'));
  });

  await test('après vérification, le formulaire professionnel garde le nouveau numéro (ouvrir puis annuler)', async () => {
    const m = clone(MEMBRE);
    m.customFields['n-rpps'] = 'Pas de RPPS';
    const { d, member } = await page({ member: m, server: {
      lookup: () => reply(200, { results: [CLAIRE] }),
      select: () => reply(200, { ok: true, rpps: N1, category: 'C', family: 'MARTIN', given: 'CLAIRE', profession: 'Médecin', specialty: '', verified_at: '2026-09-28T12:00:00.000Z' })
    } });
    const root = d.querySelector(ROOT_SEL);
    assert.ok(/Rechercher mon RPPS/.test(root.textContent), 'texte sans numéro valide');
    byText(root, 'button', /Rechercher mon RPPS/).click();
    const num = root.querySelectorAll('input')[2];
    assert.strictEqual(num.value, '', 'un texte libre n’est pas repris comme numéro');
    num.value = N1;
    num.dispatchEvent(new d.defaultView.Event('input'));
    byText(root, 'button', /^Vérifier$/).click();
    await settle();
    byText(root, 'button', /^Confirmer$/).click();
    await settle();
    assert.strictEqual(member.customFields['n-rpps'], N1);
    d.querySelector('[data-ordo-edit="pro"]').click();
    const field = d.querySelector('[data-ordo-form-slot="pro"] [data-ms-member="n-rpps"]');
    assert.ok(field, 'formulaire pro déplacé dans la carte');
    assert.strictEqual(field.value, N1, 'refill reprend le numéro vérifié, pas l’ancien texte');
    byText(d.querySelector('[data-ordo-form-slot="pro"]'), 'a', /Annuler/).click();
    assert.strictEqual(d.getElementById('RPPS').value, N1);
  });

  await test('numéro saisi : contrôle de validité, fiche d’un autre nom sans bouton', async () => {
    const { d, calls, pushed } = await page({ server: { lookup: () => reply(200, { results: [PAUL] }) } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    const num = root.querySelectorAll('input')[2];
    const check = byText(root, 'button', /^Vérifier$/);
    num.value = BAD;
    num.dispatchEvent(new d.defaultView.Event('input'));
    assert.ok(check.disabled, 'bouton inactif sur une clé fausse');
    assert.ok(/contrôle de validité/.test(root.textContent));
    num.value = '8' + N2;
    num.dispatchEvent(new d.defaultView.Event('input'));
    assert.ok(!check.disabled, 'identifiant national accepté');
    check.click();
    await settle();
    assert.deepStrictEqual(calls[0].body, { action: 'lookup', rpps: N2 });
    assert.ok(!byText(root, 'button', /^Confirmer$/), 'pas de confirmation possible');
    assert.ok(/pas au nom de votre profil/.test(root.textContent));
    assert.ok(/Paul MARTINEZ/.test(root.textContent));
    assert.ok(steps(pushed).includes('rpps:pro:mismatch'));
  });

  await test('refus du serveur à l’enregistrement : message, rien de changé côté page', async () => {
    const { d, member, reports } = await page({ server: {
      search: () => reply(200, { results: [CLAIRE], total: 1 }),
      select: () => reply(409, { error: 'name_mismatch' })
    } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    const pick = byText(root, 'button', /C’est moi/);
    pick.click();
    await settle();
    assert.ok(/ne porte pas le nom de votre profil/.test(root.textContent));
    assert.ok(/contact@ordotype\.fr/.test(root.textContent));
    assert.strictEqual(member.customFields['statut-rpps'], undefined);
    assert.ok(!pick.disabled, 'bouton réactivé');
    assert.deepStrictEqual(reports, [], 'refus attendu : pas de signalement');
  });

  await test('pannes : session, indisponibilité, réseau, erreur serveur', async () => {
    let ctx = await page({ server: { search: () => reply(401, { error: 'unauthorized' }) } });
    let root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(/session a expiré/.test(root.textContent));
    assert.deepStrictEqual(ctx.reports, []);

    ctx = await page({ server: { search: () => reply(503, { error: 'upstream_unavailable' }) } });
    root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(/L’Annuaire santé ne répond pas en ce moment/.test(root.textContent));
    assert.ok(!/quelques secondes/.test(root.textContent), 'pas de promesse de délai');
    const msg = root.querySelector('[data-ordo-message="erreur"]');
    const row = root.querySelector('input').parentNode;
    assert.strictEqual(msg.parentNode, row.nextSibling, 'message juste sous les champs de recherche');
    assert.ok(steps(ctx.pushed).includes('rpps:pro:search-unavailable'), 'panne de l’annuaire comptée dans GA4');
    assert.deepStrictEqual(ctx.reports, []);

    ctx = await page({ server: { search: () => reply(429, { error: 'rate_limited' }) } });
    root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(/patientez une minute/.test(root.textContent));
    assert.ok(steps(ctx.pushed).includes('rpps:pro:search-rate-limited'));
    assert.deepStrictEqual(ctx.reports, []);

    ctx = await page({ server: {} });
    root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(/Connexion impossible/.test(root.textContent));
    assert.ok(steps(ctx.pushed).includes('rpps:pro:search-network'));
    assert.deepStrictEqual(ctx.reports.map((r) => r.kind), ['network'], 'requête morte signalée comme telle');

    ctx = await page({ server: { search: () => reply(502, { error: 'upstream_error' }) } });
    root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.deepStrictEqual(ctx.reports.map((r) => r.ctx), ['RppsFinder.search'], 'erreur serveur signalée');
    assert.ok(!byText(root, 'button', /^Rechercher$/).disabled, 'bouton réactivé');
  });

  await test('professions : médecins par défaut, toutes sur demande, toutes d’emblée pour un autre professionnel', async () => {
    let ctx = await page({ server: { search: () => reply(200, { results: [], total: 0 }) } });
    let root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /pas médecin/).click();
    await settle();
    assert.strictEqual(ctx.calls[0].body.scope, 'all');
    assert.ok(/Aucune fiche à ce nom/.test(root.textContent));
    assert.ok(byText(root, 'button', /médecins seulement/));

    const m = clone(MEMBRE);
    m.customFields.statut = 'Autre professionnel de sante';
    ctx = await page({ member: m, server: { search: () => reply(200, { results: [], total: 0 }) } });
    root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.strictEqual(ctx.calls[0].body.scope, 'all');
  });

  await test('profil sans nom : aucune fiche confirmable, consigne claire', async () => {
    const m = clone(MEMBRE);
    m.customFields.nom = '';
    const { d } = await page({ member: m, server: { search: () => reply(200, { results: [{ ...CLAIRE, name_match: 'n/a' }], total: 1 }) } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(/Indiquez au moins 2 lettres/.test(root.textContent), 'nom vide : pas d’appel');
    root.querySelectorAll('input')[0].value = 'Martin';
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(/Renseignez votre nom/.test(root.textContent));
    assert.ok(!byText(root, 'button', /C’est moi/));
  });

  await test('Entrée lance la recherche sans envoyer le formulaire ; réponse périmée ignorée', async () => {
    let resolveFirst;
    let n = 0;
    const { w, d } = await page({ server: {
      search: () => {
        n += 1;
        if (n === 1) return new Promise((r) => { resolveFirst = () => r({ ok: true, status: 200, json: () => Promise.resolve({ results: [PAUL], total: 1 }) }); });
        return reply(200, { results: [CLAIRE], total: 1 });
      }
    } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    const fam = root.querySelectorAll('input')[0];
    const e = new w.KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    fam.dispatchEvent(e);
    assert.ok(e.defaultPrevented, 'Entrée ne soumet pas le formulaire');
    await settle();
    assert.ok(byText(root, 'button', /^Rechercher$/).disabled, 'bouton inactif pendant la recherche');
    // Seconde recherche lancée au clavier pendant que la première attend encore sa réponse.
    root.querySelectorAll('input')[1].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
    await settle();
    resolveFirst();
    await settle();
    const items = root.querySelectorAll('ul > li');
    assert.strictEqual(items.length, 1);
    assert.ok(items[0].textContent.includes(N1), 'la dernière recherche l’emporte');
  });

  await test('texte de l’annuaire jamais interprété comme du HTML', async () => {
    const evil = { ...CLAIRE, family: '<img src=x onerror="window.__pwn=1">', given: '<b>x</b>' };
    const { w, d } = await page({ server: { search: () => reply(200, { results: [evil], total: 1 }) } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(!root.querySelector('img') && !root.querySelector('b'));
    assert.strictEqual(w.__pwn, undefined);
  });

  await test('sans la nouvelle présentation : le bloc reste sous le champ RPPS du formulaire, champ saisissable', async () => {
    const { d } = await page({ overview: false });
    const root = d.querySelector(ROOT_SEL);
    const rpps = d.getElementById('RPPS');
    const cell = rpps.closest('.form-field-wrapper');
    assert.strictEqual(cell.nextSibling, root);
    assert.strictEqual(rpps.placeholder, 'ex. : 10000668540');
    assert.ok(!rpps.readOnly, 'aucune annonce de modification : rien de verrouillé');
    assert.ok(!d.querySelector('[data-ordo-rpps-verrou]'));
  });

  const lectureRow = (d) => d.querySelector('[data-ordo-v2="profil"] [data-ordo-champ="n-rpps"]').closest('.compte-v2_field');
  const annuler = (d) => byText(d.querySelector('[data-ordo-form-slot="pro"]'), 'a', /Annuler/).click();
  const C_CTA = { designer: 'compte-v2_finder-cta', ancienne: 'ordo-rpps-cta' };
  const NOTE_VERROU = 'Modifiable uniquement par la recherche dans l’Annuaire santé ci\u2011dessous.';

  /** Le bloc est de retour dans la lecture, le champ libéré, plus de cellule ni de mention. */
  function enLecture(d, root) {
    const rpps = d.getElementById('RPPS');
    assert.strictEqual(lectureRow(d).nextSibling, root, 'revenu juste sous la ligne « Numéro RPPS » de la lecture');
    assert.ok(!d.querySelector('[data-ordo-rpps-hote]'), 'cellule du formulaire retirée');
    assert.ok(!rpps.readOnly);
    assert.ok(!rpps.hasAttribute('aria-readonly'));
    assert.ok(!rpps.hasAttribute('aria-describedby'));
    assert.ok(!d.querySelector('[data-ordo-rpps-verrou]'), 'mention retirée');
  }

  await test('modification : le bloc passe sous le champ RPPS, champ en lecture seule avec sa mention ; « Annuler » le remet dans la lecture', async () => {
    const { w, d, pushed } = await page();
    const root = d.querySelector(ROOT_SEL);
    const rpps = d.getElementById('RPPS');
    assert.strictEqual(rpps.placeholder, 'ex. : 10000668540', 'placeholder en français');
    assert.ok(!rpps.readOnly, 'en lecture, le formulaire caché n’est pas touché');
    d.querySelector('[data-ordo-edit="pro"]').click();
    const slot = d.querySelector('[data-ordo-form-slot="pro"]');
    const cell = rpps.closest('.form-field-wrapper');
    assert.ok(slot.contains(rpps), 'formulaire pro dans la carte');
    const host = cell.nextSibling;
    assert.strictEqual(host.getAttribute('data-ordo-rpps-hote'), '1', 'cellule juste après celle du champ RPPS');
    assert.strictEqual(host.className, 'form-field-wrapper is-short is-pleine-largeur', 'classes de cellule pleine largeur du gabarit Webflow');
    assert.strictEqual(host.firstChild, root);
    assert.strictEqual(host.style.paddingBottom, '1.5rem', 'écart avec les boutons = écart entre lignes de la grille des champs');
    assert.ok(visible(w, root), 'visible pendant la modification');
    assert.ok(!visible(w, d.querySelector('[data-ordo-lecture="pro"]')), 'lecture masquée');
    assert.ok(byText(root, 'button', /Vérifier maintenant/));
    assert.strictEqual(root.className, mode === 'designer' ? 'compte-v2_finder is-en-carte' : 'ordo-rpps', 'classes de la carte gardées');
    assert.ok(rpps.readOnly, 'lecture seule');
    assert.strictEqual(rpps.getAttribute('aria-readonly'), 'true');
    assert.strictEqual(rpps.getAttribute('style'), null, 'aucune couleur ajoutée : dessin natif .w-input[readonly]');
    assert.ok(rpps.classList.contains('w-input'), 'classe portant le dessin natif');
    const note = cell.querySelector('[data-ordo-rpps-verrou]');
    assert.ok(note, 'mention sous le champ');
    assert.ok(rpps.compareDocumentPosition(note) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'mention après le champ');
    assert.strictEqual(note.textContent, NOTE_VERROU);
    assert.strictEqual(note.className, mode === 'designer' ? 'compte-v2_finder-note is-note-haut' : 'ordo-rpps-muted ordo-rpps-scope', 'classe de note du finder');
    assert.strictEqual(rpps.getAttribute('aria-describedby'), note.id, 'mention lue avec le champ');
    assert.ok(!/[—]/.test(note.textContent + root.textContent));
    annuler(d);
    enLecture(d, root);
    assert.ok(visible(w, root), 'non vérifié : invitation toujours affichée en lecture');
    assert.ok(byText(root, 'button', /Vérifier maintenant/));
    // Rouvrir puis refermer : une seule cellule, une seule mention.
    d.querySelector('[data-ordo-edit="pro"]').click();
    annuler(d);
    d.querySelector('[data-ordo-edit="pro"]').click();
    assert.strictEqual(d.querySelectorAll('[data-ordo-rpps-hote]').length, 1);
    assert.strictEqual(d.querySelectorAll('[data-ordo-rpps-verrou]').length, 1);
    assert.deepStrictEqual(steps(pushed), ['rpps:pro:shown'], 'déplacements non comptés');
  });

  await test('modification : une autre carte ouverte, ou le formulaire enregistré, remet le bloc dans la lecture', async () => {
    let ctx = await page();
    let root = ctx.d.querySelector(ROOT_SEL);
    ctx.d.querySelector('[data-ordo-edit="pro"]').click();
    assert.ok(root.closest('[data-ordo-form-slot="pro"]'));
    ctx.d.querySelector('[data-ordo-edit="perso"]').click();
    enLecture(ctx.d, root);

    // Grille sans écart entre lignes (mobile) : aucun écart ajouté, les boutons ont le leur.
    ctx = await page({ fastPoll: true, avant: (doc) => { doc.getElementById('RPPS').closest('.form-field-3col').style.rowGap = '0px'; } });
    root = ctx.d.querySelector(ROOT_SEL);
    ctx.d.querySelector('[data-ordo-edit="pro"]').click();
    assert.strictEqual(ctx.d.querySelector('[data-ordo-rpps-hote]').getAttribute('style'), null);
    const form = ctx.d.querySelector('[data-ordo-form-slot="pro"] form');
    form.dispatchEvent(new ctx.w.Event('submit', { cancelable: true }));
    for (let i = 0; i < 100 && !ctx.pushed.some((p) => p.profile_step === 'edit:pro:saved'); i++) await tick(10);
    assert.ok(ctx.pushed.some((p) => p.profile_step === 'edit:pro:saved'), 'enregistrement constaté');
    enLecture(ctx.d, root);
  });

  await test('numéro vérifié : en modification, replié avec « Changer de numéro » qui ouvre la recherche ; en lecture, caché', async () => {
    const m = clone(MEMBRE);
    m.customFields['statut-rpps'] = 'C';
    m.metaData = { 'rpps-tested': N1 };
    const { w, d, pushed } = await page({ member: m });
    const root = d.querySelector(ROOT_SEL);
    assert.ok(!visible(w, root), 'lecture : caché');
    d.querySelector('[data-ordo-edit="pro"]').click();
    assert.ok(visible(w, root), 'modification : affiché');
    assert.ok(root.closest('[data-ordo-rpps-hote]'));
    assert.strictEqual(root.firstChild.className, C_CTA[mode]);
    assert.strictEqual(root.firstChild.firstChild.textContent, 'Votre numéro RPPS est vérifié. Pour en changer, recherchez votre nouvelle fiche.');
    assert.ok(!byText(root, 'button', /Vérifier maintenant|Rechercher mon RPPS/));
    assert.ok(d.getElementById('RPPS').readOnly);
    byText(root, 'button', /^Changer de numéro$/).click();
    assert.ok(root.querySelector('strong'), 'recherche ouverte');
    assert.strictEqual(root.querySelectorAll('input')[2].value, N1, 'numéro actuel repris');
    byText(root, 'button', /^Fermer$/).click();
    assert.ok(byText(root, 'button', /^Changer de numéro$/), 'replié de nouveau, texte du numéro vérifié');
    assert.deepStrictEqual(steps(pushed), ['rpps:pro:open', 'rpps:pro:close']);
    annuler(d);
    enLecture(d, root);
    assert.ok(!visible(w, root), 'retour en lecture : caché comme avant');
  });

  await test('recherche ouverte en lecture puis « Modifier » : elle suit, ouverte ; « Annuler » la replie', async () => {
    const { w, d } = await page();
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    root.querySelectorAll('input')[0].value = 'Martine';
    d.querySelector('[data-ordo-edit="pro"]').click();
    assert.ok(root.querySelector('strong'), 'toujours ouverte');
    assert.strictEqual(root.querySelectorAll('input')[0].value, 'Martine', 'saisie conservée');
    annuler(d);
    assert.ok(visible(w, root));
    assert.ok(!root.querySelector('strong'), 'repliée');
  });

  await test('enregistrement par la recherche en modification : le formulaire porte le NOUVEAU numéro (Annuler, rouvrir, Sauvegarder)', async () => {
    const m = clone(MEMBRE);
    m.customFields['n-rpps'] = '120';
    const { w, d, member, pushed, reports, events } = await page({ member: m, fastPoll: true, server: {
      lookup: () => reply(200, { results: [CLAIRE] }),
      select: () => reply(200, { ok: true, rpps: N1, category: 'C', family: 'MARTIN', given: 'CLAIRE', profession: 'Médecin', specialty: '', verified_at: '2026-09-28T12:00:00.000Z' })
    } });
    const root = d.querySelector(ROOT_SEL);
    const rpps = d.getElementById('RPPS');
    d.querySelector('[data-ordo-edit="pro"]').click();
    assert.strictEqual(rpps.value, '120', 'ancienne valeur avant la recherche');
    byText(root, 'button', /Rechercher mon RPPS/).click();
    const num = root.querySelectorAll('input')[2];
    num.value = N1;
    num.dispatchEvent(new w.Event('input'));
    byText(root, 'button', /^Vérifier$/).click();
    await settle();
    byText(root, 'button', /^Confirmer$/).click();
    await settle();
    assert.deepStrictEqual(events.map((e) => e.source), ['rpps-finder']);
    assert.strictEqual(member.customFields['n-rpps'], N1);
    assert.strictEqual(rpps.value, N1, 'champ du formulaire ouvert = nouveau numéro');
    assert.ok(root.closest('[data-ordo-rpps-hote]'), 'confirmation affichée sous le champ');
    assert.ok(/Numéro RPPS vérifié dans l’Annuaire santé/.test(root.textContent));
    assert.ok(rpps.readOnly);
    // « Annuler » : refill() remet la valeur enregistrée, c'est-à-dire le nouveau numéro.
    annuler(d);
    assert.strictEqual(rpps.value, N1, 'refill ne remet pas l’ancien numéro');
    enLecture(d, root);
    assert.ok(!visible(w, root), 'vérifié : caché en lecture');
    assert.ok(d.querySelector('[data-ordo-v2="profil"] [data-ordo-champ="n-rpps"] [data-ordo-rpps-verifie]'), 'coche dans la lecture');
    // Rouvrir puis « Sauvegarder » : le formulaire envoie le nouveau numéro et l'enregistrement est constaté.
    d.querySelector('[data-ordo-edit="pro"]').click();
    assert.strictEqual(rpps.value, N1);
    assert.ok(byText(root, 'button', /^Changer de numéro$/));
    const form = d.querySelector('[data-ordo-form-slot="pro"] form');
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    for (let i = 0; i < 100 && !pushed.some((p) => p.profile_step === 'edit:pro:saved'); i++) await tick(10);
    assert.ok(pushed.some((p) => p.profile_step === 'edit:pro:saved'), 'formulaire = Memberstack : enregistrement constaté');
    assert.strictEqual(rpps.value, N1);
    assert.deepStrictEqual(reports, []);
  });

  await test('« Fermer » replie et ignore une recherche en cours', async () => {
    let release;
    const { d, pushed } = await page({ server: { search: () => new Promise((r) => { release = () => r({ ok: true, status: 200, json: () => Promise.resolve({ results: [CLAIRE], total: 1 }) }); }) } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    byText(root, 'button', /^Fermer$/).click();
    release();
    await settle();
    assert.ok(byText(root, 'button', /Vérifier maintenant/), 'replié');
    assert.ok(!root.querySelector('ul'));
    assert.deepStrictEqual(steps(pushed), ['rpps:pro:shown', 'rpps:pro:open', 'rpps:pro:search', 'rpps:pro:close'], 'la réponse tardive n’est ni affichée ni comptée');
  });


  // --- Repli quand l'Annuaire santé est en panne --------------------------------------------------

  const NOTE_PANNE = 'L’Annuaire santé ne répond pas en ce moment : vous pouvez saisir votre numéro, il sera vérifié automatiquement dès son retour.';
  const MSG_REPLI = 'L’Annuaire santé ne répond pas en ce moment : saisissez votre numéro dans le champ ci‑dessus puis « Sauvegarder ».';
  const jamais = () => new Promise(() => {});
  const ouvrir = (d) => d.querySelector('[data-ordo-edit="pro"]').click();

  /** Champ verrouillé normalement : lecture seule, mention d'origine. */
  function verrouille(d) {
    const rpps = d.getElementById('RPPS');
    assert.ok(rpps.readOnly, 'lecture seule');
    assert.strictEqual(rpps.getAttribute('aria-readonly'), 'true');
    assert.strictEqual(d.querySelector('[data-ordo-rpps-verrou]').textContent, NOTE_VERROU);
  }

  /** Champ libéré par le repli : saisissable, mention de panne toujours lue avec le champ. */
  function libere(d) {
    const rpps = d.getElementById('RPPS');
    assert.ok(!rpps.readOnly, 'champ saisissable');
    assert.ok(!rpps.hasAttribute('aria-readonly'));
    const note = d.querySelector('[data-ordo-rpps-verrou]');
    assert.strictEqual(note.textContent, NOTE_PANNE);
    assert.ok(rpps.closest('.form-field-wrapper').contains(note), 'mention dans la cellule du champ');
    assert.strictEqual(rpps.getAttribute('aria-describedby'), note.id);
    assert.ok(!/[—]/.test(note.textContent));
  }

  /** En modification : ouvre la recherche et lance une recherche par nom. */
  async function chercherEnModification(d) {
    ouvrir(d);
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    return root;
  }

  /** En modification : saisit un numéro dans la recherche et lance « Vérifier ». */
  async function verifierEnModification(d, numero) {
    ouvrir(d);
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    const num = root.querySelectorAll('input')[2];
    num.value = numero;
    num.dispatchEvent(new d.defaultView.Event('input'));
    byText(root, 'button', /^Vérifier$/).click();
    await settle();
    return root;
  }

  await test('repli : 503 à la recherche en modification, champ libéré, mention et message de panne, le numéro tapé part à « Sauvegarder », rien de vérifié', async () => {
    const ctx = await page({ fastPoll: true, server: { search: () => reply(503, { error: 'upstream_unavailable' }) } });
    const { w, d, pushed, reports, member } = ctx;
    const rpps = d.getElementById('RPPS');
    const root = await chercherEnModification(d);
    libere(d);
    const msg = root.querySelector('[data-ordo-message="erreur"]');
    assert.strictEqual(msg.textContent, MSG_REPLI, 'le message du finder dit quoi faire');
    assert.ok(!/[—]/.test(msg.textContent));
    const repli = pushed.filter((p) => p.profile_outcome === 'repli-panne');
    assert.strictEqual(repli.length, 1);
    assert.strictEqual(repli[0].profile_step, 'rpps:pro:repli-panne:erreur', 'cause dans profile_step, aucune nouvelle dimension');
    assert.deepStrictEqual(Object.keys(repli[0]).sort(), ['event', 'profile_action', 'profile_outcome', 'profile_section', 'profile_step']);
    assert.ok(steps(pushed).includes('rpps:pro:search-unavailable'));
    assert.deepStrictEqual(reports, [], 'panne de l’Annuaire : pas de signalement navigateur');
    // Une seconde panne pendant la même modification ne recompte pas.
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.strictEqual(pushed.filter((p) => p.profile_outcome === 'repli-panne').length, 1);
    // Le membre tape son numéro puis « Sauvegarder » ; Memberstack enregistre ce que porte le formulaire.
    rpps.value = N2;
    rpps.dispatchEvent(new w.Event('input', { bubbles: true }));
    const form = d.querySelector('[data-ordo-form-slot="pro"] form');
    let envoye = null;
    form.addEventListener('submit', () => {
      envoye = rpps.value;
      member.customFields['n-rpps'] = rpps.value;
    });
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    for (let i = 0; i < 100 && !pushed.some((p) => p.profile_step === 'edit:pro:saved'); i++) await tick(10);
    assert.strictEqual(envoye, N2, 'le nouveau numéro part à « Sauvegarder »');
    assert.ok(pushed.some((p) => p.profile_step === 'edit:pro:saved'), 'enregistrement constaté');
    assert.strictEqual(member.customFields['n-rpps'], N2);
    assert.strictEqual(member.customFields['statut-rpps'], undefined, 'rien de marqué vérifié');
    assert.deepStrictEqual(member.metaData, {});
    assert.strictEqual(d.querySelectorAll('[data-ordo-rpps-verifie]').length, 0, 'aucune coche');
    // Fermeture (enregistrement) : retour au verrou normal à la prochaine ouverture.
    enLecture(d, root);
    assert.ok(/pas encore vérifié/.test(root.textContent), 'lecture : numéro à vérifier');
    ouvrir(d);
    verrouille(d);
    await settle();
    verrouille(d);
  });

  await test('repli : 503 ou délai dépassé à la vérification du numéro, puis « Annuler » remet le verrou', async () => {
    let ctx = await page({ server: { lookup: () => reply(503, { error: 'upstream_unavailable' }) } });
    let root = await verifierEnModification(ctx.d, N2);
    libere(ctx.d);
    assert.strictEqual(root.querySelector('[data-ordo-message="erreur"]').textContent, MSG_REPLI);
    assert.ok(steps(ctx.pushed).includes('rpps:pro:lookup-unavailable'));
    assert.ok(steps(ctx.pushed).includes('rpps:pro:repli-panne:erreur'));
    // Quota : une seule lecture de l'état, à l'ouverture ; aucune après le 503 de la même ouverture.
    assert.strictEqual(ctx.statusCalls.length, 1);
    ctx.d.dispatchEvent(new ctx.w.CustomEvent('ordo:edit-open', { detail: { section: 'pro' } }));
    byText(root, 'button', /^Vérifier$/).click();
    await settle();
    assert.strictEqual(ctx.statusCalls.length, 1);
    libere(ctx.d);
    annuler(ctx.d);
    enLecture(ctx.d, root);
    ouvrir(ctx.d);
    verrouille(ctx.d);

    ctx = await page({ delais: true, server: { lookup: jamais } });
    root = await verifierEnModification(ctx.d, N2);
    verrouille(ctx.d);
    await tick(40);
    await settle();
    libere(ctx.d);
    assert.strictEqual(root.querySelector('[data-ordo-message="erreur"]').textContent, MSG_REPLI);
    assert.ok(steps(ctx.pushed).includes('rpps:pro:lookup-timeout'), 'délai compté à part');
    assert.ok(steps(ctx.pushed).includes('rpps:pro:repli-panne:erreur'));
    assert.ok(!byText(root, 'button', /^Vérifier$/).disabled, 'bouton réactivé');

    // 504 de la passerelle : même chose que le délai.
    ctx = await page({ server: { search: () => reply(504, {}) } });
    await chercherEnModification(ctx.d);
    libere(ctx.d);
    assert.ok(steps(ctx.pushed).includes('rpps:pro:search-timeout'));
  });

  await test('pas de repli sur 401, 404, 409, 422, 429, 502 ni panne réseau : champ toujours verrouillé', async () => {
    const cas = [
      { server: { search: () => reply(401, { error: 'unauthorized' }) }, via: 'search' },
      { server: { lookup: () => reply(404, { error: 'unknown_rpps' }) }, via: 'lookup' },
      { server: { search: () => reply(200, { results: [CLAIRE], total: 1 }), select: () => reply(409, { error: 'name_mismatch' }) }, via: 'select' },
      { server: { search: () => reply(200, { results: [CLAIRE], total: 1 }), select: () => reply(422, { error: 'unverifiable' }) }, via: 'select' },
      { server: { search: () => reply(429, { error: 'rate_limited' }) }, via: 'search' },
      { server: { search: () => reply(502, { error: 'upstream_error' }) }, via: 'search' },
      { server: {}, via: 'search' }
    ];
    for (const c of cas) {
      const ctx = await page({ server: c.server });
      let root;
      if (c.via === 'lookup') root = await verifierEnModification(ctx.d, N2);
      else root = await chercherEnModification(ctx.d);
      if (c.via === 'select') {
        byText(root, 'button', /C’est moi/).click();
        await settle();
      }
      verrouille(ctx.d);
      assert.ok(root.querySelector('[data-ordo-message]'), 'message d’erreur habituel');
      assert.ok(!root.textContent.includes(MSG_REPLI));
      assert.ok(!steps(ctx.pushed).some((s) => /repli-panne/.test(s)), 'aucun repli compté');
    }
  });

  await test('repli : 503 à la confirmation de la fiche, champ libéré', async () => {
    const ctx = await page({ server: { search: () => reply(200, { results: [CLAIRE], total: 1 }), select: () => reply(503, { error: 'upstream_unavailable' }) } });
    const root = await chercherEnModification(ctx.d);
    byText(root, 'button', /C’est moi/).click();
    await settle();
    libere(ctx.d);
    assert.ok(root.textContent.includes(MSG_REPLI));
    assert.strictEqual(ctx.member.customFields['statut-rpps'], undefined);
  });

  await test('hors modification : un 503 garde le message habituel, rien à libérer', async () => {
    const ctx = await page({ server: { search: () => reply(503, { error: 'upstream_unavailable' }) } });
    const root = ctx.d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.strictEqual(root.querySelector('[data-ordo-message="erreur"]').textContent, 'L’Annuaire santé ne répond pas en ce moment. Réessayez un peu plus tard.');
    assert.ok(!steps(ctx.pushed).some((s) => /repli-panne/.test(s)));
    assert.strictEqual(ctx.statusCalls.length, 0, 'état lu seulement à l’ouverture de la modification');
  });

  await test('état de l’Annuaire « down » à l’ouverture : champ libéré d’emblée, une lecture par ouverture', async () => {
    let state = 'down';
    const ctx = await page({ server: { status: () => reply(200, { state, since: '2026-10-15T08:00:00Z', checkedAt: '2026-10-15T09:00:00Z' }) } });
    const { d, statusCalls, calls, pushed, reports } = ctx;
    const root = d.querySelector(ROOT_SEL);
    ouvrir(d);
    verrouille(d);
    await settle();
    libere(d);
    assert.strictEqual(statusCalls.length, 1);
    assert.strictEqual(statusCalls[0].method, 'GET');
    assert.strictEqual(statusCalls[0].credentials, 'omit');
    assert.strictEqual(statusCalls[0].headers, undefined, 'point d’accès public : ni jeton ni en-tête');
    assert.strictEqual(calls.length, 0, 'aucun appel à la recherche');
    assert.ok(!root.querySelector('[data-ordo-message]'), 'pas de message dans le finder');
    assert.deepStrictEqual(steps(pushed), ['rpps:pro:shown', 'rpps:pro:repli-panne:status']);
    assert.deepStrictEqual(reports, []);
    // Annonce répétée sans fermeture : ni nouvelle lecture, ni retour au verrou.
    d.dispatchEvent(new d.defaultView.CustomEvent('ordo:edit-open', { detail: { section: 'pro' } }));
    await settle();
    assert.strictEqual(statusCalls.length, 1);
    libere(d);
    // Fermeture : verrou normal ; réouverture : nouvelle lecture.
    annuler(d);
    enLecture(d, root);
    state = 'up';
    ouvrir(d);
    await settle();
    assert.strictEqual(statusCalls.length, 2);
    verrouille(d);
  });

  await test('état « up », « unknown », point d’accès en 404, en échec, illisible ou trop lent : verrou, sans bruit', async () => {
    const cas = {
      up: () => reply(200, { state: 'up' }),
      unknown: () => reply(200, { state: 'unknown' }),
      '404': () => reply(404, { error: 'not_found' }),
      '500 down': () => reply(500, { state: 'down' }),
      injoignable: () => Promise.reject(new TypeError('Failed to fetch')),
      illisible: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('JSON')) }),
      lent: jamais
    };
    for (const nom of Object.keys(cas)) {
      const ctx = await page({ delais: true, server: { status: cas[nom] } });
      ouvrir(ctx.d);
      await tick(40);
      await settle();
      try {
        verrouille(ctx.d);
        assert.strictEqual(ctx.statusCalls.length, 1);
        assert.deepStrictEqual(ctx.reports, [], 'pas de signalement');
        assert.deepStrictEqual(steps(ctx.pushed), ['rpps:pro:shown'], 'pas de mesure');
        assert.ok(!ctx.d.querySelector(ROOT_SEL).querySelector('[data-ordo-message]'), 'pas de message');
      } catch (e) {
        e.message = `[état ${nom}] ` + e.message;
        throw e;
      }
    }
  });

  await test('état « down » reçu après « Annuler » : ignoré', async () => {
    let release;
    const ctx = await page({ server: { status: () => new Promise((r) => { release = () => r({ ok: true, status: 200, json: () => Promise.resolve({ state: 'down' }) }); }) } });
    const root = ctx.d.querySelector(ROOT_SEL);
    ouvrir(ctx.d);
    annuler(ctx.d);
    release();
    await settle();
    enLecture(ctx.d, root);
    assert.ok(!steps(ctx.pushed).some((s) => /repli-panne/.test(s)));
  });

  }
  MODE = 'designer';
  await test('[designer] classes reprises des gabarits du Designer, aucune feuille injectée, aucun style en ligne', async () => {
    const { d } = await page({ server: {
      search: () => reply(200, { results: [CLAIRE, PAUL], total: 1 }),
      lookup: () => reply(200, { results: [CLAIRE] })
    } });
    const root = d.querySelector(ROOT_SEL);
    assert.strictEqual(d.getElementById('ordo-rpps-styles'), null, 'aucune feuille injectée');
    assert.strictEqual(root.getAttribute('data-ordo-dessin'), 'designer');
    assert.strictEqual(root.className, 'compte-v2_finder is-en-carte', 'dans la carte : variante « finder-en-carte » du Designer');
    assert.strictEqual(root.getAttribute('data-ordo-classe-hors-carte'), 'compte-v2_finder');
    assert.strictEqual(root.firstChild.className, 'compte-v2_finder-cta');
    assert.strictEqual(root.firstChild.firstChild.className, 'compte-v2_finder-note');
    const open = byText(root, 'button', /Vérifier maintenant/);
    assert.strictEqual(open.className, 'compte-v2_finder-lien');
    open.click();
    assert.strictEqual(root.firstChild.className, 'compte-v2_finder-panneau');
    assert.strictEqual(root.querySelector('strong').className, 'compte-v2_finder-titre');
    const inputs = root.querySelectorAll('input');
    assert.strictEqual(inputs[0].className, 'form-input is-finder-champ w-input', 'champ : classes du gabarit + base Webflow');
    assert.strictEqual(inputs[0].parentNode.className, 'compte-v2_finder-ligne is-finder-haut');
    const go = byText(root, 'button', /^Rechercher$/);
    assert.strictEqual(go.className, 'button is-gradient w-button');
    const foot = byText(root, 'button', /^Fermer$/).parentNode;
    assert.strictEqual(foot.className, 'compte-v2_finder-note is-note-pied');
    assert.strictEqual(foot.getAttribute('style'), null, 'marge dessinée dans le Designer, pas en ligne');
    assert.ok(root.querySelector('.compte-v2_finder-direct'));
    assert.strictEqual(byText(root, 'button', /pas médecin/).parentNode.className, 'compte-v2_finder-note is-note-haut');
    go.click();
    await settle();
    const ul = root.querySelector('ul');
    assert.strictEqual(ul.className, 'compte-v2_finder-liste');
    const items = ul.querySelectorAll('li');
    assert.strictEqual(items[0].className, 'compte-v2_finder-item');
    assert.strictEqual(items[0].querySelector('span').className, 'compte-v2_finder-libelle');
    assert.strictEqual(items[0].querySelector('button').className, 'button is-grey is-small is-finder-choix w-button');
    assert.strictEqual(items[1].querySelector('span:last-child').className, 'compte-v2_finder-note is-note-droite');
    const num = inputs[2];
    num.value = N1;
    num.dispatchEvent(new d.defaultView.Event('input'));
    byText(root, 'button', /^Vérifier$/).click();
    await settle();
    const card = root.querySelector('.compte-v2_finder-carte');
    assert.ok(card, 'carte du Designer');
    const ok = byText(card, 'button', /^Confirmer$/);
    assert.strictEqual(ok.className, 'button is-gradient is-finder-confirmer w-button');
    assert.strictEqual(ok.getAttribute('style'), null);
  });

  await test('[designer] message d’erreur et encadré « vérifié » : classes du Designer', async () => {
    const { d } = await page({ server: {
      search: () => reply(503, { error: 'upstream_unavailable' }),
      lookup: () => reply(200, { results: [CLAIRE] }),
      select: () => reply(200, { ok: true, rpps: N1, category: 'C', family: 'MARTIN', given: 'CLAIRE', profession: 'Médecin', verified_at: '2026-09-28T12:00:00.000Z' })
    } });
    const root = d.querySelector(ROOT_SEL);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.strictEqual(root.querySelector('[data-ordo-message]').className, 'compte-v2_finder-erreur');
    const num = root.querySelectorAll('input')[2];
    num.value = N1;
    num.dispatchEvent(new d.defaultView.Event('input'));
    byText(root, 'button', /^Vérifier$/).click();
    await settle();
    byText(root, 'button', /^Confirmer$/).click();
    await settle();
    assert.strictEqual(root.firstChild.className, 'compte-v2_finder-fait');
  });

  await test('[designer] William renomme ou change une classe dans le Designer : le script suit', async () => {
    const { d } = await page({ avant: (doc) => {
      doc.querySelector('[data-ordo-gabarit="finder-note"]').className = 'compte-v2_finder-note is-discret';
    } });
    const root = d.querySelector(ROOT_SEL);
    assert.strictEqual(root.firstChild.firstChild.className, 'compte-v2_finder-note is-discret');
  });

  await test('[designer] gabarits incomplets : présentation d’origine, signalée, recherche utilisable', async () => {
    const { d, reports } = await page({
      server: { search: () => reply(200, { results: [CLAIRE], total: 1 }) },
      avant: (doc) => doc.querySelector('[data-ordo-gabarit="finder-carte"]').removeAttribute('data-ordo-gabarit')
    });
    const root = d.querySelector(ROOT_SEL);
    assert.strictEqual(root.className, 'ordo-rpps');
    assert.ok(d.getElementById('ordo-rpps-styles'), 'feuille d’origine injectée');
    assert.deepStrictEqual(reports.map((r) => r.ctx), ['RppsFinder.designer']);
    byText(root, 'button', /Vérifier maintenant/).click();
    byText(root, 'button', /^Rechercher$/).click();
    await settle();
    assert.ok(byText(root, 'button', /C’est moi/));
  });

  await test('[designer] hors de la nouvelle présentation : classes du Designer, sans la variante « carte »', async () => {
    const { d } = await page({ overview: false });
    assert.strictEqual(d.querySelector(ROOT_SEL).className, 'compte-v2_finder');
  });

  await test('[designer] présentation en échec après placement : recherche remise sous le champ, classes d’avant la carte', async () => {
    const { d, reports } = await page({ avant: (doc) => {
      const cl = doc.documentElement.classList;
      const add = cl.add.bind(cl);
      cl.add = (...names) => {
        if (names.includes('ordo-profil-v2')) throw new Error('panne simulée');
        return add(...names);
      };
    } });
    const root = d.querySelector(ROOT_SEL);
    assert.ok(reports.some((r) => r.ctx === 'ProfileOverview'), 'échec de la présentation signalé');
    assert.strictEqual(d.getElementById('RPPS').closest('.form-field-wrapper').nextSibling, root, 'remise sous le champ');
    assert.strictEqual(root.className, 'compte-v2_finder');
    assert.ok(!root.hasAttribute('data-ordo-classe-hors-carte'));
  });

  await test('[ancienne] classes et feuille du script, aucune trace du Designer', async () => {
    const { d, reports } = await page({ mode: 'ancienne' });
    const root = d.querySelector(ROOT_SEL);
    assert.strictEqual(root.className, 'ordo-rpps', 'classe d’origine : les règles [data-ordo-v2] .ordo-rpps de la présentation s’appliquent');
    assert.ok(!root.hasAttribute('data-ordo-dessin'));
    assert.ok(d.getElementById('ordo-rpps-styles'));
    assert.deepStrictEqual(reports, [], 'page pas encore republiée : rien à signaler');
    byText(root, 'button', /Vérifier maintenant/).click();
    // Bouton principal en bleu plein, comme les gabarits finder-bouton et finder-confirmer du Designer.
    assert.strictEqual(byText(root, 'button', /^Rechercher$/).className, 'button no-full-width w-button ordo-rpps-btn');
    assert.strictEqual(byText(root, 'button', /^Vérifier$/).className, 'button no-full-width w-button ordo-rpps-btn');
  });
  console.log(`rpps-finder : ${passed} tests OK`);
})();
