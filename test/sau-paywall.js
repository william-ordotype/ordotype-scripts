#!/usr/bin/env node
/**
 * Paywall SAU (pathology/sau-paywall.js) : carte clonée depuis le composant
 * Webflow « Paywall SAU », IP et contacts remplis, fiches de module épargnées.
 *
 * Usage : node test/sau-paywall.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'pathology/sau-paywall.js'), 'utf8');

const IP6 = '2a01:e0a:2b7:1a0::1';
const IP4 = '88.164.43.12';
const MEMBRE = 'mem_test123';

// Composant tel que posé dans le Designer (structure relevée le 13/10/2026).
const GABARIT =
    '<div class="sau-paywall_gabarits" data-ordo-gabarits="sau">' +
      '<div class="paywall_card is-sau" data-ordo-gabarit="sau-paywall"><div class="grid-1col-1rem left-align">' +
        '<h2 class="heading-h2-docs text-weight-medium">Besoin d’Ordotype en dehors de l’hôpital ?</h2>' +
        '<p class="text-color-base-600 text-size-regular">Votre compte gratuit Urgences est réservé au réseau de votre établissement.</p>' +
        '<div class="action_btns_form std" data-ordo-sau-bloc="offres"><a class="button" href="/nos-offres">Choisir mon offre</a></div>' +
        '<p class="text-size-small text-color-base-600" data-ordo-sau-ip="main">Vous \u00eates dans votre \u00e9tablissement et voyez ce message ? \u00c9crivez-nous \u00e0 ' +
          '<a class="fs-cc-banner_text-link" data-ordo-sau-contact="mail" href="mailto:support@ordotype.fr">support@ordotype.fr</a> en indiquant cette adresse : <strong>adresse IP</strong></p>' +
        '<p class="text-size-small text-color-base-600">Vous pouvez aussi ' +
          '<a class="fs-cc-banner_text-link" data-ordo-sau-contact="chat" href="https://www.ordotype.fr/#ordo-chat">nous écrire sur le chat</a>' +
          ' ou nous appeler au <a class="fs-cc-banner_text-link" href="tel:+33744785503">07 44 78 55 03</a>.</p>' +
      '</div></div>' +
    '</div>';

// Zone des rappels cliniques d'une fiche MG : contenu premium + carte d'origine.
const FICHE_MG =
    '<div class="rappels-cliniques-content">' +
      '<div data-ms-content="premium-pages">Contenu MG</div>' +
      '<div id="RC_hidden_warning" class="rc_hidden_warning_wrapper"><div class="rc_premium_hidden_warning">Carte d’origine</div></div>' +
    '</div>';
const FICHE_RHUMATO = FICHE_MG.replace('<div data-ms-content="premium-pages">Contenu MG</div>',
    '<div data-ms-content="premium-pages">Notes</div><div data-ms-content="rhumatologie">Contenu rhumato</div>');
const FICHE_MIXTE = FICHE_MG.replace('<div data-ms-content="premium-pages">Contenu MG</div>',
    '<div data-ms-content="premium-pages">Notes</div><div data-ms-content="soins-palliatifs-et-ordotype-plus">Contenu</div>');
const FICHE_GRATUITE = '<div class="rappels-cliniques-content"><div id="RC_hidden_warning" class="rc_hidden_warning_wrapper"><div class="rc_premium_hidden_warning">x</div></div></div>';

async function page(corps, { ip = IP6, crisp = false, ipify = true } = {}) {
    const dom = new JSDOM(`<!doctype html><head></head><body>${corps}</body>`, {
        url: 'https://www.ordotype.fr/pathologies/coxarthrose', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    w.localStorage.setItem('ord_ip_restricted', '1');
    if (ip) w.localStorage.setItem('ord_ip_restricted_ip', ip);
    w.localStorage.setItem('_ms-mem', JSON.stringify({ id: MEMBRE }));
    w.fetch = ipify ? () => Promise.resolve({ text: () => Promise.resolve(IP4) }) : () => Promise.reject(new Error('bloqué'));
    w.__reports = [];
    w.OrdoErrorReporter = { report: (tag, msg) => w.__reports.push(tag + ': ' + msg) };
    if (crisp) { w.$crisp = []; }
    w.eval(SCRIPT);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    return w;
}

const carte = (w) => w.document.querySelector('.rc_hidden_warning_wrapper .rc_premium_hidden_warning [data-ordo-sau-card]');
let ok = 0;
async function cas(nom, fn) {
    await fn();
    ok++;
    console.log('ok  ' + nom);
}

(async () => {
    await cas('fiche MG : la carte du Designer est clonée, seule l\u2019IPv4 est affichée', async () => {
        const w = await page(GABARIT + FICHE_MG);
        assert.ok(w.document.body.classList.contains('ord-ip-restricted'));
        const c = carte(w);
        assert.ok(c, 'carte absente');
        assert.strictEqual(c.getAttribute('data-ordo-gabarit'), null, 'le clone garde la marque du gabarit');
        assert.strictEqual(c.querySelector('[data-ordo-sau-ip="main"] strong').textContent, IP4);
        assert.strictEqual(w.document.querySelectorAll('[data-ordo-gabarit="sau-paywall"]').length, 1, 'le gabarit reste en place, une seule fois');
        assert.deepStrictEqual(w.__reports, []);
    });

    await cas('mail prérempli : objet, IPv4 et identifiant du membre', async () => {
        const w = await page(GABARIT + FICHE_MG);
        const href = carte(w).querySelector('[data-ordo-sau-contact="mail"]').getAttribute('href');
        assert.ok(href.startsWith('mailto:support@ordotype.fr?subject='));
        const corps = decodeURIComponent(href.split('&body=')[1]);
        assert.ok(corps.includes('Adresse IP : ' + IP4));
        assert.ok(!corps.includes(IP6), 'l\u2019IPv6 ne doit pas figurer dans le mail');
        assert.ok(corps.includes('Identifiant de compte : ' + MEMBRE));
        assert.strictEqual(decodeURIComponent(href.split('subject=')[1].split('&')[0]), 'Accès Urgences depuis mon établissement');
    });

    await cas('chat : Crisp ouvert avec le message et les données de session', async () => {
        const w = await page(GABARIT + FICHE_MG, { crisp: true });
        const lien = carte(w).querySelector('[data-ordo-sau-contact="chat"]');
        const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
        lien.dispatchEvent(ev);
        assert.ok(ev.defaultPrevented, 'le clic doit rester sur la page quand Crisp est chargé');
        const cmd = Array.from(w.$crisp, (c) => c[0] + ' ' + c[1]);
        assert.deepStrictEqual(cmd, ['set session:data', 'set message:text', 'do chat:open']);
        const data = w.$crisp[0][2][0];
        assert.strictEqual(JSON.stringify(data), JSON.stringify([['sau_ip', IP6], ['sau_ipv4', IP4], ['member_id', MEMBRE]]));
        assert.ok(w.$crisp[1][2][0].includes(IP4) && !w.$crisp[1][2][0].includes(IP6));
    });

    await cas('chat sans Crisp (cookies refusés) : le lien envoie le mail prérempli', async () => {
        const w = await page(GABARIT + FICHE_MG);
        const lien = carte(w).querySelector('[data-ordo-sau-contact="chat"]');
        assert.ok(lien.getAttribute('href').startsWith('mailto:support@ordotype.fr?subject='));
        const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
        lien.dispatchEvent(ev);
        assert.ok(!ev.defaultPrevented);
    });

    await cas('fiche rhumato : pas de paywall (le module reste utilisable partout)', async () => {
        const w = await page(GABARIT + FICHE_RHUMATO);
        assert.ok(!w.document.body.classList.contains('ord-ip-restricted'));
        assert.strictEqual(carte(w), null);
    });

    await cas('fiche mixte soins palliatifs + Ordotype Plus : pas de paywall', async () => {
        const w = await page(GABARIT + FICHE_MIXTE);
        assert.ok(!w.document.body.classList.contains('ord-ip-restricted'));
    });

    await cas('fiche gratuite : pas de paywall', async () => {
        const w = await page(GABARIT + FICHE_GRATUITE);
        assert.ok(!w.document.body.classList.contains('ord-ip-restricted'));
    });

    await cas('gabarit absent : carte de secours, signalée une fois, sans tiret cadratin ni « · »', async () => {
        const w = await page(FICHE_MG);
        const c = carte(w);
        assert.ok(c, 'carte de secours absente');
        assert.ok(!/[—·]/.test(c.textContent), c.textContent);
        assert.strictEqual(c.querySelector('[data-ordo-sau-ip="main"] strong').textContent, IP4);
        assert.ok(c.textContent.includes('Choisir mon offre'));
        assert.strictEqual(w.__reports.length, 1);
        assert.ok(w.__reports[0].startsWith('SauPaywall: '));
    });

    await cas('IPv4 introuvable : l’adresse IPv6 est affichée en dernier recours', async () => {
        const w = await page(GABARIT + FICHE_MG, { ipify: false });
        assert.strictEqual(carte(w).querySelector('[data-ordo-sau-ip="main"] strong').textContent, IP6);
    });

    await cas('adresse IPv4 dès le départ : affichée telle quelle', async () => {
        const w = await page(GABARIT + FICHE_MG, { ip: IP4, ipify: false });
        assert.strictEqual(carte(w).querySelector('[data-ordo-sau-ip="main"] strong').textContent, IP4);
    });

    await cas('sans IP connue : seule l\u2019adresse est masquée, la phrase reste', async () => {
        const w = await page(GABARIT + FICHE_MG, { ip: '' });
        const ligne = carte(w).querySelector('[data-ordo-sau-ip="main"]');
        assert.strictEqual(ligne.style.display, '');
        assert.strictEqual(ligne.querySelector('strong').style.display, 'none');
        assert.ok(ligne.querySelector('[data-ordo-sau-contact="mail"]'), 'le lien mail reste dans la phrase');
    });

    await cas('l\u2019adresse est sur la même ligne que la phrase', async () => {
        const w = await page(GABARIT + FICHE_MG);
        const ligne = carte(w).querySelector('[data-ordo-sau-ip="main"]');
        assert.strictEqual(ligne.tagName, 'P');
        assert.ok(ligne.textContent.endsWith('cette adresse : ' + IP4), ligne.textContent);
    });

    await cas('restriction levée : la carte d’origine revient', async () => {
        const w = await page(GABARIT + FICHE_MG);
        w.document.dispatchEvent(new w.CustomEvent('ordo:ip-restriction', { detail: { restricted: false } }));
        assert.ok(!w.document.body.classList.contains('ord-ip-restricted'));
        assert.strictEqual(w.document.querySelector('.rc_premium_hidden_warning').textContent, 'Carte d’origine');
    });

    console.log(`\n${ok} cas OK`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
