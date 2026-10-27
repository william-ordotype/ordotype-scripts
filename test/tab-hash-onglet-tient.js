#!/usr/bin/env node
/**
 * /membership/compte#abonnements must open « Abonnements et facturation ».
 *
 * The tab component is members-only (data-ms-content="members"). For a real
 * member the page came up on « Mon profil » (27/10/2026, « Mon offre actuelle »
 * buttons of the pricing pages point here): the single click of tab-hash.js
 * ran while the component was missing, or the component came back on its
 * default tab afterwards.
 *
 * What must hold:
 *   - component present: the tab opens at once, as before;
 *   - component missing when the script runs, put back later on its default
 *     tab: the tab opens once it is back;
 *   - tabs restarted on data-current (Webflow restart): the tab stays, since
 *     data-current now names it;
 *   - tabs reset without reading data-current: the tab is applied again;
 *   - a script switching back to the default tab by a click is overridden;
 *     a tab picked by the member (a real, trusted click) wins: jsdom cannot
 *     make trusted events, so that case is checked in a real browser;
 *   - no hash, or an unknown one: nothing is clicked.
 *
 * Usage: node test/tab-hash-onglet-tient.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'account/tab-hash.js'), 'utf8');
const TABS = ['information', 'security', 'billing', 'logout'];

const COMPONENT = `
<div class="compte_component w-tabs" data-ms-content="members" data-current="information">
  <div class="compte_tabs-menu w-tab-menu">
    ${TABS.map((t) => `<a data-w-tab="${t}" class="w-tab-link${t === 'information' ? ' w--current' : ''}" href="#w-tabs-0-data-w-pane-${t}">${t}</a>`).join('')}
  </div>
  <div class="w-tab-content">
    ${TABS.map((t) => `<div data-w-tab="${t}" class="w-tab-pane${t === 'information' ? ' w--tab-active' : ''}"><button>${t}</button></div>`).join('')}
  </div>
</div>`;

async function page(hash, { detached = false } = {}) {
    const dom = new JSDOM(`<!doctype html><body>${detached ? '' : COMPONENT}</body>`, {
        url: 'https://www.ordotype.fr/membership/compte' + hash,
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    const doc = window.document;
    const clicks = [];
    // The account loader runs its scripts after the document is parsed.
    if (doc.readyState !== 'complete') await new Promise((r) => window.addEventListener('load', r));

    // Webflow tabs, reduced to what matters: a click on a link selects it.
    function select(name) {
        doc.querySelectorAll('.compte_component .w-tab-link').forEach((l) => l.classList.toggle('w--current', l.getAttribute('data-w-tab') === name));
        doc.querySelectorAll('.compte_component .w-tab-pane').forEach((p) => p.classList.toggle('w--tab-active', p.getAttribute('data-w-tab') === name));
    }
    doc.addEventListener('click', (e) => {
        const link = e.target.closest && e.target.closest('.w-tab-link');
        if (!link) return;
        e.preventDefault();
        clicks.push(link.getAttribute('data-w-tab'));
        select(link.getAttribute('data-w-tab'));
    });

    return {
        window,
        clicks,
        current: () => {
            const c = doc.querySelector('.compte_component .w-tab-link.w--current');
            return c && c.getAttribute('data-w-tab');
        },
        run: () => window.eval(SRC),
        // Memberstack puts the members-only block back, on its default tab.
        insert: () => doc.body.insertAdjacentHTML('beforeend', COMPONENT),
        // Webflow restart of the tabs: back to data-current.
        restart: () => select(doc.querySelector('.compte_component').getAttribute('data-current')),
        // A reset that does not read data-current.
        reset: () => select('information'),
        scriptClicks: (name) => doc.querySelector(`.compte_component .w-tab-link[data-w-tab="${name}"]`).click(),
    };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    let p = await page('#abonnements');
    p.run();
    assert.strictEqual(p.current(), 'billing', 'component present: the tab opens at once');
    p.window.close();

    p = await page('#abonnements', { detached: true });
    p.run();
    await wait(20);
    p.insert();
    await wait(20);
    assert.strictEqual(p.current(), 'billing', 'component put back later: the tab opens once it is back');
    p.window.close();

    p = await page('#abonnements');
    p.run();
    p.restart();
    await wait(20);
    assert.strictEqual(p.current(), 'billing', 'Webflow restart on data-current: the tab stays');
    p.window.close();

    p = await page('#abonnements');
    p.run();
    p.reset();
    await wait(20);
    assert.strictEqual(p.current(), 'billing', 'reset without data-current: the tab is applied again');
    p.window.close();

    p = await page('#abonnements');
    p.run();
    p.scriptClicks('information');
    await wait(20);
    assert.strictEqual(p.current(), 'billing', 'a script click back to the default tab is overridden');
    assert.deepStrictEqual(p.clicks, ['billing', 'information', 'billing'], 'the hash tab is clicked again after the script click');
    p.window.close();

    for (const hash of ['', '#inconnu']) {
        p = await page(hash);
        p.run();
        await wait(20);
        assert.deepStrictEqual(p.clicks, [], `hash « ${hash} »: nothing is clicked`);
        assert.strictEqual(p.current(), 'information');
        p.window.close();
    }

    p = await page('#profil');
    p.run();
    assert.strictEqual(p.current(), 'information', '#profil: Mon profil');
    p.window.close();

    console.log('tab-hash-onglet-tient : OK');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
