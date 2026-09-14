#!/usr/bin/env node
/**
 * Les champs « à compléter seulement » déclarés par config.fillOnlyFields.
 *
 * Une offre d'inscription peut fixer le statut et la spécialité du médecin.
 * /membership/mes-informations les recopie dans Memberstack, mais ces champs
 * décrivent le membre : ils ne remplissent qu'un champ vide, sur un compte créé
 * il y a moins de 24 h. Le statut pilote aussi l'affichage d'autres champs, ce
 * qui rend un écrasement plus coûteux que pour un simple libellé.
 *
 * Trois pièges vérifiés ici :
 *   - la clé de config est nouvelle : une page qui ne la déclare pas, ou une
 *     ancienne version de core.js qui ne la transmet pas, ne doit rien écrire ;
 *   - la liste des spécialités reçoit ses options APRÈS le chargement : la
 *     valeur doit être affichée dès que l'option existe, pas avant ;
 *   - un changement de liste doit prévenir la page (événement change), pour que
 *     les règles d'affichage liées au statut s'appliquent.
 *
 * Usage : node test/signup-fill-only-fields.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SYNC = fs.readFileSync(path.join(ROOT, 'mes-informations/memberstack-sync.js'), 'utf8');

const HEURE = 60 * 60 * 1000;
const STATUTS = ['', 'Medecin', 'Interne', 'PADHUE', 'Paramédical', 'Autre professionnel de sante'];
const FILL_ONLY = [
    { key: 'signup-statut', msField: 'statut' },
    { key: 'signup-specialite', msField: 'specialite' },
];

const ilYa = (ms) => new Date(Date.now() - ms).toISOString();
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/**
 * Rejoue memberstack-sync.js. La liste des spécialités démarre sans option,
 * comme sur la page servie ; `optionsApresMs` simule leur ajout différé.
 */
async function jouer({ membre, stockage = {}, config, optionsApresMs = 0, choixStatut = '', echecMiseAJour = false }) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const statuts = STATUTS.map((s) => `<option value="${s}">${s}</option>`).join('');
    const dom = new JSDOM(
        `<!doctype html><body><form data-ms-form="profile">
            <select id="mon-statut-2" data-ms-member="statut">${statuts}</select>
            <select id="Specialite-3" data-ms-member="specialite"><option value=""></option></select>
        </form></body>`,
        { url: 'https://www.ordotype.fr/membership/mes-informations', runScripts: 'outside-only', virtualConsole }
    );
    const w = dom.window;
    Object.entries(stockage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    w.document.getElementById('mon-statut-2').value = choixStatut;

    const changements = [];
    w.document.addEventListener('change', (e) => changements.push(e.target.getAttribute('data-ms-member')));

    const envoye = {};
    let appels = 0;
    w.OrdoMesInfos = { config };
    w.$memberstackDom = {
        getCurrentMember: async () => ({ data: membre }),
        updateMember: async (p) => {
            appels += 1;
            if (echecMiseAJour) throw new Error('network');
            Object.assign(envoye, p.customFields);
        },
    };

    const ajouterSpecialites = () => {
        const select = w.document.getElementById('Specialite-3');
        ['Médecine générale', "Médecine d'urgence"].forEach((v) => {
            const o = w.document.createElement('option');
            o.value = v;
            o.textContent = v;
            select.appendChild(o);
        });
    };
    if (optionsApresMs === 0) ajouterSpecialites();

    w.eval(SYNC);
    await attendre();
    const specialiteAvantOptions = w.document.getElementById('Specialite-3').value;
    if (optionsApresMs > 0) {
        await attendre(optionsApresMs);
        ajouterSpecialites();
        await attendre();
    }

    const r = {
        envoye,
        appels,
        statutEcran: w.document.getElementById('mon-statut-2').value,
        specialiteEcran: w.document.getElementById('Specialite-3').value,
        specialiteAvantOptions,
        changements,
        cleStatut: w.localStorage.getItem('signup-statut'),
        cleSpecialite: w.localStorage.getItem('signup-specialite'),
        erreurs,
    };
    w.close();
    return r;
}

const configFillOnly = { forceStatut: null, syncFields: [], fillOnlyFields: FILL_ONLY };
const cles = { 'signup-statut': 'Medecin', 'signup-specialite': 'Médecine générale' };

const CAS = [
    ['compte récent, champs vides : écrits, affichés, page prévenue', async () => {
        const r = await jouer({ membre: { id: 'm1', createdAt: ilYa(HEURE), customFields: {} }, stockage: cles, config: configFillOnly });
        return [
            [r.envoye.statut, 'Medecin', 'statut envoyé'],
            [r.envoye.specialite, 'Médecine générale', 'spécialité envoyée'],
            [r.statutEcran, 'Medecin', 'liste statut'],
            [r.specialiteEcran, 'Médecine générale', 'liste spécialité'],
            [r.changements.includes('statut'), true, 'change sur statut'],
            [r.cleStatut, null, 'clé statut consommée'],
            [r.cleSpecialite, null, 'clé spécialité consommée'],
        ];
    }],
    ['options de spécialité ajoutées plus tard : affichée dès qu\'elles arrivent', async () => {
        const r = await jouer({ membre: { id: 'm2', createdAt: ilYa(HEURE), customFields: {} }, stockage: cles, config: configFillOnly, optionsApresMs: 80 });
        return [
            [r.specialiteAvantOptions, '', 'liste avant les options'],
            [r.specialiteEcran, 'Médecine générale', 'liste après les options'],
            [r.changements.includes('specialite'), true, 'change sur spécialité'],
        ];
    }],
    ['membre qui a déjà un statut : jamais écrasé', async () => {
        const r = await jouer({
            membre: { id: 'm3', createdAt: ilYa(HEURE), customFields: { statut: 'Interne', specialite: 'Médecine générale' } },
            stockage: cles, config: configFillOnly, choixStatut: 'Interne',
        });
        return [
            [r.appels, 0, 'appels à Memberstack'],
            [r.statutEcran, 'Interne', 'liste statut'],
            [r.cleStatut, null, 'clé statut jetée'],
        ];
    }],
    ['compte ancien, champs vides : pas écrits', async () => {
        const r = await jouer({ membre: { id: 'm4', createdAt: ilYa(72 * HEURE), customFields: {} }, stockage: cles, config: configFillOnly });
        return [
            [r.appels, 0, 'appels à Memberstack'],
            [r.statutEcran, '', 'liste statut'],
            [r.cleSpecialite, null, 'clé spécialité jetée'],
        ];
    }],
    ['statut déjà choisi à l\'écran : conservé', async () => {
        const r = await jouer({ membre: { id: 'm5', createdAt: ilYa(HEURE), customFields: {} }, stockage: cles, config: configFillOnly, choixStatut: 'PADHUE' });
        return [
            [r.statutEcran, 'PADHUE', 'liste statut'],
            [r.changements.includes('statut'), false, 'pas de change sur statut'],
        ];
    }],
    ['page sans fillOnlyFields (ou ancien core.js) : rien n\'est écrit', async () => {
        const r = await jouer({ membre: { id: 'm6', createdAt: ilYa(HEURE), customFields: {} }, stockage: cles, config: { forceStatut: null, syncFields: [] } });
        return [
            [r.appels, 0, 'appels à Memberstack'],
            [r.cleStatut, 'Medecin', 'clé statut laissée'],
            [r.erreurs.length, 0, 'erreurs'],
        ];
    }],
    ['échec de la mise à jour : clés conservées, listes non touchées', async () => {
        const r = await jouer({ membre: { id: 'm7', createdAt: ilYa(HEURE), customFields: {} }, stockage: cles, config: configFillOnly, echecMiseAJour: true });
        return [
            [r.cleStatut, 'Medecin', 'clé statut'],
            [r.statutEcran, '', 'liste statut'],
        ];
    }],
    ['syncFields et fillOnlyFields ensemble : chacun garde sa règle', async () => {
        const r = await jouer({
            membre: { id: 'm8', createdAt: ilYa(72 * HEURE), customFields: { 'type-de-compte': 'Ancien' } },
            stockage: { ...cles, 'signup-type-de-compte': 'Nouveau' },
            config: { forceStatut: null, syncFields: [{ key: 'signup-type-de-compte', msField: 'type-de-compte' }], fillOnlyFields: FILL_ONLY },
        });
        return [
            [r.envoye['type-de-compte'], 'Nouveau', 'type de compte écrit'],
            ['statut' in r.envoye, false, 'statut non écrit (compte ancien)'],
        ];
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
            continue;
        }
        console.log(`  ok     ${nom}`);
    }
    if (echecs) {
        console.error(`\n${echecs} cas en échec sur ${CAS.length}.`);
        process.exit(1);
    }
    console.log(`\n${CAS.length} cas vérifiés.`);
})();
