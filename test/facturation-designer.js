#!/usr/bin/env node
/**
 * Onglet Facturation dessiné dans le Designer (palier facturation-designer.js).
 *
 * La page de test est l'onglet tel que Webflow le publie (test/fixtures/compte-facturation.html, copie du
 * domaine de recette) : la Facturation du Designer, son bloc de gabarits, et les anciens blocs en secours.
 * Ce qui est vérifié :
 *   - mêmes textes que la présentation héritée, pour chaque carte, moyen de paiement, facture et adresse ;
 *   - le dessin vient du Designer : classes recopiées des gabarits, aucune feuille de style injectée ;
 *   - les gabarits en place disparaissent, aucun identifiant n'est dupliqué, rien ne reste d'un rendu à l'autre ;
 *   - formulaires recopiés : identifiants, libellés, pays, envoi gardé loin de Webflow ;
 *   - squelette, secours sur erreur, palier coupé, repère manquant (retour à l'héritée, signalé) ;
 *   - l'interrupteur « factures par e-mail » piloté sur l'élément du Designer.
 *
 * Usage : node test/facturation-designer.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'account/subscriptions-overview.js'), 'utf8');
const NAV_SCRIPT = SCRIPT.split('window.location.assign(').join('window.__navigate(');
const EMAILS = fs.readFileSync(path.join(ROOT, 'account/invoice-emails.js'), 'utf8');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-facturation.html'), 'utf8');
// La règle d'en-tête qui cache la Facturation tant qu'elle n'est pas remplie (account/compte-head.html).
const HEAD = fs.readFileSync(path.join(ROOT, 'account/compte-head.html'), 'utf8');
const HEAD_STYLE = /<style>([\s\S]*?)<\/style>/.exec(HEAD)[1];
// Règles de base publiées par Webflow pour ces classes : une classe qui fixe `display` l'emporte sur `hidden`.
const SITE_CSS = fs.readFileSync(path.join(ROOT, 'test/fixtures/compte-facturation.css'), 'utf8');

const PRICE = (amount, current) => ({ amount, current, currency: 'eur', interval: 'month', intervalCount: 1 });
const CARDS = [
  { label: 'Médecine Générale', status: 'active', price: PRICE(3000, 1500), icon: 'https://cdn.prod.website-files.com/x/logo.svg',
    discount: { percentOff: 50, amountOff: null, currency: null, duration: 'repeating', end: '2026-12-21' },
    offeredUntil: null, next: { date: '2026-10-05', amount: 1500 }, endsOn: null, resumesOn: null },
  { label: 'Module Rhumatologie', status: 'active', price: PRICE(500, 500), icon: 'https://evil.example/x.svg',
    discount: null, offeredUntil: '2026-10-01', next: { date: '2026-10-01', amount: 500 }, endsOn: null, resumesOn: null },
  { label: 'Module Soins palliatifs', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null,
    action: { label: 'Voir les offres', href: '/nos-offres' } },
  { label: 'Stockage', status: 'canceling', price: PRICE(200, 200), discount: null, offeredUntil: null, next: null, endsOn: '2026-09-30', resumesOn: null },
  { label: 'Impayé', status: 'past_due', price: PRICE(3000, 3000), discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Pause prévue', status: 'pause_scheduled', price: PRICE(3000, 3000), discount: null, offeredUntil: null, next: null, endsOn: '2026-10-17', resumesOn: '2027-03-17' },
  { label: 'En attente', status: 'pending', price: PRICE(3000, 3000), discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: '<img src=x onerror=alert(1)>', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Essai terminé', status: 'ended', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Essai gratuit', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null,
    note: 'Valable 15 jours à partir de votre inscription.' },
  { label: 'Résiliation', status: 'canceling', price: PRICE(3000, 3000), discount: null, offeredUntil: null,
    next: { date: '2026-11-01', amount: 3000 }, endsOn: '2026-11-01', resumesOn: null, reactivation: 'a1b2c3d4e5f6a7b8c9d0' },
];
const VISA = { type: 'card', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2027, expired: false, expiresSoon: false,
  usedBy: ['Médecine Générale', 'Module Rhumatologie'], usedByIcons: ['https://cdn.prod.website-files.com/x/logo.svg', null] };
const SEPA = { type: 'sepa_debit', last4: '3000', expired: false, expiresSoon: false, usedBy: ['Stockage'] };
const EXPIRED = Object.assign({}, VISA, { expMonth: 6, expYear: 2026, expired: true, usedBy: ['Médecine Générale'], usedByIcons: [] });
const OTHERS = [{ type: 'card', last4: '1004' }];
const INVOICES = [
  { ref: 'a1b2c3d4e5f6a7b8c9d1', date: '2026-09-14', label: 'Médecine Générale', amount: 1500, currency: 'eur', status: 'paid', pdf: true },
  { ref: 'a1b2c3d4e5f6a7b8c9d2', date: '2026-09-01', label: 'Module Rhumatologie', amount: 500, currency: 'eur', status: 'processing', pdf: true },
  { ref: 'a1b2c3d4e5f6a7b8c9d3', date: '2026-08-14', label: null, amount: 3000, currency: 'eur', status: 'due', pdf: false, pay: 'setup' },
];
const ADDRESS = { name: 'Dr Test', line1: '1 rue Exemple', line2: '', postalCode: '75001', city: 'Paris', country: 'FR' };

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function text(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 4);
  const parts = [];
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue.replace(/[\u00a0\u202f]/g, ' ').trim());
  return parts.filter(Boolean).join(' ');
}

/**
 * designer : décision du palier ; outcomes : réponses successives de la fonction (liste puis actions) ;
 * removeGabarit : retire un repère du Designer avant le chargement.
 */
function page({ designer = true, outcomes = [], visible = true, removeGabarit = null, emails = false, emailsState = { eligible: true, enabled: false }, emailsWrite = null } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${SITE_CSS}</style><style>${HEAD_STYLE}</style></head><body><div class="w-tabs">${FIXTURE}</div></body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole }
  );
  const w = dom.window;
  if (removeGabarit) {
    const n = w.document.querySelector(removeGabarit);
    n.parentNode.removeChild(n);
  }
  const reported = [];
  const network = [];
  const opened = [];
  const pushed = [];
  w.dataLayer = { push: (p) => { pushed.push(p); return 0; } };
  w.OrdoRollout = {
    'facturation-designer.js': { enabled: designer, reason: 'bucket' },
    'subscriptions-overview.js': { enabled: true, reason: 'bucket' },
    'invoice-emails.js': { enabled: true, reason: 'bucket' }
  };
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: 'cus_test', planConnections: [{ status: 'ACTIVE', type: 'SUBSCRIPTION' }, { status: 'ACTIVE', type: 'FREE' }] } };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('jeton-de-test') };
  w.OrdoErrorReporter = {
    report(ctx, err) { reported.push({ ctx, err }); },
    reportNetwork(ctx, err) { network.push({ ctx, err }); return true; },
  };
  w.OrdoBillingPortal = { open() { opened.push(true); } };
  w.confirm = () => true;
  w.console.log = () => {};
  w.__navigate = () => {};
  const observers = [];
  w.IntersectionObserver = function(cb) {
    const o = { cb, targets: [] };
    observers.push(o);
    this.observe = (target) => {
      o.targets.push(target);
      if (visible) setTimeout(() => cb([{ target, isIntersecting: true }]), 0);
    };
    this.disconnect = () => {};
  };
  // Webflow écoute les envois de formulaire au niveau du document : aucun ne doit lui parvenir.
  const webflowSubmits = [];
  w.document.addEventListener('submit', (e) => webflowSubmits.push(e.target));
  const calls = [];
  const emailCalls = [];
  w.fetch = (url, options) => {
    if (String(url).indexOf('invoice-emails') !== -1) {
      emailCalls.push({ url, options });
      if (options && options.method === 'POST') {
        const r = emailsWrite || { status: 200, body: { ok: true } };
        return Promise.resolve({ ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.body || {}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(emailsState) });
    }
    if (String(url).indexOf('abonnements-affiches') !== -1) {
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    }
    calls.push({ url, options });
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (outcome.transport) return Promise.reject(new TypeError(outcome.transport));
    const response = { ok: outcome.status < 400, status: outcome.status, json: () => Promise.resolve(outcome.body || {}) };
    if (outcome.delay) return new Promise((r) => setTimeout(() => r(response), outcome.delay));
    return Promise.resolve(response);
  };
  return { dom, w, erreurs, reported, network, opened, pushed, observers, calls, emailCalls, webflowSubmits,
    run() { w.eval(NAV_SCRIPT); if (emails) w.eval(EMAILS); } };
}

const doc = (t) => t.w.document;
const root = (t) => doc(t).querySelector('[data-ordo-facturation]');
const section = (t, name) => root(t).querySelector('[data-ordo-section="' + name + '"]');
const designerCards = (t) => Array.from(root(t).querySelectorAll('[data-ordo-liste="abonnements"] > [data-ordo-rendu]'));
const legacyCards = (t) => Array.from(doc(t).querySelectorAll('#ordotype-subscriptions .ordo-subs-card'));
// Visible pour de vrai : ni l'élément ni un ancêtre n'est masqué. Sur le site, l'attribut `hidden` ne masque rien
// dès qu'une classe fixe `display` (la règle de base Webflow n'est pas prioritaire) ; jsdom, lui, le fait toujours
// gagner. On ne lui fait donc pas confiance : un élément qui n'est caché QUE par `hidden` compte comme visible.
function visibleIn(t, node) {
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    if (n.style.display === 'none') return false;
    if (n.hasAttribute('hidden')) continue;
    if (t.w.getComputedStyle(n).display === 'none') return false;
  }
  return true;
}

async function both(body) {
  const legacy = page({ designer: false, outcomes: [{ status: 200, body }] });
  legacy.run();
  const designer = page({ designer: true, outcomes: [{ status: 200, body }] });
  designer.run();
  await wait(80);
  return { legacy, designer };
}

async function main() {
  // Mêmes textes que la présentation héritée, carte par carte
  {
    const { legacy, designer: t } = await both({ subscriptions: CARDS, paymentMethods: [VISA], otherPaymentMethods: OTHERS, invoices: INVOICES,
      billingAddress: ADDRESS, taxId: null, taxIdAllowed: true });
    const before = legacyCards(legacy).map(text);
    const after = designerCards(t).map(text);
    assert.strictEqual(after.length, CARDS.length);
    assert.deepStrictEqual(after, before);
    assert.strictEqual(after[0], 'Médecine Générale Actif 15 € / mois au lieu de 30 € -50 % jusqu’au 21 décembre 2026 Puis 30 € / mois Prochain prélèvement 15 € le 5 octobre 2026');

    // Le dessin vient du Designer : aucune feuille injectée, classes recopiées des gabarits
    assert.strictEqual(doc(t).getElementById('ordo-subs-style'), null);
    assert.strictEqual(doc(t).getElementById('ordotype-subscriptions').children.length, 0);
    const cards = designerCards(t);
    assert.ok(cards[0].classList.contains('compte-v2_abo'));
    assert.strictEqual(cards[0].querySelector('[data-ordo-champ="nom"] + .compte-v2_badge, .compte-v2_abo-head > .compte-v2_badge').className, 'compte-v2_badge is-actif');
    assert.strictEqual(cards[2].querySelector('.compte-v2_abo-head > .compte-v2_badge').className, 'compte-v2_badge is-succes');
    assert.strictEqual(cards[4].querySelector('.compte-v2_abo-head > .compte-v2_badge').className, 'compte-v2_badge is-a-regulariser');
    assert.strictEqual(cards[3].querySelector('.compte-v2_abo-head > .compte-v2_badge').className, 'compte-v2_badge');
    // Logo : seulement d'un hôte Webflow ; sinon retiré
    assert.strictEqual(cards[0].querySelector('img').getAttribute('src'), 'https://cdn.prod.website-files.com/x/logo.svg');
    assert.strictEqual(cards[0].querySelector('img').getAttribute('alt'), '');
    assert.strictEqual(cards[1].querySelector('img'), null);
    // Les libellés sont du texte
    assert.strictEqual(cards[7].querySelectorAll('img').length, 0);
    // Lien d'impayé vers la page de moyen de paiement, avec la classe du gabarit « lien »
    const fix = cards[4].querySelector('a[href="/membership/moyen-de-paiement"]');
    assert.ok(fix && fix.classList.contains('compte-v2_lien'));
    // Action de plan : lien du gabarit « bouton »
    const offres = cards[2].querySelector('a[href="/nos-offres"]');
    assert.strictEqual(offres.className, 'compte-v2_btn');
    assert.strictEqual(offres.getAttribute('data-subs-action'), 'voir_les_offres');
    // Me réabonner : vrai bouton, classe du gabarit « bouton-primaire », zone d'état du gabarit « message »
    const again = cards[10].querySelector('button');
    assert.strictEqual(again.textContent, 'Me réabonner');
    assert.strictEqual(again.className, 'compte-v2_btn is-principal');
    assert.ok(cards[10].querySelector('.compte-v2_message[role="status"]'));
    // Les actions vivent dans la rangée dessinée dans le Designer
    assert.ok(again.parentElement.classList.contains('compte-v2_actions'));

    // La Facturation est montrée, les anciens blocs cachés, la page dit qu'elle est rendue
    assert.ok(doc(t).documentElement.classList.contains('ordo-subs-v2'));
    assert.strictEqual(root(t).hidden, false);
    assert.ok(visibleIn(t, root(t)));
    assert.strictEqual(doc(t).getElementById('payment-method-block').style.display, 'none');
    assert.strictEqual(doc(t).getElementById('invoices-block').style.display, 'none');

    // Sans invoice-emails.js, l'interrupteur dessiné ne se montre jamais (pas de position inventée)
    assert.ok(!visibleIn(t, root(t).querySelector('[data-ordo-factures-email]')));
    // Ni numéro de TVA ni droit d'en ajouter : la zone TVA (en flex dans le Designer) disparaît
    // (ici l'ajout est permis : elle est là)
    assert.ok(visibleIn(t, section(t, 'adresse').querySelector('[data-ordo-zone="tva"]')));

    // Les gabarits en place ont quitté la page ; aucun identifiant ajouté n'est en double
    assert.strictEqual(root(t).querySelectorAll('[data-ordo-gabarit]').length, 0);
    assert.deepStrictEqual(t.erreurs, []);
    assert.strictEqual(t.reported.length + t.network.length, 0);
    legacy.dom.window.close();
    t.dom.window.close();
  }

  // Moyen de paiement : mêmes textes, icône et classes du Designer
  for (const [pms, list] of [[[VISA], [CARDS[0]]], [[EXPIRED], [CARDS[0]]], [[VISA, SEPA], [CARDS[0], CARDS[3]]], [[{ type: 'none', usedBy: ['Médecine Générale'] }], [CARDS[0]]]]) {
    const { legacy, designer: t } = await both({ subscriptions: list, paymentMethods: pms, otherPaymentMethods: OTHERS, invoices: [] });
    const legacyText = text(doc(legacy).querySelector('.ordo-pm'));
    const card = section(t, 'moyen-de-paiement');
    assert.strictEqual(card.hidden, false);
    assert.strictEqual(text(card), legacyText);
    const rows = card.querySelectorAll('.compte-v2_moyen');
    assert.strictEqual(rows.length, pms.length);
    if (pms[0] === VISA && pms.length === 1) {
      // « Modifier » ouvre le portail : vrai bouton, classe du gabarit « bouton »
      const edit = card.querySelector('button.compte-v2_btn');
      assert.strictEqual(edit.textContent, 'Modifier');
      assert.ok(!edit.classList.contains('is-principal'));
      edit.click();
      assert.strictEqual(t.opened.length, 1);
      assert.ok(card.querySelector('.compte-v2_picto.is-moyen'));
      assert.strictEqual(card.querySelector('.compte-v2_moyen-usage img').getAttribute('src'), 'https://cdn.prod.website-files.com/x/logo.svg');
      assert.ok(text(card).includes('Aussi enregistrée : carte •••• 1004, non utilisée'));
    }
    if (pms[0] === EXPIRED) {
      assert.ok(card.querySelector('.compte-v2_picto.is-moyen.is-expiree'));
      assert.ok(card.querySelector('.compte-v2_badge.is-a-regler'));
      assert.ok(card.querySelector('a.compte-v2_btn.is-principal[href="/membership/moyen-de-paiement"]'));
    }
    if (pms.length === 2) {
      assert.ok(card.querySelector('.compte-v2_picto.is-moyen svg path[d="M3 20h18"]'), 'icône banque pour le SEPA');
      assert.ok(card.lastElementChild.classList.contains('compte-v2_actions'), 'un seul bouton, sous les moyens');
    }
    legacy.dom.window.close();
    t.dom.window.close();
  }

  // Factures : mêmes lignes, statuts et PDF du Designer, interrupteur e-mail déplacé dans la carte
  {
    const body = { subscriptions: [CARDS[0]], paymentMethods: [VISA], invoices: INVOICES };
    const { legacy } = await both(body);
    const legacyRows = Array.from(doc(legacy).querySelectorAll('.ordo-inv-row:not(.ordo-inv-head)')).map(text);
    legacy.dom.window.close();
    const t = page({ outcomes: [{ status: 200, body }, { status: 500, body: {} }], emails: true });
    t.run();
    await wait(120);
    const card = section(t, 'factures');
    assert.ok(visibleIn(t, card));
    const rows = Array.from(card.querySelectorAll('.compte-v2_facture[data-ordo-rendu]')).map(text);
    assert.deepStrictEqual(rows, legacyRows);
    assert.strictEqual(card.querySelectorAll('.compte-v2_facture').length, 1 + INVOICES.length, 'en-tête + lignes, sans le gabarit');
    assert.ok(card.querySelector('.compte-v2_badge.is-paye') && card.querySelector('.compte-v2_badge.is-en-cours') && card.querySelector('.compte-v2_badge.is-a-regler'));
    const pdf = card.querySelector('button.compte-v2_pdf');
    assert.ok(pdf, 'PDF : vrai bouton, classe du gabarit');
    assert.strictEqual(pdf.getAttribute('aria-label'), 'Télécharger la facture du 14 septembre 2026');
    assert.ok(pdf.querySelector('svg'));
    pdf.click();
    await wait(60);
    assert.strictEqual(pdf.lastChild.textContent, 'Réessayer', 'échec du PDF annoncé dans le libellé');
    // Portail
    const portal = card.querySelector('button[data-subs-action="portail"]');
    assert.ok(portal && portal.classList.contains('compte-v2_lien'));
    portal.click();
    assert.strictEqual(t.opened.length, 1);
    // L'interrupteur du Designer : pris par invoice-emails.js, déplacé dans la carte, rendu
    const row = card.querySelector('[data-ordo-slot="factures-email"] [data-ordo-factures-email]');
    assert.ok(row, 'ligne de l\'interrupteur dans la carte Factures');
    assert.ok(visibleIn(t, row));
    const sw = row.querySelector('[role="switch"]');
    assert.strictEqual(sw.getAttribute('aria-checked'), 'false');
    assert.ok(!sw.classList.contains('is-chargement'));
    assert.strictEqual(doc(t).querySelectorAll('[data-ordo-factures-email]').length, 1);
    // Aide : le composant, ses liens comptés
    const aide = root(t).querySelector('[data-ordo-aide-bloc]');
    assert.ok(visibleIn(t, aide));
    assert.strictEqual(aide.querySelector('[data-ordo-aide="email"]').getAttribute('data-subs-action'), 'aide_email');
    assert.strictEqual(aide.querySelector('[data-ordo-aide="video-2"]').getAttribute('data-subs-action'), 'video_factures');
    assert.deepStrictEqual(t.erreurs, []);
    t.dom.window.close();
  }

  // Interrupteur « factures par e-mail » sur l'élément du Designer : clic, clavier, échec
  {
    const body = { subscriptions: [CARDS[0]], paymentMethods: [VISA], invoices: INVOICES };
    const t = page({ outcomes: [{ status: 200, body }], emails: true, emailsState: { eligible: true, enabled: true } });
    t.run();
    await wait(120);
    const sw = section(t, 'factures').querySelector('[role="switch"]');
    const knob = sw.firstElementChild;
    assert.strictEqual(sw.getAttribute('aria-checked'), 'true');
    assert.ok(sw.classList.contains('is-coche') && knob.classList.contains('is-coche'));
    assert.strictEqual(sw.getAttribute('aria-labelledby'), 'invoice-emails-toggle-libelle');
    sw.click();
    await wait(40);
    assert.strictEqual(sw.getAttribute('aria-checked'), 'false');
    assert.ok(!sw.classList.contains('is-coche') && !knob.classList.contains('is-coche'));
    const post = t.emailCalls.find((c) => c.options && c.options.method === 'POST');
    assert.deepStrictEqual(JSON.parse(post.options.body), { enabled: false });
    const etat = section(t, 'factures').querySelector('[data-ordo-champ="etat"]');
    assert.strictEqual(etat.textContent, 'C’est noté, vous ne recevrez plus vos factures par e-mail.');
    assert.strictEqual(etat.className, 'compte-v2_muted');
    // Clavier : Espace bascule
    sw.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await wait(40);
    assert.strictEqual(sw.getAttribute('aria-checked'), 'true');
    t.dom.window.close();

    const f = page({ outcomes: [{ status: 200, body }], emails: true, emailsWrite: { status: 500, body: {} } });
    f.run();
    await wait(120);
    const sw2 = section(f, 'factures').querySelector('[role="switch"]');
    sw2.click();
    await wait(40);
    assert.strictEqual(sw2.getAttribute('aria-checked'), 'false', 'retour en arrière sur échec');
    const etat2 = section(f, 'factures').querySelector('[data-ordo-champ="etat"]');
    assert.strictEqual(etat2.className, 'compte-v2_erreur', 'message d\'erreur aux couleurs du gabarit « erreur »');
    assert.strictEqual(sw2.getAttribute('aria-disabled'), 'false');
    f.dom.window.close();
  }

  // Adresse et numéro de TVA : lecture, formulaire recopié, envoi gardé loin de Webflow
  {
    const body = { subscriptions: [CARDS[0]], paymentMethods: [VISA], invoices: INVOICES, billingAddress: ADDRESS, taxId: null, taxIdAllowed: true };
    const { legacy } = await both(body);
    const legacyAddr = text(doc(legacy).querySelector('.ordo-addr'));
    legacy.dom.window.close();
    const saved = Object.assign({}, ADDRESS, { line1: '2 rue Neuve' });
    const t = page({ outcomes: [
      { status: 200, body },
      { status: 200, body: { billingAddress: saved, taxId: null, taxIdAllowed: true } },
      { status: 400, body: { error: 'invalid' } },
      { status: 200, body: { taxId: { value: 'FR12345678901' } } },
      { status: 200, body: { ok: true } },
    ] });
    doc(t).querySelector('[data-ordo-gabarit="adresse-formulaire"] .compte-v2_hint').id = 'aide-pays';
    t.run();
    await wait(80);
    const card = section(t, 'adresse');
    assert.strictEqual(card.hidden, false);
    assert.strictEqual(text(card), legacyAddr);
    assert.strictEqual(text(card.querySelector('[data-ordo-zone="adresse"]')),
      'Nom sur les factures Dr Test Adresse 1 rue Exemple 75001 Paris France Modifier');
    assert.strictEqual(text(card.querySelector('[data-ordo-zone="tva"]')), 'Vous avez un numéro de TVA intracommunautaire ? L’ajouter');
    // Formulaire d'adresse
    card.querySelector('[data-ordo-zone="adresse"] button.compte-v2_btn').click();
    const form = card.querySelector('[data-ordo-zone="adresse"] form');
    assert.ok(form, 'formulaire recopié du gabarit');
    assert.strictEqual(form.elements.line1.value, '1 rue Exemple');
    assert.strictEqual(form.elements.line1.id, 'ordo-addr-line1');
    assert.strictEqual(form.querySelector('label[for="ordo-addr-line1"]').textContent, 'Adresse');
    assert.ok(!form.elements.line1.hasAttribute('placeholder'), 'texte d\'exemple Webflow retiré');
    assert.strictEqual(form.elements.line2.getAttribute('placeholder'), 'Bâtiment, étage…');
    assert.ok(form.elements.line1.required);
    assert.strictEqual(form.elements.country.value, 'FR');
    assert.ok(form.elements.country.options.length > 30);
    assert.strictEqual(form.elements.country.options[0].textContent, 'France');
    assert.ok(!form.hasAttribute('id'));
    assert.strictEqual(doc(t).querySelectorAll('#aide-pays').length, 1, 'identifiant interne d\'un gabarit non recopié');
    const error = form.querySelector('[data-ordo-champ="erreur"]');
    assert.ok(!visibleIn(t, error), 'le message d\'exemple du gabarit est caché');
    form.elements.line1.value = '2 rue Neuve';
    form.querySelector('[type="submit"]').click();
    await wait(60);
    assert.deepStrictEqual(t.webflowSubmits, [], 'aucun envoi ne parvient à Webflow');
    assert.deepStrictEqual(JSON.parse(t.calls[1].options.body).address, { name: 'Dr Test', line1: '2 rue Neuve', line2: '', postalCode: '75001', city: 'Paris', country: 'FR' });
    assert.ok(text(card).includes('Adresse enregistrée.'));
    assert.ok(text(card).includes('2 rue Neuve'));
    // Numéro de TVA : refusé, puis enregistré, puis retiré
    card.querySelector('[data-ordo-zone="tva"] button').click();
    const tva = card.querySelector('[data-ordo-zone="tva"] form');
    assert.strictEqual(tva.elements.taxId.getAttribute('placeholder'), 'FR12345678901');
    tva.elements.taxId.value = 'FR123';
    tva.querySelector('[type="submit"]').click();
    await wait(60);
    const tvaError = tva.querySelector('[data-ordo-champ="erreur"]');
    assert.ok(visibleIn(t, tvaError));
    assert.strictEqual(tvaError.textContent, 'Ce numéro n’est pas un numéro de TVA français valide (FR suivi de 11 chiffres).');
    assert.strictEqual(tva.elements.taxId.getAttribute('aria-invalid'), 'true');
    assert.strictEqual(tva.querySelector('[type="submit"]').value, 'Enregistrer');
    tva.elements.taxId.value = 'FR12345678901';
    tva.querySelector('[type="submit"]').click();
    await wait(60);
    assert.strictEqual(text(card.querySelector('[data-ordo-zone="tva"]')),
      'Numéro de TVA enregistré. Numéro de TVA intracommunautaire FR12345678901 Modifier Retirer');
    const retirer = Array.from(card.querySelectorAll('[data-ordo-zone="tva"] button')).find((b) => b.textContent === 'Retirer');
    retirer.click();
    const question = card.querySelector('[data-ordo-zone="tva"] [data-ordo-champ="question"]');
    assert.ok(question && question.id === 'ordo-addr-tva-ask');
    const confirmer = Array.from(card.querySelectorAll('[data-ordo-zone="tva"] button')).find((b) => b.textContent === 'Retirer');
    assert.strictEqual(confirmer.getAttribute('aria-describedby'), 'ordo-addr-tva-ask');
    confirmer.click();
    await wait(60);
    assert.ok(text(card.querySelector('[data-ordo-zone="tva"]')).startsWith('Numéro de TVA retiré.'));
    assert.deepStrictEqual(t.webflowSubmits, []);
    // Identifiants ajoutés : jamais en double
    const ids = Array.from(doc(t).querySelectorAll('[id^="ordo-addr-"], #invoice-emails-toggle')).map((n) => n.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    // Les champs des gabarits gardent seuls leurs identifiants : les copies n'en héritent pas.
    assert.strictEqual(doc(t).querySelectorAll('[id^="gabarit-facturation-"]').length, 7);
    assert.deepStrictEqual(t.erreurs, []);
    t.dom.window.close();
  }

  // Adresse sans numéro de TVA ni droit d'en ajouter : zone TVA cachée pour de vrai
  {
    const t = page({ outcomes: [{ status: 200, body: { subscriptions: [CARDS[0]], paymentMethods: [VISA], invoices: INVOICES,
      billingAddress: ADDRESS, taxId: null, taxIdAllowed: false } }] });
    t.run();
    await wait(80);
    assert.ok(visibleIn(t, section(t, 'adresse')));
    assert.ok(!visibleIn(t, section(t, 'adresse').querySelector('[data-ordo-zone="tva"]')));
    t.dom.window.close();
  }

  // Rendu suivant (réabonnement) : rien ne reste du précédent, message affiché sous le titre
  {
    const t = page({ outcomes: [
      { status: 200, body: { subscriptions: [CARDS[10]], paymentMethods: [VISA], invoices: INVOICES } },
      { status: 200, body: { subscriptions: [CARDS[0]], paymentMethods: [VISA], invoices: INVOICES } },
    ] });
    // Un identifiant posé dans le Designer sur un gabarit ne doit jamais se retrouver en double.
    doc(t).querySelector('[data-ordo-gabarit="flash"]').id = 'message-flash';
    t.run();
    await wait(80);
    designerCards(t)[0].querySelector('button').click();
    await wait(60);
    assert.strictEqual(designerCards(t).length, 1);
    assert.ok(text(designerCards(t)[0]).startsWith('Médecine Générale Actif'));
    const flash = section(t, 'abonnements').querySelector('.compte-v2_flash');
    assert.strictEqual(flash.textContent, 'C’est fait : votre abonnement continue.');
    assert.strictEqual(doc(t).querySelectorAll('#message-flash').length, 1);
    assert.strictEqual(section(t, 'moyen-de-paiement').querySelectorAll('.compte-v2_moyen').length, 1);
    assert.strictEqual(section(t, 'factures').querySelectorAll('.compte-v2_facture[data-ordo-rendu]').length, INVOICES.length);
    t.dom.window.close();
  }

  // Rien de facturé : seules les cartes utiles, message vide du Designer
  {
    const t = page({ outcomes: [{ status: 200, body: { subscriptions: [], paymentMethods: [], invoices: [] } }] });
    t.run();
    await wait(80);
    assert.strictEqual(text(section(t, 'abonnements')), 'Mes abonnements Vous n’avez pas d’abonnement en cours.');
    assert.ok(!visibleIn(t, section(t, 'moyen-de-paiement')));
    assert.ok(!visibleIn(t, section(t, 'adresse')));
    assert.ok(!visibleIn(t, section(t, 'factures')));
    assert.ok(visibleIn(t, section(t, 'abonnements')));
    assert.ok(visibleIn(t, root(t).querySelector('[data-ordo-aide-bloc]')));
    // L'interrupteur, sans invoice-emails.js pour le prendre, ne se montre pas
    assert.ok(!visibleIn(t, root(t).querySelector('[data-ordo-factures-email]')));
    t.dom.window.close();
  }

  // Factures illisibles : carte et aide cachées, ancien bloc gardé
  {
    const t = page({ outcomes: [{ status: 200, body: { subscriptions: [CARDS[0]], paymentMethods: [VISA] } }] });
    t.run();
    await wait(80);
    assert.ok(!visibleIn(t, section(t, 'factures')));
    assert.ok(!visibleIn(t, root(t).querySelector('[data-ordo-aide-bloc]')));
    assert.strictEqual(doc(t).getElementById('invoices-block').style.display, '');
    t.dom.window.close();
  }

  // Squelette pendant l'attente, puis la liste ; message « lent » après 3 s
  {
    const t = page({ outcomes: [{ status: 200, body: { subscriptions: [CARDS[0]], invoices: [] }, delay: 400 }] });
    t.run();
    await wait(300);
    assert.ok(doc(t).documentElement.classList.contains('ordo-subs-v2'));
    const skels = section(t, 'abonnements').querySelectorAll('.compte-v2_squelette');
    assert.strictEqual(skels.length, 2, 'un par plan non résilié');
    assert.strictEqual(section(t, 'abonnements').getAttribute('aria-busy'), 'true');
    assert.ok(text(section(t, 'abonnements')).includes('Chargement de vos abonnements…'));
    assert.ok(!visibleIn(t, section(t, 'moyen-de-paiement')));
    assert.ok(!visibleIn(t, root(t).querySelector('[data-ordo-aide-bloc]')));
    await wait(250);
    assert.strictEqual(section(t, 'abonnements').querySelectorAll('.compte-v2_squelette').length, 0);
    assert.strictEqual(section(t, 'abonnements').hasAttribute('aria-busy'), false);
    assert.strictEqual(designerCards(t).length, 1);
    t.dom.window.close();
  }

  // Échec de la liste : Facturation cachée, anciens blocs rendus par la classe de secours
  {
    const t = page({ outcomes: [{ status: 500, body: {} }] });
    t.run();
    await wait(80);
    assert.ok(!doc(t).documentElement.classList.contains('ordo-subs-v2'));
    assert.ok(doc(t).documentElement.classList.contains('ordo-subs-fallback'));
    assert.ok(!visibleIn(t, root(t)));
    t.dom.window.close();
  }

  // Palier coupé : présentation héritée, Facturation du Designer jamais montrée
  {
    const t = page({ designer: false, outcomes: [{ status: 200, body: { subscriptions: [CARDS[0]], invoices: [] } }] });
    t.run();
    await wait(80);
    assert.strictEqual(legacyCards(t).length, 1);
    assert.ok(!doc(t).documentElement.classList.contains('ordo-subs-v2'));
    assert.ok(!visibleIn(t, root(t)), 'cachée par la règle d\'en-tête');
    assert.strictEqual(root(t).querySelectorAll('[data-ordo-gabarit]').length, 6, 'gabarits en place (et le PDF) laissés tels quels');
    t.dom.window.close();
  }

  // Repère manquant dans le Designer : retour à l'héritée, signalé
  for (const missing of ['[data-ordo-gabarit="statut-past_due"]', '[data-ordo-gabarit="facture"]', '[data-ordo-gabarits="facturation"]']) {
    const t = page({ removeGabarit: missing, outcomes: [{ status: 200, body: { subscriptions: [CARDS[0]], invoices: [] } }] });
    t.run();
    await wait(80);
    assert.strictEqual(legacyCards(t).length, 1, missing);
    assert.ok(!doc(t).documentElement.classList.contains('ordo-subs-v2'));
    const names = t.reported.map((r) => r.err.name);
    assert.ok(names.includes('FacturationGabaritAbsent') || names.includes('FacturationDesignerAbsent'), missing + ' ' + names.join(','));
    t.dom.window.close();
  }

  // Une seconde exécution du script ne rend pas deux fois
  {
    const t = page({ outcomes: [{ status: 200, body: { subscriptions: [CARDS[0]], invoices: [] } }] });
    t.run();
    t.w.eval(NAV_SCRIPT);
    await wait(80);
    assert.strictEqual(designerCards(t).length, 1);
    assert.strictEqual(t.calls.length, 1);
    t.dom.window.close();
  }

  // Mesure : les clics des boutons recopiés sont comptés
  {
    const t = page({ outcomes: [{ status: 200, body: { subscriptions: [CARDS[2]], invoices: INVOICES, paymentMethods: [VISA] } }] });
    t.run();
    await wait(80);
    const before = t.pushed.length;
    designerCards(t)[0].querySelector('a[href="/nos-offres"]').addEventListener('click', (e) => e.preventDefault());
    designerCards(t)[0].querySelector('a[href="/nos-offres"]').click();
    const ev = t.pushed.slice(before).find((p) => p.event === 'subscriptions_action');
    assert.ok(ev && ev.subs_action === 'voir_les_offres' && ev.subs_outcome === 'click');
    t.dom.window.close();
  }

  console.log('facturation designer: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
