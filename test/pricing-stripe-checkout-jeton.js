#!/usr/bin/env node
/**
 * Pages tarifs (pricing/ et pricing-v2/) : la création des sessions part après
 * la lecture du jeton Memberstack. Avec un jeton, la requête porte
 * `Authorization: Bearer` ; sans jeton, elle part comme avant (pas d'en-tête,
 * même corps). Dans les deux cas le corps garde `stripeCustomerId` et ajoute
 * `v: 2`. Un 401 prend le repli Memberstack. Un visiteur sans client Stripe
 * n'attend rien et n'envoie rien.
 *
 * Usage : node test/pricing-stripe-checkout-jeton.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const BOUTON = (id, extra = '') => `<a id="${id}" class="button" href="#"${extra}><div class="button-content outer"><div>En profiter</div></div></a>`;
const GABARIT = `<!doctype html><html><head></head><body>
  ${BOUTON('signup-prat-from-decouverte')}
  ${BOUTON('signup-rempla-from-decouverte')}
  ${BOUTON('signup-prat-stripe-customer', ' data-price="price_prat" data-coupon="C1"')}
  ${BOUTON('signup-rempla-stripe-customer', ' data-price="price_rempla" data-coupon="C2"')}
</body></html>`;

const COMMUN = {
  stripeCustomerId: 'cus_test',
  priceId1: 'price_prat',
  couponId1: 'C1',
  priceId2: 'price_rempla',
  couponId2: 'C2',
  successUrl: 'https://www.ordotype.fr/membership/mes-informations-praticien',
};
const PAGES = {
  pricing: {
    code: lire('pricing/stripe-checkout.js'),
    url: 'https://www.ordotype.fr/nos-offres',
    corpsAvant: Object.assign({}, COMMUN, {
      pageCurrency: 'eur',
      cancelUrl1: 'https://www.ordotype.fr/inscription-non-terminee/praticien-sepa',
      cancelUrl2: 'https://www.ordotype.fr/inscription-non-terminee/rempla-sepa',
      payment_method_types: ['sepa_debit'],
    }),
  },
  'pricing-v2': {
    code: lire('pricing-v2/stripe-checkout.js'),
    url: 'https://www.ordotype.fr/nos-offres-v2',
    corpsAvant: Object.assign({}, COMMUN, {
      cancelUrl1: 'https://www.ordotype.fr/inscription-non-terminee/praticien-cb',
      cancelUrl2: 'https://www.ordotype.fr/inscription-non-terminee/rempla-cb',
      payment_method_types: ['card', 'sepa_debit'],
    }),
  },
};

const SESSIONS = { sessionId1: 'cs_1', url1: 'https://checkout.stripe.com/c/cs_1', sessionId2: 'cs_2', url2: 'https://checkout.stripe.com/c/cs_2' };

// jeton : ce que rend getMemberCookie() ; cookie 'jette' : il lève ;
// memberstackApres : délai avant l'apparition de window.$memberstackDom.
function page({ url, reponse = { status: 200, body: SESSIONS }, jeton = 'jeton-de-test', cookie = null, memberstackApres = null, client = 'cus_test' }) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(GABARIT, { url, runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.console.error = () => {};
  w.OrdoMemberstack = { stripeCustomerId: client, memberId: 'mem_test', email: 'test@example.com' };
  const evenements = [];
  const memberstack = {
    getMemberCookie: () => {
      evenements.push('jeton');
      if (cookie === 'jette') throw new Error('cookie indisponible');
      return Promise.resolve(jeton);
    },
  };
  if (memberstackApres === null) w.$memberstackDom = memberstack;
  else setTimeout(() => { w.$memberstackDom = memberstack; }, memberstackApres);
  w.OrdoErrorReporter = { report: () => {} };
  w.dataLayer = [];
  const requetes = [];
  w.fetch = (u, opts) => {
    evenements.push('session');
    requetes.push({ url: u, headers: Object.assign({}, opts.headers), body: JSON.parse(opts.body) });
    return Promise.resolve({ ok: reponse.status < 300, status: reponse.status, json: () => Promise.resolve(reponse.body) });
  };
  w.navigator.sendBeacon = () => true;
  return { w, requetes, evenements };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => el.style.display !== 'none';
const echecs = (w) => w.dataLayer.filter((e) => e.event === 'checkout_failed').map((e) => e.failure_reason);

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

for (const [nom, p] of Object.entries(PAGES)) {
  test(`${nom}, avec jeton : Authorization: Bearer, corps d'avant plus v: 2`, async () => {
    const { w, requetes } = page({ url: p.url });
    w.eval(p.code);
    await attendre(20);
    assert.strictEqual(requetes.length, 1);
    assert.ok(/pricing\.ordotype\.fr\/\.netlify\/functions\/create-checkout-session$/.test(requetes[0].url));
    assert.strictEqual(requetes[0].headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(requetes[0].headers['Content-Type'], 'application/json');
    assert.deepStrictEqual(requetes[0].body, Object.assign({ v: 2 }, p.corpsAvant));
    assert.deepStrictEqual(echecs(w), []);
  });

  test(`${nom}, sans jeton : pas d'en-tête, corps d'avant plus v: 2`, async () => {
    for (const opts of [{ jeton: null }, { jeton: '' }, { cookie: 'jette' }]) {
      const { w, requetes } = page(Object.assign({ url: p.url }, opts));
      w.eval(p.code);
      await attendre(20);
      assert.strictEqual(requetes.length, 1, JSON.stringify(opts));
      assert.deepStrictEqual(Object.keys(requetes[0].headers), ['Content-Type'], JSON.stringify(opts));
      assert.deepStrictEqual(requetes[0].body, Object.assign({ v: 2 }, p.corpsAvant), JSON.stringify(opts));
      assert.ok(visible(w.document.getElementById('signup-prat-stripe-customer')), JSON.stringify(opts));
    }
  });

  test(`${nom}, la session attend le jeton`, async () => {
    const { w, requetes, evenements } = page({ url: p.url, memberstackApres: 150 });
    w.eval(p.code);
    await attendre(100);
    assert.strictEqual(requetes.length, 0, 'aucune requête avant Memberstack');
    await attendre(400);
    assert.strictEqual(requetes.length, 1);
    assert.strictEqual(requetes[0].headers.Authorization, 'Bearer jeton-de-test');
    assert.deepStrictEqual(evenements, ['jeton', 'session']);
  });

  test(`${nom}, 401 : repli Memberstack`, async () => {
    const { w } = page({ url: p.url, reponse: { status: 401, body: { error: 'unauthorized' } } });
    w.eval(p.code);
    await attendre(20);
    for (const id of ['signup-prat-stripe-customer', 'signup-rempla-stripe-customer']) {
      assert.ok(!visible(w.document.getElementById(id)), id);
    }
    for (const id of ['signup-prat-from-decouverte', 'signup-rempla-from-decouverte']) {
      assert.ok(visible(w.document.getElementById(id)), id);
    }
    assert.deepStrictEqual(echecs(w), ['api_401']);
  });

  test(`${nom}, visiteur sans client Stripe : ni jeton lu ni requête`, async () => {
    const { w, requetes, evenements } = page({ url: p.url, client: null });
    w.eval(p.code);
    await attendre(20);
    assert.deepStrictEqual(requetes, []);
    assert.deepStrictEqual(evenements, []);
    assert.ok(visible(w.document.getElementById('signup-prat-from-decouverte')));
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
