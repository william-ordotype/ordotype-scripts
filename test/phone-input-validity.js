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
 *   - territoire d'outre-mer choisi et chiffres d'un mobile de métropole :
 *     une proposition de passer en +33, qui garde les chiffres ;
 *   - sans les aides de formatage, seul le nombre de chiffres est contrôlé,
 *     et seulement là où il est fixe. Dans le doute, rien n'est affiché ;
 *   - le message ne peut pas emporter le champ avec lui.
 *
 * La bibliothèque et ses aides sont les VRAIS fichiers de la version servie
 * (intl-tel-input 17.0.8, installé à la volée comme jsdom) : la validité d'un
 * numéro vient de leurs métadonnées, pas d'une table recopiée ici.
 *
 * Les cas sont rejoués sur les DEUX copies servies en production.
 *
 * Usage : node test/phone-input-validity.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
    'mes-informations/phone-input.js',
    'account/phone-input.js',
];

const LIB = fs.readFileSync(require.resolve('intl-tel-input/build/js/intlTelInput.js'), 'utf8');
const AIDES = fs.readFileSync(require.resolve('intl-tel-input/build/js/utils.js'), 'utf8');

const MESSAGE = "Ce numéro ne semble pas valide. Vérifiez l'indicatif du pays et le nombre de chiffres.";
const QUESTION = 'Vouliez-vous saisir un numéro de France métropolitaine (+33)\u00a0?';

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
  <input type="submit" id="valider" value="Valider">
</form>
<p id="aide-existante">Numéro utilisé pour vous joindre.</p>
</body>`;
}

const repos = (ms) => new Promise((r) => setTimeout(r, ms || 0));

/**
 * @param {string} source
 * @param {object} opts
 *   aides       : 'presentes' (défaut) | 'absentes' | 'tardives'
 *   describedBy : aria-describedby déjà posé sur le champ
 *   casserBouton : createElement('button') lève. La bibliothèque ne crée
 *                  aucun bouton : seul le message tombe, pas le champ.
 *   envoiAvant  : un gestionnaire d'envoi posé sur le formulaire AVANT le
 *                 script, qui lit la valeur puis arrête l'événement. C'est
 *                 l'ordre réel sur les pages qui portent ce champ.
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
        valider: doc.getElementById('valider'),
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

/** Ce que le visiteur voit : le texte des nœuds non masqués de la zone. */
function zone(e) {
    const ids = (e.input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    for (const id of ids) {
        const el = e.doc.getElementById(id);
        if (el && el.getAttribute('aria-live')) return el;
    }
    return null;
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
    return {
        zone: z,
        texte: z ? texteVisible(z) : '',
        bouton: bouton && visible(bouton, z) ? bouton : null,
    };
}

function envoyer(e) {
    const avant = e.trace.envois.length;
    e.valider.click();
    return e.trace.envois.length > avant ? e.trace.envois[e.trace.envois.length - 1] : null;
}

const CAS = [
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
        if (lire(e).bouton) return 'proposition +33 affichée pour une simple saisie tronquée';
        const envoi = envoyer(e);
        if (!envoi) return 'l envoi n est pas parti : le message bloque le formulaire';
        if (envoi.empeche) return 'l événement submit a été empêché';
        if (envoi.valeur !== '06 00 00 00') return 'la saisie a été modifiée à l envoi : ' + envoi.valeur;
        if (!e.doc.getElementById('profil').checkValidity()) return 'le formulaire est rendu invalide';
        return '';
    }],

    ['saisie tronquée sans passer par la sortie : le message apparaît à l envoi', async (src) => {
        const e = await page(src);
        taper(e, '06 00 00 00');
        const envoi = envoyer(e);
        if (!envoi || envoi.empeche) return 'l envoi a été bloqué';
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

    ['mobile de métropole avec La Réunion : message et proposition, qui passe en +33', async (src) => {
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '06 00 00 00 00');
        sortir(e);
        const vu = lire(e);
        if (vu.texte.indexOf(MESSAGE) !== 0) return 'message absent : « ' + vu.texte + ' »';
        if (vu.texte.indexOf(QUESTION) === -1) return 'proposition +33 absente : « ' + vu.texte + ' »';
        if (!vu.bouton) return 'aucune action pour passer en +33';
        if (vu.bouton.type !== 'button') return 'l action est un bouton d envoi : un clic enverrait le formulaire';

        const envois = e.trace.envois.length;
        vu.bouton.click();
        if (e.trace.envois.length !== envois) return 'le clic sur la proposition a envoyé le formulaire';
        if (e.iti.getSelectedCountryData().iso2 !== 'fr') return 'le pays n est pas passé sur la France';
        if (e.input.value !== '+33 6 00 00 00 00') return 'chiffres non conservés : ' + e.input.value;
        if (lire(e).texte) return 'message laissé après correction';
        if (e.doc.activeElement !== e.input) return 'le focus n est pas rendu au champ';
        return '';
    }],

    ['indicatif +262 saisi en toutes lettres : même proposition', async (src) => {
        const e = await page(src);
        e.iti.setCountry('re');
        taper(e, '+262 6 00 00 00 00');
        sortir(e);
        const vu = lire(e);
        if (!vu.bouton || vu.texte.indexOf(QUESTION) === -1) return 'proposition absente : « ' + vu.texte + ' »';
        vu.bouton.click();
        if (e.input.value !== '+33 6 00 00 00 00') return 'chiffres non conservés : ' + e.input.value;
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
        if (e.input.value !== '+33 6 00 00 00 00') return 'chiffres non conservés : ' + e.input.value;
        if (!e.iti.isValidNumber()) return 'numéro toujours invalide après correction';
        return '';
    }],

    ['autres territoires : proposition aussi en Guadeloupe et en Nouvelle-Calédonie', async (src) => {
        for (const pays of ['gp', 'nc']) {
            const e = await page(src);
            e.iti.setCountry(pays);
            taper(e, '06 00 00 00 00');
            sortir(e);
            if (!lire(e).bouton) return 'pas de proposition pour ' + pays + ' : « ' + lire(e).texte + ' »';
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

    ['repli sans les aides : seules des longueurs confirmées par les métadonnées', async (src) => {
        // La règle maison ne doit rien inventer : chaque entrée de sa liste doit
        // avoir, dans les métadonnées de la version servie, un numéro national
        // de 9 chiffres exactement, précédé ou non du 0.
        const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
        const liste = (code.match(/NINE_DIGIT_NATIONAL = \[([^\]]*)\]/) || [])[1];
        if (!liste) return 'liste du repli introuvable dans le fichier';
        const e = await page(src);
        const U = e.w.intlTelInputUtils;
        const pays = e.w.intlTelInputGlobals.getCountryData();
        for (const iso of liste.match(/[a-z]{2}/g)) {
            const donnees = pays.find((c) => c.iso2 === iso);
            if (!donnees) return iso + ' absent du sélecteur';
            for (let n = 4; n <= 13; n++) {
                const attendu = n < 9 ? U.validationError.TOO_SHORT : n > 9 ? U.validationError.TOO_LONG : U.validationError.IS_POSSIBLE;
                for (const premier of '123456789') {
                    const national = premier + '0'.repeat(n - 1);
                    if (U.getValidationError('+' + donnees.dialCode + national, iso) !== attendu) {
                        return iso + ' : ' + n + ' chiffres nationaux ne donnent pas le verdict attendu';
                    }
                }
            }
            if (U.getValidationError('01' + '0'.repeat(8), iso) !== U.validationError.IS_POSSIBLE) {
                return iso + ' : le 0 initial n est pas le préfixe national';
            }
        }
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

    ['accessibilité : zone annoncée poliment, reliée au champ, sous l enveloppe du drapeau', async (src) => {
        const e = await page(src, { describedBy: 'aide-existante' });
        const z = zone(e);
        if (!z) return 'aucune zone reliée au champ par aria-describedby';
        if (z.getAttribute('aria-live') !== 'polite') return 'aria-live attendu à polite';
        const ids = e.input.getAttribute('aria-describedby').split(/\s+/);
        if (ids.indexOf('aide-existante') === -1) return 'aria-describedby existant écrasé';
        const enveloppe = e.input.parentNode;
        if (!enveloppe.classList.contains('iti')) return 'le champ n est pas dans l enveloppe de la bibliothèque';
        if (enveloppe.nextElementSibling !== z) return 'la zone n est pas juste après l enveloppe du champ';
        if (enveloppe.contains(z)) return 'zone dans l enveloppe : le conteneur du drapeau s étirerait dessus';
        if (lire(e).texte) return 'zone non vide au chargement';
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
