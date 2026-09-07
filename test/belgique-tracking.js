#!/usr/bin/env node
/**
 * Vérifie nos-offres-belgique/ga4-events.js contre le HTML RÉEL de la page.
 *
 * Le HTML est celui de https://www.ordotype.fr/nos-offres-belgique, capturé
 * dans test/fixtures/. Tester contre un stub inventé n'aurait rien prouvé :
 * la page répète le même id sur quatre boutons et Memberstack bascule les CTA
 * après le chargement.
 *
 * Usage : node test/belgique-tracking.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'nos-offres-belgique.html'), 'utf8');
const src = fs.readFileSync(path.join(ROOT, 'nos-offres-belgique', 'ga4-events.js'), 'utf8');

function load({ member, breakTrack }) {
    // `outside-only` active window.eval sans exécuter les scripts de la page :
    // on teste NOTRE script sur le vrai DOM, sans jouer Webflow ni Memberstack.
    const dom = new JSDOM(html, {
        url: 'https://www.ordotype.fr/nos-offres-belgique',
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const win = dom.window;
    const pushed = [];
    const reported = [];
    win.dataLayer = { push: (p) => { if (breakTrack) throw new Error('dataLayer cassé'); pushed.push(p); } };
    win.localStorage.setItem('_ms-mem', JSON.stringify(member ? { id: 'mem_1' } : {}));
    win.addEventListener('error', (e) => reported.push(e.message || 'error'));
    win.console = { log() {}, warn() {}, error() {} };
    win.eval(src);
    // jsdom laisse readyState à 'loading' : le script s'abonne donc à
    // DOMContentLoaded, exactement comme sur la vraie page.
    return { win, dom, pushed, reported, ready: new Promise((res) => {
        if (win.document.readyState !== 'loading') return res();
        win.document.addEventListener('DOMContentLoaded', () => res());
        win.addEventListener('load', () => res());
    }) };
}

let fail = 0;
function check(label, cond, detail) {
    console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : '  → ' + detail));
    if (!cond) fail++;
}

async function main() {
// 1. vue au chargement, visiteur anonyme
{
    const { pushed, ready } = load({ member: false });
    await ready;
    const v = pushed.find((p) => p.event === 'belgique_offers_view');
    check('vue émise au chargement', !!v, 'aucun belgique_offers_view');
    check('member_state = anonymous', v && v.member_state === 'anonymous', v && v.member_state);
    const slugs = v ? v.offers_visible.split(',') : [];
    check('les 4 offres sont listées', slugs.length === 4, slugs.join(','));
    check('slugs plausibles', slugs.every((s) => s.startsWith('belgique')), slugs.join(','));
}

// 2. clic sur le CTA déconnecté (lien vers la page d'inscription)
{
    const { win, dom, pushed } = load({ member: false });
    const link = dom.window.document.querySelector('a[href*="/inscription-offre-speciale/belgique"]');
    link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const c = pushed.find((p) => p.event === 'belgique_offer_click');
    check('clic lien inscription mesuré', !!c, 'aucun belgique_offer_click');
    check('cta_type = signup_page', c && c.cta_type === 'signup_page', c && c.cta_type);
    check('option = slug de l offre', c && /^belgique/.test(c.option || ''), c && c.option);
}

// 3. clic sur le CTA connecté (bouton Memberstack natif)
{
    const { win, dom, pushed } = load({ member: true });
    const btn = Array.from(dom.window.document.querySelectorAll('a'))
        .find((a) => a.hasAttribute('data-ms-price:add'));
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const c = pushed.find((p) => p.event === 'belgique_offer_click');
    check('clic Memberstack mesuré', !!c, 'aucun belgique_offer_click');
    check('cta_type = memberstack_checkout', c && c.cta_type === 'memberstack_checkout', c && c.cta_type);
    check('priceId remonté', !!(c && c.priceId), c && c.priceId);
    check('option déduit de la carte, pas d une table', c && /^belgique/.test(c.option || ''), c && c.option);
    check('member_state = member', c && c.member_state === 'member', c && c.member_state);
}

// 4. la mesure ne doit pas casser la navigation
{
    const { win, dom, reported } = load({ member: false, breakTrack: true });
    const link = dom.window.document.querySelector('a[href*="/inscription-offre-speciale/belgique"]');
    let threw = null;
    try { link.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }
    catch (e) { threw = e; }
    check('un dataLayer cassé ne propage pas', threw === null, threw && threw.message);
    check('l échec est signalé', reported.length > 0, 'aucun signalement');
}

}
main().then(() => {
    console.log(fail === 0 ? '\nbelgique tracking : OK' : `\nbelgique tracking : ${fail} ÉCHEC(S)`);
    process.exit(fail === 0 ? 0 : 1);
});
