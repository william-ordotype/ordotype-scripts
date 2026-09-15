#!/usr/bin/env node
/**
 * Vérifie le message de validité du champ téléphone.
 *
 * Le message est INFORMATIF : il ne doit jamais empêcher l'envoi du formulaire.
 * Ce qui doit tenir :
 *   - l'envoi part TOUJOURS, message affiché ou non, aides présentes ou non ;
 *   - numéro valide ou champ vide : aucun message ;
 *   - numéro qui ne semble pas valide : un message sous le champ, à la sortie
 *     du champ et à l'envoi, retiré dès que la saisie redevient valide ou vide ;
 *   - un rendu pendant qu'un bouton est enfoncé attend le relâchement : le
 *     message pourrait déplacer le bouton et faire perdre le clic ;
 *   - ouvrir la liste des pays ou quitter la fenêtre n'est pas quitter le champ ;
 *   - chiffres d'un mobile d'outre-mer avec la France ou un autre territoire :
 *     proposition du bon territoire, jamais de +33 ;
 *   - territoire d'outre-mer choisi et chiffres d'un mobile de métropole :
 *     proposition de passer en +33. Le clic écrit le numéro au format E.164 ;
 *   - sans les aides de formatage, seul le nombre de chiffres est contrôlé,
 *     et seulement là où il est fixe. Dans le doute, rien n'est affiché ;
 *   - la zone n'est décrite par le champ que visible, une région annoncée
 *     reste toujours rendue, le focus n'est jamais déplacé ;
 *   - une panne du message est signalée une fois et n'emporte pas le champ ;
 *   - les deux copies servies gardent la même logique.
 *
 * La bibliothèque et ses aides sont les VRAIS fichiers de la version servie
 * (intl-tel-input 17.0.8). La table des mobiles d'outre-mer et la longueur du
 * repli sont vérifiées contre des métadonnées récentes (libphonenumber-js).
 * Tous deux sont installés à la volée, comme jsdom.
 *
 * Les cas sont rejoués sur les DEUX copies servies en production.
 *
 * Usage : node test/phone-input-validity.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const recent = require('libphonenumber-js/max');
const { Metadata } = require('libphonenumber-js/core');
const METADONNEES = require('libphonenumber-js/metadata.max.json');

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
    'mes-informations/phone-input.js',
    'account/phone-input.js',
];

const LIB = fs.readFileSync(require.resolve('intl-tel-input/build/js/intlTelInput.js'), 'utf8');
const AIDES = fs.readFileSync(require.resolve('intl-tel-input/build/js/utils.js'), 'utf8');

const MESSAGE = "Ce numéro ne semble pas valide. Vérifiez l'indicatif du pays et le nombre de chiffres.";
const question = (nom, indicatif) => 'Vouliez-vous saisir un numéro de ' + nom + ' (+' + indicatif + ')\u00a0?';
const action = (indicatif) => 'Oui, passer en +' + indicatif;
const METROPOLE = question('France métropolitaine', '33');

// La liste de pays proposée sur les pages qui portent ce champ.
const PAYS = 'fr,gp,mq,gf,re,yt,nc,pf,dz,be,lu,ma,ch,tn';

function balisage(opts) {
    const decrit = opts.describedBy ? ` aria-describedby="${opts.describedBy}"` : '';
    return `<!doctype html><body>
<form id="profil" data-ms-form="profile">
  <div class="input_block">
    <div class="input_label">Téléphone*</div>
    <input ms-code-phone-number="${PAYS}" name="phone" placeholder="06 00 00 00 00" type="tel" id="signup-phone" data-ms-member="phone" required${decrit}>
  </div>
  <input type="text" id="autre" name="autre">
  <button type="button" id="aide">Aide</button>
  <input type="submit" id="valider" value="Valider">
</form>
<p id="aide-existante">Numéro utilisé pour vous joindre.</p>
</body>`;
}

const repos = (ms) => new Promise((r) => setTimeout(r, ms || 0));

/**
 * @param {string} source
 * @param {object} opts
 *   aides        : 'presentes' (défaut) | 'absentes' | 'tardives'
 *   describedBy  : aria-describedby déjà posé sur le champ
 *   casserBouton : createElement('button') lève. La bibliothèque ne crée
 *                  aucun bouton : seul le message tombe, pas le champ.
 *   envoiAvant   : un gestionnaire d'envoi posé sur le formulaire AVANT le
 *                  script, qui lit la valeur puis arrête l'événement. C'est
 *                  l'ordre réel sur les pages qui portent ce champ.
 */
async function page(source, opts) {
    opts = opts || {};
    const vc = new VirtualConsole();
    const trace = { signalements: [], avertissements: [], scripts: [], envois: [], lectures: [] };
    vc.on('warn', (...a) => trace.avertissements.push(a.join(' ')));

    const dom = new JSDOM(balisage(opts), {
        url: 'https://www.ordotype.fr/membership/mes-informations',
        runScripts: 'outside-only',
        virtualConsole: vc,
    });
    const w = dom.window;
    const doc = w.document;
    if (doc.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r));

    // jsdom ne modélise pas le focus de la fenêtre : pendant un blur, son
    // hasFocus() rend false. Un navigateur rend true tant que la fenêtre a
    // le focus, ce que ce drapeau rejoue.
    let fenetreActive = true;
    doc.hasFocus = () => fenetreActive;

    w.OrdoErrorReporter = {
        reportNetwork(contexte, err) { trace.signalements.push(contexte + ': ' + err.message); return true; },
        reportSideEffect(contexte, err) { trace.signalements.push(contexte + ': ' + (err && err.message)); },
    };

    w.eval(LIB);
    const aides = opts.aides || 'presentes';
    if (aides === 'presentes') w.eval(AIDES);

    // Aucun réseau : la balise des aides est notée, puis chargée ou en échec.
    const body = doc.body;
    const ajouter = body.appendChild.bind(body);
    body.appendChild = (el) => {
        if (el.tagName !== 'SCRIPT') return ajouter(el);
        trace.scripts.push(el.src);
        setTimeout(() => {
            if (aides === 'tardives') {
                w.eval(AIDES);
                el.onload();
            } else {
                el.onerror();
            }
        }, 0);
        return el;
    };

    if (opts.envoiAvant) {
        doc.getElementById('profil').addEventListener('submit', (ev) => {
            trace.lectures.push(doc.getElementById('signup-phone').value);
            ev.preventDefault();
            ev.stopPropagation();
        });
    }

    if (opts.casserBouton) {
        const creer = doc.createElement.bind(doc);
        doc.createElement = (tag) => {
            if (String(tag).toLowerCase() === 'button') throw new Error('createElement indisponible');
            return creer(tag);
        };
    }

    w.eval(fs.readFileSync(path.join(ROOT, source), 'utf8'));
    await repos();

    // Témoin posé APRÈS le script, sur le document : il voit l'événement tel
    // que les écouteurs du formulaire l'ont laissé, comme un gestionnaire
    // délégué. Il arrête ensuite la navigation, que jsdom n'implémente pas.
    doc.addEventListener('submit', (ev) => {
        trace.envois.push({ empeche: ev.defaultPrevented, valeur: doc.getElementById('signup-phone').value });
        ev.preventDefault();
    });

    const input = doc.getElementById('signup-phone');
    return {
        w, doc, input, trace,
        iti: w.intlTelInputGlobals.getInstance(input),
        autre: doc.getElementById('autre'),
        aide: doc.getElementById('aide'),
        valider: doc.getElementById('valider'),
        fenetre(active) { fenetreActive = active; },
    };
}

function taper(e, texte) {
    e.input.focus();
    e.input.value = texte;
    e.input.dispatchEvent(new e.w.Event('input', { bubbles: true }));
    e.input.dispatchEvent(new e.w.KeyboardEvent('keyup', { bubbles: true }));
}

function sortir(e) {
    e.autre.focus();
}

/** La zone visible : juste après l'enveloppe que la bibliothèque pose. */
function zone(e) {
    const enveloppe = e.input.parentNode;
    return enveloppe && enveloppe.classList.contains('iti') ? enveloppe.nextElementSibling : null;
}

/** La région annoncée aux lecteurs d'écran. */
function annonce(e) {
    const enveloppe = e.input.parentNode;
    return enveloppe && enveloppe.parentNode ? enveloppe.parentNode.querySelector('[aria-live]') : null;
}

function visible(el, jusqua) {
    for (let n = el; n && n !== jusqua.parentNode; n = n.parentNode) {
        if (n.style && n.style.display === 'none') return false;
    }
    return true;
}

function texteVisible(el) {
    if (!el || !visible(el, el)) return '';
    let texte = '';
    el.childNodes.forEach((n) => {
        if (n.nodeType === 3) texte += n.nodeValue;
        else if (n.nodeType === 1 && !(n.style && n.style.display === 'none')) texte += ' ' + texteVisible(n);
    });
    // Espaces ordinaires seulement : l'espace insécable avant « ? » compte.
    return texte.replace(/[ \t\n\r]+/g, ' ').trim();
}

function lire(e) {
    const z = zone(e);
    const bouton = z && z.querySelector('button');
    const a = annonce(e);
    return {
        zone: z,
        texte: z ? texteVisible(z) : '',
        bouton: bouton && visible(bouton, z) ? bouton : null,
        annonce: a ? a.textContent : null,
    };
}

function decritPar(e) {
    return (e.input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
}

function envoyer(e) {
    const avant = e.trace.envois.length;
    e.valider.click();
    return e.trace.envois.length > avant ? e.trace.envois[e.trace.envois.length - 1] : null;
}

function souris(e, type, cible) {
    cible.dispatchEvent(new e.w.MouseEvent(type, { bubbles: true, cancelable: true }));
}

function lireSource(src) {
    return fs.readFileSync(path.join(ROOT, src), 'utf8');
}

/** La table des mobiles d'outre-mer et les propositions, lues dans le fichier servi. */
function tables(code) {
    const bloc = (code.match(/OVERSEAS_MOBILE_PREFIXES = \{([^}]*)\}/) || [])[1] || '';
    const prefixes = Array.from(bloc.matchAll(/'(\d{3})': '([a-z]{2})'/g)).map((m) => [m[1], m[2]]);
    const propositions = {};
    for (const m of code.matchAll(/(\w{2}): \{ name: '([^']+)', dialCode: '(\d+)' \}/g)) {
        propositions[m[1]] = { nom: m[2], indicatif: m[3] };
    }
    return { prefixes, propositions };
}

/** Rend '' si chaque entrée a un plan national propre de 9 chiffres après un 0. */
function controlerLongueurs(json, isos) {
    const m = new Metadata(json);
    for (const iso of isos) {
        m.selectNumberingPlan(iso.toUpperCase());
        const longueurs = m.numberingPlan.possibleLengths();
        if (longueurs.length !== 1 || longueurs[0] !== 9) return iso + ' : longueurs ' + longueurs.join('/');
        if (m.numberingPlan.nationalPrefix() !== '0') return iso + ' : préfixe national ' + m.numberingPlan.nationalPrefix();
    }
    return '';
}

/** Blocs de logique du message, normalisés pour comparer les deux styles. */
function blocsLogique(code) {
    const debut = code.search(/\n {2}(var|const) HINT_INVALID/);
    const fin = code.indexOf('\n  /**\n   * Load the formatting helpers');
    const pose = code.indexOf('      // The message is an extra');
    const finPose = code.indexOf("    console.log('[PhoneInput] Initialized'");
    if (debut === -1 || fin === -1 || pose === -1 || finPose === -1) return null;
    const normaliser = (t) => t
        .replace(/\b(const|let)\b/g, 'var')
        .replace(/\((\w*)\) => \{/g, 'function($1) {')
        .replace(/\b(\w+) => \{/g, 'function($1) {');
    return (normaliser(code.slice(debut, fin)) + '\n' + normaliser(code.slice(pose, finPose))).split('\n');
}

const CAS = [
    // ---------------------------------------------------------------- base
    ['numéro valide : aucun message, ni à la sortie ni à l envoi', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00 00');
        sortir(e);
        if (lire(e).texte) return 'message affiché pour un numéro valide : « ' + lire(e).texte + ' »';
        const envoi = envoyer(e);
        if (!envoi) return 'formulaire non envoyé';
        if (lire(e).texte) return 'message affiché à l envoi d un numéro valide';
        if (envoi.valeur !== '+33 6 00 00 00 00') return 'valeur envoyée inattendue : ' + envoi.valeur;
        return '';
    }],

    ['saisie tronquée : message à la sortie, et l envoi part quand même', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        if (lire(e).texte) return 'message affiché pendant la frappe, avant la sortie du champ';
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'message attendu à la sortie, vu : « ' + lire(e).texte + ' »';
        if (lire(e).bouton) return 'proposition affichée pour une simple saisie tronquée';
        const envoi = envoyer(e);
        if (!envoi) return 'l envoi n est pas parti : le message bloque le formulaire';
        if (envoi.empeche) return 'l événement submit a été empêché';
        if (envoi.valeur !== '06 00 00 00') return 'la saisie a été modifiée à l envoi : ' + envoi.valeur;
        if (!e.doc.getElementById('profil').checkValidity()) return 'le formulaire est rendu invalide';
        return '';
    }],

    ['contrôle à l envoi : même message, sans rien changer à l envoi', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        const envoi = envoyer(e);
        if (!envoi || envoi.empeche) return 'l envoi a été bloqué';
        if (envoi.valeur !== '06 00 00 00') return 'valeur modifiée : ' + envoi.valeur;
        if (lire(e).texte !== MESSAGE) return 'aucun message à l envoi d un numéro tronqué';
        return '';
    }],

    ['envoi pris en charge par un gestionnaire posé avant : il lit la saisie, le message suit', async (src) => {
        const e = await page(src, { envoiAvant: true });
        taper(e, '06 00 00 00');
        e.valider.click();
        if (e.trace.lectures.length !== 1) return 'le gestionnaire d envoi n a pas été appelé';
        if (e.trace.lectures[0] !== '06 00 00 00') return 'valeur lue modifiée : ' + e.trace.lectures[0];
        if (lire(e).texte !== MESSAGE) return 'message absent quand l événement est arrêté plus tôt';
        return '';
    }],

    // ------------------------------------------------ proposition du +33
    ['mobile de métropole avec La Réunion : proposition +33, le clic écrit l E.164', async (src) => {
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        sortir(e);
        const vu = lire(e);
        if (vu.texte.indexOf(MESSAGE) !== 0) return 'message absent : « ' + vu.texte + ' »';
        if (vu.texte.indexOf(METROPOLE) === -1) return 'proposition +33 absente : « ' + vu.texte + ' »';
        if (!vu.bouton || vu.bouton.textContent !== action('33')) return 'action pour passer en +33 absente';
        if (vu.bouton.type !== 'button') return 'l action est un bouton d envoi : un clic enverrait le formulaire';

        const envois = e.trace.envois.length;
        vu.bouton.click();
        if (e.trace.envois.length !== envois) return 'le clic sur la proposition a envoyé le formulaire';
        if (e.iti.getSelectedCountryData().iso2 !== 'fr') return 'le pays n est pas passé sur la France';
        if (e.input.value !== '+33600000000') return 'valeur attendue au format E.164, vue : ' + e.input.value;
        if (lire(e).texte) return 'message laissé après correction';
        if (e.doc.activeElement === e.input) return 'le focus a été déplacé vers le champ';
        return '';
    }],

    ['valider juste après la proposition : la valeur lue à l envoi est l E.164', async (src) => {
        const e = await page(src, { envoiAvant: true });
        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        sortir(e);
        if (!lire(e).bouton) return 'le cas ne prouve rien sans proposition';
        lire(e).bouton.click();
        e.valider.click();
        if (e.trace.lectures[0] !== '+33600000000') return 'valeur lue à l envoi : ' + e.trace.lectures[0];
        return '';
    }],

    ['indicatif +262 saisi en toutes lettres : même proposition', async (src) => {
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '+262 6 00 00 00 00');
        sortir(e);
        const vu = lire(e);
        if (!vu.bouton || vu.texte.indexOf(METROPOLE) === -1) return 'proposition absente : « ' + vu.texte + ' »';
        vu.bouton.click();
        if (e.input.value !== '+33600000000') return 'chiffres non conservés : ' + e.input.value;
        return '';
    }],

    ['valeur préremplie sans événement, jamais reformatée : la proposition garde les chiffres', async (src) => {
        // Un champ rempli par la page au chargement n'émet rien, et le traverser
        // sans le modifier non plus : la valeur n'est jamais passée par le
        // formatage quand la proposition est suivie.
        const e = await page(src);
        e.iti.setCountry('re');
        e.input.value = '00262 6 00 00 00 00';
        e.input.focus();
        sortir(e);
        if (e.input.value !== '00262 6 00 00 00 00') return 'le cas ne prouve rien si la valeur a été reformatée';
        const vu = lire(e);
        if (!vu.bouton) return 'proposition absente : « ' + vu.texte + ' »';
        vu.bouton.click();
        if (e.input.value !== '+33600000000') return 'chiffres non conservés : ' + e.input.value;
        if (!e.iti.isValidNumber()) return 'numéro toujours invalide après correction';
        return '';
    }],

    ['autres territoires : proposition +33 aussi en Guadeloupe et en Nouvelle-Calédonie', async (src) => {
        for (const pays of ['gp', 'nc']) {
            const e = await page(src);
            e.iti.setCountry(pays);
            taper(e, '06 00 00 00 00');
            sortir(e);
            if (lire(e).texte.indexOf(METROPOLE) === -1) return 'pas de proposition +33 pour ' + pays + ' : « ' + lire(e).texte + ' »';
        }
        return '';
    }],

    ['chiffres d un mobile de métropole hors outre-mer (Belgique) : message sans proposition', async (src) => {
        const e = await page(src);
        e.iti.setCountry('be');
        taper(e, '06 00 00 00 00');
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'message attendu seul, vu : « ' + lire(e).texte + ' »';
        return '';
    }],

    ['outre-mer, chiffres qui ne font pas un mobile de métropole : pas de proposition', async (src) => {
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '06 00 00 00');
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'message attendu seul, vu : « ' + lire(e).texte + ' »';
        return '';
    }],

    ['outre-mer, chiffres d un fixe de métropole : message sans proposition', async (src) => {
        // La proposition vise le mobile de métropole tapé avec le mauvais pays.
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '01 00 00 00 00');
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'message attendu seul, vu : « ' + lire(e).texte + ' »';
        return '';
    }],

    // ------------------------------------------- mobiles d'outre-mer (table)
    ['France choisie, mobile d outre-mer : le bon territoire est proposé, avec ou sans les aides', async (src) => {
        const attendus = [
            ['06 90 00 00 00', 'gp', 'Guadeloupe', '590', '+590690000000'],
            ['06 92 00 00 00', 're', 'La Réunion', '262', '+262692000000'],
            ['06 39 00 00 00', 'yt', 'Mayotte', '262', '+262639000000'],
            ['06 94 00 00 00', 'gf', 'Guyane', '594', '+594694000000'],
            ['06 96 00 00 00', 'mq', 'Martinique', '596', '+596696000000'],
        ];
        for (const aides of ['presentes', 'absentes']) {
            for (const [saisie, iso, nom, indicatif, e164] of attendus) {
                const e = await page(src, { aides });
                taper(e, saisie);
                sortir(e);
                const vu = lire(e);
                const attendu = MESSAGE + ' ' + question(nom, indicatif) + ' ' + action(indicatif);
                if (vu.texte !== attendu) return saisie + ' (aides ' + aides + ') : vu « ' + vu.texte + ' »';
                vu.bouton.click();
                if (e.iti.getSelectedCountryData().iso2 !== iso) return saisie + ' : pays non basculé sur ' + iso;
                if (e.input.value !== e164) return saisie + ' : valeur ' + e.input.value + ' au lieu de ' + e164;
                if (lire(e).texte) return saisie + ' : message laissé après correction';
            }
        }
        return '';
    }],

    ['territoire choisi, mobile d un AUTRE territoire : ce territoire est proposé, jamais +33', async (src) => {
        const essais = [
            ['gp', '06 92 00 00 00', 'La Réunion', '262'],
            ['re', '06 90 00 00 00', 'Guadeloupe', '590'],
            ['nc', '06 96 00 00 00', 'Martinique', '596'],
        ];
        for (const [pays, saisie, nom, indicatif] of essais) {
            const e = await page(src);
            e.iti.setCountry(pays);
            taper(e, saisie);
            sortir(e);
            const vu = lire(e).texte;
            if (vu.indexOf(question(nom, indicatif)) === -1) return pays + ' ' + saisie + ' : vu « ' + vu + ' »';
            if (vu.indexOf('+33') !== -1) return pays + ' ' + saisie + ' : +33 proposé';
        }
        return '';
    }],

    ['même indicatif que le territoire du mobile : rien à proposer', async (src) => {
        // Saint-Barthélemy partage le +590 de la Guadeloupe, Mayotte le +262 de
        // La Réunion : le numéro enregistré est le même.
        for (const [pays, saisie] of [['re', '06 39 00 00 00'], ['yt', '06 92 00 00 00']]) {
            const e = await page(src);
            e.iti.setCountry(pays);
            taper(e, saisie);
            sortir(e);
            if (lire(e).texte) return pays + ' ' + saisie + ' : vu « ' + lire(e).texte + ' »';
        }
        const e = await page(src);
        e.iti.setCountry('bl');
        taper(e, '06 90 00 00 00');
        sortir(e);
        if (lire(e).bouton) return 'bl 06 90 : proposition faite pour un même indicatif';
        return '';
    }],

    ['préfixe d outre-mer, même indicatif, numéro invalide : message seul, jamais +33', async (src) => {
        // Les aides servies acceptent +33 691, alors que ce préfixe est la
        // Guadeloupe : sans la table, ces chiffres recevraient une proposition +33.
        const e = await page(src);
        e.iti.setCountry('gp');
        taper(e, '06 91 00 00 00');
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'message attendu seul, vu : « ' + lire(e).texte + ' »';
        return '';
    }],

    ['témoins : les mobiles de métropole en 06 95, 06 98, 06 99 restent sans message', async (src) => {
        for (const saisie of ['06 95 00 00 00', '06 98 00 00 00', '06 99 00 00 00']) {
            const e = await page(src);
            taper(e, saisie);
            sortir(e);
            if (lire(e).texte) return saisie + ' : vu « ' + lire(e).texte + ' »';
        }
        return '';
    }],

    ['table prouvée contre des métadonnées récentes', async (src) => {
        const { prefixes, propositions } = tables(lireSource(src));
        if (prefixes.length < 8) return 'table des préfixes introuvable ou incomplète dans le fichier';
        for (const [prefixe, iso] of prefixes) {
            const ISO = iso.toUpperCase();
            const cible = propositions[iso];
            if (!cible) return prefixe + ' : ' + iso + ' sans libellé de proposition';
            if (cible.indicatif !== recent.getCountryCallingCode(ISO)) return iso + ' : indicatif ' + cible.indicatif + ' faux';
            if (recent.parsePhoneNumber('+33' + prefixe + '000000').isValid()) return '+33 ' + prefixe + ' 000000 est valide';
            let mobiles = 0;
            for (let ab = 0; ab < 100; ab++) {
                const national = prefixe + String(ab).padStart(2, '0') + '0000';
                if (recent.parsePhoneNumber('+33' + national).isValid()) return '+33 ' + national + ' est valide';
                const n = recent.parsePhoneNumber('+' + cible.indicatif + national);
                if (n.isValid() && n.getType() === 'MOBILE' && n.country === ISO) mobiles += 1;
            }
            if (!mobiles) return prefixe + ' : aucun mobile valide de ' + ISO + ' dans ce préfixe';
        }
        for (const prefixe of ['695', '698', '699']) {
            const n = recent.parsePhoneNumber('+33' + prefixe + '000000');
            if (!n.isValid() || n.getType() !== 'MOBILE') return '+33 ' + prefixe + ' devrait rester un mobile valide';
        }
        return '';
    }],

    // ------------------------------------------------------------- retrait
    ['changer de pays retire le message quand le numéro devient valide', async (src) => {
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        sortir(e);
        if (!lire(e).texte) return 'le cas ne prouve rien sans message de départ';
        e.iti.setCountry('fr');
        if (lire(e).texte) return 'message laissé après le choix du bon pays';
        return '';
    }],

    ['champ vide : aucun message, ni à la sortie ni à l envoi', async (src) => {
        const e = await page(src);
        e.input.focus();
        sortir(e);
        if (lire(e).texte) return 'message affiché pour un champ vide';
        e.input.removeAttribute('required');
        const envoi = envoyer(e);
        if (!envoi || envoi.empeche) return 'envoi bloqué';
        if (lire(e).texte) return 'message affiché à l envoi d un champ vide';
        return '';
    }],

    ['message retiré dès que la saisie redevient valide, sans attendre la sortie', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'le cas ne prouve rien sans message de départ';
        taper(e, '06 00 00 00 0');
        if (lire(e).texte !== MESSAGE) return 'message retiré alors que la saisie reste invalide';
        taper(e, '06 00 00 00 00');
        if (lire(e).texte) return 'message laissé alors que la saisie est valide';
        return '';
    }],

    ['message retiré quand le champ est vidé', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        sortir(e);
        if (!lire(e).texte) return 'le cas ne prouve rien sans message de départ';
        taper(e, '');
        if (lire(e).texte) return 'message laissé sur un champ vide';
        return '';
    }],

    // ------------------------------------------------------ sans les aides
    ['aides absentes : repli sur le nombre de chiffres, sans blocage', async (src) => {
        const e = await page(src, { aides: 'absentes' });
        if (e.w.intlTelInputUtils) return 'le cas ne prouve rien si les aides sont là';
        taper(e, '06 00 00 00');
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'repli muet sur un numéro tronqué : « ' + lire(e).texte + ' »';
        const envoi = envoyer(e);
        if (!envoi || envoi.empeche) return 'l envoi a été bloqué sans les aides';
        if (envoi.valeur !== '06 00 00 00') return 'saisie modifiée sans les aides : ' + envoi.valeur;
        taper(e, '06 00 00 00 00');
        if (lire(e).texte) return 'message laissé sur 9 chiffres nationaux';
        taper(e, '+33 6 00 00 00 00');
        sortir(e);
        if (lire(e).texte) return 'message sur un +33 à 9 chiffres';
        return '';
    }],

    ['aides absentes : dans le doute, rien n est affiché', async (src) => {
        const e = await page(src, { aides: 'absentes' });
        const essais = [
            ['re', '06 00 00 00 00'],      // longueur juste, validité inconnue
            ['be', '06 00 00'],            // pays sans longueur fixe connue ici
            ['fr', '+32 6 00 00 00'],      // indicatif d un autre pays
        ];
        for (const [pays, texte] of essais) {
            e.iti.setCountry(pays);
            taper(e, texte);
            sortir(e);
            if (lire(e).texte) return 'faux avertissement sans les aides pour ' + pays + ' « ' + texte + ' »';
        }
        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        sortir(e);
        if (lire(e).bouton) return 'proposition +33 faite sans pouvoir la vérifier';

        // Saisie remplie d'un bloc (remplissage automatique) : pas de frappe,
        // donc le drapeau n'a pas encore suivi l'indicatif.
        e.iti.setCountry('fr');
        taper(e, '');
        e.input.value = '+32 6 00 00 00 0';
        e.input.dispatchEvent(new e.w.Event('input', { bubbles: true }));
        e.input.dispatchEvent(new e.w.Event('change', { bubbles: true }));
        if (e.iti.getSelectedCountryData().iso2 !== 'fr') return 'le cas ne prouve rien si le drapeau a suivi';
        sortir(e);
        if (lire(e).texte) return 'chiffres d un autre indicatif comptés comme français';
        return '';
    }],

    ['repli : 9 chiffres lus dans le plan de CHAQUE entrée, et le contrôle voit un écart', async (src) => {
        // Saint-Barthélemy et Saint-Martin partagent le +590 : un contrôle par
        // indicatif lirait la Guadeloupe. Ici chaque plan est sélectionné par
        // son propre code, et une copie altérée des métadonnées prouve qu'une
        // autre longueur pour bl serait vue.
        const liste = (lireSource(src).match(/NINE_DIGIT_NATIONAL = \[([^\]]*)\]/) || [])[1];
        if (!liste) return 'liste du repli introuvable dans le fichier';
        const isos = liste.match(/[a-z]{2}/g);
        if (isos.indexOf('bl') === -1 || isos.indexOf('mf') === -1) return 'le cas vise bl et mf, absents de la liste';
        const verdict = controlerLongueurs(METADONNEES, isos);
        if (verdict) return verdict;

        const altere = JSON.parse(JSON.stringify(METADONNEES));
        altere.countries.BL[3] = [8];
        if (!controlerLongueurs(altere, ['bl'])) return 'une longueur de 8 pour bl passerait inaperçue';
        if (controlerLongueurs(altere, ['gp'])) return 'l altération de bl a touché la Guadeloupe : plans non distingués';
        return '';
    }],

    ['indicatif seul : laissé en place par la bibliothèque, donc signalé', async (src) => {
        // En mode national, intl-tel-input n'efface pas un indicatif seul à la
        // sortie du champ : « +33 » partirait tel quel.
        for (const aides of ['presentes', 'absentes']) {
            const e = await page(src, { aides });
            taper(e, '+33');
            sortir(e);
            if (e.input.value !== '+33') return 'le cas ne prouve rien si la bibliothèque efface la saisie';
            if (lire(e).texte !== MESSAGE) return 'indicatif seul non signalé, aides ' + aides;
        }
        return '';
    }],

    ['aides arrivées après coup : la validation complète reprend la main', async (src) => {
        const e = await page(src, { aides: 'tardives' });
        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        await repos(5);
        if (!e.w.intlTelInputUtils) return 'le cas ne prouve rien si les aides ne sont pas arrivées';
        sortir(e);
        if (!lire(e).bouton) return 'la validation ne relit pas les aides au moment de l appel';
        return '';
    }],

    // ------------------------------------------------ pointeur enfoncé
    ['clic sur Valider : rien n est rendu entre l appui et le clic, qui part', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        const auClic = [];
        e.doc.addEventListener('click', () => auClic.push(lire(e).texte), true);

        souris(e, 'mousedown', e.valider);
        e.valider.focus(); // le navigateur déplace le focus à l'appui
        if (lire(e).texte) return 'message rendu pendant l appui : il peut déplacer le bouton';
        souris(e, 'mouseup', e.valider);
        if (lire(e).texte) return 'message rendu avant le clic';
        const envoi = envoyer(e);
        if (!envoi || envoi.empeche) return 'le clic n a pas envoyé le formulaire';
        if (auClic[0] !== '') return 'message déjà rendu au moment du clic';
        await repos(5);
        if (lire(e).texte !== MESSAGE) return 'message jamais affiché après le relâchement';
        return '';
    }],

    ['appui par pointeur sur un autre bouton : le message suit le relâchement', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        e.aide.dispatchEvent(new e.w.PointerEvent('pointerdown', { bubbles: true }));
        e.aide.focus();
        if (lire(e).texte) return 'message rendu pendant l appui';
        e.aide.dispatchEvent(new e.w.PointerEvent('pointerup', { bubbles: true }));
        if (lire(e).texte) return 'message rendu dans le relâchement même, avant le clic';
        e.aide.click();
        await repos(5);
        if (lire(e).texte !== MESSAGE) return 'message jamais affiché après le relâchement';
        return '';
    }],

    ['appui jamais relâché : le message arrive au délai maximal, pas avant', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        souris(e, 'mousedown', e.aide);
        e.aide.focus();
        await repos(850);
        if (lire(e).texte) return 'message rendu avant le délai maximal, pointeur toujours enfoncé';
        await repos(300);
        if (lire(e).texte !== MESSAGE) return 'message jamais rendu sans relâchement';
        souris(e, 'mouseup', e.aide);
        return '';
    }],

    ['relâché après retour dans le champ : pas de message pendant la saisie', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        souris(e, 'mousedown', e.aide);
        e.aide.focus();
        e.input.focus();
        souris(e, 'mouseup', e.input);
        await repos(5);
        if (lire(e).texte) return 'message rendu alors que le visiteur est revenu dans le champ';
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'la sortie suivante ne contrôle plus';
        return '';
    }],

    // ------------------------------------------------- sorties parasites
    ['ouvrir la liste des pays n est pas quitter le champ', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        const drapeau = e.doc.querySelector('.iti__selected-flag');
        if (!drapeau) return 'drapeau introuvable';
        drapeau.focus();
        if (e.doc.activeElement !== drapeau) return 'le cas ne prouve rien si le drapeau ne prend pas le focus';
        await repos(5);
        if (lire(e).texte) return 'message affiché en allant vers le sélecteur de pays';
        return '';
    }],

    ['quitter la fenêtre n est pas quitter le champ', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        // Le champ garde le focus du document quand la fenêtre le perd.
        e.input.dispatchEvent(new e.w.FocusEvent('blur'));
        if (e.doc.activeElement !== e.input) return 'le cas ne prouve rien si le champ a perdu le focus';
        if (lire(e).texte) return 'message affiché alors que le champ garde le focus';
        e.fenetre(false);
        sortir(e);
        await repos(5);
        if (lire(e).texte) return 'message affiché alors que la fenêtre n a plus le focus';
        e.fenetre(true);
        e.input.focus();
        sortir(e);
        if (lire(e).texte !== MESSAGE) return 'une vraie sortie ne contrôle plus';
        return '';
    }],

    // ------------------------------------------------------- accessibilité
    ['accessibilité au montage : région annoncée rendue et vide, zone non décrite', async (src) => {
        const e = await page(src, { describedBy: 'aide-existante' });
        const z = zone(e);
        const a = annonce(e);
        if (!z || !a) return 'zone ou région annoncée absente';
        if (a === z || z.contains(a)) return 'la région annoncée ne doit pas être la zone masquée quand vide';
        if (a.getAttribute('aria-live') !== 'polite') return 'aria-live attendu à polite';
        if (z.hasAttribute('aria-live')) return 'zone visible aussi annoncée : double lecture';
        if (a.style.display === 'none' || a.hidden) return 'région annoncée non rendue : ses changements ne seraient pas lus';
        if (a.style.position !== 'absolute' || !/rect\(0/.test(a.style.clip)) return 'région annoncée non masquée visuellement';
        if (a.textContent) return 'région annoncée non vide au montage';
        if (z.style.display !== 'none') return 'zone visible rendue au montage : écart dans un conteneur flex';
        if (decritPar(e).join(' ') !== 'aide-existante') return 'aria-describedby modifié au montage : ' + decritPar(e).join(' ');
        if (z.querySelector('button').textContent) return 'bouton étiqueté sans proposition';
        const enveloppe = e.input.parentNode;
        if (enveloppe.contains(z)) return 'zone dans l enveloppe : le conteneur du drapeau s étirerait dessus';
        return '';
    }],

    ['accessibilité à l affichage : description et annonce suivent la zone', async (src) => {
        const e = await page(src, { describedBy: 'aide-existante' });
        const z = zone(e);
        taper(e, '06 00 00 00');
        sortir(e);
        if (decritPar(e).join(' ') !== 'aide-existante ' + z.id) return 'zone visible non décrite : ' + decritPar(e).join(' ');
        if (lire(e).annonce !== MESSAGE) return 'annonce attendue : ' + lire(e).annonce;
        if (z.querySelector('button').textContent) return 'bouton étiqueté sans proposition';

        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        sortir(e);
        if (lire(e).annonce !== MESSAGE + ' ' + METROPOLE) return 'annonce de la proposition : ' + lire(e).annonce;
        if (z.querySelector('button').textContent !== action('33')) return 'bouton sans étiquette avec proposition';

        e.iti.setCountry('fr');
        if (decritPar(e).join(' ') !== 'aide-existante') return 'zone masquée encore décrite : ' + decritPar(e).join(' ');
        if (lire(e).annonce !== '') return 'annonce laissée après retrait';
        if (z.querySelector('button').textContent) return 'étiquette laissée après retrait';
        if (e.doc.activeElement === e.input) return 'le focus a été déplacé vers le champ';
        return '';
    }],

    ['sans aria-describedby existant : l attribut disparaît avec la zone', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        sortir(e);
        if (decritPar(e).length !== 1) return 'zone visible non décrite';
        taper(e, '');
        if (e.input.hasAttribute('aria-describedby')) return 'attribut vide laissé sur le champ';
        return '';
    }],

    ['couleurs du design system, avec repli', async (src) => {
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        sortir(e);
        const z = zone(e);
        if (!z) return 'aucune zone de message';
        const styles = [z].concat(Array.from(z.querySelectorAll('*'))).map((n) => n.getAttribute('style') || '').join(' ');
        for (const attendu of ['var(--error-700, #ba1b1b)', 'var(--neutral-500, #47505c)', 'var(--primary-1, #153cf5)']) {
            if (styles.indexOf(attendu) === -1) return 'couleur absente : ' + attendu;
        }
        const autres = (styles.match(/#[0-9a-f]{3,8}\b/gi) || []).filter((c) => ['#ba1b1b', '#47505c', '#153cf5'].indexOf(c.toLowerCase()) === -1);
        if (autres.length) return 'couleur hors design system : ' + autres.join(', ');
        return '';
    }],

    // ------------------------------------------------------------ pannes
    ['contrôle qui lève : signalé une seule fois, aucun message, envoi intact', async (src) => {
        const e = await page(src);
        e.iti.getSelectedCountryData = () => { throw new Error('lecture impossible'); };
        taper(e, '06 00 00 00');
        sortir(e);
        e.input.focus();
        sortir(e);
        const envoi = envoyer(e);
        if (!envoi || envoi.empeche) return 'envoi bloqué par une panne du contrôle';
        const vus = e.trace.signalements.filter((m) => /^PhoneInput: lecture impossible/.test(m));
        if (vus.length !== 1) return vus.length + ' signalement(s) pour trois contrôles en échec, 1 attendu';
        if (lire(e).texte) return 'message affiché malgré la panne';
        return '';
    }],

    ['message impossible à poser : le champ formate, les aides partent, c est signalé', async (src) => {
        const e = await page(src, { casserBouton: true, aides: 'tardives' });
        if (!e.iti) return 'champ non construit';
        if (e.trace.scripts.length !== 1) return 'les aides ne sont pas parties : une panne du message coupe le formatage';
        await repos(5);
        taper(e, '0600000000');
        if (e.input.value !== '+33 6 00 00 00 00') return 'formatage perdu : ' + e.input.value;
        if (!e.trace.signalements.some((m) => /^PhoneInput: /.test(m))) return 'panne du message non signalée';
        const envoi = envoyer(e);
        if (!envoi || envoi.empeche) return 'envoi bloqué';
        return '';
    }],

    // ------------------------------------------------------------ copies
    ['les deux copies servies ont la même logique de message', async () => {
        const [a, b] = SOURCES.map((s) => blocsLogique(lireSource(s)));
        if (!a || !b) return 'bloc de logique introuvable dans une copie';
        const n = Math.max(a.length, b.length);
        for (let i = 0; i < n; i++) {
            if (a[i] !== b[i]) {
                return 'dérive ligne ' + (i + 1) + ' :\n        ' + SOURCES[0] + ' : ' + a[i] + '\n        ' + SOURCES[1] + ' : ' + b[i];
            }
        }
        return '';
    }],
];

(async () => {
    let echecs = 0;
    let joues = 0;

    for (const source of SOURCES) {
        for (const [nom, fn] of CAS) {
            joues += 1;
            let probleme;
            try {
                probleme = await fn(source);
            } catch (err) {
                probleme = 'exception : ' + err.message;
            }
            if (probleme) {
                echecs += 1;
                console.error('FAIL  ' + source + ' : ' + nom + '\n      ' + probleme);
            } else {
                console.log('ok    ' + source + ' : ' + nom);
            }
        }
    }

    if (echecs) {
        console.error('\n' + echecs + ' cas en échec sur ' + joues);
        process.exit(1);
    }
    console.log('\n' + joues + ' cas (' + CAS.length + ' × ' + SOURCES.length + '), tous verts');
})();
