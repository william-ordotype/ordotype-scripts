#!/usr/bin/env node
/**
 * shared/countdown.js : chiffre sans zéro devant et libellé accordé quand la
 * case de l'unité porte son libellé Webflow (page
 * /membership/gerer-son-offre-de-stockage : « 1 minute 53 secondes », et non
 * plus « 01 minutes 53 secondes ») ; deux chiffres, comme avant, quand il n'y
 * a pas de libellé (affichage « 00:15:00 »).
 *
 * Usage : node test/countdown-accord.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '..', 'shared/countdown.js'), 'utf8');
const CLE = 'countdownDateTimeStorage';

// Balisage servi sur /membership/gerer-son-offre-de-stockage (relevé le 20/10/2026).
const CASE = (classe, attr, valeur, libelle) =>
  `<div class="${classe}"><div><span ms-code-skeleton="1000" ${attr}="${valeur}">00</span></div>` +
  `<div class="spacing-left"><span>${libelle}</span></div></div>`;
const AVEC_LIBELLES = '<div id="js-clock" class="time-wrap small">' +
  CASE('time hidden', 'ms-code-time-hour', '', 'heures') +
  CASE('time', 'ms-code-time-minute', '2', 'minutes') +
  CASE('time', 'ms-code-time-second', '', 'secondes') +
  CASE('time hidden', 'ms-code-time-millisecond', '', 'millisecondes') +
  '</div><div ms-code-countdown="hide-on-end" id="offre">offre</div>' +
  '<a href="#" ms-code-countdown="show-on-end" id="expiree" style="display:none">Offre expirée</a>';

// Compteur sans libellé (exemple du README pour offre-annulation).
const SANS_LIBELLES = '<div ms-code-time-hour="0">00</div><div ms-code-time-minute="15">00</div>' +
  '<div ms-code-time-second="0">00</div><div ms-code-time-millisecond="0">00</div>';

async function page(corps, resteMs) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(`<!doctype html><html><body>${corps}</body></html>`, {
    url: 'https://www.ordotype.fr/membership/gerer-son-offre-de-stockage', runScripts: 'outside-only', virtualConsole,
  });
  const w = dom.window;
  w.console.log = () => {};
  if (resteMs !== undefined) w.localStorage.setItem(CLE, new Date(Date.now() + resteMs).toISOString());
  w.eval(SCRIPT);
  // Le script démarre à DOMContentLoaded, comme sur la page.
  if (w.document.readyState === 'loading') await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  const d = w.document;
  const unite = (attr) => {
    const el = d.querySelector(`[${attr}]`);
    const libelle = el.closest('.time');
    return libelle ? [el.textContent, libelle.querySelector('.spacing-left span').textContent] : [el.textContent];
  };
  return { w, d, unite, fermer: () => w.close() };
}

const cas = [];
const test = (nom, fn) => cas.push({ nom, fn });

test('1 min 53 s restantes : « 1 minute 53 secondes », heures « 0 heure »', async () => {
  const p = await page(AVEC_LIBELLES, 113500);
  try {
    assert.deepStrictEqual(p.unite('ms-code-time-minute'), ['1', 'minute']);
    assert.deepStrictEqual(p.unite('ms-code-time-second'), ['53', 'secondes']);
    assert.deepStrictEqual(p.unite('ms-code-time-hour'), ['0', 'heure']);
  } finally { p.fermer(); }
});

test('2 h 2 min 5 s restantes : pluriel pour 2 et plus, pas de zéro devant', async () => {
  const p = await page(AVEC_LIBELLES, ((2 * 60 + 2) * 60 + 5) * 1000 + 500);
  try {
    assert.deepStrictEqual(p.unite('ms-code-time-hour'), ['2', 'heures']);
    assert.deepStrictEqual(p.unite('ms-code-time-minute'), ['2', 'minutes']);
    assert.deepStrictEqual(p.unite('ms-code-time-second'), ['5', 'secondes']);
  } finally { p.fermer(); }
});

test('première visite (2 minutes du gabarit) : « 1 minute 59 secondes » un instant après', async () => {
  const p = await page(AVEC_LIBELLES);
  try {
    assert.ok(p.w.localStorage.getItem(CLE), 'échéance enregistrée');
    // Au tout premier affichage, l'écart peut valoir 2 min pile ; le rafraîchissement suivant (10 ms) passe sous 2 min.
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(p.unite('ms-code-time-minute'), ['1', 'minute']);
    assert.deepStrictEqual(p.unite('ms-code-time-second'), ['59', 'secondes']);
  } finally { p.fermer(); }
});

test('1 s restante : « 0 minute 1 seconde »', async () => {
  const p = await page(AVEC_LIBELLES, 1500);
  try {
    assert.deepStrictEqual(p.unite('ms-code-time-minute'), ['0', 'minute']);
    assert.deepStrictEqual(p.unite('ms-code-time-second'), ['1', 'seconde']);
  } finally { p.fermer(); }
});

test('offre expirée : « 0 minute 0 seconde », offre retirée, bouton « Offre expirée » montré', async () => {
  const p = await page(AVEC_LIBELLES, -1000);
  try {
    assert.deepStrictEqual(p.unite('ms-code-time-minute'), ['0', 'minute']);
    assert.deepStrictEqual(p.unite('ms-code-time-second'), ['0', 'seconde']);
    assert.strictEqual(p.d.getElementById('offre'), null);
    assert.strictEqual(p.d.getElementById('expiree').style.display, 'flex');
    assert.strictEqual(p.d.querySelector('.spacing-left span').textContent, 'heure');
  } finally { p.fermer(); }
});

test('sans libellé : deux chiffres, comme avant', async () => {
  const p = await page(SANS_LIBELLES, (5 * 60 + 3) * 1000 + 500);
  try {
    assert.deepStrictEqual(p.unite('ms-code-time-hour'), ['00']);
    assert.deepStrictEqual(p.unite('ms-code-time-minute'), ['05']);
    assert.deepStrictEqual(p.unite('ms-code-time-second'), ['03']);
  } finally { p.fermer(); }
});

test('sans libellé, fin : « 00 », comme avant', async () => {
  const p = await page(SANS_LIBELLES, -1000);
  try {
    assert.deepStrictEqual(p.unite('ms-code-time-minute'), ['00']);
    assert.deepStrictEqual(p.unite('ms-code-time-second'), ['00']);
  } finally { p.fermer(); }
});

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
