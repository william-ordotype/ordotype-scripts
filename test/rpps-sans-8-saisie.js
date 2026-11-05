#!/usr/bin/env node
/**
 * Mes informations : un RPPS tapé avec le « 8 » de l'identifiant national
 * (12 chiffres, celui de la carte CPS) est enregistré sur 11 chiffres.
 *
 * Le formulaire est un formulaire Memberstack : il lit les champs à l'envoi.
 * Le 8 doit donc être retiré AVANT ses écouteurs. Ici, un écouteur posé sur le
 * formulaire avant le script joue Memberstack et note la valeur qu'il aurait
 * enregistrée.
 *   - « 8 » + 11 chiffres dont la clé de Luhn est bonne : 11 chiffres, avec ou
 *     sans espaces, à l'envoi comme à la sortie du champ ;
 *   - toute autre valeur reste telle quelle (clé fausse, 11 chiffres, texte de
 *     la case « pas de RPPS ») ;
 *   - pages CMS : seulement quand le numéro est un RPPS, jamais sur une page
 *     d'un autre pays (INAMI, GLN, CNS…).
 *
 * Usage : node test/rpps-sans-8-saisie.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const MES_INFOS = fs.readFileSync(path.join(ROOT, 'mes-informations/rpps.js'), 'utf8');
const CMS = fs.readFileSync(path.join(ROOT, 'mes-informations-cms/rpps-handler.js'), 'utf8');

// Numéro fictif à clé de Luhn valide (déjà utilisé par les autres tests).
const RPPS = '10000668540';

const PAGE = `<!doctype html><body>
  <form id="profil" data-ms-form="profile">
    <input type="text" id="RPPS" data-ms-member="n-rpps">
    <input type="checkbox" id="notRPPS">
    <input type="submit" id="envoyer" value="Valider">
  </form>
  <form id="autre"><input type="submit" id="autre-envoyer"></form>
</body>`;

/**
 * Charge le script sur la page, tape `saisie`, puis `action` :
 * 'envoi' (événement submit), 'clic' (clic sur le bouton), 'sortie' (change),
 * 'autre-envoi' (envoi d'un autre formulaire de la page).
 * Rend la valeur lue par le faux Memberstack (ou celle du champ) et les erreurs.
 */
async function jouer({ script, saisie, action = 'envoi', config = { rppsText: 'Pas de RPPS' }, cms, html = PAGE, cocher = false }) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(html, { url: 'https://www.ordotype.fr/membership/mes-informations', runScripts: 'outside-only', virtualConsole });
    const w = dom.window;
    const d = w.document;
    let luParMemberstack = null;
    let luAuClic = null;
    // Faux Memberstack : écouteurs posés sur le formulaire AVANT le script.
    d.getElementById('profil').addEventListener('submit', (e) => { e.preventDefault(); luParMemberstack = d.getElementById('RPPS').value; });
    d.getElementById('envoyer').addEventListener('click', (e) => { e.preventDefault(); luAuClic = d.getElementById('RPPS').value; });
    d.getElementById('autre').addEventListener('submit', (e) => e.preventDefault());
    if (config) w.OrdoMesInfos = { config };
    if (cms) w.OrdoMesInfosCMS = { rppsEquivalentName: cms };
    w.eval(script);
    await new Promise((r) => setTimeout(r, 20)); // DOMContentLoaded de jsdom
    const champ = d.getElementById('RPPS');
    const caseCochee = d.getElementById('notRPPS');
    if (cocher && caseCochee) {
        caseCochee.checked = true;
        caseCochee.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    if (saisie !== undefined) champ.value = saisie;
    const formulaire = d.getElementById('profil');
    if (action === 'envoi') formulaire.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    if (action === 'clic') d.getElementById('envoyer').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    if (action === 'sortie') champ.dispatchEvent(new w.Event('change', { bubbles: true }));
    if (action === 'autre-envoi') d.getElementById('autre').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    const r = { lu: action === 'envoi' ? luParMemberstack : action === 'clic' ? luAuClic : champ.value, erreurs };
    w.close();
    return r;
}

const sansErreur = (r) => [r.erreurs.length, 0, `erreurs ${r.erreurs.join(' | ')}`];

const CAS = [
    // mes-informations/rpps.js
    ['8 + RPPS, envoi : Memberstack lit 11 chiffres', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: `8${RPPS}` });
        return [[r.lu, RPPS, 'valeur lue'], sansErreur(r)];
    }],
    ['8 + RPPS avec espaces, envoi : 11 chiffres', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: ` 8 1000 066 8540 ` });
        return [[r.lu, RPPS, 'valeur lue']];
    }],
    ['8 + RPPS, sortie du champ : 11 chiffres affichés', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: `8${RPPS}`, action: 'sortie' });
        return [[r.lu, RPPS, 'valeur du champ']];
    }],
    ['8 + RPPS, clic sur le bouton : retiré avant les écouteurs du bouton', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: `8${RPPS}`, action: 'clic' });
        return [[r.lu, RPPS, 'valeur au clic']];
    }],
    ['clé de Luhn fausse : laissé tel quel', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: '810000668541' });
        return [[r.lu, '810000668541', 'valeur lue']];
    }],
    ['RPPS sur 11 chiffres : inchangé', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: RPPS });
        return [[r.lu, RPPS, 'valeur lue']];
    }],
    ['13 chiffres commençant par 8 : inchangé', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: `8${RPPS}0` });
        return [[r.lu, `8${RPPS}0`, 'valeur lue']];
    }],
    ['case « pas de RPPS » cochée : le texte part tel quel', async () => {
        const r = await jouer({ script: MES_INFOS, cocher: true });
        return [[r.lu, 'Pas de RPPS', 'valeur lue']];
    }],
    ['envoi d\'un autre formulaire : champ RPPS non touché', async () => {
        const r = await jouer({ script: MES_INFOS, saisie: `8${RPPS}`, action: 'autre-envoi' });
        return [[r.lu, `8${RPPS}`, 'valeur du champ']];
    }],
    ['rppsText null : le 8 est quand même retiré, la case ne fait rien', async () => {
        const a = await jouer({ script: MES_INFOS, saisie: `8${RPPS}`, config: { rppsText: null } });
        const b = await jouer({ script: MES_INFOS, config: { rppsText: null }, cocher: true });
        return [[a.lu, RPPS, 'valeur lue'], [b.lu, '', 'case cochée sans texte configuré']];
    }],
    ['page sans case « pas de RPPS » : le 8 est retiré', async () => {
        const html = PAGE.replace('<input type="checkbox" id="notRPPS">', '');
        const r = await jouer({ script: MES_INFOS, saisie: `8${RPPS}`, html });
        return [[r.lu, RPPS, 'valeur lue'], sansErreur(r)];
    }],
    // mes-informations-cms/rpps-handler.js
    ['CMS « RPPS » : 11 chiffres', async () => {
        const r = await jouer({ script: CMS, saisie: `8${RPPS}`, config: null, cms: 'RPPS' });
        return [[r.lu, RPPS, 'valeur lue'], sansErreur(r)];
    }],
    ['CMS « Numéro RPPS » : 11 chiffres', async () => {
        const r = await jouer({ script: CMS, saisie: `8${RPPS}`, config: null, cms: 'Numéro RPPS' });
        return [[r.lu, RPPS, 'valeur lue']];
    }],
    ['CMS « Numéro INAMI » : laissé tel quel', async () => {
        const r = await jouer({ script: CMS, saisie: `8${RPPS}`, config: null, cms: 'Numéro INAMI' });
        return [[r.lu, `8${RPPS}`, 'valeur lue']];
    }],
    ['CMS « Numéro GLN », sortie du champ : laissé tel quel', async () => {
        const r = await jouer({ script: CMS, saisie: `8${RPPS}`, config: null, cms: 'Numéro GLN', action: 'sortie' });
        return [[r.lu, `8${RPPS}`, 'valeur du champ']];
    }],
    ['CMS case cochée : « Pas de Numéro INAMI »', async () => {
        const r = await jouer({ script: CMS, config: null, cms: 'Numéro INAMI', cocher: true });
        return [[r.lu, 'Pas de Numéro INAMI', 'valeur lue']];
    }],
    ['CMS sans case « pas de RPPS » : le 8 est retiré', async () => {
        const html = PAGE.replace('<input type="checkbox" id="notRPPS">', '');
        const r = await jouer({ script: CMS, saisie: `8${RPPS}`, config: null, cms: 'RPPS', html });
        return [[r.lu, RPPS, 'valeur lue'], sansErreur(r)];
    }],
];

(async () => {
let echecs = 0;
for (const [nom, cas] of CAS) {
    let verifs;
    try {
        verifs = await cas();
    } catch (e) {
        console.log(`  ECHEC  ${nom} : exception ${e.message}`);
        echecs += 1;
        continue;
    }
    const rates = verifs.filter(([obtenu, attendu]) => obtenu !== attendu);
    if (rates.length) {
        rates.forEach(([obtenu, attendu, quoi]) =>
            console.log(`  ECHEC  ${nom} : ${quoi} = ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`));
        echecs += 1;
    } else {
        console.log(`  ok     ${nom}`);
    }
}
console.log(echecs ? `\n${echecs} cas en échec` : `\n${CAS.length} cas OK`);
process.exit(echecs ? 1 : 0);
})();
