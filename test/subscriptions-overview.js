#!/usr/bin/env node
/**
 * « Mes abonnements » list on the account page: rendering of each status, formats, loading and errors.
 *
 * Usage : node test/subscriptions-overview.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'account/subscriptions-overview.js'), 'utf8');

const CARDS = [
  { label: 'Médecine Générale', status: 'active', price: { amount: 3000, current: 1500, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: { percentOff: 50, amountOff: null, currency: null, duration: 'repeating', end: '2026-12-21' },
    offeredUntil: null, next: { date: '2026-10-05', amount: 1500 }, endsOn: null, resumesOn: null },
  { label: 'Module Rhumatologie', status: 'active', price: { amount: 500, current: 500, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: '2026-10-01', next: { date: '2026-10-01', amount: 500 }, endsOn: null, resumesOn: null },
  { label: 'Offert', status: 'active', price: { amount: 3000, current: 0, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: { percentOff: 100, amountOff: null, currency: null, duration: 'repeating', end: '2027-03-20' },
    offeredUntil: null, next: { date: '2027-03-20', amount: 3000 }, endsOn: null, resumesOn: null },
  { label: 'Module Soins palliatifs', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Stockage', status: 'canceling', price: { amount: 200, current: 200, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: '2026-09-30', resumesOn: null },
  { label: 'Impayé', status: 'past_due', price: { amount: 3000, current: 3000, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'En pause', status: 'paused', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: '2027-03-17' },
  { label: 'Pause prévue', status: 'pause_scheduled', price: { amount: 3000, current: 3000, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: '2026-10-17', resumesOn: '2027-03-17' },
  { label: 'À vie', status: 'active', price: { amount: 3000, current: 2550, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: { percentOff: 15, amountOff: null, currency: null, duration: 'forever', end: null },
    offeredUntil: null, next: { date: '2026-11-01', amount: 2550 }, endsOn: null, resumesOn: null },
  { label: 'En attente', status: 'pending', price: { amount: 3000, current: 3000, currency: 'eur', interval: 'month', intervalCount: 1 },
    discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: null, status: 'active', price: { amount: 15000, current: 15000, currency: 'mad', interval: 'year', intervalCount: 1 },
    discount: null, offeredUntil: null, next: { date: '2027-01-10', amount: 15000 }, endsOn: null, resumesOn: null },
  { label: '<img src=x onerror=alert(1)>', status: 'free', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
  { label: 'Essai terminé', status: 'ended', price: null, discount: null, offeredUntil: null, next: null, endsOn: null, resumesOn: null },
];

function page({ visible = true, prefilled = false, portal = true, whitespace = false, pause = null, confirmAnswer = true } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>
      <div class="tab-pane"><div class="w-embed"><div id="ordotype-subscriptions">${prefilled ? '<p>x</p>' : ''}${whitespace ? '\n  ' : ''}</div></div>
        <div class="inner-block-wraper" id="old-section"><div class="abonnement-wrapper">Ancien bloc</div></div>
        <div class="inner-block-wraper" id="invoices-block">Mes factures</div>
      </div>
      <div id="cancellation-warning-modal" style="display:none">Êtes-vous sûr ?</div>
    </body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', virtualConsole }
  );
  const w = dom.window;
  const reported = [];
  const network = [];
  const opened = [];
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: 'cus_test' } };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('jeton-de-test') };
  w.OrdoErrorReporter = {
    report(ctx, err) { reported.push({ ctx, err }); },
    reportNetwork(ctx, err) { network.push({ ctx, err }); return true; },
  };
  if (portal) w.OrdoBillingPortal = { open() { opened.push(true); } };
  const pauseCalls = [];
  if (pause) {
    w.OrdoPause = {
      resume(cb) { pauseCalls.push('resume'); setTimeout(() => cb(pause.ok), 0); },
      cancelDefinitive(cb) { pauseCalls.push('cancel'); setTimeout(() => cb(pause.ok), 0); },
      resumedUrl: '/membership/abonnement-repris',
      redirectDelay: 100000,
    };
  }
  w.confirm = () => confirmAnswer;
  const observer = { callback: null, target: null };
  w.IntersectionObserver = function(cb) {
    observer.callback = cb;
    this.observe = (target) => {
      observer.target = target;
      if (visible) setTimeout(() => cb([{ target, isIntersecting: true }]), 0);
    };
    this.disconnect = () => {};
  };
  return { dom, w, erreurs, reported, network, opened, observer, pauseCalls };
}

function installFetch(w, outcomes) {
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, options });
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (outcome.transport) return Promise.reject(new TypeError(outcome.transport));
    const response = { ok: outcome.status < 400, status: outcome.status, json: () => Promise.resolve(outcome.body || {}) };
    if (outcome.delay) return new Promise((r) => setTimeout(() => r(response), outcome.delay));
    return Promise.resolve(response);
  };
  return calls;
}

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
function text(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 4);
  const parts = [];
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue.replace(/[  ]/g, ' ').trim());
  return parts.filter(Boolean).join(' ');
}
const anchor = (w) => w.document.getElementById('ordotype-subscriptions');
const cards = (w) => Array.from(w.document.querySelectorAll('.ordo-subs-card'));
const cardText = (w, i) => text(cards(w)[i]);

async function main() {
  // Rendering of every status
  {
    const t = page();
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer jeton-de-test');
    assert.strictEqual(calls[0].options.credentials, 'omit');
    assert.strictEqual(calls[0].options.method, 'GET');
    assert.strictEqual(anchor(t.w).style.display, '');
    assert.strictEqual(anchor(t.w).parentElement.style.display, '');
    assert.ok(text(anchor(t.w)).startsWith('Mes abonnements'));
    assert.strictEqual(cards(t.w).length, CARDS.length);

    assert.strictEqual(cardText(t.w, 0),
      'Médecine Générale Actif 15 € / mois au lieu de 30 € -50 % jusqu’au 21 décembre 2026 Puis 30 € / mois Prochain prélèvement 15 € le 5 octobre 2026');
    assert.strictEqual(cardText(t.w, 1),
      'Module Rhumatologie Actif 0 € / mois au lieu de 5 € Offert jusqu’au 1er octobre 2026 Puis 5 € / mois Prochain prélèvement 5 € le 1er octobre 2026');
    assert.strictEqual(cardText(t.w, 2),
      'Offert Actif 0 € / mois au lieu de 30 € Offert jusqu’au 20 mars 2027 Puis 30 € / mois Prochain prélèvement 30 € le 20 mars 2027');
    assert.strictEqual(cardText(t.w, 3), 'Module Soins palliatifs Gratuit Gratuit');
    assert.strictEqual(cardText(t.w, 4), 'Stockage Résiliation programmée 2 € / mois Se termine le 30 septembre 2026');
    assert.strictEqual(cardText(t.w, 5), 'Impayé Paiement à régulariser 30 € / mois Paiement en échec Modifier le moyen de paiement');
    assert.strictEqual(cardText(t.w, 6), 'En pause En pause Reprise automatique le 17 mars 2027');
    assert.strictEqual(cardText(t.w, 7),
      'Pause prévue Pause programmée 30 € / mois Accès maintenu jusqu’au 17 octobre 2026, puis mise en pause. Reprise automatique le 17 mars 2027');
    assert.strictEqual(cardText(t.w, 8), 'À vie Actif 25,50 € / mois au lieu de 30 € -15 % à vie Prochain prélèvement 25,50 € le 1er novembre 2026');
    assert.strictEqual(cardText(t.w, 9), 'En attente Paiement en cours 30 € / mois Votre paiement est en cours de validation.');
    assert.strictEqual(cardText(t.w, 10), 'Abonnement Actif 150 MAD / an Prochain prélèvement 150 MAD le 10 janvier 2027');

    assert.strictEqual(cardText(t.w, 12), 'Essai terminé Terminé');
    assert.ok(cards(t.w)[12].querySelector('.ordo-subs-tone-muted'));

    // Labels are text, never markup
    assert.strictEqual(cards(t.w)[11].querySelector('img'), null);
    assert.ok(cardText(t.w, 11).startsWith('<img src=x onerror=alert(1)>'));

    // Payment method link opens the billing portal
    cards(t.w)[5].querySelector('button').click();
    assert.strictEqual(t.opened.length, 1);

    // Status dots follow the status
    assert.ok(cards(t.w)[0].querySelector('.ordo-subs-tone-ok'));
    assert.ok(cards(t.w)[3].querySelector('.ordo-subs-tone-free'));
    assert.ok(cards(t.w)[5].querySelector('.ordo-subs-tone-alert'));
    assert.ok(cards(t.w)[4].querySelector('.ordo-subs-tone-muted'));
    assert.strictEqual(t.w.document.querySelectorAll('#ordo-subs-style').length, 1);
    assert.deepStrictEqual(t.erreurs, []);
    assert.strictEqual(t.reported.length + t.network.length, 0);
  }

  // The old per-plan section is hidden once the list is shown; other sections stay
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(t.w.document.getElementById('old-section').style.display, 'none');
    assert.strictEqual(t.w.document.getElementById('invoices-block').style.display, '');
    t.dom.window.close();
  }

  // On a load error the old section stays as the fallback
  {
    const t = page();
    installFetch(t.w, [{ status: 502, body: { error: 'upstream_error' } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(t.w.document.getElementById('old-section').style.display, '');
    t.dom.window.close();
  }

  // Card buttons: site link, page element, refused link
  {
    const t = page();
    const withActions = [
      Object.assign({}, CARDS[0], { label: 'MG', action: { label: 'Résilier', href: '#cancellation-warning-modal' } }),
      Object.assign({}, CARDS[3], { label: 'SP', action: { label: 'Voir les offres', href: '/nos-offres' } }),
      Object.assign({}, CARDS[3], { label: 'Piège', action: { label: 'Cliquer', href: '//evil.example/x' } }),
      Object.assign({}, CARDS[3], { label: 'Script', action: { label: 'Cliquer', href: 'javascript:alert(1)' } }),
    ];
    installFetch(t.w, [{ status: 200, body: { subscriptions: withActions } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    const btn = cards(t.w)[0].querySelector('.ordo-subs-actions button');
    assert.strictEqual(btn.textContent, 'Résilier');
    btn.click();
    assert.strictEqual(t.w.document.getElementById('cancellation-warning-modal').style.display, 'block');
    const link = cards(t.w)[1].querySelector('.ordo-subs-actions a');
    assert.strictEqual(link.textContent, 'Voir les offres');
    assert.strictEqual(link.getAttribute('href'), '/nos-offres');
    assert.strictEqual(cards(t.w)[2].querySelector('.ordo-subs-actions'), null);
    assert.strictEqual(cards(t.w)[3].querySelector('.ordo-subs-actions'), null);
    t.dom.window.close();
  }

  // Missing page element: reported, nothing thrown
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [Object.assign({}, CARDS[0], { action: { label: 'Résilier', href: '#absent' } })] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    cards(t.w)[0].querySelector('.ordo-subs-actions button').click();
    assert.strictEqual(t.reported.length, 1);
    t.dom.window.close();
  }

  // Pause cards: resume and definitive cancellation through the pause script
  {
    const t = page({ pause: { ok: true } });
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[6], CARDS[7]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    const [paused, scheduled] = cards(t.w);
    assert.ok(cardText(t.w, 0).endsWith('Annuler définitivement Reprendre mon abonnement'));
    assert.ok(scheduled.querySelector('.ordo-subs-actions'));
    paused.querySelector('.is-primary').click();
    await wait(20);
    assert.deepStrictEqual(t.pauseCalls, ['resume']);
    assert.ok(text(paused).includes('Votre abonnement a été réactivé !'));
    t.dom.window.close();
  }
  {
    const t = page({ pause: { ok: false }, confirmAnswer: false });
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[6]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    const buttons = cards(t.w)[0].querySelectorAll('button');
    buttons[0].click();
    assert.deepStrictEqual(t.pauseCalls, [], 'no call without confirmation');
    t.w.confirm = () => true;
    buttons[0].click();
    await wait(20);
    assert.deepStrictEqual(t.pauseCalls, ['cancel']);
    assert.ok(text(cards(t.w)[0]).includes('Une erreur est survenue. Merci de réessayer.'));
    assert.strictEqual(buttons[0].disabled, false);
    t.dom.window.close();
  }

  // Without the pause script, no dead buttons
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[6]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(cards(t.w)[0].querySelector('.ordo-subs-actions'), null);
    t.dom.window.close();
  }

  // No portal available: plain text instead of a dead button
  {
    const t = page({ portal: false });
    installFetch(t.w, [{ status: 200, body: { subscriptions: [CARDS[5]] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(cards(t.w)[0].querySelector('button'), null);
    assert.ok(cardText(t.w, 0).endsWith('Paiement en échec Modifiez votre moyen de paiement'));
  }

  // Empty list
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: [] } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.ok(text(anchor(t.w)).endsWith('Vous n’avez pas d’abonnement en cours.'));
  }

  // Nothing is requested before the block is visible, and the block stays hidden until then
  {
    const t = page({ visible: false });
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(anchor(t.w).parentElement.style.display, 'none');
    assert.strictEqual(t.observer.target.className, 'tab-pane');
    t.observer.callback([{ target: t.observer.target, isIntersecting: true }]);
    await wait(60);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(cards(t.w).length, CARDS.length);
  }

  // A second copy of the script leaves an already filled block alone
  {
    const t = page({ prefilled: true });
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 0);
  }

  // Whitespace left in the embed is not a rendered block
  {
    const t = page({ whitespace: true });
    const calls = installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(60);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(cards(t.w).length, CARDS.length);
  }

  // One network failure is retried
  {
    const t = page();
    const calls = installFetch(t.w, [{ transport: 'Failed to fetch' }, { status: 200, body: { subscriptions: CARDS } }]);
    t.w.eval(SCRIPT);
    await wait(600);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(cards(t.w).length, CARDS.length);
    assert.strictEqual(t.network.length, 0);
  }

  // Two network failures: hidden, reported as a network incident
  {
    const t = page();
    const calls = installFetch(t.w, [{ transport: 'Failed to fetch' }]);
    t.w.eval(SCRIPT);
    await wait(600);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(anchor(t.w).childNodes.length, 0);
    assert.strictEqual(t.network.length, 1);
  }

  // Server error: hidden, reported, not retried
  {
    const t = page();
    const calls = installFetch(t.w, [{ status: 502, body: { error: 'upstream_error' } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(t.reported.length, 1);
  }

  // Expected refusals: hidden, not reported
  for (const status of [401, 409, 429, 503]) {
    const t = page();
    installFetch(t.w, [{ status, body: { error: 'x' } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(anchor(t.w).style.display, 'none', `status ${status}`);
    assert.strictEqual(t.reported.length + t.network.length, 0, `status ${status}`);
  }

  // Unexpected body: hidden and reported
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { ok: true } }]);
    t.w.eval(SCRIPT);
    await wait(100);
    assert.strictEqual(anchor(t.w).style.display, 'none');
    assert.strictEqual(t.reported.length, 1);
  }

  // Slow answer: a placeholder first, then the list
  {
    const t = page();
    installFetch(t.w, [{ status: 200, body: { subscriptions: CARDS }, delay: 400 }]);
    t.w.eval(SCRIPT);
    await wait(300);
    assert.ok(t.w.document.querySelector('.ordo-subs-skel'));
    assert.strictEqual(anchor(t.w).style.display, '');
    await wait(300);
    assert.strictEqual(t.w.document.querySelector('.ordo-subs-skel'), null);
    assert.strictEqual(cards(t.w).length, CARDS.length);
  }

  console.log('subscriptions-overview: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
