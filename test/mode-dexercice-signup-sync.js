#!/usr/bin/env node
/**
 * Le mode d'exercice fixé par une offre d'inscription, et ce qu'il ne doit
 * jamais écraser.
 *
 * Une page /inscription/<offre> peut fixer un mode d'exercice. La page le
 * laisse dans le localStorage, puis /membership/mes-informations le recopie
 * dans Memberstack. Contrairement au type de compte, ce champ décrit le
 * médecin et non l'offre : il ne doit remplir qu'un champ vide, sur un compte
 * qui vient d'être créé. Sinon, un membre existant qui a simplement consulté
 * une offre verrait son propre choix remplacé.
 *
 * Deux pièges vérifiés ici :
 *   - la clé suit la dernière offre affichée, pas la première visitée ;
 *   - la liste du formulaire a été pré-remplie AVANT la mise à jour : si on ne
 *     l'actualise pas, enregistrer le formulaire renvoie la valeur vide.
 *
 * Usage : node test/mode-dexercice-signup-sync.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SYNC = fs.readFileSync(path.join(ROOT, 'mes-informations/memberstack-sync.js'), 'utf8');
const LOADER = fs.readFileSync(path.join(ROOT, 'inscription/loader.js'), 'utf8');

const KEY = 'signup-mode-dexercice';
const HEURE = 60 * 60 * 1000;

// Les options telles que la page /membership/mes-informations les sert.
const OPTIONS = ['', 'Liberal', 'Remplacant', 'Salarie', 'SSA', 'Mixte', 'Retraité', "Autre mode d'exercice"];

function creerPage() {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const options = OPTIONS.map((o) => `<option value="${o}">${o || "Mode d'exercice"}</option>`).join('');
    const dom = new JSDOM(
        `<!doctype html><body><select data-ms-member="mode-dexercice">${options}</select></body>`,
        { url: 'https://www.ordotype.fr/membership/mes-informations', runScripts: 'outside-only', virtualConsole }
    );
    return { dom, erreurs };
}

const attendre = () => new Promise((r) => setTimeout(r, 30));

/** Rejoue memberstack-sync.js pour un membre et un localStorage donnés. */
async function jouerSync({ membre, stockage = {}, choixEcran = '', syncFields, echecMiseAJour = false }) {
    const { dom, erreurs } = creerPage();
    const w = dom.window;
    Object.entries(stockage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    w.document.querySelector('select').value = choixEcran;

    const miseAJour = [];
    w.OrdoMesInfos = {
        config: {
            forceStatut: null,
            syncFields: syncFields || [
                { key: 'signup-type-de-compte', msField: 'type-de-compte' },
                { key: KEY, msField: 'mode-dexercice' },
            ],
        },
    };
    w.$memberstackDom = {
        getCurrentMember: async () => ({ data: membre }),
        updateMember: async (p) => {
            if (echecMiseAJour) throw new Error('network');
            miseAJour.push(p.customFields);
        },
    };

    w.eval(SYNC);
    await attendre();

    return {
        envoye: Object.assign({}, ...miseAJour),
        appels: miseAJour.length,
        cleRestante: w.localStorage.getItem(KEY),
        cleTypeRestante: w.localStorage.getItem('signup-type-de-compte'),
        ecran: w.document.querySelector('select').value,
        erreurs,
    };
}

/** Rejoue le chargeur d'une page /inscription avec la config donnée. */
async function jouerLoader({ config, stockage = {} }) {
    const { dom, erreurs } = creerPage();
    const w = dom.window;
    Object.entries(stockage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    w.INSCRIPTION_CONFIG = config;
    w.eval(LOADER);
    await attendre();
    return { cle: w.localStorage.getItem(KEY), erreurs };
}

const ilYa = (ms) => new Date(Date.now() - ms).toISOString();

const CAS = [
    ['compte créé il y a une heure, champ vide : écrit et affiché dans la liste', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_a', createdAt: ilYa(HEURE), customFields: {} },
            stockage: { [KEY]: 'Retraité' },
        });
        return [
            [r.envoye['mode-dexercice'], 'Retraité', 'valeur envoyée à Memberstack'],
            [r.ecran, 'Retraité', 'liste du formulaire'],
            [r.cleRestante, null, 'clé consommée'],
        ];
    }],
    ['membre qui a déjà un mode d\'exercice : jamais écrasé', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_b', createdAt: ilYa(HEURE), customFields: { 'mode-dexercice': 'Liberal' } },
            stockage: { [KEY]: 'Retraité' },
            choixEcran: 'Liberal',
        });
        return [
            ['mode-dexercice' in r.envoye, false, 'aucune écriture du champ'],
            [r.ecran, 'Liberal', 'liste du formulaire'],
            [r.cleRestante, null, 'clé jetée'],
        ];
    }],
    ['compte ancien, champ vide : pas écrit', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_c', createdAt: ilYa(72 * HEURE), customFields: {} },
            stockage: { [KEY]: 'Retraité' },
        });
        return [
            ['mode-dexercice' in r.envoye, false, 'aucune écriture du champ'],
            [r.ecran, '', 'liste du formulaire'],
            [r.cleRestante, null, 'clé jetée'],
        ];
    }],
    ['date de création illisible : pas écrit', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_d', customFields: {} },
            stockage: { [KEY]: 'Retraité' },
        });
        return [['mode-dexercice' in r.envoye, false, 'aucune écriture du champ']];
    }],
    ['les champs de l\'offre restent synchronisés comme avant', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_e', createdAt: ilYa(72 * HEURE), customFields: { 'type-de-compte': 'Ancien' } },
            stockage: { [KEY]: 'Retraité', 'signup-type-de-compte': 'Nouveau' },
        });
        return [
            [r.envoye['type-de-compte'], 'Nouveau', 'type de compte écrit'],
            ['mode-dexercice' in r.envoye, false, 'mode d\'exercice non écrit'],
            [r.cleTypeRestante, null, 'clé du type consommée'],
        ];
    }],
    ['le membre a déjà choisi dans la liste : son choix reste à l\'écran', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_f', createdAt: ilYa(HEURE), customFields: {} },
            stockage: { [KEY]: 'Retraité' },
            choixEcran: 'Mixte',
        });
        return [[r.ecran, 'Mixte', 'liste du formulaire']];
    }],
    ['échec de la mise à jour : la clé reste pour la visite suivante', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_g', createdAt: ilYa(HEURE), customFields: {} },
            stockage: { [KEY]: 'Retraité' },
            echecMiseAJour: true,
        });
        return [[r.cleRestante, 'Retraité', 'clé conservée']];
    }],
    ['page non configurée pour ce champ : rien n\'est écrit', async () => {
        const r = await jouerSync({
            membre: { id: 'mem_h', createdAt: ilYa(HEURE), customFields: {} },
            stockage: { [KEY]: 'Retraité' },
            syncFields: [{ key: 'signup-type-de-compte', msField: 'type-de-compte' }],
        });
        return [[r.appels, 0, 'aucun appel à Memberstack']];
    }],
    ['offre avec mode d\'exercice : la clé est posée', async () => {
        const r = await jouerLoader({ config: { modeDexercice: 'Retraité' } });
        return [[r.cle, 'Retraité', 'clé posée']];
    }],
    ['offre sans mode d\'exercice : la clé laissée par une autre offre disparaît', async () => {
        const r = await jouerLoader({ config: { modeDexercice: '', typeDeCompte: 'SAU Gratuit' }, stockage: { [KEY]: 'Retraité' } });
        return [[r.cle, null, 'clé effacée']];
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
