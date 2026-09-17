#!/usr/bin/env node
/**
 * Formulaire d'invitation de la page 2FA : envoi, confirmation, erreur et retour au formulaire.
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
const SESSION = JSON.stringify({ data: { memberId: 'mem_parrain', email: 'parrain@example.test' } });

function page({ action = ENDPOINT, session = SESSION } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const dom = new JSDOM(
    `<!doctype html><html><head><style>
      .sign_window { display: flex; }
      .is-hidden { display: none; }
    </style></head><body>
      <form id="code-form"><input name="code" value="123456"><input type="submit" value="Valider"></form>
      <div id="referral-invitation" class="sign_window">
        <div class="w-form">
          <form id="wf-form-form-invite" name="form-invite" method="post" action="${action}">
            <input type="email" name="parrainage" id="parrainage" required>
            <input type="submit" data-wait="Envoi en cours" value="Inviter">
          </form>
          <div class="w-form-done" style="display:none">Merci</div>
          <div class="w-form-fail" style="display:none">Erreur</div>
        </div>
      </div>
      <div id="referral-confirmation" class="sign_window is-hidden">
        <div>Nous avons envoyé une invitation à<br><span data-referral-email>email@confrere.fr</span></div>
        <a href="mailto:contact@example.test">contact</a>
        <a href="#">Inviter un autre confrère</a>
      </div>
    </body></html>`,
    { url: 'https://www.ordotype.fr/membership/connexion-2fa', runScripts: 'outside-only', virtualConsole }
  );
  const w = dom.window;
  if (session) w.sessionStorage.setItem('_ms-2fa-session', session);
  return { dom, w, erreurs };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const display = (w, id) => w.getComputedStyle(w.document.getElementById(id)).display;

function installFetch(w, respond) {
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, options });
    return respond(options);
  };
  return calls;
}

function submitInvite(w, email) {
  const form = w.document.getElementById('wf-form-form-invite');
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
  assert.strictEqual(display(w, 'referral-invitation'), 'none');
  assert.strictEqual(display(w, 'referral-confirmation'), 'flex');
  assert.strictEqual(w.document.querySelector('[data-referral-email]').textContent, 'confrere@example.test');
  assert.strictEqual(form.querySelector('input[type="email"]').value, '');
  assert.strictEqual(bouton.value, 'Inviter');
  assert.strictEqual(bouton.disabled, false);
  assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'none');
  assert.deepStrictEqual(erreurs, []);
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
  w.document.getElementById('code-form').requestSubmit();
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
  assert.strictEqual(display(w, 'referral-invitation'), 'flex');
  assert.strictEqual(display(w, 'referral-confirmation'), 'none');
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
  assert.strictEqual(display(w, 'referral-confirmation'), 'flex');
});

test('délai dépassé : la requête est annulée et le message d\'erreur apparaît', async () => {
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
  assert.strictEqual(display(w, 'referral-confirmation'), 'none');
});

test("sans session 2FA ni adresse d'envoi valide : rien n'est envoyé", async () => {
  for (const options of [{ session: null }, { action: '' }, { action: 'http://hook.example.test/referral' }]) {
    const { w } = page(options);
    const calls = installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
    w.eval(SCRIPT);
    submitInvite(w, 'confrere@example.test');
    await tick();
    assert.strictEqual(calls.length, 0, JSON.stringify(options));
    assert.strictEqual(w.document.querySelector('.w-form-fail').style.display, 'block', JSON.stringify(options));
    assert.strictEqual(display(w, 'referral-confirmation'), 'none');
  }
});

test('double envoi pendant la requête : un seul appel', async () => {
  const { w } = page();
  let terminer;
  const calls = installFetch(w, () => new Promise((resolve) => { terminer = resolve; }));
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  const form = w.document.getElementById('wf-form-form-invite');
  form.querySelector('[type="submit"]').disabled = false;
  form.requestSubmit();
  await tick();
  assert.strictEqual(calls.length, 1);
  terminer({ ok: true, status: 200 });
  await tick();
  assert.strictEqual(display(w, 'referral-confirmation'), 'flex');
});

test('formulaire remplacé par un clone après le chargement du script : toujours pris en charge', async () => {
  const { w } = page();
  const calls = installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  const ancien = w.document.getElementById('wf-form-form-invite');
  ancien.parentNode.replaceChild(ancien.cloneNode(true), ancien);
  submitInvite(w, 'confrere@example.test');
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(display(w, 'referral-confirmation'), 'flex');
});

test("« Inviter un autre confrère » ramène au formulaire vide, les autres liens ne sont pas touchés", async () => {
  const { w } = page();
  installFetch(w, () => Promise.resolve({ ok: true, status: 200 }));
  w.eval(SCRIPT);
  submitInvite(w, 'confrere@example.test');
  await tick();

  const mailto = w.document.querySelector('#referral-confirmation a[href^="mailto:"]');
  const clicMailto = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  mailto.addEventListener('click', (e) => e.preventDefault());
  mailto.dispatchEvent(clicMailto);
  assert.strictEqual(display(w, 'referral-confirmation'), 'flex');

  const retour = w.document.querySelector('#referral-confirmation a[href="#"]');
  const clic = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  retour.dispatchEvent(clic);
  assert.strictEqual(clic.defaultPrevented, true);
  assert.strictEqual(display(w, 'referral-confirmation'), 'none');
  assert.strictEqual(display(w, 'referral-invitation'), 'flex');
  const input = w.document.querySelector('#referral-invitation input[type="email"]');
  assert.strictEqual(input.value, '');
  assert.strictEqual(w.document.activeElement, input);
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
