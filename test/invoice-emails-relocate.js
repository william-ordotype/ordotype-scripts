#!/usr/bin/env node
/**
 * The invoice emails toggle can be moved into another container (the invoices section of the
 * subscriptions list) without losing its state:
 *   - a toggle still waiting to be seen starts observing its new container, the old one being
 *     hidden afterwards;
 *   - a toggle already shown keeps working where it lands;
 *   - without an anchor there is nothing to move.
 *
 * Usage : node test/invoice-emails-relocate.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'account/invoice-emails.js'), 'utf8');
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function page({ anchor = true } = {}) {
  const erreurs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>
      <div id="invoices-block">${anchor ? '<div class="w-embed"><div id="ordotype-invoice-emails"></div></div>' : ''}</div>
      <div id="section"><div id="slot"></div></div>
    </body></html>`,
    { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', virtualConsole }
  );
  const w = dom.window;
  const observers = [];
  w.IntersectionObserver = function(cb) {
    const o = { cb, targets: [], disconnected: 0 };
    observers.push(o);
    this.observe = (target) => { o.targets.push(target); };
    this.disconnect = () => { o.disconnected += 1; };
  };
  const calls = [];
  w.fetch = (url, options) => {
    calls.push({ url, options });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ eligible: true, enabled: false }) });
  };
  w.OrdoAccount = { member: { id: 'mem_test', stripeCustomerId: 'cus_test' } };
  w.$memberstackDom = { getMemberCookie: () => Promise.resolve('jeton-de-test') };
  w.dataLayer = [];
  w.console.log = () => {};
  return { dom, w, erreurs, observers, calls };
}

async function main() {
  // Waiting to be seen: the move re-targets the observer to the new container
  {
    const t = page();
    t.w.eval(SCRIPT);
    await wait();
    const doc = t.w.document;
    const embed = doc.getElementById('ordotype-invoice-emails').parentElement;
    assert.strictEqual(t.observers.length, 1);
    assert.strictEqual(t.observers[0].targets[0], doc.getElementById('invoices-block'), 'observes the block first');
    assert.strictEqual(t.calls.length, 0, 'nothing read before being seen');

    const moved = t.w.OrdoInvoiceEmails.relocate(doc.getElementById('slot'));
    assert.strictEqual(moved, true);
    assert.strictEqual(embed.parentElement, doc.getElementById('slot'), 'the Embed moved');
    doc.getElementById('invoices-block').style.display = 'none';
    assert.strictEqual(t.observers[0].disconnected, 1);
    assert.strictEqual(t.observers[0].targets[1], doc.getElementById('slot'), 'now observes the new container');

    t.observers[0].cb([{ target: doc.getElementById('slot'), isIntersecting: true }]);
    await wait();
    assert.strictEqual(t.calls.length, 1, 'state read once seen in its new place');
    assert.ok(doc.querySelector('#slot input[type="checkbox"]'), 'toggle rendered in the new container');
    assert.notStrictEqual(embed.style.display, 'none');
    assert.deepStrictEqual(t.erreurs, []);
    t.dom.window.close();
  }

  // Already shown: it keeps its listeners where it lands, and no observer is re-armed
  {
    const t = page();
    t.w.eval(SCRIPT);
    await wait();
    const doc = t.w.document;
    t.observers[0].cb([{ target: doc.getElementById('invoices-block'), isIntersecting: true }]);
    await wait();
    const input = doc.querySelector('#ordotype-invoice-emails input[type="checkbox"]');
    assert.ok(input, 'toggle rendered in place');
    t.w.OrdoInvoiceEmails.relocate(doc.getElementById('slot'));
    assert.ok(doc.querySelector('#slot input[type="checkbox"]') === input, 'same toggle, moved');
    assert.strictEqual(t.observers[0].targets.length, 1, 'no observer re-armed once shown');
    t.dom.window.close();
  }

  // No anchor on the page: nothing to move
  {
    const t = page({ anchor: false });
    t.w.eval(SCRIPT);
    await wait();
    assert.strictEqual(t.w.OrdoInvoiceEmails.relocate(t.w.document.getElementById('slot')), false);
    assert.strictEqual(t.w.OrdoInvoiceEmails.relocate(null), false);
    t.dom.window.close();
  }

  console.log('invoice-emails relocate: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
