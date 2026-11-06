#!/usr/bin/env node
/**
 * Mes informations : un semestre enregistré absent de la liste est gardé.
 *
 * Le formulaire est un formulaire Memberstack : il enregistre la valeur affichée
 * par chaque liste. Une valeur enregistrée hors de la liste laissait la liste
 * sur son option vide, et l'enregistrement l'effaçait. Le script l'ajoute comme
 * option pour ce membre et l'affiche.
 *   - valeur hors liste : une option ajoutée, affichée, lue à l'envoi ;
 *   - valeur de la liste, ou qui n'en diffère que par un accent ou la casse :
 *     aucune option ajoutée ;
 *   - une valeur déjà affichée (choisie par le membre) n'est pas remplacée ;
 *   - Memberstack qui remplit la liste après le script : la valeur tient ;
 *   - champ vide, membre non connecté, autre liste (statut) : rien ne change ;
 *   - les deux chargeurs (mes-informations et pages CMS) chargent le script.
 *
 * Usage : node test/mes-infos-valeurs-hors-liste.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'mes-informations/keep-unlisted-values.js'), 'utf8');
const LOADER = fs.readFileSync(path.join(ROOT, 'mes-informations/loader.js'), 'utf8');
const LOADER_CMS = fs.readFileSync(path.join(ROOT, 'mes-informations-cms/loader.js'), 'utf8');

const SEMESTRES = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Internat terminé'];
const options = (valeurs) => valeurs.map((v) => `<option value="${v}">${v || 'Sélectionner'}</option>`).join('');

const PAGE = `<!doctype html><body>
  <form id="profil" data-ms-form="profile">
    <select id="statut" data-ms-member="statut">${options(['', 'Médecin', 'Interne'])}</select>
    <select id="semestre" data-ms-member="semestre">${options(SEMESTRES)}</select>
    <input type="submit" id="envoyer" value="Valider">
  </form>
</body>`;

const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/**
 * Charge le script pour un membre dont les champs sont `champs` (null = non
 * connecté). `avant(d)` joue ce qui se passe avant le script (Memberstack qui
 * remplit, choix du membre), `apres(d)` ce qui se passe après.
 */
async function jouer({ champs, avant, apres }) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(PAGE, { url: 'https://www.ordotype.fr/membership/mes-informations', runScripts: 'outside-only', virtualConsole });
    const w = dom.window;
    const d = w.document;
    let luParMemberstack = null;
    d.getElementById('profil').addEventListener('submit', (e) => {
        e.preventDefault();
        luParMemberstack = { semestre: d.getElementById('semestre').value, statut: d.getElementById('statut').value };
    });
    w.$memberstackDom = {
        getCurrentMember: () => Promise.resolve({ data: champs === null ? null : { id: 'mem_test', customFields: champs } }),
    };
    if (avant) avant(d);
    w.eval(SCRIPT);
    await attendre();
    if (apres) apres(d);
    d.getElementById('profil').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    const semestre = d.getElementById('semestre');
    const r = {
        lu: luParMemberstack,
        ajoutees: Array.from(semestre.options).map((o) => o.value).filter((v) => !SEMESTRES.includes(v)),
        options: semestre.options.length,
        statutOptions: d.getElementById('statut').options.length,
        erreurs,
    };
    w.close();
    return r;
}

const sansErreur = (r) => [r.erreurs.length, 0, `erreurs ${r.erreurs.join(' | ')}`];

/** Liste des URL ajoutées par un chargeur (aucun réseau). */
async function urlsChargees(source) {
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://www.ordotype.fr/mes-informations/externe-france',
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;
    const urls = [];
    w.document.head.appendChild = (el) => {
        urls.push(el.src || el.href);
        setTimeout(() => el.onload && el.onload(), 0);
        return el;
    };
    w.MES_INFOS_CONFIG = {};
    w.eval(source);
    await attendre(50);
    w.close();
    return urls;
}

const CAS = [
    ['« 6 (FST) » : option ajoutée, affichée et enregistrée', async () => {
        const r = await jouer({ champs: { semestre: '6 (FST)' } });
        return [[r.lu.semestre, '6 (FST)', 'valeur lue'], [r.ajoutees.join('|'), '6 (FST)', 'options ajoutées'], sansErreur(r)];
    }],
    ['« 11 » absent de la liste : gardé', async () => {
        const r = await jouer({ champs: { semestre: '11' } });
        return [[r.lu.semestre, '11', 'valeur lue']];
    }],
    ['valeur de la liste : aucune option ajoutée', async () => {
        const r = await jouer({ champs: { semestre: '3' } });
        return [[r.lu.semestre, '3', 'valeur lue'], [r.options, SEMESTRES.length, 'nombre d\'options']];
    }],
    ['« internat termine » : prend l\'option accentuée', async () => {
        const r = await jouer({ champs: { semestre: 'internat termine' } });
        return [[r.lu.semestre, 'Internat terminé', 'valeur lue'], [r.options, SEMESTRES.length, 'nombre d\'options']];
    }],
    ['valeur déjà affichée par Memberstack : inchangée', async () => {
        const r = await jouer({ champs: { semestre: '5' }, avant: (d) => { d.getElementById('semestre').value = '5'; } });
        return [[r.lu.semestre, '5', 'valeur lue'], [r.options, SEMESTRES.length, 'nombre d\'options']];
    }],
    ['le membre a déjà choisi une autre valeur : son choix reste', async () => {
        const r = await jouer({ champs: { semestre: '6 (FST)' }, avant: (d) => { d.getElementById('semestre').value = '7'; } });
        return [[r.lu.semestre, '7', 'valeur lue']];
    }],
    ['Memberstack remplit la liste après le script : la valeur tient', async () => {
        const r = await jouer({ champs: { semestre: '6 (FST)' }, apres: (d) => { d.getElementById('semestre').value = '6 (FST)'; } });
        return [[r.lu.semestre, '6 (FST)', 'valeur lue'], [r.ajoutees.length, 1, 'une seule option ajoutée']];
    }],
    ['semestre vide : rien ne change', async () => {
        const r = await jouer({ champs: { semestre: '' } });
        return [[r.lu.semestre, '', 'valeur lue'], [r.options, SEMESTRES.length, 'nombre d\'options']];
    }],
    ['membre non connecté : rien ne change', async () => {
        const r = await jouer({ champs: null });
        return [[r.lu.semestre, '', 'valeur lue'], [r.options, SEMESTRES.length, 'nombre d\'options'], sansErreur(r)];
    }],
    ['statut hors liste : liste du statut non touchée', async () => {
        const r = await jouer({ champs: { statut: 'Retraité', semestre: '' } });
        return [[r.lu.statut, '', 'statut lu'], [r.statutOptions, 3, 'options du statut']];
    }],
    ['chargeur mes-informations : charge le script', async () => {
        const urls = await urlsChargees(LOADER);
        return [[urls.some((u) => u.endsWith('/mes-informations/keep-unlisted-values.js')), true, 'script chargé']];
    }],
    ['chargeur des pages CMS : charge le script', async () => {
        const urls = await urlsChargees(LOADER_CMS);
        return [[urls.some((u) => u.endsWith('/mes-informations/keep-unlisted-values.js')), true, 'script chargé']];
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
