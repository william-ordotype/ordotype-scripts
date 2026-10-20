#!/usr/bin/env node
/**
 * Bandeau Docteur Junior (#banner-to-hide-docteur-junior) : qui le voit, et quand.
 *
 * Usage : node test/docteur-junior-banner.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const UTILS = lire('shared/memberstack-utils.js');
const NAV = (src) => src.split('window.location.replace(').join('window.__navigate(');
const BANDEAU = '#banner-to-hide-docteur-junior';
const FIN_INTERNAT = '#banner-to-hide-fin-internat';

const PAGES = {
    accueil: NAV(lire('homepage/member-redirects.js')),
    pathologie: NAV(lire('pathology/member-redirects.js')),
};

const JOUR = 24 * 60 * 60 * 1000;
const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';
const DERNIERE_ANNEE = 'pln_compte-interne-derni-re-ann-e-9f4o0oyy';
const SAU_INTERNE = 'pln_sau-interne-811d0aht';
const BRIQUE_PARIS = 'pln_brique-google-internes-paris-i31as0w8p';
const COMPTE_INTERNE_PAYANT = 'pln_compte-interne-sy4j0oft';
const SPECIAL_500 = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';
const MODULE_RHUMATO = 'pln_module-rhumatologie-kei40zul';
const ESSAI_EXPIRE = 'pln_essai-expir--vr4r0ouk';

const DEBUT = '2026-10-15T00:00:00+02:00';
const FIN = '2026-11-16T00:00:00+01:00';
const t = (iso) => new Date(iso).getTime();
const PENDANT = t('2026-10-15T12:00:00+02:00');
// Les deux bandeaux sont dans leur fenêtre.
const PENDANT_FIN_INTERNAT = t('2026-10-20T12:00:00+02:00');

const plan = (p) => (typeof p === 'string' ? { planId: p, status: 'ACTIVE' } : p);
const membre = ({
    semestre = '6', specialite = 'Médecine générale', plans = [ASSO], statut = 'Interne',
    rpps = '12345678901', phone = '+33600000000',
}) => ({
    id: 'mem_test', createdAt: new Date(Date.now() - 400 * JOUR).toISOString(),
    planConnections: plans.map(plan).map((c) => ({ type: 'SUBSCRIPTION', ...c })),
    customFields: {
        statut, semestre, specialite, prnom: 'Test', 'n-rpps': rpps,
        phone, country: 'France', 'partnership-city': 'Paris', 'mode-dexercice': 'Salarie',
    },
    metaData: {},
});

const FERME = 'docteurJuniorBannerClosedTs';
// Bandeau tel que posé dans le Designer : croix nfc_close-button (accueil) ou banner_close (fiches).
const HTML_BANDEAU = {
    accueil: '<div id="banner-to-hide-docteur-junior" class="nfc_wrapper"><div class="nfc_content">Texte'
        + '<a class="nfc_close-button" href="#"><div class="nfc_close-icon"><svg></svg></div></a></div></div><p id="ailleurs">x</p>',
    pathologie: '<div id="banner-to-hide-docteur-junior" class="banner-wrapper"><div class="bn_inner">Texte</div>'
        + '<a class="banner_close" href="#"><div class="banner-icon"><svg></svg></div></a></div><p id="ailleurs">x</p>',
};

/** Fenêtre jsdom avec memberstack-utils chargé, l'horloge de la page fixée à `maintenant`. */
function utils(m, maintenant = PENDANT, { corps = '', stockage = {} } = {}) {
    const dom = new JSDOM(`<!doctype html><head></head><body>${corps}</body>`, {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    if (w.Date === Date) throw new Error('horloge partagée avec le test');
    w.Date.now = () => maintenant;
    if (m) w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    for (const [k, v] of Object.entries(stockage)) w.localStorage.setItem(k, v);
    w.eval(UTILS);
    return w;
}

function page(nom, m, maintenant, options) {
    const w = utils(m, maintenant, options);
    const vus = [];
    const redirections = [];
    w.__navigate = (u) => redirections.push(u);
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); }, on() { return this; }, hide() { return this; } });
    w.dataLayer = [];
    w.eval(PAGES[nom]);
    return { vus, redirections, w };
}

/** Clique sur `selecteur` dans la page `nom` affichée pour un S6 : état du bandeau et du stockage après le clic. */
function cliquer(nom, selecteur) {
    const { w, vus } = page(nom, membre({}), PENDANT, { corps: HTML_BANDEAU[nom] });
    const cible = w.document.querySelector(selecteur);
    const evt = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    cible.dispatchEvent(evt);
    return {
        affiche: vus.includes(BANDEAU),
        cache: w.document.getElementById('banner-to-hide-docteur-junior').style.display === 'none',
        memorise: !!w.localStorage.getItem(FERME),
        empeche: evt.defaultPrevented,
    };
}

// La règle seule, avec la liste des comptes payants de la page d'accueil.
const PAYANTS = [COMPTE_INTERNE_PAYANT, SPECIAL_500];
const cible = (opts) => utils(membre(opts)).OrdoMemberstack.isDocteurJuniorAudience(PAYANTS);
const periode = (maintenant) => utils(null, maintenant).OrdoMemberstack.isDocteurJuniorBannerPeriod();

const CAS = [
    ['[règle] interne MG en S6 ou S7 : oui', () => [
        [cible({ semestre: '6' }), true, '6'], [cible({ semestre: '7' }), true, '7'],
        [cible({ semestre: ' 6 ' }), true, 'espaces'],
        [cible({ semestre: '6', specialite: 'Médecine générale ' }), true, 'spécialité avec espace'],
    ]],
    ['[règle] autres semestres : non', () => [
        [cible({ semestre: '5' }), false, '5'], [cible({ semestre: '8' }), false, '8'],
        [cible({ semestre: '10' }), false, '10'], [cible({ semestre: 'Internat terminé' }), false, 'terminé'],
        [cible({ semestre: '' }), false, 'vide'], [cible({ semestre: null }), false, 'absent'],
    ]],
    ['[règle] semestres annotés (FST, dernier semestre) : non', () => [
        [cible({ semestre: '6 (FST)' }), false, '6 (FST)'], [cible({ semestre: '6 (SFT)' }), false, '6 (SFT)'],
        [cible({ semestre: '6 (Dernier semestre)' }), false, 'dernier semestre'],
        [cible({ semestre: '5 (FST)' }), false, '5 (FST)'],
    ]],
    ['[règle] autre spécialité ou autre statut : non', () => [
        [cible({ specialite: 'Psychiatrie' }), false, 'psychiatrie'], [cible({ specialite: '' }), false, 'vide'],
        [cible({ statut: 'Medecin' }), false, 'Medecin'],
    ]],
    ['[règle] chaque plan interne gratuit ouvre la cible', () => [
        [cible({ plans: [ASSO] }), true, 'asso'], [cible({ plans: [DERNIERE_ANNEE] }), true, 'dernière année'],
        [cible({ plans: [SAU_INTERNE] }), true, 'SAU'], [cible({ plans: [BRIQUE_PARIS] }), true, 'brique'],
        [cible({ plans: [ASSO, MODULE_RHUMATO] }), true, 'avec un module'],
    ]],
    ['[règle] sans plan interne gratuit vivant : non', () => [
        [cible({ plans: [ESSAI_EXPIRE] }), false, 'essai expiré'], [cible({ plans: [] }), false, 'aucun plan'],
        [cible({ plans: [{ planId: ASSO, status: 'CANCELED' }] }), false, 'asso résiliée'],
        [cible({ plans: [COMPTE_INTERNE_PAYANT] }), false, 'compte interne payant seul'],
    ]],
    ['[règle] un compte payant vivant exclut : non', () => [
        [cible({ plans: [ASSO, COMPTE_INTERNE_PAYANT] }), false, 'compte interne payant'],
        [cible({ plans: [ASSO, SPECIAL_500] }), false, 'offre spéciale'],
        [cible({ plans: [ASSO, { planId: SPECIAL_500, status: 'REQUIRES_PAYMENT' }] }), false, 'impayé'],
        [cible({ plans: [ASSO, { planId: SPECIAL_500, status: 'CANCELED' }] }), true, 'offre spéciale résiliée'],
    ]],
    ['[période] du 15/10 00:00 au 15/11 23:59, heure de Paris', () => [
        [periode(t(DEBUT) - 1), false, 'veille 23:59:59'],
        [periode(t(DEBUT)), true, '15/10 00:00'],
        [periode(t('2026-11-02T09:00:00+01:00')), true, '02/11'],
        [periode(t('2026-11-15T23:59:59+01:00')), true, '15/11 23:59:59'],
        [periode(t(FIN)), false, '16/11 00:00'],
        [periode(t('2027-10-20T12:00:00+02:00')), false, 'octobre 2027'],
    ]],
];

for (const nom of Object.keys(PAGES)) {
    const voit = (opts, maintenant) => page(nom, membre(opts), maintenant).vus;
    const dj = (opts, maintenant) => voit(opts, maintenant).includes(BANDEAU);
    CAS.push(
        [`[${nom}] interne MG S6 : bandeau, et lui seul`, () => [
            [dj({ semestre: '6' }), true, 'S6'], [voit({ semestre: '6' }).length, 1, 'un seul bandeau'],
        ]],
        [`[${nom}] interne MG S7 : bandeau`, () => [[dj({ semestre: '7' }), true, 'S7']]],
        [`[${nom}] « 6 (FST) » : pas ce bandeau, celui de fin d'internat`, () => [
            [dj({ semestre: '6 (FST)' }, PENDANT_FIN_INTERNAT), false, 'docteur junior'],
            [voit({ semestre: '6 (FST)' }, PENDANT_FIN_INTERNAT).includes(FIN_INTERNAT), true, 'fin d\'internat'],
        ]],
        [`[${nom}] S8 : pas de bandeau Docteur Junior`, () => [
            [dj({ semestre: '8' }), false, 'avant le 17/10'], [dj({ semestre: '8' }, PENDANT_FIN_INTERNAT), false, 'après'],
        ]],
        [`[${nom}] « Internat terminé » : pas de bandeau`, () => [[dj({ semestre: 'Internat terminé' }), false, 'terminé']]],
        [`[${nom}] payeur : pas de bandeau`, () => [
            [dj({ plans: [ASSO, SPECIAL_500] }), false, 'offre spéciale'],
            [dj({ plans: [COMPTE_INTERNE_PAYANT] }), false, 'compte interne payant'],
        ]],
        [`[${nom}] hors période : pas de bandeau`, () => [
            [dj({}, t(DEBUT) - 1), false, 'veille'], [dj({}, t(FIN)), false, '16/11'], [dj({}, t(DEBUT)), true, 'premier instant'],
        ]],
        [`[${nom}] pendant le bandeau de fin d'internat, un S6 garde le sien`, () => [
            [dj({ semestre: '6' }, PENDANT_FIN_INTERNAT), true, 'S6 le 20/10'],
        ]],
        [`[${nom}] fermé une fois : ne revient plus`, () => [
            [page(nom, membre({}), PENDANT, { stockage: { [FERME]: String(PENDANT - JOUR) } }).vus.includes(BANDEAU), false, 'fermé la veille'],
        ]],
        [`[${nom}] clic sur la croix : caché, mémorisé, sans remonter en haut de page`, () => {
            const sel = nom === 'accueil' ? '.nfc_close-icon svg' : '.banner_close .banner-icon';
            const r = cliquer(nom, sel);
            return [[r.affiche, true, 'affiché avant'], [r.cache, true, 'caché'], [r.memorise, true, 'mémorisé'], [r.empeche, true, 'lien # neutralisé']];
        }],
        [`[${nom}] clic ailleurs : rien n'est mémorisé`, () => {
            const r = cliquer(nom, '#ailleurs');
            return [[r.cache, false, 'pas caché'], [r.memorise, false, 'pas mémorisé']];
        }],
    );
}

// Priorités propres à chaque page.
CAS.push(
    ['[accueil] RPPS manquant : le bandeau Docteur Junior passe avant', () => {
        const { vus } = page('accueil', membre({ rpps: '' }));
        return [[vus.includes(BANDEAU), true, 'docteur junior'], [vus.includes('#banner-to-hide-rpps-interne'), false, 'RPPS']];
    }],
    ['[accueil] RPPS manquant, bandeau Docteur Junior fermé : le bandeau RPPS reprend sa place', () => {
        const { vus } = page('accueil', membre({ rpps: '' }), PENDANT, { stockage: { [FERME]: String(PENDANT) } });
        return [[vus.includes(BANDEAU), false, 'docteur junior'], [vus.includes('#banner-to-hide-rpps-interne'), true, 'RPPS']];
    }],
    ['[accueil] téléphone manquant : le bandeau Docteur Junior passe avant', () => {
        const { vus } = page('accueil', membre({ phone: '' }));
        return [[vus.includes(BANDEAU), true, 'docteur junior'], [vus.includes('#banner-to-hide-phone-missing'), false, 'téléphone']];
    }],
    ['[accueil] téléphone manquant, bandeau Docteur Junior fermé : le bandeau téléphone reprend sa place', () => {
        const { vus } = page('accueil', membre({ phone: '' }), PENDANT, { stockage: { [FERME]: String(PENDANT) } });
        return [[vus.includes(BANDEAU), false, 'docteur junior'], [vus.includes('#banner-to-hide-phone-missing'), true, 'téléphone']];
    }],
    ['[pathologie] compte payant impayé : redirection vers le paiement, pas de bandeau', () => {
        const { vus, redirections } = page('pathologie', membre({ plans: [ASSO, { planId: SPECIAL_500, status: 'REQUIRES_PAYMENT' }] }));
        return [[redirections[0], '/membership/probleme-de-paiement', 'redirection'], [vus.includes(BANDEAU), false, 'bandeau']];
    }],
);

let echecs = 0;
let verifs = 0;
for (const [nom, cas] of CAS) {
    let resultats;
    try {
        resultats = cas();
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
