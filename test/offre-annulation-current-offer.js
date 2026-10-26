#!/usr/bin/env node
/**
 * Current offer on the cancellation page (offre-annulation/current-offer.js).
 *
 * What must hold:
 *   - one request to the endpoint: POST `{ action: 'apercu-redeem-mg' }` with the session token, nothing
 *     else in the body;
 *   - a 409 `remise_en_cours` replaces the -50 % block with the current offer: kicker, price after the
 *     discount, the wording of its kind (until a date, forever, once), the link back to the account; the
 *     intro line changes, the redeem form is gone, pause and cancel are untouched;
 *   - fields missing from `remise` give the short card, never a wrong amount;
 *   - any other answer (200, 503, unreadable, network error, no session, no answer in time) keeps the
 *     -50 % offer and shows it again;
 *   - a refusal that comes after the timeout still replaces the offer;
 *   - window.OrdoCurrentOffer.show() does the same for the refusal of a submitted offer.
 *
 * Usage: node test/offre-annulation-current-offer.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const REAL = fs.readFileSync(path.resolve(__dirname, '..', 'offre-annulation/current-offer.js'), 'utf8');
// The 3 s answer timeout shortened to 80 ms: same checks, without sleeping.
const SCRIPT = REAL.split('var ANSWER_TIMEOUT = 3000;').join('var ANSWER_TIMEOUT = 80;');
assert.notStrictEqual(SCRIPT, REAL, 'timeout not found');
const ENDPOINT = 'https://webhooks.ordotype.fr/.netlify/functions/member-forms';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

// Copied from the live page structure.
const HTML = '<!doctype html><html><body><div class="inscr-p_card inscr-p_offer">' +
  '<div class="inscr-p_head"><h1 class="inscr-p_title">Avant de partir</h1>' +
  '<p class="inscr-p_note">Avant de confirmer la résiliation, voici deux autres possibilités.</p>' +
  '<p id="session-stats" class="inscr-p_note" style="display:none;">Le mois dernier, vous avez utilisé Ordotype <strong id="session-count">0</strong> fois.</p></div>' +
  '<div class="inscr-p_sep"></div>' +
  '<div class="inscr-p_actions" id="offer"><div class="inscr-p_kicker">Réduction de 50&nbsp;%</div>' +
  '<div class="inscr-p_price"><div class="inscr-p_price-num">15&nbsp;€</div><div class="text-size-regular">/mois</div></div>' +
  '<p class="inscr-p_note">au lieu de 30&nbsp;€, pendant 6 mois.</p>' +
  '<form id="redeem-form" data-ordo-action="redeem-mg"><button class="button" type="submit">Profiter de l\'offre</button></form>' +
  '<div id="waiting-message-redeem" style="display:none;"></div><div id="success-message-redeem" style="display:none;"></div>' +
  '<div id="error-message-redeem" style="display:none;"></div></div>' +
  '<div class="inscr-p_sep"></div>' +
  '<div class="inscr-p_actions" id="pause"><div>Mettre en pause</div><form id="pause-form"><button type="submit">Mettre en pause pendant 6 mois</button></form></div>' +
  '<div class="inscr-p_sep"></div>' +
  '<div class="text-align-center"><form id="cancel-form"><button type="submit">Non merci, annuler mon abonnement</button></form></div>' +
  '</div></body></html>';

const remiseBody = (remise) => ({ status: 409, body: { error: 'remise_en_cours', remise } });
const OFFERT = { prix: 3000, prixRemise: 0, intervalle: 'month', duree: 'repeating', pleinTarif: '2027-04-25' };

// answer: { status, body } | { transport } | { never: true }; token: session token ('' = none);
// memberstack: false = the SDK never arrives.
function page({ answer = { status: 200, body: { apercu: true, remise: null } }, token = 'jeton-de-test', memberstack = true, html = HTML, late = null } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/membership/offre-annulation', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const d = w.document;
  // What the loader does before this script runs.
  const block = d.getElementById('offer');
  if (block) block.style.visibility = 'hidden';
  if (memberstack) w.$memberstackDom = { getMemberCookie: () => Promise.resolve(token) };
  const fetches = [];
  w.fetch = (url, opts) => {
    fetches.push({ url, method: opts.method, headers: Object.assign({}, opts.headers), body: opts.body });
    if (answer.transport) return Promise.reject(new TypeError(answer.transport));
    const respond = (a) => ({ status: a.status, json: () => (typeof a.body === 'string' ? Promise.reject(new Error('json')) : Promise.resolve(a.body)) });
    if (answer.never) return late ? wait(late.after).then(() => respond(late)) : new Promise(() => {});
    return Promise.resolve(respond(answer));
  };
  const reports = [];
  w.OrdoErrorReporter = { report: (ctx, err) => reports.push(err.name) };
  w.eval(SCRIPT);
  const text = (sel) => { const n = d.querySelector(sel); return n ? n.textContent : null; };
  return { w, d, fetches, reports, text, block: () => d.getElementById('offer') };
}

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('ok  ' + name);
}

function assertOfferKept(p) {
  assert.ok(p.d.getElementById('redeem-form'), 'offer form still there');
  assert.strictEqual(p.block().style.visibility, '', 'offer shown again');
  assert.strictEqual(p.block().getAttribute('data-ordo-offer'), 'offer');
  assert.strictEqual(p.text('.inscr-p_head .inscr-p_note'), 'Avant de confirmer la résiliation, voici deux autres possibilités.');
}

function assertCard(p, price, unit, note) {
  const b = p.block();
  assert.strictEqual(b.getAttribute('data-ordo-offer'), 'current');
  assert.strictEqual(b.style.visibility, '');
  assert.strictEqual(p.d.getElementById('redeem-form'), null, 'offer form removed');
  assert.strictEqual(p.text('#offer .inscr-p_kicker'), 'Votre offre en cours');
  assert.strictEqual(p.text('#offer .inscr-p_price-num'), price);
  assert.strictEqual(p.text('#offer .inscr-p_price .text-size-regular'), unit);
  assert.strictEqual(p.text('#offer .inscr-p_note'), note);
  const keep = b.querySelector('a.button.w-button');
  assert.strictEqual(keep.textContent, 'Garder mon abonnement');
  assert.strictEqual(keep.getAttribute('href'), '/membership/compte#abonnements');
  assert.strictEqual(p.text('.inscr-p_head .inscr-p_note'), 'Avant de confirmer la résiliation, voici votre offre en cours et une autre possibilité.');
  assert.strictEqual(p.text('#session-stats').indexOf('Le mois dernier'), 0, 'session line untouched');
  assert.ok(p.d.getElementById('pause-form') && p.d.getElementById('cancel-form'), 'pause and cancel untouched');
}

(async () => {
  await check('request: one POST with the session token and the preview action only', async () => {
    const p = page();
    await wait(30);
    assert.strictEqual(p.fetches.length, 1);
    const f = p.fetches[0];
    assert.strictEqual(f.url, ENDPOINT);
    assert.strictEqual(f.method, 'POST');
    assert.strictEqual(f.headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(f.body, JSON.stringify({ action: 'apercu-redeem-mg' }));
  });

  await check('free months: 0 €/mois, offered until the first full-price payment', async () => {
    const p = page({ answer: remiseBody(OFFERT) });
    await wait(30);
    assertCard(p, '0 €', '/mois', 'offert jusqu’au 25 avril 2027, puis 30 € par mois. Cette offre prend fin si vous résiliez.');
  });

  await check('-50 % running: 15 €/mois instead of 30 €, until the date', async () => {
    const p = page({ answer: remiseBody({ prix: 3000, prixRemise: 1500, intervalle: 'month', duree: 'repeating', pleinTarif: '2027-03-12' }) });
    await wait(30);
    assertCard(p, '15 €', '/mois', 'au lieu de 30 €, jusqu’au 12 mars 2027. Cette offre prend fin si vous résiliez.');
  });

  await check('discount forever: no end date', async () => {
    const p = page({ answer: remiseBody({ prix: 3000, prixRemise: 2400, intervalle: 'month', duree: 'forever', pleinTarif: null }) });
    await wait(30);
    assertCard(p, '24 €', '/mois', 'au lieu de 30 €, sans limite de durée. Cette offre prend fin si vous résiliez.');
  });

  await check('first of the month and cents: « 1er », « 12,50 € »', async () => {
    const p = page({ answer: remiseBody({ prix: 2500, prixRemise: 1250, intervalle: 'month', duree: 'once', pleinTarif: '2027-04-01' }) });
    await wait(30);
    assertCard(p, '12,50 €', '/mois', 'au lieu de 25 €, jusqu’au 1er avril 2027. Cette offre prend fin si vous résiliez.');
  });

  await check('missing or inconsistent amounts: the short card, no price', async () => {
    for (const remise of [
      { prix: null, prixRemise: null, intervalle: null, duree: null, pleinTarif: null },
      { prix: 3000, prixRemise: 4000, intervalle: 'month', duree: 'repeating', pleinTarif: '2027-04-25' },
      { prix: '3000', prixRemise: 0 },
      {},
    ]) {
      const p = page({ answer: remiseBody(remise) });
      await wait(30);
      assert.strictEqual(p.block().getAttribute('data-ordo-offer'), 'current', JSON.stringify(remise));
      assert.strictEqual(p.d.querySelector('#offer .inscr-p_price'), null);
      assert.strictEqual(p.text('#offer .inscr-p_note'), 'Votre abonnement bénéficie déjà d’une offre en cours. Cette offre prend fin si vous résiliez.');
      assert.ok(p.d.querySelector('#offer a.button'));
    }
  });

  for (const [label, answer] of [
    ['200 (the offer is possible)', { status: 200, body: { apercu: true, remise: null } }],
    ['503 (subscriptions unreadable)', { status: 503, body: { error: 'verification_impossible' } }],
    ['409 abonnement_absent', { status: 409, body: { error: 'abonnement_absent' } }],
    ['409 without remise', { status: 409, body: { error: 'remise_en_cours' } }],
    ['409 unreadable body', { status: 409, body: 'not json' }],
    ['401', { status: 401, body: { error: 'unauthorized' } }],
    ['network error', { transport: 'Failed to fetch' }],
  ]) {
    await check(`${label}: the -50 % offer is kept and shown`, async () => {
      const p = page({ answer });
      await wait(30);
      assertOfferKept(p);
    });
  }

  await check('no session token: nothing sent, offer kept', async () => {
    const p = page({ token: '' });
    await wait(30);
    assert.strictEqual(p.fetches.length, 0);
    assertOfferKept(p);
  });

  await check('Memberstack never arrives: nothing sent, offer shown after the timeout', async () => {
    const p = page({ memberstack: false });
    await wait(30);
    assert.strictEqual(p.block().style.visibility, 'hidden', 'still waiting');
    await wait(200);
    assert.strictEqual(p.fetches.length, 0);
    assertOfferKept(p);
  });

  await check('no answer in time: offer shown; a refusal that comes later still replaces it', async () => {
    const p = page({ answer: { never: true }, late: { after: 250, ...remiseBody(OFFERT) } });
    await wait(150);
    assertOfferKept(p);
    await wait(250);
    assertCard(p, '0 €', '/mois', 'offert jusqu’au 25 avril 2027, puis 30 € par mois. Cette offre prend fin si vous résiliez.');
  });

  await check('OrdoCurrentOffer.show(): replaces the block for a submitted offer, false without remise', async () => {
    const p = page({ answer: { never: true } });
    await wait(150);
    assert.strictEqual(p.w.OrdoCurrentOffer.show(null), false);
    assert.ok(p.d.getElementById('redeem-form'));
    assert.strictEqual(p.w.OrdoCurrentOffer.show(OFFERT), true);
    assertCard(p, '0 €', '/mois', 'offert jusqu’au 25 avril 2027, puis 30 € par mois. Cette offre prend fin si vous résiliez.');
  });

  await check('page without the offer form: nothing sent, show() returns false', async () => {
    const p = page({ html: '<!doctype html><html><body><form id="cancel-form"></form></body></html>' });
    await wait(30);
    assert.strictEqual(p.fetches.length, 0);
    assert.strictEqual(p.w.OrdoCurrentOffer.show(OFFERT), false);
  });

  console.log('\n' + passed + ' checks pass');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
