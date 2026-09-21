#!/usr/bin/env node
/**
 * Formulaire d'invitation de la page 2FA : envoi, confirmation, erreur, retour au formulaire et aperçu restreint.
 *
 * Usage : node test/connexion-2fa-referral.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'connexion-2fa/referral.js'), 'utf8');
const ENDPOINT = 'https://hook.example.test/referral';
const session = () => JSON.stringify({ data: { memberId: 'mem_parrain', email: 'pa****in@example.test' } });

function page({ action = ENDPOINT, endpointAttr = null, sessionValue = session(), loginEmail = 'parrain@example.test', invitationHidden = false, preview = null, comboRule = true, gated = false } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const previewAttr = preview === null ? '' : ` data-referral-preview="${preview}"`;
  const dom = new JSDOM(
    `<!doctype html><html><head><style>
      .hidden { background-color: transparent; padding: 0; display: none; }
      .sign_window { display: flex; background-color: rgb(255, 255, 255); padding: 16px; }
      ${comboRule ? '.sign_window.hidden { display: none; }' : ''}
      .sign_window.is-gated { display: none; }
    </style></head><body>
      <form id="code-form"><input name="code" value="123456"><input type="submit" value="Valider"></form>
      <div id="referral-invitation" class="sign_window${invitationHidden ? ' hidden' : ''}${gated ? ' is-gated' : ''}"${gated ? ' style="display:flex"' : ''}${previewAttr}>
        <div class="w-form">
          <form id="wf-form-form-invite" name="form-invite" method="get"${action ? ` action="${action}"` : ''}${endpointAttr === null ? '' : ` data-referral-endpoint="${endpointAttr}"`}>
            <input type="email" name="parrainage" id="parrainage" required>
            <input type="submit" data-wait="Envoi en cours" value="Inviter">
          </form>
          <div class="w-form-done" style="display:none">Merci</div>
          <div class="w-form-fail" style="display:none">Erreur</div>
        </div>
      </div>
      <div id="referral-confirmation" class="sign_window hidden">
        <div>Nous avons envoyé une invitation à <span data-referral-email>email@confrere.fr</span></div>
        <a href="#" class="autre-lien">autre lien</a>
        <div><a id="go-back-link" class="text-style-link" href="#"><span>Inviter un autre confrère</span></a></div>
      </div>
    </body></html>`,
    { url: 'https://www.ordotype.fr/membership/connexion-2fa', runScripts: 'outside-only', virtualConsole }
  );
  const w = dom.window;
  if (sessionValue) w.sessionStorage.setItem('_ms-2fa-session', sessionValue);
  if (loginEmail !== null) w.sessionStorage.setItem('ms_email', loginEmail);
  return { dom, w, erreurs };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const el = (w, id) => w.document.getElementById(id);
const display = (w, id) => w.getComputedStyle(el(w, id)).display;

function assertShown(w, id) {
  assert.strictEqual(display(w, id), 'flex', `${id} devrait être affiché`);
  assert.strictEqual(el(w, id).classList.contains('hidden'), false, `${id} garde la classe hidden`);
  assert.strictEqual(w.getComputedStyle(el(w, id)).backgroundColor, 'rgb(255, 255, 255)', `${id} a perdu son fond`);
}

function assertHidden(w, id) {
  assert.strictEqual(display(w, id), 'none', `${id} devrait être masqué`);
}

function installFetch(w, respond) {
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, options });
    return respond(options);
  };
  return calls;
}

function submitInvite(w, email) {
  const form = el(w, 'wf-form-form-invite');
  form.querySelector('input[type="email"]').value = email;
  form.requestSubmit();
  return form;
}

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test("envoi réussi : adresse transmise, confirmation affichée avec l'adresse", async () => {
  const { w, erreurs } = page();
  const calls = installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  const form = submitInvite(w, '  confrere@example.test ');
  const bouton = form.querySelector('[type="submit"]');
  assert.strictEqual(bouton.value, 'Envoi en cours');
  assert.strictEqual(bouton.disabled, true);
  await tick();

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, ENDPOINT);
  assert.strictEqual(calls[0].options.method, 'POST');
  assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
    invitee_email: 'confrere@example.test',
    referrer_member_id: 'mem_parrain',
    referrer_email: 'parrain@example.test',
  });
  assert.ok(!calls[0].options.body.includes('*'), "l'e-mail masqué de la session ne part jamais");
  assertHidden(w, 'referral-invitation');
  assertShown(w, 'referral-confirmation');
  assert.strictEqual(w.document.querySelector('[data-referral-email]').textContent, 'confrere@example.test');
  assert.strictEqual(form.querySelector('input[type="email"]').value, '');
  assert.strictEqual(bouton.value, 'Inviter');
  assert.strictEqual(bouton.disabled, false);
  assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'none');
  assert.deepStrictEqual(erreurs, []);
});

test('masquage fiable même si la classe hidden seule ne masque pas le bloc', async () => {
  const { w } = page({ comboRule: false });
  installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  await tick();
  assertHidden(w, 'referral-invitation');
  assertShown(w, 'referral-confirmation');
});

test("le gestionnaire natif du formulaire ne voit pas l'invitation, les autres formulaires restent intacts", async () => {
  const { w } = page();
  installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  const vus = [];
  w.document.addEventListener('submit', (e) => {
    vus.push({ id: e.target.id, prevented: e.defaultPrevented });
    e.preventDefault();
  });
  submitInvite(w, 'confrere@example.test');
  el(w, 'code-form').requestSubmit();
  await tick();
  assert.deepStrictEqual(vus, [{ id: 'code-form', prevented: false }]);
});

test("réponse HTTP en erreur : message d'erreur, pas de confirmation", async () => {
  const { w } = page();
  installFetch(w, () => Promise.resolve({ ok: false, status: 500 }));
  w.eval(SCRIPT);
  const form = submitInvite(w, 'confrere@example.test');
  await tick();
  assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'block');
  assertShown(w, 'referral-invitation');
  assertHidden(w, 'referral-confirmation');
  assert.strictEqual(form.querySelector('input[type="email"]').value, 'confrere@example.test');
  assert.strictEqual(form.querySelector('[type="submit"]').disabled, false);
});

test("panne réseau : message d'erreur, et un nouvel essai réussi l'efface", async () => {
  const { w } = page();
  let echec = true;
  const calls = installFetch(w, () => (echec ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve({ ok: true, status: 200 })));
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  await tick();
  assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'block');
  echec = false;
  submitInvite(w, 'confrere@example.test');
  await tick();
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'none');
  assertShown(w, 'referral-confirmation');
});

test("délai dépassé : la requête est annulée et le message d'erreur apparaît", async () => {
  const { w } = page();
  installFetch(w, (options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const vraiSetTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms) => vraiSetTimeout(fn, ms >= 10000 ? 0 : ms);
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  await tick();
  assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'block');
  assertHidden(w, 'referral-confirmation');
});

test("adresse d'envoi lue dans data-referral-endpoint, formulaire Webflow sans action", async () => {
  const { w } = page({ action: '', endpointAttr: 'https://hook.example.test/attribut' });
  const calls = installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://hook.example.test/attribut');
  assert.strictEqual(calls[0].options.method, 'POST');
  assertShown(w, 'referral-confirmation');
});

test("sans session 2FA, sans e-mail de connexion lisible (absent, masqué) ou sans adresse d'envoi valide : rien n'est envoyé", async () => {
  for (const options of [{ sessionValue: null }, { loginEmail: null }, { loginEmail: 'pa****in@example.test' }, { loginEmail: 'unknown' }, { action: '' }, { action: 'http://hook.example.test/referral' }, { action: '', endpointAttr: 'http://hook.example.test/attribut' }]) {
    const { w } = page(options);
    const calls = installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
    w.eval(SCRIPT);
    submitInvite(w, 'confrere@example.test');
    await tick();
    assert.strictEqual(calls.length, 0, JSON.stringify(options));
    assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'block', JSON.stringify(options));
    assertHidden(w, 'referral-confirmation');
  }
});

test('mesure et signalement : envoi réussi mesuré, chaque échec mesuré avec sa raison et signalé', async () => {
  const lancer = async (options, repondre) => {
    const { w } = page(options);
    const signalements = [];
    w.addEventListener('error', (e) => signalements.push(e.message));
    installFetch(w, repondre);
    const vraiSetTimeout = w.setTimeout.bind(w);
    w.setTimeout = (fn, ms) => vraiSetTimeout(fn, ms >= 10000 ? 0 : ms);
    w.eval(SCRIPT);
    submitInvite(w, 'confrere@example.test');
    await tick();
    return { evenements: JSON.parse(JSON.stringify(w.dataLayer || [])), signalements };
  };
  const succes = () => Promise.resolve({ ok: true, status: 200 });

  let r = await lancer({}, succes);
  assert.deepStrictEqual(r.evenements, [{ event: 'referral_invite_sent' }]);
  assert.deepStrictEqual(r.signalements, [], 'rien à signaler sur un succès');

  const echecs = [
    ['http_500', {}, () => Promise.resolve({ ok: false, status: 500 })],
    ['network', {}, () => Promise.reject(new TypeError('Failed to fetch'))],
    ['timeout', {}, (options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    })],
    ['no_referrer', { loginEmail: null }, succes],
    ['no_endpoint', { action: '' }, succes],
  ];
  for (const [raison, options, repondre] of echecs) {
    r = await lancer(options, repondre);
    assert.deepStrictEqual(r.evenements, [{ event: 'referral_invite_failed', failure_reason: raison }], raison);
    assert.deepStrictEqual(r.signalements, ['Referral invite failed: ' + raison], raison);
    assert.ok(!r.signalements.some((m) => /Failed to fetch/.test(m)), 'le signalement ne doit pas passer pour une coupure réseau');
  }
});

test('double envoi pendant la requête : un seul appel', async () => {
  const { w } = page();
  let terminer;
  const calls = installFetch(w, () => new Promise((resolve) => { terminer = resolve; }));
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  const form = el(w, 'wf-form-form-invite');
  form.querySelector('[type="submit"]').disabled = false;
  form.requestSubmit();
  await tick();
  assert.strictEqual(calls.length, 1);
  terminer({ ok: true, status: 200 });
  await tick();
  assertShown(w, 'referral-confirmation');
});

test('formulaire remplacé par un clone après le chargement du script : toujours pris en charge', async () => {
  const { w } = page();
  const calls = installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  const ancien = el(w, 'wf-form-form-invite');
  ancien.parentNode.replaceChild(ancien.cloneNode(true), ancien);
  submitInvite(w, 'confrere@example.test');
  await tick();
  assert.strictEqual(calls.length, 1);
  assertShown(w, 'referral-confirmation');
});

test('#go-back-link ramène au formulaire vide, les autres liens ne sont pas touchés', async () => {
  const { w } = page();
  installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  await tick();

  const autre = w.document.querySelector('#referral-confirmation .autre-lien');
  const clicAutre = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  autre.dispatchEvent(clicAutre);
  assert.strictEqual(clicAutre.defaultPrevented, false);
  assertShown(w, 'referral-confirmation');

  const clic = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  w.document.querySelector('#go-back-link span').dispatchEvent(clic);
  assert.strictEqual(clic.defaultPrevented, true);
  assertHidden(w, 'referral-confirmation');
  assertShown(w, 'referral-invitation');
  const input = w.document.querySelector('#referral-invitation input[type="email"]');
  assert.strictEqual(input.value, '');
  assert.strictEqual(w.document.activeElement, input);
});

test('bloc révélé par Memberstack (display:flex en ligne sur un style masqué) : retour au formulaire après une invitation, double clic compris', async () => {
  const { w } = page({ gated: true });
  installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  assert.strictEqual(display(w, 'referral-invitation'), 'flex');
  submitInvite(w, 'confrere@example.test');
  await tick();
  assertHidden(w, 'referral-invitation');
  assertShown(w, 'referral-confirmation');
  w.document.querySelector('#go-back-link').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.strictEqual(display(w, 'referral-invitation'), 'flex', 'le style posé par Memberstack est rétabli');
  assertHidden(w, 'referral-confirmation');
  w.document.querySelector('#go-back-link').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  submitInvite(w, 'autre@example.test');
  await tick();
  assertHidden(w, 'referral-invitation');
  assertShown(w, 'referral-confirmation');
  w.document.querySelector('#go-back-link').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.strictEqual(display(w, 'referral-invitation'), 'flex', 'rétabli aussi au second aller-retour');
});

test('aperçu : le formulaire masqué ne s\'affiche que pour les adresses listées dans data-referral-preview', async () => {
  const essais = [
    { preview: 'william@ordotype.fr', email: 'William@Ordotype.fr', visible: true },
    { preview: ' autre@example.test , william@ordotype.fr ', email: 'william@ordotype.fr', visible: true },
    { preview: '@ordotype.fr', email: 'louis@ordotype.fr', visible: true },
    { preview: '@ordotype.fr', email: 'x@notordotype.fr', visible: false },
    { preview: '@ordotype.fr', email: 'x@ordotype.fr.example.test', visible: false },
    { preview: 'william@ordotype.fr', email: 'parrain@example.test', visible: false },
    { preview: '', email: 'william@ordotype.fr', visible: false },
    { preview: null, email: 'william@ordotype.fr', visible: false },
  ];
  for (const e of essais) {
    const { w } = page({ invitationHidden: true, preview: e.preview, loginEmail: e.email });
    w.eval(SCRIPT);
    await tick();
    const label = JSON.stringify(e);
    if (e.visible) assertShown(w, 'referral-invitation');
    else assert.strictEqual(display(w, 'referral-invitation'), 'none', label);
  }
  for (const options of [{ sessionValue: null, loginEmail: 'william@ordotype.fr' }, { loginEmail: 'wi****am@ordotype.fr' }]) {
    const { w } = page({ invitationHidden: true, preview: 'william@ordotype.fr, wi****am@ordotype.fr', ...options });
    w.eval(SCRIPT);
    await tick();
    assertHidden(w, 'referral-invitation');
  }
  const { w } = page({ invitationHidden: true, preview: 'william@ordotype.fr', loginEmail: null });
  w.eval(SCRIPT);
  await tick();
  assertHidden(w, 'referral-invitation');
});

(async () => {
  let echecs = 0;
  for (const { nom, fn } of cas) {
    try {
      await fn();
      console.log(`ok   ${nom}`);
    } catch (e) {
      echecs += 1;
      console.log(`FAIL ${nom}\n     ${e.message}`);
    }
  }
  console.log(`\n${cas.length - echecs}/${cas.length} cas passent`);
  process.exit(echecs ? 1 : 0);
})();
