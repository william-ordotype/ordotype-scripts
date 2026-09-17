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
const LOADERS = { 'fin-internat': lire('fin-internat/loader.js'), 'fin-internat-v2': lire('fin-internat-v2/loader.js') };
const PAYWALL = lire('pathology/fin-internat-paywall.js');
const SAU_PAYWALL = lire('pathology/sau-paywall.js');
const PATHOLOGY_LOADER = lire('pathology/loader.js');
const REPO = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts';

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
    return {
        fin: navigations.includes(FIN),
        bandeau: bandeaux.includes('#banner-to-hide-signup-internat-termine'),
        vueNotee: w.localStorage.getItem('finInternatSeenTs') !== (stockage.finInternatSeenTs || null),
        navigations,
    };
}

const PAGE_PATHOLOGIE = (paywallPresent = true) => `<!doctype html><head></head><body>
  <div class="rappels-cliniques-content">
    <div data-ms-content="premium-pages" class="rc-html">Contenu premium</div>
    ${paywallPresent ? '<div id="RC_hidden_warning" data-ms-content="!premium-pages" class="rc_hidden_warning_wrapper"><div class="rc_premium_hidden_warning">Accès limité</div></div>' : ''}
  </div></body>`;

// Fiche d'un module payant : contenu gardé par le module, seul le bouton de la carte porte premium-pages.
const PAGE_MODULE = (paywallPresent = true) => `<!doctype html><head></head><body>
  <div class="rappels-cliniques-content">
    <div data-ms-content="rhumatologie" class="rc-html">Contenu du module</div>
    ${paywallPresent ? '<div id="RC_hidden_warning" data-ms-content="!rhumatologie" class="rc_hidden_warning_wrapper"><div class="rc_premium_hidden_warning">Module <a data-ms-content="premium-pages" href="#">Ajouter</a></div></div>' : ''}
  </div></body>`;

const charge = (w) => (w.document.readyState === 'loading'
    ? new Promise((r) => w.document.addEventListener('DOMContentLoaded', () => r()))
    : Promise.resolve());

const tick = () => new Promise((r) => setTimeout(r, 0));

const etat = (w) => {
    const cartes = [...w.document.querySelectorAll('.rc_hidden_warning_wrapper .rc_premium_hidden_warning')];
    return {
        applique: w.document.body.classList.contains('ord-fin-internat'),
        carte: cartes.length ? cartes.map((c) => c.textContent).join(' | ') : null,
        wrappers: w.document.querySelectorAll('.rc_hidden_warning_wrapper').length,
        injecte: !!w.document.querySelector('.rc_hidden_warning_wrapper[data-ordo-fin-internat="1"]'),
    };
};

async function paywall(m, { stockage = {}, html = PAGE_PATHOLOGIE(), sau = false, rapports = [] } = {}) {
    const w = fenetre({ html, url: 'https://www.ordotype.fr/pathologies/test', stockage });
    w.OrdoErrorReporter = { report: (ctx, msg) => rapports.push(`${ctx}: ${msg}`) };
    utils(w, m);
    if (sau) w.eval(SAU_PAYWALL);
    w.eval(PAYWALL);
    await charge(w);
    await tick();
    return Object.assign(etat(w), { w });
}

const leveeSau = async (w, restricted) => {
    w.document.dispatchEvent(new w.CustomEvent('ordo:ip-restriction', { detail: { restricted } }));
    await tick();
    return etat(w);
};

function page(nom) {
    const w = fenetre({
        html: `<!doctype html><head></head><body>
          <a id="reduire" data-ms-plan:add="pln_essai-expir--vr4r0ouk" href="#">Réduire</a>
          <a id="signup-rempla-from-decouverte" data-ms-price:add="prc_x" href="#"><span id="dedans">Offre</span></a>
          <a id="signup-rempla-stripe-customer" href="#">Offre</a>
          <a id="autre" href="/">Accueil</a></body>`,
        url: `https://www.ordotype.fr/membership/${nom}`,
    });
    utils(w, membre());
    w.STRIPE_CHECKOUT_CONFIG = { btnNoStripeId: 'signup-rempla-from-decouverte', btnStripeId: 'signup-rempla-stripe-customer' };
    w.eval(CORES[nom]);
    const clic = (id) => {
        w.localStorage.removeItem('finInternatActionTs');
        w.document.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        return !!w.localStorage.getItem('finInternatActionTs');
    };
    return {
        vue: !!w.localStorage.getItem('finInternatSeenTs'),
        justPaidTs: !!w.localStorage.getItem('justPaidTs'),
        clic,
        clicPoseJustPaid: () => { clic('reduire'); return !!w.localStorage.getItem('justPaidTs'); },
    };
}

/** Rejoue un chargeur sans réseau : chaque script est noté, `echoue` renvoie une erreur de chargement. */
async function chargeur(source, { src, echoue = () => false, delai = () => 0, jusqua = null, attente = 50 } = {}) {
    const w = fenetre({ url: 'https://www.ordotype.fr/pathologies/test' });
    const urls = [];
    const journal = [];
    Object.defineProperty(w.document, 'currentScript', { configurable: true, get: () => (src ? { src } : null) });
    const scriptTag = w.document.createElement('script');
    if (src) { scriptTag.src = src; w.document.head.appendChild(scriptTag); }
    w.document.head.appendChild = (el) => {
        const u = (el.src || el.href || '').split('?')[0];
        urls.push(u);
        journal.push({ quoi: 'ajout', u, async: el.async });
        setTimeout(() => {
            if (echoue(u)) { if (el.onerror) el.onerror(); return; }
            journal.push({ quoi: 'charge', u });
            if (el.onload) el.onload();
        }, delai(u));
        return el;
    };
    w.eval(source);
    const limite = Date.now() + 10000;
    if (jusqua) {
        while (!jusqua(urls) && Date.now() < limite) await new Promise((r) => setTimeout(r, 20));
    } else {
        await new Promise((r) => setTimeout(r, attente));
    }
    w.close();
    const res = urls.filter((u) => u && u.startsWith(REPO));
    res.journal = journal;
    return res;
}

const vuIlYa = (h) => ({ finInternatSeenTs: String(Date.now() - h * 60 * 60 * 1000) });
const vientDePayer = { justPaidTs: String(Date.now() - 5 * 60 * 1000) };
const offreChoisieIlYa = (min) => ({ finInternatActionTs: String(Date.now() - min * 60 * 1000) });
const offreChoisieDansUnAn = { finInternatActionTs: String(Date.now() + 365 * JOUR) };

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
    ['plans interne de la redirection historique inclus', () => {
        const ms = utils(fenetre(), membre());
        return ms.ALLOWED_INTERN_PLAN_IDS.map((id) => [ms.END_OF_INTERNSHIP_PLAN_IDS.includes(id), true, id]);
    }],
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
        [`[${p}] fin d'internat : redirigé, page notée vue avant de partir`, () => {
            const r = redirection(p, membre());
            return [[r.fin, true, 'redirection'], [r.vueNotee, true, 'finInternatSeenTs posé par la redirection']];
        }],
        [`[${p}] pas de redirection : page pas notée vue`, () => [[redirection(p, membre(), vuIlYa(2)).vueNotee, false, 'finInternatSeenTs inchangé']]],
        [`[${p}] offre choisie il y a 30 min : pas de redirection`, () => [[redirection(p, membre(), offreChoisieIlYa(30)).fin, false, 'pas de redirection']]],
        [`[${p}] offre choisie il y a 2 h : redirigé`, () => [[redirection(p, membre(), offreChoisieIlYa(120)).fin, true, 'redirection']]],
        [`[${p}] horodatages dans le futur ignorés : redirigé`, () => [
            [redirection(p, membre(), offreChoisieDansUnAn).fin, true, 'offre choisie dans un an'],
            [redirection(p, membre(), { finInternatSeenTs: String(Date.now() + 365 * JOUR) }).fin, true, 'page vue dans un an'],
        ]],
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
    ...Object.keys(CORES).flatMap((nom) => [
        [`[${nom}] page vue notée, marqueur dédié seulement au clic sur une offre`, () => {
            const p = page(nom);
            return [
                [p.vue, true, 'finInternatSeenTs posé'],
                [p.justPaidTs, false, 'pas de justPaidTs au chargement'],
                [p.clic('reduire'), true, 'clic réduire'],
                [p.clic('dedans'), true, 'clic offre (élément enfant)'],
                [p.clic('signup-rempla-stripe-customer'), true, 'clic offre client Stripe'],
                [p.clic('autre'), false, 'clic ailleurs'],
                [p.clicPoseJustPaid(), false, 'le clic ne pose pas justPaidTs'],
            ];
        }],
        [`[${nom}] sans memberstack-utils : erreur signalée sous le nom de la page, pas d'exception`, () => {
            const w = fenetre({ url: `https://www.ordotype.fr/membership/${nom}` });
            const rapports = [];
            w.OrdoErrorReporter = { report: (ctx, msg) => rapports.push(ctx) };
            w.eval(CORES[nom]);
            const attendu = nom === 'fin-internat' ? 'FinInternatCore' : 'FinInternatV2Core';
            return [[rapports.join(','), attendu, 'une erreur signalée'], [!!w.localStorage.getItem('locat'), true, 'locat posé']];
        }],
        [`[${nom}] boutons lus dans STRIPE_CHECKOUT_CONFIG`, () => {
            const w = fenetre({
                html: '<!doctype html><head></head><body><a id="bouton-a" href="#">A</a><a id="signup-rempla-stripe-customer" href="#">B</a></body>',
                url: `https://www.ordotype.fr/membership/${nom}`,
            });
            const rapports = [];
            w.OrdoErrorReporter = { report: (ctx, msg) => rapports.push(msg) };
            utils(w, membre());
            w.STRIPE_CHECKOUT_CONFIG = { btnNoStripeId: 'bouton-a', btnStripeId: 'bouton-b' };
            w.eval(CORES[nom]);
            const clic = (id) => { w.localStorage.removeItem('finInternatActionTs'); w.document.getElementById(id).click(); return !!w.localStorage.getItem('finInternatActionTs'); };
            const sans = fenetre({ url: `https://www.ordotype.fr/membership/${nom}` });
            const rapportsSans = [];
            sans.OrdoErrorReporter = { report: (ctx, msg) => rapportsSans.push(msg) };
            utils(sans, membre());
            sans.eval(CORES[nom]);
            return [
                [clic('bouton-a'), true, 'id de la config'],
                [clic('signup-rempla-stripe-customer'), false, 'id absent de la config'],
                [rapports.length, 0, 'config complète : aucun rapport'],
                [rapportsSans.length, 1, 'config absente : signalée'],
                [!!sans.localStorage.getItem('finInternatSeenTs'), true, 'config absente : page quand même notée vue'],
            ];
        }],
        [`[${nom}] chargeur épinglé : ses scripts suivent l'épingle`, async () => {
            const epingle = await chargeur(LOADERS[nom], { src: `${REPO}@abc1234/${nom}/loader.js` });
            const main = await chargeur(LOADERS[nom], { src: `${REPO}@main/${nom}/loader.js` });
            const inconnu = await chargeur(LOADERS[nom], { src: null });
            return [
                [epingle.length >= 3 && epingle.every((u) => u.startsWith(`${REPO}@abc1234/`)), true, 'tout sur @abc1234'],
                [epingle.includes(`${REPO}@abc1234/${nom}/core.js`), true, 'core.js épinglé'],
                [main.length >= 3 && main.every((u) => u.startsWith(`${REPO}@main/`)), true, '@main inchangé'],
                [inconnu.length >= 3 && inconnu.every((u) => u.startsWith(`${REPO}@main/`)), true, 'repli sur @main'],
            ];
        }],
    ]),
    // Paywall
    ['[paywall] fin d\'internat : appliquée', async () => {
        const r = await paywall(membre());
        return [[r.applique, true, 'classe posée'], [/offre interne/.test(r.carte || ''), true, 'carte remplacée']];
    }],
    ['[paywall] wrapper retiré par Memberstack : réinjecté', async () => {
        const r = await paywall(membre(), { html: PAGE_PATHOLOGIE(false) });
        return [[r.applique, true, 'classe posée'], [r.injecte, true, 'wrapper injecté'], [/offre interne/.test(r.carte || ''), true, 'carte']];
    }],
    ['[paywall] wrapper retiré APRÈS coup par Memberstack : le même bloc est remis', async () => {
        const r = await paywall(membre());
        const bloc = r.w.document.querySelector('.rappels-cliniques-content .rc_hidden_warning_wrapper');
        bloc.remove();
        await tick();
        const apres = etat(r.w);
        return [
            [apres.applique, true, 'classe posée'],
            [apres.wrappers, 1, 'un wrapper'],
            [r.w.document.querySelector('.rappels-cliniques-content .rc_hidden_warning_wrapper') === bloc, true, 'même nœud (iframe-handler le garde)'],
            [bloc.hasAttribute('data-ms-content'), false, 'attribut Memberstack retiré'],
            [/offre interne/.test(apres.carte || ''), true, 'carte'],
        ];
    }],
    ['[paywall] Memberstack retire le bloc en boucle : arrêt et un seul rapport', async () => {
        const rapports = [];
        const r = await paywall(membre(), { rapports });
        const hote = r.w.document.querySelector('.rappels-cliniques-content');
        let retraits = 0;
        new r.w.MutationObserver(() => {
            const b = hote.querySelector('.rc_hidden_warning_wrapper');
            if (b) { retraits += 1; b.remove(); }
        }).observe(hote, { childList: true });
        hote.querySelector('.rc_hidden_warning_wrapper').remove();
        for (let i = 0; i < 60; i += 1) await tick();
        return [[retraits <= 20, true, `remises bornées (${retraits})`], [rapports.length, 1, 'un rapport']];
    }],
    ['[paywall] fiche de module payant : rien, quel que soit le moment', async () => {
        const avecCarte = await paywall(membre(), { html: PAGE_MODULE(true) });
        const sansCarte = await paywall(membre({ plans: [[ASSO], [MODULES[0]]] }), { html: PAGE_MODULE(false) });
        return [[avecCarte.applique, false, 'carte du module présente'], [sansCarte.applique, false, 'carte retirée (module payé)']];
    }],
    ['[paywall] restriction SAU puis bloc retiré par Memberstack : bloc remis, carte SAU gardée', async () => {
        const r = await paywall(membre(), { sau: true, stockage: { ord_ip_restricted: '1' } });
        r.w.document.querySelector('.rappels-cliniques-content .rc_hidden_warning_wrapper').remove();
        await tick();
        const apres = etat(r.w);
        return [[apres.wrappers, 1, 'un wrapper'], [/Besoin d/.test(apres.carte || ''), true, 'carte SAU']];
    }],
    ['[paywall] pas de zone de contenu : contenu laissé visible, un seul rapport par session', async () => {
        const rapports = [];
        const html = '<!doctype html><head></head><body><div data-ms-content="premium-pages">Contenu</div></body>';
        const r = await paywall(membre(), { html, rapports });
        r.w.eval(PAYWALL);
        await tick();
        return [[r.applique, false, 'classe non posée'], [rapports.length, 1, 'un rapport sur deux passages']];
    }],
    ['[paywall] carte écrasée après coup : remise', async () => {
        const r = await paywall(membre());
        r.w.document.querySelector('.rc_premium_hidden_warning').innerHTML = 'Accès limité';
        await tick();
        return [[/offre interne/.test(etat(r.w).carte || ''), true, 'carte']];
    }],
    ['[paywall] restriction SAU active puis levée : carte SAU, puis carte fin d\'internat', async () => {
        const r = await paywall(membre(), { html: PAGE_PATHOLOGIE(false), sau: true, stockage: { ord_ip_restricted: '1' } });
        const pendant = etat(r.w);
        const apres = await leveeSau(r.w, false);
        return [
            [/Besoin d/.test(pendant.carte || ''), true, 'carte SAU pendant la restriction'],
            [apres.applique, true, 'classe toujours posée'],
            [apres.wrappers, 1, 'un wrapper après la levée'],
            [/offre interne/.test(apres.carte || ''), true, 'carte fin d\'internat après la levée'],
        ];
    }],
    ['[paywall] restriction SAU arrivée après coup puis levée', async () => {
        const r = await paywall(membre(), { html: PAGE_PATHOLOGIE(false), sau: true });
        const pendant = await leveeSau(r.w, true);
        const apres = await leveeSau(r.w, false);
        return [
            [/Besoin d/.test(pendant.carte || ''), true, 'carte SAU pendant la restriction'],
            [apres.wrappers, 1, 'un wrapper après la levée'],
            [/offre interne/.test(apres.carte || ''), true, 'carte fin d\'internat après la levée'],
        ];
    }],
    ['[paywall] fonction absente : erreur signalée', async () => {
        const rapports = [];
        const w = fenetre({ html: PAGE_PATHOLOGIE(), url: 'https://www.ordotype.fr/pathologies/test' });
        w.OrdoErrorReporter = { report: (ctx, msg) => rapports.push(`${ctx}: ${msg}`) };
        w.OrdoMemberstack = { member: { id: 'mem_test' }, refresh() {} };
        w.eval(PAYWALL);
        await charge(w);
        return [[rapports.length, 1, 'une erreur signalée'], [w.document.body.classList.contains('ord-fin-internat'), false, 'rien']];
    }],
    ['[paywall] module payant : appliquée quand même', async () => [[(await paywall(membre({ plans: [[ASSO], [MODULES[1]]] }))).applique, true, 'classe posée']]],
    ['[paywall] justPaidTs posé par une autre page : appliquée quand même', async () => [[(await paywall(membre(), { stockage: vientDePayer })).applique, true, 'classe posée']]],
    ['[paywall] offre choisie il y a 30 min : rien', async () => [[(await paywall(membre(), { stockage: offreChoisieIlYa(30) })).applique, false, 'rien']]],
    ['[paywall] offre choisie il y a 2 h : appliquée', async () => [[(await paywall(membre(), { stockage: offreChoisieIlYa(120) })).applique, true, 'classe posée']]],
    ['[paywall] offre choisie « dans un an » : appliquée', async () => [[(await paywall(membre(), { stockage: offreChoisieDansUnAn })).applique, true, 'classe posée']]],
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
    // Chargeur des pathologies
    ['[chargeur pathologies] paywalls téléchargées en parallèle, exécutées dans l\'ordre, Tier 2 après toutes', async () => {
        const base = `${REPO}@abc1234`;
        const avant = [`${base}/shared/memberstack-utils.js`, `${base}/pathology/pause-paywall.js`, `${base}/pathology/sau-paywall.js`, `${base}/pathology/fin-internat-paywall.js`];
        const tier2 = (urls) => urls.some((u) => u.endsWith('/pathology/tabs-manager.js'));
        // pause-paywall échoue vite, fin-internat arrive tard.
        const r = await chargeur(PATHOLOGY_LOADER, {
            src: `${base}/pathology/loader.js`, jusqua: tier2,
            echoue: (u) => u.endsWith('/pause-paywall.js'),
            delai: (u) => (u.endsWith('/fin-internat-paywall.js') ? 2500 : 0),
        });
        const idx = (quoi, u) => r.journal.findIndex((e) => e.quoi === quoi && e.u === u);
        const ajoutsAvant = avant.map((u) => r.journal.find((e) => e.quoi === 'ajout' && e.u === u));
        const tier2Ajout = r.journal.findIndex((e) => e.quoi === 'ajout' && e.u.endsWith('/pathology/tabs-manager.js'));
        return [
            [ajoutsAvant.every(Boolean), true, 'les 4 scripts demandés'],
            [ajoutsAvant.every((e) => e && e.async === false), true, 'exécution dans l\'ordre (async = false)'],
            [idx('ajout', avant[3]) < idx('charge', avant[0]), true, 'fin-internat demandée sans attendre memberstack-utils'],
            [idx('charge', avant[3]) !== -1 && tier2Ajout > idx('charge', avant[3]), true, 'Tier 2 après fin-internat malgré l\'échec de pause-paywall'],
        ];
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
