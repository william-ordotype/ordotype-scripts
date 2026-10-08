#!/usr/bin/env node
/**
 * Photo de profil dans l'en-tête de « Mon profil » (account/profile-photo.js), avec la vraie
 * structure de la page (test/fixtures/compte-profil-securite.html) et profile-overview.js chargé
 * avant lui, comme le fait le chargeur. Memberstack et le canvas sont simulés.
 *
 * Usage : node test/profile-photo.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const PHOTO = fs.readFileSync(path.join(ROOT, 'account/profile-photo.js'), 'utf8');
const OVERVIEW = fs.readFileSync(path.join(ROOT, 'account/profile-overview.js'), 'utf8');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-profil-securite.html'), 'utf8');

const UPLOADED = 'https://ms-application-assets.s3.us-east-1.amazonaws.com/app/photo-123.jpg';
const GOOGLE = 'https://lh3.googleusercontent.com/a/abc=s96-c';

const MEMBRE = {
  id: 'mem_test_1',
  auth: { email: 'claire.martin@exemple.fr' },
  profileImage: null,
  customFields: { prnom: 'Claire', nom: 'Martin', statut: 'Medecin', specialite: 'Médecine générale' },
  metaData: {}
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

/**
 * image : dimensions renvoyées par createImageBitmap, ou 'illisible'.
 * upload : (file|null) => Promise, réponse de updateMemberProfileImage.
 */
async function page({ member = MEMBRE, image = { width: 1500, height: 2000 }, upload, sdk = true, noHeader = false } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const fixture = noHeader ? FIXTURE.replace(/data-ordo-initiales="1"/g, 'data-x="1"') : FIXTURE;
  const dom = new JSDOM(`<!doctype html><html><head><style>.compte-v2_wrap{display:none}</style></head><body><div class="w-tabs">${fixture}</div></body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  const pushed = [];
  const reports = [];
  const uploads = [];
  const draws = [];
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
  w.localStorage.setItem('_ms-mem', JSON.stringify({ id: m.id, profileImage: m.profileImage, customFields: clone(m.customFields) }));
  w.createImageBitmap = () => (image === 'illisible'
    ? Promise.reject(new Error('decode'))
    : Promise.resolve({ width: image.width, height: image.height, close() {} }));
  w.HTMLCanvasElement.prototype.getContext = function() {
    const canvas = this;
    return {
      fillRect() {},
      drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) { draws.push({ sx, sy, sw, sh, dw, dh, cw: canvas.width, ch: canvas.height }); }
    };
  };
  w.HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
    cb(new w.Blob(['jpeg-bytes'], { type }));
    draws[draws.length - 1].type = type;
    draws[draws.length - 1].quality = quality;
  };
  if (sdk) {
    w.$memberstackDom = {
      getCurrentMember: () => Promise.resolve({ data: clone(w.OrdoAccount.member) }),
      updateMemberProfileImage: ({ profileImage }) => {
        uploads.push(profileImage ? { name: profileImage.name, type: profileImage.type } : null);
        return upload ? upload(profileImage) : Promise.resolve({ data: { profileImage: profileImage ? UPLOADED : null } });
      }
    };
  }
  w.document.addEventListener('ordo:member-updated', (e) => events.push(e.detail));
  w.console.log = () => {};
  w.console.warn = () => {};
  w.eval(OVERVIEW);
  w.eval(PHOTO);
  if (w.document.readyState === 'loading') await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  await tick();
  const d = w.document;
  const header = d.querySelector('[data-ordo-v2="profil"] .compte-v2_identity');
  const q = (sel) => header && header.querySelector(sel);
  const choose = async (file) => {
    const input = q('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new w.Event('change'));
    await settle();
  };
  const file = (name = 'portrait.jpg', type = 'image/jpeg', size = 2048) => {
    const f = new w.File(['x'.repeat(16)], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  return { w, d, header, q, pushed, reports, uploads, draws, events, erreurs, member: m, choose, file };
}

const steps = (pushed) => pushed.filter((p) => p.event === 'profile_action' && p.profile_action === 'photo').map((p) => p.profile_step);
const shown = (el) => !!el && !el.hidden;

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.stack}`);
    process.exit(1);
  }
}

(async () => {
  await test('sans photo : initiales dans un bouton, « Ajouter une photo », indication, aucun envoi', async () => {
    const { header, q, uploads, pushed, erreurs } = await page();
    assert.deepStrictEqual(erreurs, []);
    const trigger = q('button.ordo-photo');
    assert.ok(trigger, 'rond cliquable');
    assert.strictEqual(trigger.getAttribute('aria-label'), 'Ajouter une photo de profil');
    assert.ok(trigger.querySelector('[data-ordo-initiales]'), 'les initiales sont dans le bouton');
    assert.strictEqual(trigger.querySelector('[data-ordo-initiales]').textContent, 'CM');
    assert.ok(!shown(q('.ordo-photo-img')), 'pas d’image');
    assert.strictEqual(q('.ordo-photo-actions button').textContent, 'Ajouter une photo');
    assert.ok(!shown(q('.ordo-photo-retirer')), 'pas de « Retirer »');
    assert.ok(shown(q('.ordo-photo-actions .compte-v2_hint')));
    assert.ok(!q('input[type="file"]').closest('form'), 'champ fichier hors de tout formulaire');
    assert.ok(header.querySelector('.compte-v2_identity-text .ordo-photo-actions'), 'liens sous le texte de l’en-tête');
    assert.strictEqual(uploads.length, 0);
    assert.deepStrictEqual(steps(pushed), ['photo:identite:shown']);
  });

  await test('photo envoyée : affichée, « Changer la photo » et « Retirer »', async () => {
    const m = clone(MEMBRE);
    m.profileImage = UPLOADED;
    const { q, pushed } = await page({ member: m });
    assert.ok(shown(q('.ordo-photo-img')));
    assert.strictEqual(q('.ordo-photo-img').getAttribute('src'), UPLOADED);
    assert.strictEqual(q('.ordo-photo-img').getAttribute('alt'), '', 'image décorative : le bouton porte le libellé');
    assert.strictEqual(q('button.ordo-photo').getAttribute('aria-label'), 'Changer la photo de profil');
    assert.strictEqual(q('.ordo-photo-actions button').textContent, 'Changer la photo');
    assert.ok(shown(q('.ordo-photo-retirer')));
    assert.ok(!shown(q('.ordo-photo-actions .compte-v2_hint')));
    assert.deepStrictEqual(steps(pushed), ['photo:identite:shown-photo']);
  });

  await test('photo de la connexion Google : pas affichée, initiales gardées', async () => {
    const m = clone(MEMBRE);
    m.profileImage = GOOGLE;
    const { q } = await page({ member: m });
    assert.ok(!shown(q('.ordo-photo-img')));
    assert.strictEqual(q('.ordo-photo-actions button').textContent, 'Ajouter une photo');
    const m2 = clone(MEMBRE);
    m2.profileImage = 'http://exemple.fr/photo.jpg';
    const r = await page({ member: m2 });
    assert.ok(!shown(r.q('.ordo-photo-img')), 'adresse non https refusée');
  });

  await test('envoi : recadrage carré haut de photo, 512 px, JPEG, membre + instantané + événement à jour', async () => {
    const { w, q, uploads, draws, pushed, events, member, choose, file } = await page({ image: { width: 1500, height: 2000 } });
    await choose(file('portrait.heic', 'image/heic', 3 * 1024 * 1024));
    assert.strictEqual(draws.length, 1);
    assert.deepStrictEqual(
      { sx: draws[0].sx, sy: draws[0].sy, sw: draws[0].sw, sh: draws[0].sh, cw: draws[0].cw, ch: draws[0].ch },
      { sx: 0, sy: 125, sw: 1500, sh: 1500, cw: 512, ch: 512 },
      'carré pris au quart haut d’une photo en hauteur, réduit à 512'
    );
    assert.strictEqual(draws[0].type, 'image/jpeg');
    assert.deepStrictEqual(uploads, [{ name: 'photo.jpg', type: 'image/jpeg' }], 'Memberstack reçoit un JPEG');
    assert.strictEqual(member.profileImage, UPLOADED);
    assert.strictEqual(JSON.parse(w.localStorage.getItem('_ms-mem')).profileImage, UPLOADED);
    assert.deepStrictEqual(events.map((e) => e.source), ['profile-photo']);
    assert.ok(shown(q('.ordo-photo-img')));
    assert.strictEqual(q('.ordo-photo-actions button').textContent, 'Changer la photo');
    assert.strictEqual(q('.ordo-photo-status').textContent, '');
    assert.ok(!q('button.ordo-photo').disabled, 'bouton rendu');
    assert.ok(q('[data-ordo-initiales]').textContent === 'CM', 'la présentation peut se redessiner sans casser la photo');
    assert.deepStrictEqual(steps(pushed), ['photo:identite:shown', 'photo:identite:upload', 'photo:identite:saved']);
  });

  await test('recadrage : paysage centré, petite image pas agrandie', async () => {
    const { cropBox } = (await page()).w.OrdoProfilePhoto;
    assert.deepStrictEqual(clone(cropBox(2000, 1000)), { sx: 500, sy: 0, side: 1000, out: 512 });
    assert.deepStrictEqual(clone(cropBox(200, 300)), { sx: 0, sy: 25, side: 200, out: 200 });
  });

  await test('pendant l’envoi : « Enregistrement de la photo… », boutons désactivés, un seul envoi', async () => {
    let release;
    const pending = new Promise((r) => { release = r; });
    const ctx = await page({ upload: () => pending });
    const input = ctx.q('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [ctx.file()], configurable: true });
    input.dispatchEvent(new ctx.w.Event('change'));
    input.dispatchEvent(new ctx.w.Event('change'));
    await settle();
    assert.strictEqual(ctx.q('.ordo-photo-status').textContent, 'Enregistrement de la photo…');
    assert.ok(ctx.q('button.ordo-photo').disabled);
    assert.ok(ctx.q('button.ordo-photo').classList.contains('is-busy'));
    assert.ok(!ctx.q('.ordo-photo-spin').hasAttribute('hidden'), 'anneau de chargement');
    assert.strictEqual(ctx.uploads.length, 1, 'un second choix pendant l’envoi est ignoré');
    release({ data: { profileImage: UPLOADED } });
    await settle();
    assert.ok(!ctx.q('button.ordo-photo').disabled);
    assert.ok(ctx.q('.ordo-photo-spin').hasAttribute('hidden'));
  });

  await test('fichier illisible : message en français sous les liens, rien envoyé, pas de signalement', async () => {
    const { q, uploads, reports, pushed, choose, file } = await page({ image: 'illisible' });
    await choose(file('notes.png', 'image/png'));
    assert.strictEqual(uploads.length, 0);
    const status = q('.ordo-photo-status');
    assert.ok(status.classList.contains('is-error'));
    assert.strictEqual(status.getAttribute('role'), 'alert');
    assert.ok(/pas une image lisible/.test(status.textContent));
    assert.ok(!/[A-Za-z]+ is not|Only PNG/.test(status.textContent), 'pas de message anglais');
    assert.deepStrictEqual(reports, []);
    assert.ok(steps(pushed).includes('photo:identite:error-read'));
  });

  await test('fichier trop lourd (> 25 Mo) : refusé avant toute lecture', async () => {
    const { q, uploads, draws, choose, file } = await page();
    await choose(file('enorme.jpg', 'image/jpeg', 30 * 1024 * 1024));
    assert.strictEqual(draws.length, 0);
    assert.strictEqual(uploads.length, 0);
    assert.ok(/trop lourde/.test(q('.ordo-photo-status').textContent));
  });

  await test('refus et pannes Memberstack : messages en français, signalement seulement si inattendu', async () => {
    let ctx = await page({ upload: () => Promise.reject(Object.assign(new Error('Only PNG, JPG, and JPEG files are supported.'), { code: 'invalid-file-type' })) });
    await ctx.choose(ctx.file());
    assert.ok(/pas une image lisible/.test(ctx.q('.ordo-photo-status').textContent));
    assert.deepStrictEqual(ctx.reports, []);
    assert.strictEqual(ctx.member.profileImage, null, 'membre inchangé');

    ctx = await page({ upload: () => Promise.reject(new TypeError('Failed to fetch')) });
    await ctx.choose(ctx.file());
    assert.ok(/Vérifiez votre connexion/.test(ctx.q('.ordo-photo-status').textContent));
    assert.deepStrictEqual(ctx.reports.map((r) => r.kind), ['network']);

    ctx = await page({ upload: () => Promise.reject(new Error('boom')) });
    await ctx.choose(ctx.file());
    assert.ok(/n’a pas pu être enregistrée/.test(ctx.q('.ordo-photo-status').textContent));
    assert.deepStrictEqual(ctx.reports.map((r) => r.ctx), ['ProfilePhoto.upload']);

    ctx = await page({ upload: () => Promise.resolve({ data: {} }) });
    await ctx.choose(ctx.file());
    assert.ok(/n’a pas pu être enregistrée/.test(ctx.q('.ordo-photo-status').textContent), 'réponse sans adresse = échec');
    assert.ok(!shown(ctx.q('.ordo-photo-img')));
  });

  await test('retirer : Memberstack reçoit null, initiales de retour, « Photo retirée. », focus sur « Ajouter »', async () => {
    const m = clone(MEMBRE);
    m.profileImage = UPLOADED;
    const { w, d, q, uploads, member, pushed } = await page({ member: m });
    q('.ordo-photo-retirer').click();
    await settle();
    assert.deepStrictEqual(uploads, [null]);
    assert.strictEqual(member.profileImage, null);
    assert.strictEqual(JSON.parse(w.localStorage.getItem('_ms-mem')).profileImage, null);
    assert.ok(!shown(q('.ordo-photo-img')));
    assert.ok(!shown(q('.ordo-photo-retirer')));
    assert.strictEqual(q('.ordo-photo-actions button').textContent, 'Ajouter une photo');
    assert.strictEqual(q('.ordo-photo-status').textContent, 'Photo retirée.');
    assert.strictEqual(d.activeElement, q('.ordo-photo-actions button'));
    assert.ok(steps(pushed).includes('photo:identite:removed'));
  });

  await test('image introuvable : initiales de retour sans message', async () => {
    const m = clone(MEMBRE);
    m.profileImage = UPLOADED;
    const { w, q, pushed } = await page({ member: m });
    q('.ordo-photo-img').dispatchEvent(new w.Event('error'));
    assert.ok(!shown(q('.ordo-photo-img')));
    assert.strictEqual(q('.ordo-photo-status').textContent, '');
    assert.ok(steps(pushed).includes('photo:identite:image-error'));
  });

  await test('SDK Memberstack absent : message, signalement, rien de cassé', async () => {
    const ctx = await page({ sdk: false });
    // L'attente du SDK dure 10 s dans la page : raccourcie ici en avançant les minuteurs.
    const realSetTimeout = ctx.w.setTimeout;
    ctx.w.setTimeout = (fn) => realSetTimeout(fn, 0);
    await ctx.choose(ctx.file());
    for (let i = 0; i < 80; i++) await tick();
    assert.ok(/pas disponible pour le moment/.test(ctx.q('.ordo-photo-status').textContent));
    assert.deepStrictEqual(ctx.reports.map((r) => r.ctx), ['ProfilePhoto.upload']);
  });

  await test('page sans en-tête V2 : le script ne fait rien', async () => {
    const { d, erreurs } = await page({ noHeader: true });
    assert.deepStrictEqual(erreurs, []);
    assert.strictEqual(d.querySelector('.ordo-photo'), null);
  });

  console.log(`profile-photo : ${passed} tests OK`);
})();
