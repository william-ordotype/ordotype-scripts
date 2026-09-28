#!/usr/bin/env node
/**
 * Page « moyen de paiement ajouté » : aucune requête réseau, `justPaidTs` posé,
 * compte à rebours de 2 secondes puis redirection vers `/`. Vrai aussi quand
 * les données Memberstack sont chargées sur la page avec un client Stripe.
 *
 * Usage : node test/moyen-de-paiement-ajoute-success.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REEL = fs.readFileSync(path.resolve(__dirname, '..', 'moyen-de-paiement-ajoute/success.js'), 'utf8');
const SCRIPT = REEL.split('window.location.href = redirectUrl;').join('window.__navigate(redirectUrl);');
assert.notStrictEqual(SCRIPT, REEL, 'ligne de navigation introuvable : le test ne pourrait pas l’observer');

const PAGE = 'https://www.ordotype.fr/membership/moyen-de-paiement-ajoute?session_id=cs_test_123';
const ACCELERATION = 20; // 1 s de compte à rebours = 50 ms ici

function page({ memberstack }) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM('<!doctype html><html><body><span id="countdown"></span> <span id="label"></span></body></html>', {
    url: PAGE, runScripts: 'outside-only', virtualConsole,
  });
  const w = dom.window;
  w.console.log = () => {};
  w.console.error = () => {};
  if (memberstack) {
    w.OrdoMemberstack = { stripeCustomerId: 'cus_test', memberId: 'mem_test', email: 'test@example.com' };
    w.$memberstackDom = { getMemberCookie: () => Promise.resolve('jeton-de-test') };
  }
  const reseau = [];
  w.fetch = (url) => {
    reseau.push('fetch ' + url);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ url: 'https://billing.stripe.com/p/session/test', id: 'bps_test' }) });
  };
  w.navigator.sendBeacon = (url) => { reseau.push('beacon ' + url); return true; };
  w.XMLHttpRequest = function() { reseau.push('xhr'); };
  const navigations = [];
  w.__navigate = (u) => navigations.push(u);
  const setIntervalReel = w.setInterval.bind(w);
  w.setInterval = (fn, ms) => setIntervalReel(fn, ms / ACCELERATION);
  const ecran = () => [w.document.getElementById('countdown').textContent, w.document.getElementById('label').textContent];
  return { w, reseau, navigations, ecran, fermer: () => w.close() };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

for (const memberstack of [true, false]) {
  test(`${memberstack ? 'client Stripe chargé sur la page' : 'sans données Memberstack'} : aucune requête, redirection vers / après le compte à rebours`, async () => {
    const p = page({ memberstack });
    try {
      p.w.eval(SCRIPT);
      await attendre(10);
      assert.deepStrictEqual(p.ecran(), ['2', 'secondes']);
      assert.ok(p.w.localStorage.getItem('justPaidTs'), 'justPaidTs posé');
      await attendre(65);
      assert.deepStrictEqual(p.ecran(), ['1', 'seconde']);
      assert.deepStrictEqual(p.navigations, [], 'pas avant la fin du compte à rebours');
      await attendre(150);
      assert.deepStrictEqual(p.ecran(), ['0', 'seconde']);
      assert.deepStrictEqual(p.navigations, ['/']);
      await attendre(150);
      assert.deepStrictEqual(p.navigations, ['/'], 'une seule redirection');
      assert.deepStrictEqual(p.reseau, [], 'aucune requête réseau');
    } finally {
      p.fermer();
    }
  });
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
