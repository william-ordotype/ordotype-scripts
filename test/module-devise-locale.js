#!/usr/bin/env node
/**
 * Pages module : le prix dans la devise du membre.
 *
 * Un client Stripe ne peut pas avoir d'abonnements dans deux devises : un
 * membre facturé hors euro ne peut donc pas prendre un module en euros.
 * module/devise-locale.js remplace le prix du bouton par celui de sa devise.
 *
 * Ce que ce test vérifie, bouton par bouton, sur le balisage réel de la page
 * (les trois boutons Rhumato et les trois Soins palliatifs, libellés compris) :
 *
 *   - témoins : membre en euros, visiteur déconnecté, abonnement hors euro
 *     RÉSILIÉ (la devise ne verrouille plus rien) : AUCUN changement ;
 *   - Maroc praticien, Maroc interne, Suisse interne, Afrique de l'Ouest :
 *     bon prix Memberstack et bon libellé, structure du bouton gardée ;
 *   - le clic part bien sur le prix local : le faux Memberstack lit l'attribut
 *     AU CLIC, comme le vrai (memberstack.js v2, fonction de `data-ms-price:add`) ;
 *   - pas de prix pour la devise (interne en dinars, dinar tunisien) : le
 *     bouton cède la place à une note « écrivez-nous » et l'écart est signalé ;
 *   - le formulaire d'inscription (`form[data-ms-price:add]`) n'est jamais touché ;
 *   - cache vide puis réponse de Memberstack : le prix est posé à l'arrivée.
 *
 * Usage : node test/module-devise-locale.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'module', 'devise-locale.js'), 'utf8');

// Balisage relevé sur www.ordotype.fr/module/rhumatologie et /module/soins-palliatifs le 23/11/2026.
const PAGE = `<!doctype html><html><body>
<form data-ms-price:add="prc_rhumatologie-full-price-nt2b09xz" id="email-form-2"></form>
<div class="r">
  <a data-ms-content="!rhumatologie" data-ms-price:add="prc_rhumatologie-full-price-nt2b09xz" id="r-full" href="#" class="button is-gradient w-inline-block"><div class="button_text w-embed">S'abonner pour 20€/mois*</div></a>
  <a data-ms-content="!all-interne" data-ms-price:add="prc_rhumatologie-discount-price-my1ki0tid" id="r-prat" href="#" class="button is-gradient w-inline-block"><div class="button_text w-embed">S'abonner pour 5€/mois</div></a><div data-ms-content="!all-interne" id="r-prat-ligne" class="text-size-small text-align-center text-color-base-600 w-embed">Prix sans le module Médecine générale : 20€/mois</div>
  <a data-ms-content="all-interne" data-ms-price:add="prc_rhumatologie-discount-interne-6cow0xa7" id="r-int" href="#" class="button is-gradient w-inline-block"><div class="button_text">S’abonner pour 1 €/mois</div></a>
</div>
<div class="sp">
  <a data-ms-price:add="prc_soins-palliatifs-full-price-6x4s0c24" id="sp-full" href="#" class="button is-gradient w-inline-block"><div class="button_text w-embed">S'abonner pour 10€/mois*</div></a>
  <a data-ms-price:add="prc_soins-palliatifs-discount-price-2w1bh0teo" id="sp-prat" href="#" class="button is-gradient w-inline-block"><div class="button_text w-embed">S'abonner pour 5€/mois</div></a><div id="sp-prat-ligne" class="text-size-small text-align-center text-color-base-600 w-embed">Prix sans le module Médecine générale : 10€/mois</div>
  <a data-ms-price:add="prc_soins-palliatifs-discount-interne-zyl2008f" id="sp-int" href="#" class="button is-gradient w-inline-block"><div class="button_text">S’abonner pour 1 €/mois</div></a>
</div>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@abc1234/module/devise-locale.js"></script>
</body></html>`;

const EUR = {
  'r-full': 'prc_rhumatologie-full-price-nt2b09xz',
  'r-prat': 'prc_rhumatologie-discount-price-my1ki0tid',
  'r-int': 'prc_rhumatologie-discount-interne-6cow0xa7',
  'sp-full': 'prc_soins-palliatifs-full-price-6x4s0c24',
  'sp-prat': 'prc_soins-palliatifs-discount-price-2w1bh0teo',
  'sp-int': 'prc_soins-palliatifs-discount-interne-zyl2008f',
};

function member(currency, status) {
  return {
    id: 'mem_test',
    planConnections: [{
      active: status === 'ACTIVE', status: status || 'ACTIVE', planId: 'pln_test', type: 'SUBSCRIPTION',
      payment: { priceId: 'prc_test', amount: 30, currency, status: 'PAID' },
    }],
  };
}

/**
 * Rejoue la page. `cache` va dans `_ms-mem`, `fresh` est la réponse de
 * getCurrentMember (null = Memberstack absent). Rend l'état des boutons et
 * ce que le faux Memberstack a reçu au clic.
 */
async function jouer({ cache, fresh }) {
  const dom = new JSDOM(PAGE, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/module/rhumatologie' });
  const w = dom.window;
  const clics = {};
  const rapports = [];
  const injectes = [];

  // Le vrai Memberstack lie le clic au chargement et lit l'attribut au clic.
  // (balayage plutôt que `[data-ms-price\:add]`, que le moteur de jsdom ne reconnaît pas)
  Array.from(w.document.getElementsByTagName('*')).forEach((el) => {
    if (el.tagName === 'FORM' || !el.hasAttribute('data-ms-price:add')) return;
    el.addEventListener('click', (e) => { e.preventDefault(); clics[el.id] = el.getAttribute('data-ms-price:add'); });
  });

  if (cache) w.localStorage.setItem('_ms-mem', JSON.stringify(cache));
  if (fresh !== null) w.$memberstackDom = { getCurrentMember: () => Promise.resolve({ data: fresh }) };
  w.OrdoErrorReporter = { report: (src, msg) => rapports.push([src, msg]) };
  const appendChild = w.document.body.appendChild.bind(w.document.body);
  w.document.body.appendChild = (n) => { if (n.tagName === 'SCRIPT') injectes.push(n.src); return appendChild(n); };
  w.console.log = () => {};

  w.eval(SOURCE);
  await new Promise((r) => setTimeout(r, 30));

  const boutons = {};
  for (const id of Object.keys(EUR)) {
    const el = w.document.getElementById(id);
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    const note = el.nextElementSibling && el.nextElementSibling.hasAttribute('data-ordo-devise-note') ? el.nextElementSibling : null;
    boutons[id] = {
      prix: el.getAttribute('data-ms-price:add'),
      texte: el.textContent.replace(/\s+/g, ' '),
      cache: el.style.display === 'none',
      note: note ? note.textContent : null,
      structure: el.children.length === 1 && el.firstElementChild.classList.contains('button_text'),
      clic: clics[id],
    };
  }
  const form = w.document.getElementById('email-form-2').getAttribute('data-ms-price:add');
  const lignes = ['r-prat-ligne', 'sp-prat-ligne'].map((id) => w.document.getElementById(id).style.display === 'none');
  return { boutons, form, rapports, injectes, lignesMasquees: lignes };
}

let echecs = 0;
let total = 0;
function verifier(nom, cond, detail) {
  total += 1;
  if (cond) { console.log(`  ok     ${nom}`); return; }
  echecs += 1;
  console.log(`  ECHEC  ${nom}${detail ? ' : ' + detail : ''}`);
}

function intact(nom, r) {
  for (const [id, prix] of Object.entries(EUR)) {
    const b = r.boutons[id];
    verifier(`${nom} : ${id} inchangé`, b.prix === prix && b.clic === prix && !b.cache && !b.note && /€/.test(b.texte), JSON.stringify(b));
  }
  verifier(`${nom} : rien signalé`, r.rapports.length === 0, JSON.stringify(r.rapports));
  verifier(`${nom} : lignes « Prix sans le module… € » visibles`, r.lignesMasquees.every((m) => !m), JSON.stringify(r.lignesMasquees));
}

function local(nom, b, prix, libelle) {
  verifier(`${nom}`, b.prix === prix && b.clic === prix && libelle.test(b.texte) && !/€/.test(b.texte) && b.structure && !b.cache,
    JSON.stringify(b));
}

(async () => {
  // Témoins
  intact('membre en euros', await jouer({ cache: member('eur'), fresh: member('eur') }));
  intact('visiteur déconnecté', await jouer({ cache: null, fresh: null }));
  intact('abonnement en dirhams résilié', await jouer({ cache: member('mad', 'CANCELED'), fresh: member('mad', 'CANCELED') }));

  // Maroc : les boutons praticien (plein tarif compris) et interne
  let r = await jouer({ cache: member('mad'), fresh: member('mad') });
  local('Maroc : Rhumato plein tarif → 25 MAD', r.boutons['r-full'], 'prc_rhumatologie-maroc-praticien-xf00bcr', /S'abonner pour 25\sMAD\/mois\*/);
  local('Maroc : Rhumato abonné MG → 25 MAD', r.boutons['r-prat'], 'prc_rhumatologie-maroc-praticien-xf00bcr', /S'abonner pour 25\sMAD\/mois$/);
  local('Maroc : Rhumato interne → 10 MAD', r.boutons['r-int'], 'prc_rhumatologie-maroc-interne-fk10bvg', /S’abonner pour 10\sMAD\/mois/);
  local('Maroc : Soins palliatifs interne → 10 MAD', r.boutons['sp-int'], 'prc_soins-palliatifs-maroc-interne-nra0b89', /10\sMAD\/mois/);
  verifier('Maroc : formulaire d\'inscription intact', r.form === 'prc_rhumatologie-full-price-nt2b09xz', r.form);
  verifier('Maroc : rien signalé', r.rapports.length === 0, JSON.stringify(r.rapports));
  verifier('Maroc : lignes « Prix sans le module… € » masquées', r.lignesMasquees.every(Boolean), JSON.stringify(r.lignesMasquees));

  // Suisse, Afrique de l'Ouest, dollars
  r = await jouer({ cache: member('chf'), fresh: member('chf') });
  local('Suisse : Soins palliatifs interne → 3 CHF', r.boutons['sp-int'], 'prc_soins-palliatifs-suisse-interne-dsg0bzl', /3\sCHF\/mois/);
  local('Suisse : Rhumato abonné MG → 8 CHF', r.boutons['r-prat'], 'prc_rhumatologie-suisse-praticien-f260b05', /8\sCHF\/mois/);
  r = await jouer({ cache: member('xof'), fresh: member('xof') });
  local('Afrique de l\'Ouest : Rhumato → 500 F CFA', r.boutons['r-prat'], 'prc_rhumatologie-afrique-de-l-ouest-og30bbo', /500\sF\sCFA\/mois/);
  r = await jouer({ cache: member('usd'), fresh: member('usd') });
  local('Dollars : Soins palliatifs → 1 $US', r.boutons['sp-prat'], 'prc_soins-palliatifs-usd-jvh0b2v', /1\s\$US\/mois/);

  // Pas de prix interne en dinars : note + signalement, les boutons praticien passent
  r = await jouer({ cache: member('dzd'), fresh: member('dzd') });
  local('Algérie : Rhumato abonné MG → 130 DZD', r.boutons['r-prat'], 'prc_rhumatologie-alg-rie-gv20bn0', /130\sDZD\/mois/);
  verifier('Algérie interne : bouton masqué, note « écrivez-nous »', r.boutons['r-int'].cache && /réglé en dinars algériens : écrivez-nous/.test(r.boutons['r-int'].note || ''), JSON.stringify(r.boutons['r-int']));
  verifier('Algérie interne : clic resté en euros mais bouton invisible', r.boutons['r-int'].prix === EUR['r-int']);
  verifier('Algérie interne : un signalement par module', r.rapports.length === 2 && r.rapports.every(([s, m]) => s === 'ModuleDevise' && /interne/.test(m) && /DZD/.test(m)), JSON.stringify(r.rapports));

  // Devise sans aucun prix (dinar tunisien) : tous les boutons cèdent la place
  r = await jouer({ cache: member('tnd'), fresh: member('tnd') });
  verifier('Tunisie : six notes, aucun bouton visible', Object.values(r.boutons).every((b) => b.cache && /dinars tunisiens/.test(b.note || '')), JSON.stringify(r.boutons));
  verifier('Tunisie : quatre signalements (2 modules × 2 niveaux), pas un par bouton', r.rapports.length === 4, JSON.stringify(r.rapports));
  verifier('Tunisie : lignes en euros masquées sous les notes', r.lignesMasquees.every(Boolean), JSON.stringify(r.lignesMasquees));

  // Cache vide, Memberstack répond ensuite
  r = await jouer({ cache: null, fresh: member('mad') });
  local('cache vide puis Memberstack : prix posé à l\'arrivée', r.boutons['r-prat'], 'prc_rhumatologie-maroc-praticien-xf00bcr', /25\sMAD/);

  // Signalement sans OrdoErrorReporter sur la page : error-reporter.js chargé à côté du script
  const dom = new JSDOM(PAGE, { runScripts: 'outside-only', url: 'https://www.ordotype.fr/module/rhumatologie' });
  const injectes = [];
  const app = dom.window.document.body.appendChild.bind(dom.window.document.body);
  dom.window.document.body.appendChild = (n) => { if (n.tagName === 'SCRIPT') injectes.push(n.src); return app(n); };
  dom.window.localStorage.setItem('_ms-mem', JSON.stringify(member('dzd')));
  dom.window.console.log = () => {};
  dom.window.eval(SOURCE);
  await new Promise((res) => setTimeout(res, 30));
  verifier('sans rapporteur : error-reporter.js chargé depuis la même épingle',
    injectes.length === 1 && injectes[0] === 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@abc1234/shared/error-reporter.js', JSON.stringify(injectes));

  if (echecs) {
    console.error(`\n${echecs} vérification(s) en échec sur ${total}.`);
    process.exit(1);
  }
  console.log(`\n${total} vérifications.`);
})();
