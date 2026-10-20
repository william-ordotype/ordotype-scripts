#!/usr/bin/env node
/**
 * Bandeau « numéro de téléphone » de l'accueil (#banner-to-hide-phone-missing) :
 * la croix le masque 30 jours, dans ce navigateur et pour ce membre seulement.
 *
 * Ce qui doit tenir :
 *   - membre sans téléphone, rien en mémoire : bandeau affiché ;
 *   - clic sur la croix (sur l'icône, comme un vrai clic) : bandeau masqué, repère
 *     « <id du membre>:<horodatage> » posé ;
 *   - rechargement après la croix : pas de bandeau, le suivant de la chaîne
 *     (image partenariat Rennes) prend la place ;
 *   - 31 jours après : le bandeau revient ;
 *   - repère d'un autre membre (poste partagé) ou daté dans le futur : ne compte pas ;
 *   - stockage qui refuse l'écriture : la croix ferme quand même, sans erreur ;
 *   - clic ailleurs (croix d'un autre bandeau) : aucun repère ;
 *   - téléphone renseigné : pas de bandeau.
 *
 * Usage : node test/bandeau-telephone.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const UTILS = lire('shared/memberstack-utils.js');
const ACCUEIL = lire('homepage/member-redirects.js').split('window.location.replace(').join('window.__navigate(');

const JOUR = 24 * 60 * 60 * 1000;
const MIDI = new Date('2026-10-20T12:00:00+02:00').getTime();
const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';
const BANDEAU = '#banner-to-hide-phone-missing';
const FERME = 'phoneBannerClosedTs';

// Bandeau tel que servi sur www (croix nfc_close-button dans le nfc_wrapper),
// plus l'image Rennes et la croix d'un autre bandeau.
const CORPS = '<div id="banner-to-hide-phone-missing" class="nfc_wrapper"><div class="nfc_component"><div class="nfc_content">'
    + 'Merci de renseigner votre numéro de téléphone<form id="wf-form-phone"><input data-ms-member="phone"></form>'
    + '<a data-element-to-hide="banner-to-hide-phone-missing" href="#" class="nfc_close-button"><div class="nfc_close-icon"><svg><path d="M18 6L6 18"></path></svg></div></a>'
    + '</div></div></div>'
    + '<div id="aimger" class="nfc_wrapper"><a href="#" id="autre-croix" class="nfc_close-button"><div>x</div></a></div>';

// Interne MG semestre 5 avec RPPS : aucun bandeau avant celui du téléphone.
const membre = ({ id = 'mem_test', phone = '', ville = 'Paris' } = {}) => ({
    id, createdAt: new Date(MIDI - 400 * JOUR).toISOString(),
    planConnections: [{ type: 'SUBSCRIPTION', planId: ASSO, status: 'ACTIVE' }],
    customFields: {
        statut: 'Interne', specialite: 'Médecine générale', semestre: '5', prnom: 'Test',
        'n-rpps': '12345678901', phone, cb: '', country: 'France',
        'partnership-city': ville, 'mode-dexercice': 'Salarie',
    },
    metaData: {},
});

function page(m, { maintenant = MIDI, stockage = {}, refusEcriture = false } = {}) {
    const dom = new JSDOM(`<!doctype html><head></head><body>${CORPS}</body>`, {
        url: 'https://www.ordotype.fr/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const D = w.Date;
    w.Date = class extends D {
        constructor(...a) { if (a.length) super(...a); else super(maintenant); }
        static now() { return maintenant; }
    };
    w.localStorage.setItem('_ms-mem', JSON.stringify(m));
    for (const [k, v] of Object.entries(stockage)) w.localStorage.setItem(k, v);
    if (refusEcriture) {
        const ecrire = w.Storage.prototype.setItem;
        w.Storage.prototype.setItem = function (k, v) {
            if (k === FERME) throw new Error('QuotaExceededError');
            return ecrire.call(this, k, v);
        };
    }
    w.eval(UTILS);
    const vus = [];
    w.__navigate = () => {};
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); return this; } });
    w.dataLayer = [];
    w.eval(ACCUEIL);
    const aimger = w.document.getElementById('aimger');
    return {
        w,
        vus,
        rennes: aimger.style.display === 'flex',
        cliquer(sel) {
            w.document.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
        },
        masque: () => w.document.getElementById('banner-to-hide-phone-missing').style.display === 'none',
        repere: () => w.localStorage.getItem(FERME),
    };
}

const CAS = [
    ['sans téléphone, rien en mémoire : bandeau affiché', () => {
        const p = page(membre());
        return [[p.vus.includes(BANDEAU), true, 'bandeau']];
    }],
    ['clic sur l\'icône de la croix : bandeau masqué, repère lié au membre posé', () => {
        const p = page(membre());
        p.cliquer('#banner-to-hide-phone-missing .nfc_close-icon path');
        return [[p.masque(), true, 'masqué'], [p.repere(), 'mem_test:' + MIDI, 'repère']];
    }],
    ['rechargement 1 jour après la croix : pas de bandeau, l\'image Rennes prend la place', () => {
        const p = page(membre({ ville: 'Rennes (MG)' }), { stockage: { [FERME]: 'mem_test:' + (MIDI - JOUR) } });
        return [[p.vus.includes(BANDEAU), false, 'bandeau'], [p.rennes, true, 'image Rennes']];
    }],
    ['témoin : sans la croix, le téléphone passe avant l\'image Rennes', () => {
        const p = page(membre({ ville: 'Rennes (MG)' }));
        return [[p.vus.includes(BANDEAU), true, 'bandeau'], [p.rennes, false, 'image Rennes']];
    }],
    ['29 jours après la croix : toujours masqué ; 31 jours après : le bandeau revient', () => {
        const j29 = page(membre(), { stockage: { [FERME]: 'mem_test:' + (MIDI - 29 * JOUR) } });
        const j31 = page(membre(), { stockage: { [FERME]: 'mem_test:' + (MIDI - 31 * JOUR) } });
        return [[j29.vus.includes(BANDEAU), false, 'J+29'], [j31.vus.includes(BANDEAU), true, 'J+31']];
    }],
    ['croix d\'un AUTRE membre sur ce navigateur (poste partagé) : bandeau affiché', () => {
        const p = page(membre(), { stockage: { [FERME]: 'mem_autre:' + (MIDI - JOUR) } });
        return [[p.vus.includes(BANDEAU), true, 'bandeau']];
    }],
    ['repère daté dans le futur ou illisible : ne compte pas', () => {
        const futur = page(membre(), { stockage: { [FERME]: 'mem_test:' + (MIDI + 2 * JOUR) } });
        const illisible = page(membre(), { stockage: { [FERME]: 'n importe quoi' } });
        return [[futur.vus.includes(BANDEAU), true, 'futur'], [illisible.vus.includes(BANDEAU), true, 'illisible']];
    }],
    ['stockage qui refuse l\'écriture : la croix ferme quand même, sans repère', () => {
        const p = page(membre(), { refusEcriture: true });
        p.cliquer('#banner-to-hide-phone-missing .nfc_close-button');
        return [[p.masque(), true, 'masqué'], [p.repere(), null, 'repère']];
    }],
    ['clic sur la croix d\'un autre bandeau : aucun repère', () => {
        const p = page(membre());
        p.cliquer('#autre-croix');
        return [[p.repere(), null, 'repère'], [p.masque(), false, 'bandeau téléphone intact']];
    }],
    ['téléphone renseigné : pas de bandeau', () => {
        const p = page(membre({ phone: '+33600000000' }));
        return [[p.vus.includes(BANDEAU), false, 'bandeau']];
    }],
];

let echecs = 0;
for (const [nom, cas] of CAS) {
    let verifs;
    try {
        verifs = cas();
    } catch (e) {
        echecs++;
        console.log('✗ ' + nom + '\n    ' + e.stack.split('\n').slice(0, 3).join('\n    '));
        continue;
    }
    const rates = verifs.filter(([obtenu, attendu]) => obtenu !== attendu);
    if (rates.length) {
        echecs++;
        console.log('✗ ' + nom);
        for (const [obtenu, attendu, quoi] of rates) console.log(`    ${quoi} : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);
    } else {
        console.log('✓ ' + nom);
    }
}
console.log(`\n${CAS.length - echecs}/${CAS.length} cas`);
process.exit(echecs ? 1 : 0);
