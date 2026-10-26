#!/usr/bin/env node
/**
 * Bandeau de l'accueil dont la croix est retenue : « numéro de téléphone »
 * (#banner-to-hide-phone-missing). La croix masque le bandeau 30 jours, dans ce
 * navigateur et pour ce membre seulement ; au chargement suivant, le bandeau
 * d'après dans l'ordre peut s'afficher. Le bandeau « moyen de paiement qui expire
 * bientôt », qui avait la même croix, est retiré depuis le 26/10/2026
 * (test/bandeaux-carte-retires.js).
 *
 * Ce qui doit tenir :
 *   - membre sans téléphone, rien en mémoire : bandeau téléphone affiché ;
 *   - clic sur la croix (sur l'icône, comme un vrai clic) : bandeau masqué, repère
 *     « <id du membre>:<horodatage> » posé, celui-là seulement ;
 *   - rechargement après la croix du téléphone : l'image partenariat Rennes prend la place ;
 *   - 31 jours après : le bandeau revient ;
 *   - carte qui expire ou « expirée » : plus de bandeau carte, le téléphone s'affiche,
 *     y compris avec un ancien repère de croix carte resté dans le navigateur ;
 *   - repère d'un autre membre (poste partagé) ou daté dans le futur : ne compte pas ;
 *   - stockage qui refuse l'écriture : la croix ferme quand même, sans erreur ;
 *   - clic ailleurs (croix d'un autre bandeau) : aucun repère ;
 *   - téléphone renseigné : pas de bandeau téléphone.
 *
 * Usage : node test/bandeaux-croix-retenue.js
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
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const ASSO = 'pln_interne-m-decine-g-n-rale-adh-rent--4a4t0o95';

const TEL = { bandeau: '#banner-to-hide-phone-missing', cle: 'phoneBannerClosedTs' };
// Bandeau carte retiré : ses éléments restent dans la page Webflow, masqués, et des
// navigateurs gardent l'ancien repère de sa croix.
const CARTE = { bandeau: '#banner-to-hide-cb-expires-soon', cle: 'cbExpiresSoonBannerClosedTs' };
const CARTE_EXPIREE = '#banner-to-hide-cb-expired';
const CARTE_DANS_45_J = iso(MIDI + 45 * JOUR);

// Bandeaux tels que servis sur www (croix nfc_close-button dans le nfc_wrapper),
// plus l'image Rennes et la croix d'un autre bandeau.
const croix = '<a href="#" class="nfc_close-button"><div class="nfc_close-icon"><svg><path d="M18 6L6 18"></path></svg></div></a>';
const CORPS = '<div id="banner-to-hide-phone-missing" class="nfc_wrapper"><div class="nfc_component"><div class="nfc_content">'
    + 'Merci de renseigner votre numéro de téléphone<form id="wf-form-phone"><input data-ms-member="phone"></form>'
    + croix + '</div></div></div>'
    + '<div id="banner-to-hide-cb-expires-soon" class="nfc_wrapper"><div class="nfc_component"><div class="nfc_content">'
    + 'Votre moyen de paiement expire bientôt.<a href="/membership/moyen-de-paiement" class="button">Modifier</a>'
    + croix + '</div></div></div>'
    + '<div id="aimger" class="nfc_wrapper"><a href="#" id="autre-croix" class="nfc_close-button"><div>x</div></a></div>';

// Interne MG semestre 5 avec RPPS : aucun bandeau d'information avant celui du téléphone.
const membre = ({ id = 'mem_test', phone = '', ville = 'Paris', cb = '' } = {}) => ({
    id, createdAt: new Date(MIDI - 400 * JOUR).toISOString(),
    planConnections: [{ type: 'SUBSCRIPTION', planId: ASSO, status: 'ACTIVE' }],
    customFields: {
        statut: 'Interne', specialite: 'Médecine générale', semestre: '5', prnom: 'Test',
        'n-rpps': '12345678901', phone, cb, country: 'France',
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
            if (k === TEL.cle) throw new Error('QuotaExceededError');
            return ecrire.call(this, k, v);
        };
    }
    w.eval(UTILS);
    const vus = [];
    w.__navigate = () => {};
    w.jQuery = w.$ = (sel) => ({ css(r) { if (r && r.display === 'flex') vus.push(sel); return this; } });
    w.dataLayer = [];
    w.eval(ACCUEIL);
    return {
        vus,
        rennes: w.document.getElementById('aimger').style.display === 'flex',
        cliquer(sel) {
            w.document.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
        },
        masque: (b) => w.document.querySelector(b.bandeau).style.display === 'none',
        repere: (b) => w.localStorage.getItem(b.cle),
    };
}

const CAS = [
    // Téléphone.
    ['[téléphone] sans téléphone, rien en mémoire : bandeau affiché', () => {
        const p = page(membre());
        return [[p.vus.includes(TEL.bandeau), true, 'bandeau']];
    }],
    ['[téléphone] clic sur l\'icône de la croix : bandeau masqué, repère lié au membre posé', () => {
        const p = page(membre());
        p.cliquer(TEL.bandeau + ' .nfc_close-icon path');
        return [[p.masque(TEL), true, 'masqué'], [p.repere(TEL), 'mem_test:' + MIDI, 'repère'], [p.repere(CARTE), null, 'repère carte']];
    }],
    ['[téléphone] rechargement 1 jour après la croix : pas de bandeau, l\'image Rennes prend la place', () => {
        const p = page(membre({ ville: 'Rennes (MG)' }), { stockage: { [TEL.cle]: 'mem_test:' + (MIDI - JOUR) } });
        return [[p.vus.includes(TEL.bandeau), false, 'bandeau'], [p.rennes, true, 'image Rennes']];
    }],
    ['[téléphone] témoin : sans la croix, le téléphone passe avant l\'image Rennes', () => {
        const p = page(membre({ ville: 'Rennes (MG)' }));
        return [[p.vus.includes(TEL.bandeau), true, 'bandeau'], [p.rennes, false, 'image Rennes']];
    }],
    ['[téléphone] 29 jours après la croix : toujours masqué ; 31 jours après : le bandeau revient', () => {
        const j29 = page(membre(), { stockage: { [TEL.cle]: 'mem_test:' + (MIDI - 29 * JOUR) } });
        const j31 = page(membre(), { stockage: { [TEL.cle]: 'mem_test:' + (MIDI - 31 * JOUR) } });
        return [[j29.vus.includes(TEL.bandeau), false, 'J+29'], [j31.vus.includes(TEL.bandeau), true, 'J+31']];
    }],
    ['[téléphone] croix d\'un AUTRE membre sur ce navigateur (poste partagé) : bandeau affiché', () => {
        const p = page(membre(), { stockage: { [TEL.cle]: 'mem_autre:' + (MIDI - JOUR) } });
        return [[p.vus.includes(TEL.bandeau), true, 'bandeau']];
    }],
    ['[téléphone] repère daté dans le futur ou illisible : ne compte pas', () => {
        const futur = page(membre(), { stockage: { [TEL.cle]: 'mem_test:' + (MIDI + 2 * JOUR) } });
        const illisible = page(membre(), { stockage: { [TEL.cle]: 'n importe quoi' } });
        return [[futur.vus.includes(TEL.bandeau), true, 'futur'], [illisible.vus.includes(TEL.bandeau), true, 'illisible']];
    }],
    ['[téléphone] stockage qui refuse l\'écriture : la croix ferme quand même, sans repère', () => {
        const p = page(membre(), { refusEcriture: true });
        p.cliquer(TEL.bandeau + ' .nfc_close-button');
        return [[p.masque(TEL), true, 'masqué'], [p.repere(TEL), null, 'repère']];
    }],
    ['[téléphone] clic sur la croix d\'un autre bandeau : aucun repère', () => {
        const p = page(membre());
        p.cliquer('#autre-croix');
        return [[p.repere(TEL), null, 'repère'], [p.masque(TEL), false, 'bandeau téléphone intact']];
    }],
    ['[téléphone] téléphone renseigné : pas de bandeau', () => {
        const p = page(membre({ phone: '+33600000000' }));
        return [[p.vus.includes(TEL.bandeau), false, 'bandeau']];
    }],
    // Carte : bandeaux retirés, le téléphone n'est plus bloqué.
    ['[carte] expire dans 45 jours, sans téléphone : pas de bandeau carte, le téléphone s\'affiche', () => {
        const p = page(membre({ cb: CARTE_DANS_45_J }));
        return [[p.vus.includes(CARTE.bandeau), false, 'carte'], [p.vus.includes(TEL.bandeau), true, 'téléphone']];
    }],
    ['[carte] « expirée » (dans 10 jours), sans téléphone : pas de bandeau carte, le téléphone s\'affiche', () => {
        const p = page(membre({ cb: iso(MIDI + 10 * JOUR) }));
        return [[p.vus.includes(CARTE_EXPIREE), false, 'carte expirée'], [p.vus.includes(TEL.bandeau), true, 'téléphone']];
    }],
    ['[carte] ancien repère de croix carte dans le navigateur : sans effet, le téléphone s\'affiche', () => {
        const p = page(membre({ cb: CARTE_DANS_45_J }), { stockage: { [CARTE.cle]: 'mem_test:' + (MIDI - JOUR) } });
        return [[p.vus.includes(CARTE.bandeau), false, 'carte'], [p.vus.includes(TEL.bandeau), true, 'téléphone']];
    }],
    ['[carte] croix du téléphone posée, carte qui expire : ni téléphone ni carte', () => {
        const p = page(membre({ cb: CARTE_DANS_45_J }), { stockage: { [TEL.cle]: 'mem_test:' + (MIDI - JOUR) } });
        return [[p.vus.includes(CARTE.bandeau), false, 'carte'], [p.vus.includes(TEL.bandeau), false, 'téléphone']];
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
