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

async function page({ member = MEMBRE, overview = true, server = {}, token = 'jeton-test', noV2 = false, mode = MODE, avant } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const SITE_CSS = '.compte-v2_wrap{display:none}.compte-v2_edit{display:none}.compte-v2_edit.is-open{display:block}'
    + '.compte-v2_card.is-liste.is-2fa{display:none}.w-form-done,.w-form-fail{display:none}';
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
    const body = JSON.parse(opts.body);
    calls.push({ url, method: opts.method, headers: opts.headers, body });
    const handler = server[body.action];
    if (!handler) return Promise.reject(new TypeError('Failed to fetch'));
    return handler(body);
  };
  w.document.addEventListener('ordo:member-updated', (e) => events.push(e.detail));
  w.console.log = () => {};
  w.console.warn = () => {};
  w.eval(FINDER);
  if (overview) w.eval(OVERVIEW);
  if (w.document.readyState === 'loading') await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  await tick();
  return { w, d: w.document, calls, pushed, reports, erreurs, events, member: m };
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
    const { w, d, calls, erreurs, pushed } = await page();
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
    assert.strictEqual(items[0].querySelector('span').textContent, `Claire Anne MARTIN · Médecin · Spécialiste en Médecine générale · RPPS ${N1}`);
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

  await test('sans la nouvelle présentation : le bloc reste sous le champ RPPS du formulaire', async () => {
    const { d } = await page({ overview: false });
    const root = d.querySelector(ROOT_SEL);
    const cell = d.getElementById('RPPS').closest('.form-field-wrapper');
    assert.strictEqual(cell.nextSibling, root);
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
  });
  console.log(`rpps-finder : ${passed} tests OK`);
})();
