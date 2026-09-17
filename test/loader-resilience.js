#!/usr/bin/env node
/**
 * Chargeurs : nos scripts s'exécutent dans l'ordre et un fichier en erreur est
 * sauté ; la bibliothèque tierce du champ téléphone ne retient jamais la page.
 *
 * Le navigateur est simulé : un script `async = false` s'exécute dans l'ordre
 * d'insertion, un script en erreur est retiré de la file, un script muet la
 * bloque. L'horloge est virtuelle, les délais de 15 s ne coûtent rien.
 *
 * Usage : node test/loader-resilience.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const REPO = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@';
const CRISP_REPO = 'https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/';
const CDNJS = 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/';
const LIB = 'cdnjs:js/intlTelInput.min.js';
const CSS = 'cdnjs:css/intlTelInput.min.css';

const CHARGEURS = {
    accueil: {
        fichier: 'homepage/loader.js',
        balise: `${REPO}abc1234/homepage/loader.js`,
        ordre: ['shared/memberstack-utils.js', 'shared/error-reporter.js', 'homepage/core.js', 'homepage/countdown.js', 'homepage/member-redirects.js', 'homepage/cgu-modal.js'],
        telephone: 'mes-informations/phone-input.js',
    },
    compte: {
        fichier: 'account/loader.js',
        balise: `${REPO}abc1234/account/loader.js`,
        ordre: ['shared/memberstack-utils.js', 'shared/error-reporter.js', 'account/styles.js', 'account/core.js', 'account/subscriptions.js', 'account/session-stats-prefetch.js', 'account/pause-state.js', 'account/tab-hash.js', 'account/status-selectors.js', 'account/delete-account.js', 'account/billing-portal.js'],
        telephone: 'account/phone-input.js',
    },
    'mes-informations': {
        fichier: 'mes-informations/loader.js',
        courant: `${REPO}abc1234/mes-informations/loader.js`,
        config: { enableCheckout: true, enablePartnershipCity: true },
        ordre: ['shared/memberstack-utils.js', 'shared/error-reporter.js', 'mes-informations/styles.js', 'mes-informations/core.js', 'mes-informations/rpps.js', 'mes-informations/memberstack-sync.js', 'mes-informations/statut-selectors.js', 'mes-informations/required-if-visible.js', 'mes-informations/ga4-events.js', 'mes-informations/checkout.js', 'mes-informations/partnership-city.js'],
        telephone: 'mes-informations/phone-input.js',
        crisp: 'shared/crisp-loader.js',
    },
    'mes-informations-cms': {
        fichier: 'mes-informations-cms/loader.js',
        ordre: ['shared/error-reporter.js', 'mes-informations-cms/statut-options.js', 'mes-informations-cms/statut-selectors.js', 'mes-informations-cms/rpps-handler.js', 'mes-informations-cms/memberstack-sync.js', 'mes-informations-cms/required-if-visible.js', 'mes-informations-cms/location-store.js'],
        telephone: 'mes-informations/phone-input.js',
        crisp: 'crisp:crisp-loader.js',
    },
};

/** URL -> nom court : chemin dans le dépôt, `crisp:` ou `cdnjs:`. */
function nom(url) {
    if (url.startsWith(REPO)) return url.slice(REPO.length).replace(/^[^/]+\//, '');
    if (url.startsWith(CRISP_REPO)) return 'crisp:' + url.slice(CRISP_REPO.length);
    if (url.startsWith(CDNJS)) return 'cdnjs:' + url.slice(CDNJS.length);
    return url;
}

/**
 * Rejoue un chargeur. `reseau[nom] = { issue: 'ok' | 'erreur' | 'muet', delai }`,
 * 10 ms et 'ok' par défaut.
 */
async function rejouer(cle, { reseau = {}, config } = {}) {
    const def = CHARGEURS[cle];
    const dom = new JSDOM('<!doctype html><head></head><body></body>', {
        url: 'https://exemple.test/page',
        runScripts: 'outside-only',
        virtualConsole: new VirtualConsole(),
    });
    const w = dom.window;

    let maintenant = 0;
    let numero = 0;
    const minuteries = new Map();
    w.setTimeout = (fn, ms) => { numero += 1; minuteries.set(numero, { quand: maintenant + (ms || 0), fn, n: numero }); return numero; };
    w.clearTimeout = (id) => { minuteries.delete(id); };

    if (def.balise) {
        const balise = w.document.createElement('script');
        balise.src = def.balise;
        w.document.head.appendChild(balise);
    }
    Object.defineProperty(w.document, 'currentScript', { configurable: true, get: () => (def.courant ? { src: def.courant } : null) });
    w.MES_INFOS_CONFIG = config === undefined ? def.config : config;

    const journal = [];
    const rapports = [];
    const file = [];

    function executer(el, n) {
        journal.push({ quoi: 'execute', n, t: maintenant });
        if (n === 'shared/error-reporter.js') {
            w.OrdoErrorReporter = { reportNetwork: (ctx, err) => rapports.push(`${ctx}: ${err.message}`) };
        }
        if (n === LIB) w.intlTelInput = function() {};
        if (n === def.telephone) journal.push({ quoi: 'telephone', bibliotheque: !!w.intlTelInput });
        if (el.onload) el.onload();
    }

    function vider() {
        while (file.length && file[0].etat !== 'attente') {
            const tete = file.shift();
            if (tete.etat === 'erreur') {
                if (tete.el.onerror) tete.el.onerror();
            } else {
                executer(tete.el, tete.n);
            }
        }
    }

    w.document.head.appendChild = (el) => {
        const n = nom(el.src || el.href);
        const { issue = 'ok', delai = 10 } = reseau[n] || {};
        journal.push({ quoi: 'ajout', n, async: el.async, t: maintenant });
        if (el.tagName === 'LINK') {
            if (issue !== 'muet') w.setTimeout(() => (issue === 'erreur' ? el.onerror && el.onerror() : el.onload && el.onload()), delai);
        } else if (el.async === false) {
            const entree = { el, n, etat: 'attente' };
            file.push(entree);
            if (issue !== 'muet') w.setTimeout(() => { entree.etat = issue === 'erreur' ? 'erreur' : 'pret'; vider(); }, delai);
        } else if (issue !== 'muet') {
            w.setTimeout(() => (issue === 'erreur' ? el.onerror && el.onerror() : executer(el, n)), delai);
        }
        return el;
    };

    w.eval(lire(def.fichier));

    // Jusqu'au repos : plus aucune minuterie avant 10 minutes virtuelles.
    for (;;) {
        await new Promise((r) => setImmediate(r));
        const prochaine = [...minuteries.values()].sort((a, b) => a.quand - b.quand || a.n - b.n)[0];
        if (!prochaine || prochaine.quand > 600000) break;
        minuteries.delete(prochaine.n);
        maintenant = Math.max(maintenant, prochaine.quand);
        prochaine.fn();
    }
    w.close();

    const executes = journal.filter((e) => e.quoi === 'execute').map((e) => e.n);
    const indice = (n) => executes.indexOf(n);
    return {
        def,
        journal,
        rapports,
        executes,
        indice,
        propres: executes.filter((n) => def.ordre.includes(n)),
        telephone: journal.filter((e) => e.quoi === 'telephone'),
        ajoute: (n) => journal.some((e) => e.quoi === 'ajout' && e.n === n),
        instant: (n) => (journal.find((e) => e.quoi === 'execute' && e.n === n) || {}).t,
    };
}

const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CAS = [
    ['bloc de file identique dans les 4 chargeurs', async () => {
        const bloc = (src) => {
            const debut = src.indexOf('// --- Loader queue');
            const fin = src.indexOf('// --- End of loader queue ---');
            return debut !== -1 && fin > debut ? src.slice(debut, fin) : null;
        };
        const blocs = Object.values(CHARGEURS).map((d) => bloc(lire(d.fichier)));
        return [
            [blocs.every(Boolean), true, 'bloc présent partout'],
            [blocs.every((b) => b === blocs[0]), true, 'bloc identique'],
        ];
    }],
];

for (const cle of Object.keys(CHARGEURS)) {
    const p = `[${cle}]`;
    CAS.push(
        [`${p} tout va bien : nos scripts dans l'ordre, puis le champ téléphone, aucun rapport`, async () => {
            const r = await rejouer(cle);
            const dernier = r.def.ordre[r.def.ordre.length - 1];
            return [
                [egal(r.propres, r.def.ordre), true, `ordre ${r.propres.join(', ')}`],
                [r.journal.filter((e) => e.quoi === 'ajout' && r.def.ordre.includes(e.n)).every((e) => e.async === false), true, 'nos scripts en async = false'],
                [r.telephone.length, 1, 'phone-input exécuté une fois'],
                [r.telephone.length === 1 && r.telephone[0].bibliotheque, true, 'bibliothèque déjà là'],
                [r.indice(r.def.telephone) > r.indice(dernier), true, 'après le dernier de nos scripts'],
                [r.rapports.length, 0, 'aucun rapport'],
            ];
        }],
        [`${p} un de nos scripts en erreur : sauté, les suivants tournent, un rapport`, async () => {
            const cible = CHARGEURS[cle].ordre[3];
            const r = await rejouer(cle, { reseau: { [cible]: { issue: 'erreur' } } });
            return [
                [egal(r.propres, r.def.ordre.filter((n) => n !== cible)), true, `exécutés ${r.propres.join(', ')}`],
                [r.rapports.length === 1 && r.rapports[0].includes(cible), true, `rapports ${r.rapports.join(' | ')}`],
                [r.telephone.length, 1, 'phone-input exécuté'],
            ];
        }],
        [`${p} premier script en erreur, avant le rapporteur : signalé une fois la file finie`, async () => {
            const cible = CHARGEURS[cle].ordre[0] === 'shared/error-reporter.js' ? CHARGEURS[cle].ordre[1] : CHARGEURS[cle].ordre[0];
            const r = await rejouer(cle, { reseau: { [cible]: { issue: 'erreur', delai: 1 }, 'shared/error-reporter.js': { delai: 50 } } });
            return [[r.rapports.length === 1 && r.rapports[0].includes(cible), true, `rapports ${r.rapports.join(' | ')}`]];
        }],
        [`${p} bibliothèque en erreur : tout le reste tourne, pas de phone-input, un rapport`, async () => {
            const r = await rejouer(cle, { reseau: { [LIB]: { issue: 'erreur', delai: 1 } } });
            return [
                [egal(r.propres, r.def.ordre), true, 'nos scripts tous exécutés'],
                [r.ajoute(r.def.telephone), false, 'phone-input non demandé'],
                [r.rapports.length === 1 && r.rapports[0].includes('intlTelInput'), true, `rapports ${r.rapports.join(' | ')}`],
            ];
        }],
        [`${p} bibliothèque muette : tout le reste tourne, un rapport de délai, pas de phone-input`, async () => {
            const r = await rejouer(cle, { reseau: { [LIB]: { issue: 'muet' } } });
            return [
                [egal(r.propres, r.def.ordre), true, 'nos scripts tous exécutés'],
                [r.instant(r.def.ordre[r.def.ordre.length - 1]) < 1000, true, 'sans attendre la bibliothèque'],
                [r.ajoute(r.def.telephone), false, 'phone-input non demandé'],
                [r.rapports.length === 1 && r.rapports[0].includes('Timed out'), true, `rapports ${r.rapports.join(' | ')}`],
            ];
        }],
        [`${p} bibliothèque en retard (20 s) : rapport de délai, puis phone-input quand elle arrive`, async () => {
            const r = await rejouer(cle, { reseau: { [LIB]: { delai: 20000 } } });
            return [
                [r.telephone.length === 1 && r.telephone[0].bibliotheque, true, 'phone-input après la bibliothèque'],
                [r.instant(r.def.telephone) >= 20000, true, 'au plus tôt à son arrivée'],
                [r.rapports.length === 1 && r.rapports[0].includes('Timed out'), true, `rapports ${r.rapports.join(' | ')}`],
            ];
        }],
        [`${p} nos scripts lents (20 s), bibliothèque rapide : phone-input attend la file, pas de faux rapport`, async () => {
            const dernier = CHARGEURS[cle].ordre[CHARGEURS[cle].ordre.length - 1];
            const r = await rejouer(cle, { reseau: { [dernier]: { delai: 20000 } } });
            return [
                [r.indice(r.def.telephone) > r.indice(dernier), true, 'phone-input après le dernier script'],
                [r.rapports.length, 0, 'aucun rapport'],
            ];
        }],
        [`${p} feuille de style muette ou en erreur : phone-input ne l'attend pas, aucun rapport`, async () => {
            const muette = await rejouer(cle, { reseau: { [CSS]: { issue: 'muet' } } });
            const erreur = await rejouer(cle, { reseau: { [CSS]: { issue: 'erreur' } } });
            return [
                [muette.telephone.length === 1 && muette.instant(muette.def.telephone) < 1000, true, 'muette : phone-input tout de suite'],
                [erreur.telephone.length, 1, 'erreur : phone-input exécuté'],
                [muette.rapports.length + erreur.rapports.length, 0, 'aucun rapport'],
            ];
        }],
        [`${p} phone-input.js en erreur : un rapport`, async () => {
            const r = await rejouer(cle, { reseau: { [CHARGEURS[cle].telephone]: { issue: 'erreur' } } });
            return [[r.rapports.length === 1 && r.rapports[0].includes('phone-input.js'), true, `rapports ${r.rapports.join(' | ')}`]];
        }],
    );
    if (CHARGEURS[cle].crisp) {
        CAS.push([`${p} Crisp muet ou en erreur : ne retient rien`, async () => {
            const muet = await rejouer(cle, { reseau: { [CHARGEURS[cle].crisp]: { issue: 'muet' } } });
            const erreur = await rejouer(cle, { reseau: { [CHARGEURS[cle].crisp]: { issue: 'erreur' } } });
            return [
                [muet.ajoute(CHARGEURS[cle].crisp), true, 'Crisp demandé'],
                [egal(muet.propres, muet.def.ordre) && muet.telephone.length === 1, true, 'muet : tout tourne'],
                [egal(erreur.propres, erreur.def.ordre) && erreur.telephone.length === 1, true, 'erreur : tout tourne'],
            ];
        }]);
    }
}

CAS.push(['[mes-informations] sans config : ni checkout ni ville partenaire', async () => {
    const r = await rejouer('mes-informations', { config: {} });
    return [
        [r.ajoute('mes-informations/checkout.js') || r.ajoute('mes-informations/partnership-city.js'), false, 'non demandés'],
        [egal(r.propres, CHARGEURS['mes-informations'].ordre.slice(0, -2)), true, 'le reste dans l\'ordre'],
    ];
}]);

const rejets = [];
process.on('unhandledRejection', (e) => rejets.push(e && e.message));

(async () => {
    let echecs = 0;
    let verifs = 0;
    for (const [nomCas, cas] of CAS) {
        let resultats;
        try {
            resultats = await cas();
        } catch (e) {
            echecs += 1;
            console.log(`  ECHEC  ${nomCas} : exception ${e.message}`);
            continue;
        }
        verifs += resultats.length;
        const ko = resultats.filter(([obtenu, attendu]) => obtenu !== attendu);
        if (ko.length) {
            echecs += 1;
            console.log(`  ECHEC  ${nomCas} : ${ko.map(([o, a, quoi]) => `${quoi} (obtenu ${o}, attendu ${a})`).join(' ; ')}`);
        } else {
            console.log(`  ok     ${nomCas}`);
        }
    }
    if (rejets.length) {
        echecs += 1;
        console.log(`  ECHEC  rejets non gérés : ${rejets.length} (${rejets[0]})`);
    }
    console.log(echecs ? `\n${echecs} cas en échec sur ${CAS.length}.` : `\n${CAS.length} cas, ${verifs} vérifications OK.`);
    process.exit(echecs ? 1 : 0);
})();
