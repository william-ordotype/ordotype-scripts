#!/usr/bin/env node
/**
 * Photo de profil dans l'en-tête de « Mon profil » (account/profile-photo.js), avec la vraie
 * structure de la page (test/fixtures/compte-profil-securite.html) et profile-overview.js chargé
 * avant lui, comme le fait le chargeur. Memberstack et le canvas sont simulés.
 *
 * Deux présentations, mêmes comportements :
 *  - « designer » : la page publiée (rond, pastille, liens, conseil, message et gabarits dessinés
 *    dans le Designer, [data-ordo-photo]) ;
 *  - « ancienne » : la même page sans ces éléments (Designer pas encore republié) : le script
 *    construit la présentation d'origine.
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

const SEL = {
  designer: {
    trigger: 'button[data-ordo-photo="declencheur"]', img: '[data-ordo-photo="image"]',
    change: 'button[data-ordo-photo="changer"]', remove: 'button[data-ordo-photo="retirer"]',
    hint: '[data-ordo-photo="conseil"]', status: '[data-ordo-photo="statut"]',
    spin: '[data-ordo-photo="chargement"]', actions: '[data-ordo-photo="actions"]',
    busy: 'is-photo-occupe', error: 'is-photo-erreur'
  },
  ancienne: {
    trigger: 'button.ordo-photo', img: '.ordo-photo-img',
    change: '.ordo-photo-actions button', remove: '.ordo-photo-retirer',
    hint: '.ordo-photo-actions .compte-v2_hint', status: '.ordo-photo-status',
    spin: '.ordo-photo-spin', actions: '.ordo-photo-actions',
    busy: 'is-busy', error: 'is-error'
  }
};

/** La page d'avant le Designer : initiales hors de tout rond, aucun élément ni gabarit de photo. */
function sansDesigner(d) {
  const rond = d.querySelector('[data-ordo-photo="declencheur"]');
  if (rond) {
    const avatar = rond.querySelector('.compte-v2_avatar');
    rond.parentNode.insertBefore(avatar, rond);
  }
  d.querySelectorAll('[data-ordo-photo]').forEach((n) => n.remove());
  d.querySelectorAll('[data-ordo-gabarit^="photo-"]').forEach((n) => {
    const groupe = n.closest('.compte-v2_gabarits-groupe');
    if (groupe) groupe.remove();
  });
}

/**
 * image : dimensions renvoyées par createImageBitmap, ou 'illisible'.
 * upload : (file|null) => Promise, réponse de updateMemberProfileImage.
 * mode : 'designer' (page publiée) ou 'ancienne' (sans les éléments du Designer).
 * avant : (document) => void, retouche la page avant les scripts.
 */
async function page({ member = MEMBRE, image = { width: 1500, height: 2000 }, upload, sdk = true, noHeader = false, mode = 'designer', avant, deuxFois = false } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const fixture = noHeader ? FIXTURE.replace(/data-ordo-initiales="1"/g, 'data-x="1"') : FIXTURE;
  const dom = new JSDOM(`<!doctype html><html><head><style>.compte-v2_wrap{display:none}</style></head><body><div class="w-tabs">${fixture}</div></body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  if (mode === 'ancienne') sansDesigner(w.document);
  if (avant) avant(w.document);
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
  if (deuxFois) w.eval(PHOTO);
  if (w.document.readyState === 'loading') await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  await tick();
  const d = w.document;
  const header = d.querySelector('[data-ordo-v2="profil"] .compte-v2_identity');
  const q = (sel) => header && header.querySelector(sel);
  const S = SEL[mode];
  const el = (name) => q(S[name]);
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
  return { w, d, header, q, el, S, pushed, reports, uploads, draws, events, erreurs, member: m, choose, file };
}

const steps = (pushed) => pushed.filter((p) => p.event === 'profile_action' && p.profile_action === 'photo').map((p) => p.profile_step);
// Sur le site, une classe qui fixe `display` l'emporte sur [hidden] : le script cache aussi en ligne.
const shown = (node) => !!node && !node.hasAttribute('hidden') && node.style.display !== 'none';

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
  for (const mode of ['designer', 'ancienne']) {
    const t = (name, fn) => test(`[${mode}] ${name}`, fn);

    await t('sans photo : initiales dans un bouton, « Ajouter une photo », indication, aucun envoi', async () => {
      const { header, q, el, uploads, pushed, erreurs, reports } = await page({ mode });
      assert.deepStrictEqual(erreurs, []);
      assert.deepStrictEqual(reports, []);
      const trigger = el('trigger');
      assert.ok(trigger, 'rond cliquable');
      assert.strictEqual(trigger.type, 'button');
      assert.strictEqual(trigger.getAttribute('aria-label'), 'Ajouter une photo de profil');
      assert.ok(trigger.querySelector('[data-ordo-initiales]'), 'les initiales sont dans le bouton');
      assert.strictEqual(trigger.querySelector('[data-ordo-initiales]').textContent, 'CM');
      assert.ok(!shown(el('img')), 'pas d’image');
      assert.ok(!shown(el('spin')), 'pas de cercle de chargement');
      assert.strictEqual(el('change').textContent.trim(), 'Ajouter une photo');
      assert.strictEqual(el('change').tagName, 'BUTTON');
      assert.ok(!shown(el('remove')), 'pas de « Retirer »');
      assert.strictEqual(el('remove').style.display, 'none', 'caché en ligne : sur le site, une classe l’emporterait sur [hidden]');
      assert.ok(shown(el('hint')));
      assert.strictEqual(el('status').textContent, '', 'aucun message');
      assert.ok(!q('input[type="file"]').closest('form'), 'champ fichier hors de tout formulaire');
      assert.ok(header.querySelector('.compte-v2_identity-text ' + SEL[mode].actions), 'liens sous le texte de l’en-tête');
      assert.strictEqual(uploads.length, 0);
      assert.deepStrictEqual(steps(pushed), ['photo:identite:shown']);
    });

    await t('photo envoyée : affichée, « Changer la photo » et « Retirer »', async () => {
      const m = clone(MEMBRE);
      m.profileImage = UPLOADED;
      const { el, pushed } = await page({ member: m, mode });
      assert.ok(shown(el('img')));
      assert.strictEqual(el('img').getAttribute('src'), UPLOADED);
      assert.strictEqual(el('img').getAttribute('alt'), '', 'image décorative : le bouton porte le libellé');
      assert.ok(el('trigger').contains(el('img')), 'image dans le rond');
      assert.strictEqual(el('trigger').getAttribute('aria-label'), 'Changer la photo de profil');
      assert.strictEqual(el('change').textContent, 'Changer la photo');
      assert.ok(shown(el('remove')));
      assert.ok(!shown(el('hint')));
      assert.deepStrictEqual(steps(pushed), ['photo:identite:shown-photo']);
    });

    await t('photo de la connexion Google : pas affichée, initiales gardées', async () => {
      const m = clone(MEMBRE);
      m.profileImage = GOOGLE;
      const { el } = await page({ member: m, mode });
      assert.ok(!shown(el('img')));
      assert.strictEqual(el('change').textContent, 'Ajouter une photo');
      const m2 = clone(MEMBRE);
      m2.profileImage = 'http://exemple.fr/photo.jpg';
      const r = await page({ member: m2, mode });
      assert.ok(!shown(r.el('img')), 'adresse non https refusée');
    });

    await t('envoi : recadrage carré haut de photo, 512 px, JPEG, membre + instantané + événement à jour', async () => {
      const { w, q, el, uploads, draws, pushed, events, member, choose, file } = await page({ image: { width: 1500, height: 2000 }, mode });
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
      assert.ok(shown(el('img')));
      assert.strictEqual(el('change').textContent, 'Changer la photo');
      assert.strictEqual(el('status').textContent, '');
      assert.ok(!el('trigger').disabled, 'bouton rendu');
      assert.ok(q('[data-ordo-initiales]').textContent === 'CM', 'la présentation peut se redessiner sans casser la photo');
      assert.deepStrictEqual(steps(pushed), ['photo:identite:shown', 'photo:identite:upload', 'photo:identite:saved']);
    });

    await t('pendant l’envoi : « Enregistrement de la photo… », boutons désactivés, un seul envoi', async () => {
      let release;
      const pending = new Promise((r) => { release = r; });
      const ctx = await page({ upload: () => pending, mode });
      const input = ctx.q('input[type="file"]');
      Object.defineProperty(input, 'files', { value: [ctx.file()], configurable: true });
      input.dispatchEvent(new ctx.w.Event('change'));
      input.dispatchEvent(new ctx.w.Event('change'));
      await settle();
      assert.strictEqual(ctx.el('status').textContent, 'Enregistrement de la photo…');
      assert.ok(ctx.el('trigger').disabled);
      assert.ok(ctx.el('change').disabled && ctx.el('remove').disabled);
      assert.ok(ctx.el('trigger').classList.contains(ctx.S.busy));
      assert.ok(shown(ctx.el('spin')), 'anneau de chargement');
      assert.strictEqual(ctx.uploads.length, 1, 'un second choix pendant l’envoi est ignoré');
      release({ data: { profileImage: UPLOADED } });
      await settle();
      assert.ok(!ctx.el('trigger').disabled);
      assert.ok(!ctx.el('trigger').classList.contains(ctx.S.busy));
      assert.ok(!shown(ctx.el('spin')));
    });

    await t('fichier illisible : message en français sous les liens, rien envoyé, pas de signalement', async () => {
      const { el, uploads, reports, pushed, choose, file } = await page({ image: 'illisible', mode });
      await choose(file('notes.png', 'image/png'));
      assert.strictEqual(uploads.length, 0);
      const status = el('status');
      assert.ok(status.classList.contains(SEL[mode].error));
      assert.strictEqual(status.getAttribute('role'), 'alert');
      assert.ok(/pas une image lisible/.test(status.textContent));
      assert.ok(!/[A-Za-z]+ is not|Only PNG/.test(status.textContent), 'pas de message anglais');
      assert.deepStrictEqual(reports, []);
      assert.ok(steps(pushed).includes('photo:identite:error-read'));
    });

    await t('fichier trop lourd (> 25 Mo) : refusé avant toute lecture', async () => {
      const { el, uploads, draws, choose, file } = await page({ mode });
      await choose(file('enorme.jpg', 'image/jpeg', 30 * 1024 * 1024));
      assert.strictEqual(draws.length, 0);
      assert.strictEqual(uploads.length, 0);
      assert.ok(/trop lourde/.test(el('status').textContent));
    });

    await t('refus et pannes Memberstack : messages en français, signalement seulement si inattendu', async () => {
      let ctx = await page({ mode, upload: () => Promise.reject(Object.assign(new Error('Only PNG, JPG, and JPEG files are supported.'), { code: 'invalid-file-type' })) });
      await ctx.choose(ctx.file());
      assert.ok(/pas une image lisible/.test(ctx.el('status').textContent));
      assert.deepStrictEqual(ctx.reports, []);
      assert.strictEqual(ctx.member.profileImage, null, 'membre inchangé');

      ctx = await page({ mode, upload: () => Promise.reject(new TypeError('Failed to fetch')) });
      await ctx.choose(ctx.file());
      assert.ok(/Vérifiez votre connexion/.test(ctx.el('status').textContent));
      assert.deepStrictEqual(ctx.reports.map((r) => r.kind), ['network']);

      ctx = await page({ mode, upload: () => Promise.reject(new Error('boom')) });
      await ctx.choose(ctx.file());
      assert.ok(/n’a pas pu être enregistrée/.test(ctx.el('status').textContent));
      assert.deepStrictEqual(ctx.reports.map((r) => r.ctx), ['ProfilePhoto.upload']);

      ctx = await page({ mode, upload: () => Promise.resolve({ data: {} }) });
      await ctx.choose(ctx.file());
      assert.ok(/n’a pas pu être enregistrée/.test(ctx.el('status').textContent), 'réponse sans adresse = échec');
      assert.ok(!shown(ctx.el('img')));
    });

    await t('retirer : Memberstack reçoit null, initiales de retour, « Photo retirée. », focus sur « Ajouter »', async () => {
      const m = clone(MEMBRE);
      m.profileImage = UPLOADED;
      const { w, d, el, uploads, member, pushed } = await page({ member: m, mode });
      el('remove').click();
      await settle();
      assert.deepStrictEqual(uploads, [null]);
      assert.strictEqual(member.profileImage, null);
      assert.strictEqual(JSON.parse(w.localStorage.getItem('_ms-mem')).profileImage, null);
      assert.ok(!shown(el('img')));
      assert.ok(!shown(el('remove')));
      assert.strictEqual(el('change').textContent, 'Ajouter une photo');
      assert.strictEqual(el('status').textContent, 'Photo retirée.');
      assert.ok(!el('status').classList.contains(SEL[mode].error));
      assert.strictEqual(d.activeElement, el('change'));
      assert.ok(steps(pushed).includes('photo:identite:removed'));
    });

    await t('image introuvable : initiales de retour sans message', async () => {
      const m = clone(MEMBRE);
      m.profileImage = UPLOADED;
      const { w, el, pushed } = await page({ member: m, mode });
      el('img').dispatchEvent(new w.Event('error'));
      assert.ok(!shown(el('img')));
      assert.strictEqual(el('status').textContent, '');
      assert.ok(steps(pushed).includes('photo:identite:image-error'));
    });

    await t('SDK Memberstack absent : message, signalement, rien de cassé', async () => {
      const ctx = await page({ sdk: false, mode });
      // L'attente du SDK dure 10 s dans la page : raccourcie ici en avançant les minuteurs.
      const realSetTimeout = ctx.w.setTimeout;
      ctx.w.setTimeout = (fn) => realSetTimeout(fn, 0);
      await ctx.choose(ctx.file());
      for (let i = 0; i < 80; i++) await tick();
      assert.ok(/pas disponible pour le moment/.test(ctx.el('status').textContent));
      assert.deepStrictEqual(ctx.reports.map((r) => r.ctx), ['ProfilePhoto.upload']);
    });

    await t('script lancé deux fois : un seul rond, rien d’imbriqué', async () => {
      const { header, el, erreurs } = await page({ mode, deuxFois: true });
      assert.deepStrictEqual(erreurs, []);
      assert.strictEqual(header.querySelectorAll(SEL[mode].trigger).length, 1);
      assert.strictEqual(header.querySelectorAll('button button').length, 0);
      assert.strictEqual(header.querySelectorAll('input[type="file"]').length, 1);
      assert.strictEqual(el('change').textContent, 'Ajouter une photo');
    });

    await t('page sans en-tête V2 : le script ne fait rien', async () => {
      const { d, erreurs } = await page({ noHeader: true, mode });
      assert.deepStrictEqual(erreurs, []);
      assert.strictEqual(d.querySelector('.ordo-photo, button[data-ordo-photo]'), null);
      assert.ok(!d.documentElement.classList.contains('ordo-photo-v2'));
    });
  }

  await test('recadrage : paysage centré, petite image pas agrandie', async () => {
    const { cropBox } = (await page()).w.OrdoProfilePhoto;
    assert.deepStrictEqual(clone(cropBox(2000, 1000)), { sx: 500, sy: 0, side: 1000, out: 512 });
    assert.deepStrictEqual(clone(cropBox(200, 300)), { sx: 0, sy: 25, side: 200, out: 200 });
  });

  await test('[designer] dessin repris tel quel : classes et textes du Designer, aucun style injecté, gabarits recopiés', async () => {
    const { d, header, el } = await page({
      avant: (doc) => {
        // William change les textes dans le Designer : le script les reprend.
        const changer = doc.querySelector('[data-ordo-photo="changer"]');
        changer.textContent = 'Choisir une photo';
        changer.setAttribute('data-ordo-texte-avec-photo', 'Remplacer la photo');
      }
    });
    assert.ok(d.documentElement.classList.contains('ordo-photo-v2'), 'éléments du Designer activés');
    assert.strictEqual(d.getElementById('ordo-photo-styles'), null, 'aucune feuille de style injectée');
    assert.strictEqual(header.querySelector('.ordo-photo, .ordo-photo-actions, .ordo-photo-status'), null, 'rien de l’ancienne présentation');
    const trigger = el('trigger');
    assert.strictEqual(trigger.className, 'compte-v2_photo', 'classes du Designer');
    assert.ok(trigger.querySelector('[data-ordo-photo="pastille"]'), 'pastille du Designer dans le rond');
    assert.strictEqual(el('change').className, 'compte-v2_lien is-photo-lien');
    assert.strictEqual(el('remove').className, 'compte-v2_lien is-photo-lien is-photo-retirer');
    assert.strictEqual(el('change').textContent, 'Choisir une photo');
    const img = el('img');
    assert.strictEqual(img.className, 'compte-v2_photo-image', 'gabarit sans sa combo « envoi en cours »');
    assert.ok(!img.hasAttribute('src') && !img.hasAttribute('loading'), 'ni image d’exemple ni chargement différé');
    assert.ok(el('spin').classList.contains('compte-v2_photo-chargement'));
    assert.strictEqual(header.querySelectorAll('[data-ordo-gabarit]').length, 0, 'copies sans leur marque de gabarit');
    assert.ok(d.querySelector('[data-ordo-gabarits="profil"] [data-ordo-gabarit="photo-image"]'), 'gabarit laissé en place');
    // Seuls les boutons, le champ fichier et les copies de gabarits sont nouveaux.
    const nouveaux = [...header.querySelectorAll('*')].filter((n) => !n.closest('svg') && !['BUTTON', 'INPUT'].includes(n.tagName)
      && !n.hasAttribute('data-ordo-photo') && !n.closest('[data-ordo-photo="pastille"]') && !n.closest('.compte-v2_identity-text > div:not([data-ordo-photo])')
      && !n.hasAttribute('data-ordo-initiales') && !n.matches('.compte-v2_identity-text'));
    assert.deepStrictEqual(nouveaux.map((n) => n.outerHTML.slice(0, 60)), []);

    const m = clone(MEMBRE);
    m.profileImage = UPLOADED;
    const r = await page({
      member: m,
      avant: (doc) => doc.querySelector('[data-ordo-photo="changer"]').setAttribute('data-ordo-texte-avec-photo', 'Remplacer la photo')
    });
    assert.strictEqual(r.el('change').textContent, 'Remplacer la photo', 'texte « avec photo » pris dans l’attribut du Designer');
  });

  await test('[designer] envoi en cours : combos du Designer posées puis retirées (rond, initiales, image)', async () => {
    let release;
    const m = clone(MEMBRE);
    m.profileImage = UPLOADED;
    const ctx = await page({ member: m, upload: () => new Promise((r) => { release = r; }) });
    await ctx.choose(ctx.file());
    const avatar = ctx.q('[data-ordo-initiales]');
    assert.ok(ctx.el('trigger').classList.contains('is-photo-occupe'));
    assert.ok(avatar.classList.contains('is-photo-attenue'));
    assert.ok(ctx.el('img').classList.contains('is-photo-attenuee'));
    release({ data: { profileImage: UPLOADED } });
    await settle();
    assert.ok(!avatar.classList.contains('is-photo-attenue'));
    assert.ok(!ctx.el('img').classList.contains('is-photo-attenuee'));
  });

  await test('[designer] Designer incomplet : présentation d’origine, signalée (Sentry), photo utilisable', async () => {
    for (const casse of ['[data-ordo-gabarit="photo-chargement"]', '[data-ordo-photo="statut"]', '[data-ordo-photo="retirer"]']) {
      const { d, header, reports, choose, file, uploads } = await page({ avant: (doc) => doc.querySelector(casse).remove() });
      assert.ok(!d.documentElement.classList.contains('ordo-photo-v2'), casse + ' : éléments du Designer laissés cachés');
      assert.ok(header.querySelector('button.ordo-photo'), casse + ' : présentation d’origine');
      assert.deepStrictEqual(reports.map((r) => r.ctx), ['ProfilePhoto.designer'], casse);
      await choose(file());
      assert.strictEqual(uploads.length, 1, casse + ' : la photo s’envoie quand même');
    }
  });

  console.log(`profile-photo : ${passed} tests OK`);
})();
