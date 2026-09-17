#!/usr/bin/env node
/**
 * Fin d'internat : règle commune, redirections, page fin-internat et paywall des pathologies.
 *
 * Usage : node test/fin-internat.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const UTILS = lire('shared/memberstack-utils.js');
const NAV = (src) => src.split('window.location.replace(').join('window.__navigate(');
const REDIRECTS = { accueil: NAV(lire('homepage/member-redirects.js')), pathologie: NAV(lire('pathology/member-redirects.js')) };
const CORES = { 'fin-internat': lire('fin-internat/core.js'), 'fin-internat-v2': lire('fin-internat-v2/core.js') };
const PAYWALL = lire('pathology/fin-internat-paywall.js');

const JOUR = 24 * 60 * 60 * 1000;
const FIN = '/membership/fin-internat';

const INCLUS = [
    'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95', 'pln_compte-interne-derni-re-ann-e-9f4o0oyy',
    'pln_compte-interne-sy4j0oft', 'pln_sau-interne-811d0aht', 'pln_compte-interne-img-nl410oxc',
    'pln_brique-google-internes-paris-i31as0w8p', 'pln_praticien-belgique-gratuit--eif0fox',
    'pln_module-m-decine-g-n-rale-mves--ayrm059e', 'pln_compte-interne-aimgl-qb4h0oj3', 'pln_compte-externe-fr--bkp50om6',
];
const EXCLUS = [
    'pln_compte-praticien-offre-speciale-500-premiers--893z0o60', 'pln_praticien-belgique-2p70qka', 'pln_compte-ide-1gq10bkx',
    'pln_ordotype-plus-rhumatologie-jzz0k85', 'pln_modules-m-decine-g-n-rale-soins-palliatifs-et-rhumatologie-rq7q0trl',
    'pln_modules-mg-rhumato-et-soins-palliatifs-rc4b0dyw', 'pln_m-decin-exer-ant-en-mauritanie-j5430ol3',
    'pln_module-m-decine-g-n-rale-lu--5yfe0f08', 'pln_module-m-decine-g-n-rale-1-an-cm4c0b2p', 'pln_modume-m-decine-g-n-rale-9ze80shk',
    'pln_compte-praticien-ov4d0oln', 'pln_compte-m-decin-hu490oka', 'pln_ordotype-plus-module-soins-palliatifs-qph60vfs',
    'pln_praticien-marocain-in470oks', 'pln_compte-tablissement-vl2600lp', 'pln_padhue-mo12g06h7', 'pln_padhue-alumni-kz1950z3y',
    'pln_sau-praticien-ln1x0ovn', 'pln_compte-ouvert-u94k0of5', 'pln_eipa-b22kq009o', 'pln_compte-test-xd1tx0kmr',
    'pln_rhumatologues-3-mois-offerts-1yju0rb0', 'pln_compte-relecteur-vk17t0jyq', 'pln_compte-externe-534n0omq',
    'pln_compte-m-decin-tranger-n24p0or0', 'pln_ramsay-u64v0onh', 'pln_centre-m-dical-europe-fq4m0on9', 'pln_compte-1-an-nt4l0o48',
    'pln_abonnement-1-an-2-mois-gratuits-g04f0oue', 'pln_compte-samg-ra4q0oif', 'pln_cl2rb9es700100uhyg3v12k4i',
    'pln_essai-gratuit-5e4s0o0r', 'pln_sepa-temporary-lj4w0oky',
];
const MODULES = ['pln_module-rhumatologie-kei40zul', 'pln_soins-palliatifs-paid-plan-6tc60az6', 'pln_udr-paid-plan-dt380ts4'];
const ASSO = INCLUS[0];

const membre = ({ plans = [[ASSO]], statut = 'Interne', semestre = 'Internat terminé', jours = 60 } = {}) => ({
    id: 'mem_test', createdAt: new Date(Date.now() - jours * JOUR).toISOString(),
    planConnections: plans.map(([planId, status = 'ACTIVE']) => ({ planId, status, type: 'SUBSCRIPTION' })),
    customFields: {
        statut, semestre, specialite: 'Médecine générale', prnom: 'Test', 'n-rpps': '12345678901',
        phone: '+33600000000', country: 'France', 'partnership-city': 'Paris', 'mode-dexercice': 'Salarie',
    },
    metaData: {},
});

function fenetre({ html = '<!doctype html><head></head><body></body>', url = 'https://www.ordotype.fr/', stockage = {} } = {}) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const w = dom.window;
    Object.entries(stockage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    return w;
}

function utils(w, m) {
    if (m) w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    w.eval(UTILS);
    return w.OrdoMemberstack;
}

/** Rejoue une page de redirection. */
function redirection(page, m, stockage = {}) {
    const w = fenetre({ stockage });
    const navigations = [];
    const bandeaux = [];
    w.__navigate = (u) => navigations.push(u);
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') bandeaux.push(sel); }, on() { return this; }, hide() { return this; } });
    w.dataLayer = [];
    utils(w, m);
    w.eval(REDIRECTS[page]);
    return { fin: navigations.includes(FIN), bandeau: bandeaux.includes('#banner-to-hide-signup-internat-termine'), navigations };
}

const PAGE_PATHOLOGIE = (paywallPresent = true) => `<!doctype html><head></head><body>
  <div class="rappels-cliniques-content">
    <div data-ms-content="premium-pages" class="rc-html">Contenu premium</div>
    ${paywallPresent ? '<div id="RC_hidden_warning" class="rc_hidden_warning_wrapper"><div class="rc_premium_hidden_warning">Accès limité</div></div>' : ''}
  </div></body>`;

const charge = (w) => (w.document.readyState === 'loading'
    ? new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => r()))
    : Promise.resolve());

async function paywall(m, { stockage = {}, html = PAGE_PATHOLOGIE() } = {}) {
    const w = fenetre({ html, url: 'https://www.ordotype.fr/pathologies/test', stockage });
    utils(w, m);
    w.eval(PAYWALL);
    await charge(w);
    const carte = w.document.querySelector('.rc_hidden_warning_wrapper .rc_premium_hidden_warning');
    return {
        applique: w.document.body.classList.contains('ord-fin-internat'),
        carte: carte ? carte.textContent : null,
        injecte: !!w.document.querySelector('.rc_hidden_warning_wrapper[data-ordo-injected="1"]'),
    };
}

function page(nom) {
    const w = fenetre({
        html: `<!doctype html><head></head><body>
          <a id="reduire" data-ms-plan:add="pln_essai-expir--vr4r0ouk" href="#">Réduire</a>
          <a id="signup-rempla-from-decouverte" data-ms-price:add="prc_x" href="#"><span id="dedans">Offre</span></a>
          <a id="signup-rempla-stripe-customer" href="#">Offre</a>
          <a id="autre" href="/">Accueil</a></body>`,
        url: `https://www.ordotype.fr/membership/${nom}`,
    });
    w.eval(CORES[nom]);
    const clic = (id) => { w.localStorage.removeItem('justPaidTs'); w.document.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return !!w.localStorage.getItem('justPaidTs'); };
    return { vue: !!w.localStorage.getItem('finInternatSeenTs'), justPaidAuChargement: !!w.localStorage.getItem('justPaidTs'), clic };
}

const vuIlYa = (h) => ({ finInternatSeenTs: String(Date.now() - h * 60 * 60 * 1000) });
const vientDePayer = { justPaidTs: String(Date.now() - 5 * 60 * 1000) };

const CAS = [
    // Règle commune
    ['listes validées', () => {
        const ms = utils(fenetre(), membre());
        return [
            [JSON.stringify([...ms.END_OF_INTERNSHIP_PLAN_IDS].sort()), JSON.stringify([...INCLUS].sort()), 'plans inclus'],
            [JSON.stringify([...ms.KEEPS_ACCESS_PLAN_IDS].sort()), JSON.stringify([...EXCLUS].sort()), 'plans exclus'],
            [JSON.stringify([...ms.PAID_MODULE_PLAN_IDS].sort()), JSON.stringify([...MODULES].sort()), 'modules payants'],
        ];
    }],
    ['chaque plan inclus déclenche', () => INCLUS.map((id) => [utils(fenetre(), membre({ plans: [[id]] })).getEndOfInternship().ended, true, id])],
    ['chaque plan exclus protège', () => EXCLUS.map((id) => [utils(fenetre(), membre({ plans: [[ASSO], [id]] })).getEndOfInternship().ended, false, id])],
    ['statut sans effet', () => ['Interne', 'Medecin', 'Assistant', 'MEVS', 'Médecin assistant', ''].map((statut) =>
        [utils(fenetre(), membre({ statut })).getEndOfInternship().ended, true, `statut « ${statut} »`])],
    ['semestre en cours : pas de fin', () => [[utils(fenetre(), membre({ semestre: '6' })).getEndOfInternship().ended, false, 'semestre 6']]],
    ['plan résilié ignoré', () => [
        [utils(fenetre(), membre({ plans: [[ASSO, 'CANCELED']] })).getEndOfInternship().ended, false, 'plan interne résilié'],
        [utils(fenetre(), membre({ plans: [[ASSO], [EXCLUS[0], 'CANCELED']] })).getEndOfInternship().ended, true, 'plan payant résilié ne protège pas'],
    ]],
    ['module payant : fin quand même, signalé', () => MODULES.map((id) => {
        const r = utils(fenetre(), membre({ plans: [[ASSO], [id]] })).getEndOfInternship();
        return [r.ended && r.hasPaidModule, true, id];
    })],
    // Redirections
    ...['accueil', 'pathologie'].flatMap((p) => [
        [`[${p}] fin d'internat : redirigé`, () => [[redirection(p, membre()).fin, true, 'redirection']]],
        [`[${p}] page vue il y a 2 h : pas de redirection`, () => [[redirection(p, membre(), vuIlYa(2)).fin, false, 'pas de redirection']]],
        [`[${p}] page vue il y a 25 h : redirigé`, () => [[redirection(p, membre(), vuIlYa(25)).fin, true, 'redirection']]],
        [`[${p}] module payant : pas de redirection`, () => [[redirection(p, membre({ plans: [[ASSO], [MODULES[0]]] })).fin, false, 'pas de redirection']]],
        [`[${p}] vient de payer : pas de redirection`, () => [[redirection(p, membre(), vientDePayer).fin, false, 'pas de redirection']]],
        [`[${p}] statut Medecin : redirigé`, () => [[redirection(p, membre({ statut: 'Medecin' })).fin, true, 'redirection']]],
        [`[${p}] autre accès : pas de redirection`, () => [[redirection(p, membre({ plans: [[ASSO], [EXCLUS[0]]] })).fin, false, 'pas de redirection']]],
        [`[${p}] inscrit depuis 5 jours : bandeau`, () => {
            const r = redirection(p, membre({ jours: 5 }));
            return [[r.fin, false, 'pas de redirection'], [r.bandeau, true, 'bandeau']];
        }],
    ]),
    // Page fin-internat
    ...Object.keys(CORES).map((nom) => [`[${nom}] page vue notée, grâce seulement au clic`, () => {
        const p = page(nom);
        return [
            [p.vue, true, 'finInternatSeenTs posé'],
            [p.justPaidAuChargement, false, 'pas de justPaidTs au chargement'],
            [p.clic('reduire'), true, 'clic réduire'],
            [p.clic('dedans'), true, 'clic offre (élément enfant)'],
            [p.clic('signup-rempla-stripe-customer'), true, 'clic offre client Stripe'],
            [p.clic('autre'), false, 'clic ailleurs'],
        ];
    }]),
    // Paywall
    ['[paywall] fin d\'internat : appliquée', async () => {
        const r = await paywall(membre());
        return [[r.applique, true, 'classe posée'], [/offre interne/.test(r.carte || ''), true, 'carte remplacée']];
    }],
    ['[paywall] wrapper retiré par Memberstack : réinjecté', async () => {
        const r = await paywall(membre(), { html: PAGE_PATHOLOGIE(false) });
        return [[r.applique, true, 'classe posée'], [r.injecte, true, 'wrapper injecté'], [/offre interne/.test(r.carte || ''), true, 'carte']];
    }],
    ['[paywall] module payant : appliquée quand même', async () => [[(await paywall(membre({ plans: [[ASSO], [MODULES[1]]] }))).applique, true, 'classe posée']]],
    ['[paywall] vient de payer : rien', async () => [[(await paywall(membre(), { stockage: vientDePayer })).applique, false, 'rien']]],
    ['[paywall] autre accès : rien', async () => [[(await paywall(membre({ plans: [[ASSO], [EXCLUS[1]]] }))).applique, false, 'rien']]],
    ['[paywall] semestre en cours : rien', async () => [[(await paywall(membre({ semestre: '4' }))).applique, false, 'rien']]],
    ['[paywall] inscrit depuis 5 jours : rien', async () => [[(await paywall(membre({ jours: 5 }))).applique, false, 'rien']]],
    ['[paywall] fiche gratuite : rien', async () => [[(await paywall(membre(), { html: '<!doctype html><head></head><body><div class="rappels-cliniques-content">Libre</div></body>' })).applique, false, 'rien']]],
    ['[paywall] déconnecté : rien', async () => {
        const w = fenetre({ html: PAGE_PATHOLOGIE(), url: 'https://www.ordotype.fr/pathologies/test' });
        utils(w, null);
        w.eval(PAYWALL);
        await charge(w);
        return [[w.document.body.classList.contains('ord-fin-internat'), false, 'rien']];
    }],
];

(async () => {
let echecs = 0;
let verifs = 0;
for (const [nom, cas] of CAS) {
    let resultats;
    try {
        resultats = await cas();
    } catch (e) {
        console.log(`  ECHEC  ${nom} : exception ${e.message}`);
        echecs += 1;
        continue;
    }
    verifs += resultats.length;
    const ko = resultats.filter(([obtenu, attendu]) => obtenu !== attendu);
    if (ko.length) {
        echecs += 1;
        console.log(`  ECHEC  ${nom} : ${ko.map(([o, a, quoi]) => `${quoi} (obtenu ${o}, attendu ${a})`).join(' ; ')}`);
    } else {
        console.log(`  ok     ${nom}`);
    }
}
console.log(echecs ? `\n${echecs} cas en échec sur ${CAS.length}.` : `\n${CAS.length} cas, ${verifs} vérifications OK.`);
process.exit(echecs ? 1 : 0);
})();
