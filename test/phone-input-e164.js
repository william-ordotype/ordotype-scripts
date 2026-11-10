#!/usr/bin/env node
/**
 * Le numéro que Memberstack lit à l'envoi est en E.164.
 *
 * Ici, avec la VRAIE bibliothèque (intl-tel-input 17.0.8 et ses aides, les
 * fichiers que sert cdnjs) dans jsdom :
 *   - pendant la saisie, l'affichage reste espacé ;
 *   - à l'envoi, un numéro valide part en E.164, identique au
 *     `parsePhoneNumberFromString(...).number` de libphonenumber-js/max sur la
 *     forme espacée ;
 *   - seuls les séparateurs tombent : mêmes chiffres, y compris quand les deux
 *     bibliothèques ne sont pas d'accord (mobile d'outre-mer saisi derrière +33) ;
 *   - un numéro invalide, une extension, ou un numéro sans les aides partent
 *     tels quels ;
 *   - la conversion passe AVANT la lecture de Memberstack, que son écouteur
 *     ait été posé avant ou après la construction du champ. Le faux Memberstack
 *     reproduit le script v2 : écouteur `submit` sur le formulaire, lecture
 *     synchrone de tous les `[data-ms-member]`, puis `stopPropagation()`.
 *
 * Numéros : les exemples des métadonnées de libphonenumber, fictifs.
 *
 * Dépendances (CI : .github/workflows/tests.yml) :
 *   npm install --no-save jsdom intl-tel-input@17.0.8 libphonenumber-js@1.13.13
 *
 * Usage : node test/phone-input-e164.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = ['mes-informations/phone-input.js', 'account/phone-input.js'];
const ITI_VERSION = '17.0.8';
const LJS_VERSION = '1.13.13';

// Un module absent fait ÉCHOUER le test, il ne le saute pas : un test sauté
// passe pour vert.
function charger(nom, resoudre) {
    try {
        return resoudre ? require.resolve(nom) : require(nom);
    } catch (e) {
        console.error(`ECHEC  module « ${nom} » introuvable : npm install --no-save jsdom intl-tel-input@${ITI_VERSION} libphonenumber-js@${LJS_VERSION}`);
        process.exit(1);
    }
}

const { JSDOM, VirtualConsole } = charger('jsdom');
const ljs = charger('libphonenumber-js/max');
const ITI_DIR = path.dirname(charger('intl-tel-input/build/js/utils.js', true));
const LIB = fs.readFileSync(path.join(ITI_DIR, 'intlTelInput.min.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ITI_DIR, 'utils.js'), 'utf8');

const SEPARATEURS = /[\s.()-]/g;

/**
 * pays : drapeau choisi avant la frappe ; saisie : ce que tape le membre ;
 * envoye : ce que Memberstack doit lire (null = la valeur affichée, telle
 * quelle) ; accord : libphonenumber-js/max juge aussi le numéro valide.
 */
const CAS = [
    // France métropolitaine
    { quoi: 'FR mobile 06, saisie nationale', pays: 'fr', saisie: '06 12 34 56 78', envoye: '+33612345678', accord: true },
    { quoi: 'FR mobile 07', pays: 'fr', saisie: '07 81 23 45 67', envoye: '+33781234567', accord: true },
    { quoi: 'FR mobile, indicatif et points', pays: 'fr', saisie: '+33 6.12.34.56.78', envoye: '+33612345678', accord: true },
    { quoi: 'FR mobile, zéro entre parenthèses', pays: 'fr', saisie: '+33 (0)6 12 34 56 78', envoye: '+33612345678', accord: true },
    { quoi: 'FR fixe 01', pays: 'fr', saisie: '01 23 45 67 89', envoye: '+33123456789', accord: true },
    { quoi: 'FR 09', pays: 'fr', saisie: '09 12 34 56 78', envoye: '+33912345678', accord: true },
    // Outre-mer
    { quoi: 'La Réunion mobile', pays: 're', saisie: '0692 12 34 56', envoye: '+262692123456', accord: true },
    { quoi: 'La Réunion fixe', pays: 're', saisie: '0262 16 12 34', envoye: '+262262161234', accord: true },
    { quoi: 'Guadeloupe mobile', pays: 'gp', saisie: '0690 00 12 34', envoye: '+590690001234', accord: true },
    { quoi: 'Martinique mobile', pays: 'mq', saisie: '0696 20 12 34', envoye: '+596696201234', accord: true },
    { quoi: 'Martinique fixe', pays: 'mq', saisie: '0596 30 12 34', envoye: '+596596301234', accord: true },
    { quoi: 'Guyane mobile', pays: 'gf', saisie: '0694 20 12 34', envoye: '+594694201234', accord: true },
    { quoi: 'Mayotte mobile', pays: 'yt', saisie: '0639 01 23 45', envoye: '+262639012345', accord: true },
    { quoi: 'Nouvelle-Calédonie', pays: 'nc', saisie: '75.12.34', envoye: '+687751234', accord: true },
    { quoi: 'Polynésie française', pays: 'pf', saisie: '87 12 34 56', envoye: '+68987123456', accord: true },
    { quoi: 'outre-mer tapé avec son indicatif, drapeau France', pays: 'fr', saisie: '+262 692 12 34 56', envoye: '+262692123456', accord: true },
    // Étranger
    { quoi: 'Belgique mobile', pays: 'be', saisie: '0470 12 34 56', envoye: '+32470123456', accord: true },
    { quoi: 'Suisse mobile', pays: 'ch', saisie: '078 123 45 67', envoye: '+41781234567', accord: true },
    { quoi: 'Maroc mobile', pays: 'ma', saisie: '0650-123456', envoye: '+212650123456', accord: true },
    { quoi: 'Algérie mobile', pays: 'dz', saisie: '0551 23 45 67', envoye: '+213551234567', accord: true },
    { quoi: 'Tunisie mobile', pays: 'tn', saisie: '20 123 456', envoye: '+21620123456', accord: true },
    { quoi: 'Luxembourg mobile', pays: 'lu', saisie: '628 123 456', envoye: '+352628123456', accord: true },
    { quoi: 'Belgique tapée avec son indicatif, drapeau France', pays: 'fr', saisie: '+32 470 12 34 56', envoye: '+32470123456', accord: true },
    { quoi: 'Royaume-Uni', pays: 'fr', saisie: '+44 7400 123456', envoye: '+447400123456', accord: true },
    { quoi: 'États-Unis (555-01xx, fictif)', pays: 'fr', saisie: '+1 201-555-0123', envoye: '+12015550123', accord: true },
    // Les deux bibliothèques divergent : intl-tel-input 17.0.8 (métadonnées
    // anciennes) accepte ces tranches derrière +33, libphonenumber-js/max non.
    // Mêmes chiffres envoyés, sans les espaces.
    { quoi: 'mobile de Guadeloupe derrière +33 (désaccord)', pays: 'fr', saisie: '06 90 12 34 56', envoye: '+33690123456', accord: false },
    { quoi: 'tranche +33 700 (désaccord)', pays: 'fr', saisie: '07 00 12 34 56', envoye: '+33700123456', accord: false },
    // Laissés tels quels
    { quoi: 'invalide : trop court', pays: 'fr', saisie: '06 12 34', envoye: null },
    { quoi: 'invalide : trop long', pays: 'fr', saisie: '06 12 34 56 78 9', envoye: null },
    // Bonne longueur, tranche non attribuée : les aides en donnent quand même un
    // E.164 ; seul leur verdict de validité le retient.
    { quoi: 'invalide : bonne longueur, tranche non attribuée', pays: 'fr', saisie: '04 00 00 00 00', envoye: null },
    { quoi: 'extension', pays: 'fr', saisie: '06 12 34 56 78 ext. 12', envoye: null },
    { quoi: 'texte autour', pays: 'fr', saisie: '06 12 34 56 78 poste 12', envoye: null },
];

/** Une page avec un formulaire de profil Memberstack, la bibliothèque et ses aides déjà là. */
function page(source, { aides = true } = {}) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(`<!doctype html><head></head><body>
        <form id="profil" data-ms-form="profile">
          <input data-ms-member="prnom" value="Test">
          <input type="tel" data-ms-member="phone" ms-code-phone-number="fr,gp,mq,gf,re,yt,nc,pf,dz,be,lu,ma,ch,tn" placeholder="+33 6 38 65 65 65">
          <button type="submit">Enregistrer</button>
        </form>
        <form id="autre"><input name="q"></form>
    </body>`, { url: 'https://www.ordotype.fr/membership/compte', runScripts: 'outside-only', virtualConsole });
    const w = dom.window;
    w.console.log = () => {};

    // La feuille de style de la bibliothèque : chargée tout de suite.
    const ajouter = w.document.head.appendChild.bind(w.document.head);
    w.document.head.appendChild = (el) => {
        if (el.tagName === 'LINK') { setImmediate(() => el.onload && el.onload()); return el; }
        return ajouter(el);
    };

    const form = w.document.getElementById('profil');
    const lectures = [];
    // Memberstack, script v2 : posé au chargement, AVANT notre champ.
    const memberstack = (quand) => (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const lu = {};
        form.querySelectorAll('[data-ms-member]').forEach((el) => { lu[el.getAttribute('data-ms-member')] = el.value; });
        lectures.push({ quand, lu });
    };
    form.addEventListener('submit', memberstack('avant'));
    let auDocument = 0;
    w.document.addEventListener('submit', () => { auDocument += 1; });

    w.eval(LIB);
    if (aides) w.eval(UTILS);
    w.eval(fs.readFileSync(path.join(ROOT, source), 'utf8'));

    const input = form.querySelector('[data-ms-member="phone"]');
    return {
        w, form, input, lectures, erreurs,
        auDocument: () => auDocument,
        iti: () => w.intlTelInputGlobals.getInstance(input),
        // Le même Memberstack, mais posé APRÈS la construction du champ.
        memberstackApres() { form.addEventListener('submit', memberstack('apres')); },
        taper(texte) {
            input.value = texte;
            input.dispatchEvent(new w.KeyboardEvent('keyup', { bubbles: true }));
            return input.value;
        },
        envoyer(cible = form) {
            lectures.length = 0;
            cible.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
            return lectures;
        },
    };
}

const repos = () => new Promise((r) => setImmediate(r));

async function prete(source, opts) {
    const p = page(source, opts);
    for (let i = 0; i < 20 && !p.iti(); i++) await repos();
    if (!p.iti()) throw new Error('champ jamais construit');
    p.memberstackApres();
    return p;
}

async function verifierSource(source) {
    const echecs = [];
    const note = (quoi, msg) => echecs.push(`${source} : ${quoi} : ${msg}`);

    const p = await prete(source);
    for (const c of CAS) {
        p.iti().setCountry(c.pays);
        const affiche = p.taper(c.saisie);
        const lectures = p.envoyer();
        if (lectures.length !== 2) { note(c.quoi, `${lectures.length} lecture(s) Memberstack au lieu de 2`); continue; }
        const [avant, apres] = lectures.map((l) => l.lu.phone);
        if (avant !== apres) note(c.quoi, `lu « ${avant} » par l'écouteur posé avant, « ${apres} » par celui posé après`);
        const lu = avant;

        if (c.envoye === null) {
            if (lu !== affiche) note(c.quoi, `devait partir tel quel (« ${affiche} »), parti « ${lu} »`);
            continue;
        }
        // Pendant la saisie : forme lisible, espacée.
        if (!/\s/.test(affiche)) note(c.quoi, `affichage non espacé pendant la saisie : « ${affiche} »`);
        if (lu !== c.envoye) { note(c.quoi, `Memberstack lit « ${lu} », attendu « ${c.envoye} »`); continue; }
        // Seuls les séparateurs tombent.
        if (lu !== affiche.replace(SEPARATEURS, '')) note(c.quoi, `chiffres changés : « ${affiche} » → « ${lu} »`);

        const avantCorrection = ljs.parsePhoneNumberFromString(affiche);
        const envoye = ljs.parsePhoneNumberFromString(lu);
        if (c.accord) {
            // L'envoi vaut le `number` de libphonenumber-js/max sur la forme espacée, et se relit à l'identique.
            if (!avantCorrection || !avantCorrection.isValid() || avantCorrection.number !== lu) {
                note(c.quoi, `libphonenumber-js/max donne « ${avantCorrection && avantCorrection.number} », pas « ${lu} »`);
            }
            if (!envoye || !envoye.isValid() || envoye.number !== lu) note(c.quoi, `libphonenumber-js/max ne relit pas « ${lu} » à l'identique`);
        } else if (envoye && envoye.isValid()) {
            note(c.quoi, 'marqué en désaccord, mais libphonenumber-js/max le juge valide : à reclasser');
        }
        // Après l'envoi, la frappe suivante remet la forme espacée.
        if (!/\s/.test(p.taper(p.input.value))) note(c.quoi, 'la frappe après l envoi ne remet pas la forme espacée');
    }

    // Un autre formulaire de la page : le champ n'est pas touché.
    p.iti().setCountry('fr');
    const affiche = p.taper('06 12 34 56 78');
    p.envoyer(p.w.document.getElementById('autre'));
    if (p.input.value !== affiche) note('autre formulaire', `champ converti : « ${p.input.value} »`);

    // Memberstack arrête la propagation : rien n'arrive en bulle au document.
    if (p.auDocument() !== 1) note('propagation', `${p.auDocument()} envoi(s) vu(s) en bulle au document, attendu 1 (celui de l'autre formulaire)`);
    if (p.erreurs.length) note('erreurs', p.erreurs.join(' | '));
    p.w.close();

    // Sans les aides : le numéro part tel quel, rien ne lève.
    const sans = await prete(source, { aides: false });
    const tape = sans.taper('06 12 34 56 78');
    const lu = sans.envoyer()[0];
    if (!lu || lu.lu.phone !== tape) note('sans les aides', `parti « ${lu && lu.lu.phone} », attendu « ${tape} »`);
    if (sans.erreurs.length) note('sans les aides', sans.erreurs.join(' | '));
    sans.w.close();

    return echecs;
}

(async () => {
    const echecs = [];

    const itiVersion = require('intl-tel-input/package.json').version;
    const ljsVersion = require('libphonenumber-js/package.json').version;
    if (itiVersion !== ITI_VERSION) echecs.push(`intl-tel-input ${itiVersion} installé, la page sert ${ITI_VERSION}`);
    if (ljsVersion !== LJS_VERSION) echecs.push(`libphonenumber-js ${ljsVersion} installé, ce test attend ${LJS_VERSION}`);
    for (const source of SOURCES) {
        if (!fs.readFileSync(path.join(ROOT, source), 'utf8').includes(`/intl-tel-input/${ITI_VERSION}/js/utils.js`)) {
            echecs.push(`${source} ne sert plus intl-tel-input ${ITI_VERSION} : mettre ce test à la même version`);
        }
        try {
            echecs.push(...await verifierSource(source));
        } catch (e) {
            echecs.push(`${source} : exception ${e.message}`);
        }
    }

    if (echecs.length) {
        echecs.forEach((m) => console.error('ECHEC  ' + m));
        console.error(`\n${echecs.length} échec(s)`);
        process.exit(1);
    }
    console.log(`ok     ${CAS.length} numéros × ${SOURCES.length} copies : E.164 identique à libphonenumber-js/max ${LJS_VERSION} à l'envoi, invalides intacts, affichage espacé`);
})();
