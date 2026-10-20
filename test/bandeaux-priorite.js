#!/usr/bin/env node
/**
 * Ordre des bandeaux de l'accueil et des fiches (homepage/ et pathology/member-redirects.js).
 *
 * Ce qui doit tenir :
 *   - accueil : les campagnes datées (fin d'internat, Docteur Junior) passent avant
 *     la demande de RPPS ; une fois la campagne finie, le RPPS reprend sa place ;
 *   - accueil : l'invitation SAU n'est pas montrée à un membre qui a déjà une offre
 *     SAU vivante (praticien ou interne) ; une offre SAU résiliée ne compte pas ;
 *   - fiches : l'impayé passe avant tout bandeau, comme sur l'accueil ;
 *   - délai de grâce (`justPaidTs` < 24 h), sur les deux pages : aucune redirection,
 *     aucun bandeau de facturation ou d'abonnement, mais les bandeaux d'information
 *     restent affichés ; témoin à 25 h : la redirection revient.
 *
 * Vraie memberstack-utils, membre dans `_ms-mem`, horloge de la page figée.
 *
 * Usage : node test/bandeaux-priorite.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const UTILS = lire('shared/memberstack-utils.js');
const NAV = (src) => src.split('window.location.replace(').join('window.__navigate(');
const PAGES = {
    accueil: NAV(lire('homepage/member-redirects.js')),
    fiche: NAV(lire('pathology/member-redirects.js')),
};

const JOUR = 24 * 60 * 60 * 1000;
const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';
const SPECIAL_500 = 'pln_compte-praticien-offre-speciale-500-premiers--893z0o60';
const SAU_PRATICIEN = 'pln_sau-praticien-ln1x0ovn';
const SAU_INTERNE = 'pln_sau-interne-811d0aht';
const MODULE_RHUMATO = 'pln_module-rhumatologie-kei40zul';
const ESSAI_GRATUIT = 'pln_essai-gratuit-5e4s0o0r';
const BRIQUE = 'pln_brique-past-due-os1c808ai';

const t = (iso) => new Date(iso).getTime();
// Fin d'internat (17/10 → 03/11) et Docteur Junior (15/10 → 16/11) ouverts.
const MIDI = t('2026-10-20T12:00:00+02:00');
const NUIT = t('2026-10-20T02:00:00+02:00');
const APRES_FIN_INTERNAT = t('2026-11-05T12:00:00+01:00');
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

const B = (id) => '#banner-to-hide-' + id;
const IMPAYE = '/membership/probleme-de-paiement';

const plan = (p) => (typeof p === 'string' ? { planId: p, status: 'ACTIVE' } : p);
const membre = ({
    statut = 'Interne', specialite = 'Médecine générale', semestre = '5', plans = [ASSO],
    rpps = '12345678901', phone = '+33600000000', prnom = 'Test', cb = '', inscrit = 400 * JOUR,
} = {}, maintenant = MIDI) => ({
    id: 'mem_test', createdAt: new Date(maintenant - inscrit).toISOString(),
    planConnections: plans.map(plan).map((c) => ({ type: 'SUBSCRIPTION', ...c })),
    customFields: {
        statut, specialite, semestre, prnom, 'n-rpps': rpps, phone, cb,
        country: 'France', 'partnership-city': 'Paris', 'mode-dexercice': 'Salarie',
    },
    metaData: {},
});

/** Page jouée pour `m` à `maintenant` ; `paye` = il y a combien de temps `justPaidTs` a été posé. */
function page(nom, m, { maintenant = MIDI, paye, stockage = {} } = {}) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const D = w.Date;
    w.Date = class extends D {
        constructor(...a) { if (a.length) super(...a); else super(maintenant); }
        static now() { return maintenant; }
    };
    w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    if (paye !== undefined) w.localStorage.setItem('justPaidTs', String(maintenant - paye));
    for (const [k, v] of Object.entries(stockage)) w.localStorage.setItem(k, v);
    w.eval(UTILS);
    const vus = [];
    const redirections = [];
    w.__navigate = (u) => redirections.push(u);
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); return this; } });
    w.dataLayer = [];
    w.eval(PAGES[nom]);
    return { vus, redirections };
}

const S8_SANS_RPPS = { semestre: '8', rpps: '' };
const URGENTISTE = { statut: 'Medecin', specialite: "Médecine d'urgence", semestre: '' };
const IMPAYE_PRATICIEN = { statut: 'Medecin', semestre: '', plans: [{ planId: SPECIAL_500, status: 'REQUIRES_PAYMENT' }] };
const UNE_HEURE = 60 * 60 * 1000;

const CAS = [
    // Accueil : ordre des bandeaux d'information.
    ['[accueil] dernier semestre sans RPPS : fin d\'internat avant RPPS', () => {
        const { vus } = page('accueil', membre(S8_SANS_RPPS));
        return [[vus.includes(B('fin-internat')), true, 'fin d\'internat'], [vus.includes(B('rpps-interne')), false, 'RPPS']];
    }],
    ['[accueil] dernier semestre sans RPPS, campagne finie : le RPPS reprend sa place', () => {
        const { vus } = page('accueil', membre(S8_SANS_RPPS, APRES_FIN_INTERNAT), { maintenant: APRES_FIN_INTERNAT });
        return [[vus.includes(B('fin-internat')), false, 'fin d\'internat'], [vus.includes(B('rpps-interne')), true, 'RPPS']];
    }],
    ['[accueil] semestre 5 sans RPPS (hors campagnes) : RPPS', () => {
        const { vus } = page('accueil', membre({ rpps: '' }));
        return [[vus.includes(B('rpps-interne')), true, 'RPPS']];
    }],
    // Accueil : invitation SAU.
    ['[accueil] urgentiste sans offre SAU : invitation SAU', () => {
        const { vus } = page('accueil', membre({ ...URGENTISTE, plans: [MODULE_RHUMATO] }));
        return [[vus.includes(B('sau-signup')), true, 'invitation']];
    }],
    ['[accueil] urgentiste déjà au SAU (praticien) : pas d\'invitation', () => {
        const { vus } = page('accueil', membre({ ...URGENTISTE, plans: [SAU_PRATICIEN] }));
        return [[vus.includes(B('sau-signup')), false, 'invitation']];
    }],
    ['[accueil] urgentiste avec une offre SAU résiliée : invitation SAU', () => {
        const { vus } = page('accueil', membre({ ...URGENTISTE, plans: [{ planId: SAU_PRATICIEN, status: 'CANCELED' }, MODULE_RHUMATO] }));
        return [[vus.includes(B('sau-signup')), true, 'invitation']];
    }],
    ['[accueil] urgentiste déjà au SAU, sans téléphone : le bandeau téléphone prend la place', () => {
        const { vus } = page('accueil', membre({ ...URGENTISTE, plans: [SAU_PRATICIEN], phone: '' }));
        return [[vus.includes(B('sau-signup')), false, 'invitation'], [vus.includes(B('phone-missing')), true, 'téléphone']];
    }],
    ['[accueil] interne MG semestre 1, la nuit : invitation SAU ; déjà au SAU interne : non', () => {
        const sans = page('accueil', membre({ semestre: '1' }, NUIT), { maintenant: NUIT });
        const avec = page('accueil', membre({ semestre: '1', plans: [ASSO, SAU_INTERNE] }, NUIT), { maintenant: NUIT });
        return [[sans.vus.includes(B('sau-signup')), true, 'sans offre SAU'], [avec.vus.includes(B('sau-signup')), false, 'avec offre SAU']];
    }],
    // Fiches : impayé d'abord.
    ['[fiche] impayé et carte qui expire : redirection vers le paiement, pas de bandeau carte', () => {
        const { vus, redirections } = page('fiche', membre({ ...IMPAYE_PRATICIEN, plans: [{ planId: SPECIAL_500, status: 'REQUIRES_PAYMENT' }, MODULE_RHUMATO], cb: iso(MIDI + 10 * JOUR) }));
        return [[redirections[0], IMPAYE, 'redirection'], [vus.length, 0, 'aucun bandeau']];
    }],
    ['[fiche] impayé en dernier semestre : redirection vers le paiement, pas de bandeau fin d\'internat', () => {
        const { vus, redirections } = page('fiche', membre({ semestre: '8', plans: [ASSO, { planId: SPECIAL_500, status: 'CANCELED' }, { planId: 'pln_compte-interne-sy4j0oft', status: 'REQUIRES_PAYMENT' }] }));
        return [[redirections[0], IMPAYE, 'redirection'], [vus.includes(B('fin-internat')), false, 'fin d\'internat']];
    }],
    ['[fiche] impayé avec accès de secours : pas de redirection', () => {
        const { redirections } = page('fiche', membre({ ...IMPAYE_PRATICIEN, plans: [{ planId: SPECIAL_500, status: 'REQUIRES_PAYMENT' }, BRIQUE] }));
        return [[redirections.length, 0, 'redirections']];
    }],
    // Délai de grâce : ni redirection ni bandeau de facturation, les bandeaux d'information restent.
    ['[accueil, grâce] impayé sans téléphone : pas de redirection, bandeau téléphone', () => {
        const { vus, redirections } = page('accueil', membre({ ...IMPAYE_PRATICIEN, phone: '' }), { paye: UNE_HEURE });
        return [[redirections.length, 0, 'redirections'], [vus.includes(B('payment-failed')), false, 'paiement échoué'], [vus.includes(B('phone-missing')), true, 'téléphone']];
    }],
    ['[accueil, grâce] témoin à 25 h : la redirection revient', () => {
        const { redirections } = page('accueil', membre({ ...IMPAYE_PRATICIEN, phone: '' }), { paye: 25 * UNE_HEURE });
        return [[redirections[0], IMPAYE, 'redirection']];
    }],
    ['[accueil, grâce] dernier semestre sans RPPS : fin d\'internat', () => {
        const { vus, redirections } = page('accueil', membre(S8_SANS_RPPS), { paye: UNE_HEURE });
        return [[redirections.length, 0, 'redirections'], [vus.includes(B('fin-internat')), true, 'fin d\'internat']];
    }],
    ['[accueil, grâce] semestre 5 sans RPPS : RPPS', () => {
        const { vus } = page('accueil', membre({ rpps: '' }), { paye: UNE_HEURE });
        return [[vus.includes(B('rpps-interne')), true, 'RPPS']];
    }],
    ['[accueil, grâce] semestre 6 : Docteur Junior', () => {
        const { vus } = page('accueil', membre({ semestre: '6' }), { paye: UNE_HEURE });
        return [[vus.includes(B('docteur-junior')), true, 'Docteur Junior']];
    }],
    ['[accueil, grâce] abonnement résilié : pas de bandeau « résilié »', () => {
        const { vus } = page('accueil', membre({ statut: 'Medecin', semestre: '', plans: [{ planId: SPECIAL_500, status: 'CANCELED' }, { planId: MODULE_RHUMATO, status: 'CANCELED' }] }), { paye: UNE_HEURE });
        return [[vus.includes(B('canceled')), false, 'résilié'], [vus.includes(B('essai-expire')), false, 'essai expiré']];
    }],
    ['[accueil, grâce] carte qui expire : pas de bandeau carte', () => {
        const { vus } = page('accueil', membre({ statut: 'Medecin', semestre: '', plans: [SPECIAL_500], cb: iso(MIDI + 10 * JOUR) }), { paye: UNE_HEURE });
        return [[vus.includes(B('cb-expired')), false, 'carte expirée'], [vus.includes(B('cb-expires-soon')), false, 'carte bientôt']];
    }],
    ['[accueil, grâce] essai gratuit sans prénom : pas de redirection vers le formulaire', () => {
        const { redirections } = page('accueil', membre({ statut: 'Medecin', semestre: '', plans: [ESSAI_GRATUIT], prnom: '' }), { paye: UNE_HEURE });
        return [[redirections.length, 0, 'redirections']];
    }],
    ['[fiche, grâce] impayé en dernier semestre : pas de redirection, bandeau fin d\'internat', () => {
        const { vus, redirections } = page('fiche', membre({ semestre: '8', plans: [ASSO, { planId: 'pln_compte-interne-sy4j0oft', status: 'REQUIRES_PAYMENT' }] }), { paye: UNE_HEURE });
        return [[redirections.length, 0, 'redirections'], [vus.includes(B('fin-internat')), true, 'fin d\'internat']];
    }],
    ['[fiche, grâce] semestre 6 : Docteur Junior', () => {
        const { vus, redirections } = page('fiche', membre({ semestre: '6' }), { paye: UNE_HEURE });
        return [[redirections.length, 0, 'redirections'], [vus.includes(B('docteur-junior')), true, 'Docteur Junior']];
    }],
    ['[fiche, grâce] carte qui expire : pas de bandeau carte', () => {
        const { vus } = page('fiche', membre({ statut: 'Medecin', semestre: '', plans: [SPECIAL_500], cb: iso(MIDI + 10 * JOUR) }), { paye: UNE_HEURE });
        return [[vus.length, 0, 'aucun bandeau']];
    }],
    ['[fiche, grâce] témoin à 25 h : la redirection revient', () => {
        const { redirections } = page('fiche', membre(IMPAYE_PRATICIEN), { paye: 25 * UNE_HEURE });
        return [[redirections[0], IMPAYE, 'redirection']];
    }],
];

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
