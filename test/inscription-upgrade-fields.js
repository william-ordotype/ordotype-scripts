#!/usr/bin/env node
/**
 * Un membre connecté qui prend une offre /inscription reçoit les champs de l'offre.
 *
 * Le bouton de plan Memberstack n'envoie que l'identifiant du plan : sans
 * inscription/upgrade-fields.js, un membre existant obtient le plan sans le type
 * de compte, la ville partenaire ni le statut que la fiche porte. Le script prend
 * le clic, ajoute le plan, écrit les champs, puis part comme Memberstack
 * (redirection ou rechargement). Il doit donc écrire AVANT de quitter la page.
 *
 * Règles vérifiées :
 *   - champs de l'offre (type, ville, commentaire, durée) : remplacent la valeur
 *     du membre quand la fiche en a une, jamais par une valeur vide ;
 *   - autres champs (statut, spécialité, mode) : complètent seulement un champ vide ;
 *   - visiteur déconnecté : le clic reste à Memberstack ;
 *   - échec de l'ajout du plan : rien n'est écrit, message d'erreur ;
 *   - échec de l'écriture : le membre part quand même, l'erreur est signalée.
 *
 * Usage : node test/inscription-upgrade-fields.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'inscription/upgrade-fields.js'), 'utf8');

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><body>
  <form data-ms-form="signup" data-ms-plan:add="pln_offre">
    <div class="input-field-hidden">
      <input data-ms-member="partnership-city" value="Association C retraités">
      <input data-ms-member="comment" value="">
      <input data-ms-member="type-de-compte" value="Association C">
      <input data-ms-member="mode-dexercice" value="Retraité">
      <input data-ms-member="statut" value="Medecin">
      <input data-ms-member="specialite" value="Médecine générale">
    </div>
    <input data-ms-member="email" value=""><input data-ms-member="password" value="">
  </form>
  <a href="#" id="btn" data-ms-plan:add="pln_offre" data-ms-success-message="Offre activée"><span id="label">En profiter</span></a>
</body>`;

async function jouer({ connecte = true, membre = { id: 'mem_1', customFields: {} }, redirect = '/membership/prise-en-main',
                       echecPlan = false, echecEcriture = false, config = { dureeOffre: '' }, doubleClic = false } = {}) {
    const navigations = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navigations.push(e.message); });
    const dom = new JSDOM(PAGE, { url: 'https://www.ordotype.fr/inscription/offre', runScripts: 'outside-only', virtualConsole });
    const w = dom.window;
    if (connecte) w.localStorage.setItem('_ms-mem', JSON.stringify({ id: membre.id }));
    ['signup-type-de-compte', 'signup-statut'].forEach((k) => w.localStorage.setItem(k, 'x'));
    w.INSCRIPTION_CONFIG = config;

    const appels = { addPlan: [], updateMember: [], messages: [], rapports: [], loader: 0 };
    w.OrdoErrorReporter = { report: (nom, d) => appels.rapports.push([nom, d]) };
    w.$memberstackDom = {
        _showLoader: () => { appels.loader += 1; },
        _hideLoader: () => {},
        _showMessage: (m, erreur) => appels.messages.push([m, erreur]),
        addPlan: async (p) => {
            appels.addPlan.push(p);
            await attendre(5);
            if (echecPlan) throw new Error('Plan refusé');
            return { data: { member: membre, redirect }, _internalUseOnly: { message: 'Plan ajouté' } };
        },
        updateMember: async (p) => {
            appels.updateMember.push(p.customFields);
            if (echecEcriture) throw new Error('network');
            return { data: {} };
        },
    };

    // Le listener de Memberstack sur le bouton, pour savoir si le clic lui parvient.
    let clicMemberstack = 0;
    w.document.getElementById('btn').addEventListener('click', () => { clicMemberstack += 1; });

    w.eval(SCRIPT);
    w.document.getElementById('label').click();
    if (doubleClic) w.document.getElementById('label').click();
    await attendre(60);

    const r = {
        appels, clicMemberstack, navigations,
        cleType: w.localStorage.getItem('signup-type-de-compte'),
    };
    w.close();
    return r;
}

const CAS = [
    ['membre connecté sans champs : plan ajouté, tous les champs de la fiche écrits, puis redirection', async () => {
        const r = await jouer();
        return [
            [JSON.stringify(r.appels.addPlan), JSON.stringify([{ planId: 'pln_offre' }]), 'addPlan'],
            [JSON.stringify(r.appels.updateMember), JSON.stringify([{
                'partnership-city': 'Association C retraités', 'type-de-compte': 'Association C',
                'mode-dexercice': 'Retraité', statut: 'Medecin', specialite: 'Médecine générale',
            }]), 'champs écrits (commentaire vide exclu)'],
            [r.clicMemberstack, 0, 'clic laissé à Memberstack'],
            [r.navigations.length, 1, 'redirection'],
            [r.cleType, null, 'clés du localStorage effacées'],
        ];
    }],
    ['membre qui a déjà des valeurs : l\'offre remplace, le profil est complété sans écraser', async () => {
        const r = await jouer({ membre: { id: 'mem_2', customFields: {
            'type-de-compte': 'Ancien', 'partnership-city': 'Ancienne ville', statut: 'Interne', specialite: '', 'mode-dexercice': 'Liberal',
        } } });
        return [[JSON.stringify(r.appels.updateMember), JSON.stringify([{
            'partnership-city': 'Association C retraités', 'type-de-compte': 'Association C', specialite: 'Médecine générale',
        }]), 'champs écrits']];
    }],
    ['membre déjà à jour : aucune écriture, départ normal', async () => {
        const r = await jouer({ membre: { id: 'mem_3', customFields: {
            'type-de-compte': 'Association C', 'partnership-city': 'Association C retraités', statut: 'Medecin',
            specialite: 'Médecine générale', 'mode-dexercice': 'Retraité',
        } } });
        return [
            [r.appels.updateMember.length, 0, 'écritures'],
            [r.navigations.length, 1, 'redirection'],
        ];
    }],
    ['durée de l\'offre lue dans INSCRIPTION_CONFIG', async () => {
        const r = await jouer({ config: { dureeOffre: 'Compte 3 mois' } });
        return [[r.appels.updateMember[0] && r.appels.updateMember[0]['duree-de-loffre'], 'Compte 3 mois', 'durée écrite']];
    }],
    ['visiteur déconnecté : le clic reste à Memberstack', async () => {
        const r = await jouer({ connecte: false });
        return [
            [r.appels.addPlan.length, 0, 'addPlan'],
            [r.clicMemberstack, 1, 'clic transmis à Memberstack'],
        ];
    }],
    ['échec de l\'ajout du plan : rien n\'est écrit, message d\'erreur, pas de départ', async () => {
        const r = await jouer({ echecPlan: true });
        return [
            [r.appels.updateMember.length, 0, 'écritures'],
            [JSON.stringify(r.appels.messages), JSON.stringify([['Plan refusé', true]]), 'message'],
            [r.navigations.length, 0, 'redirection'],
        ];
    }],
    ['échec de l\'écriture : départ quand même, erreur signalée, clés conservées', async () => {
        const r = await jouer({ echecEcriture: true });
        return [
            [r.navigations.length, 1, 'redirection'],
            [r.appels.rapports.length, 1, 'rapport d\'erreur'],
            [r.cleType, 'x', 'clés conservées'],
        ];
    }],
    ['double clic : le plan n\'est ajouté qu\'une fois', async () => {
        const r = await jouer({ doubleClic: true });
        return [[r.appels.addPlan.length, 1, 'addPlan']];
    }],
    ['pas de redirection dans la réponse : message de succès puis rechargement', async () => {
        const r = await jouer({ redirect: null });
        return [[JSON.stringify(r.appels.messages), JSON.stringify([['Offre activée', false]]), 'message de succès']];
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
