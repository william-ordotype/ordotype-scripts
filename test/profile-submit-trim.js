#!/usr/bin/env node
/**
 * Spécialité, prénom et nom : Memberstack lit déjà la valeur rognée à l'envoi.
 *
 * Avant : une option avec une espace finale, ou un prénom suivi d'une espace,
 * partait tel quel.
 *
 * Ce qui doit tenir :
 *   - la valeur lue par Memberstack est rognée, que son écouteur ait été posé
 *     avant ou après le script (capture sur le document) ;
 *   - au chargement, aucune option n'est touchée : un membre dont la valeur
 *     enregistrée garde l'espace retrouve son option au pré-remplissage ;
 *   - seule l'option choisie est rognée, à l'envoi ; le libellé ne change pas ;
 *   - `trim()`, rien si la valeur rognée est vide, espaces intérieurs et
 *     casse laissés ;
 *   - un formulaire hors Memberstack, ou un autre champ, n'est pas touché ;
 *   - une erreur ne bloque pas l'envoi et n'est signalée qu'une fois.
 *
 * Usage : node test/profile-submit-trim.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'shared/profile-submit-trim.js'), 'utf8');

// Liste d'exemple : des options en double, l'une des deux avec une espace finale.
const OPTIONS = ['', 'Médecine générale', 'Allergologie', 'Autre ', 'Médecine générale ', 'Psychiatrie', 'Autre'];

function page({ specialite = '', prnom = 'Marie', nom = 'Dupont', comment = '' } = {}) {
    const erreurs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => erreurs.push(e.message));
    const dom = new JSDOM(`<!doctype html><body>
        <form id="profil" data-ms-form="profile">
          <input data-ms-member="prnom">
          <input data-ms-member="nom">
          <select data-ms-member="specialite"></select>
          <textarea data-ms-member="comment"></textarea>
        </form>
        <form id="hors-memberstack"><input data-ms-member="prnom"></form>
    </body>`, { url: 'https://www.ordotype.fr/membership/mes-informations', runScripts: 'outside-only', virtualConsole });
    const w = dom.window;
    w.console.warn = () => {};
    const d = w.document;
    const form = d.getElementById('profil');
    const select = form.querySelector('select');
    OPTIONS.forEach((v) => {
        const o = d.createElement('option');
        o.value = v;
        o.textContent = v || 'Sélectionnez votre spécialité';
        select.appendChild(o);
    });

    const signales = [];
    w.OrdoErrorReporter = { report: (ctx, err) => signales.push(`${ctx}: ${err && err.message}`) };

    // Memberstack, script v2 : lecture synchrone de tous les champs, puis arrêt.
    const lectures = [];
    const memberstack = (quand) => (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const lu = {};
        ev.currentTarget.querySelectorAll('[data-ms-member]').forEach((el) => { lu[el.getAttribute('data-ms-member')] = el.value; });
        lectures.push({ quand, lu });
    };
    form.addEventListener('submit', memberstack('avant'));

    // Pré-remplissage Memberstack : valeur enregistrée posée telle quelle.
    form.querySelector('[data-ms-member="prnom"]').value = prnom;
    form.querySelector('[data-ms-member="nom"]').value = nom;
    form.querySelector('[data-ms-member="comment"]').value = comment;
    select.value = specialite;

    w.eval(SCRIPT);
    form.addEventListener('submit', memberstack('apres'));

    return {
        w, d, form, select, lectures, erreurs, signales,
        champ: (k) => form.querySelector(`[data-ms-member="${k}"]`),
        valeursOptions: () => Array.from(select.options).map((o) => o.value),
        envoyer(cible = form) {
            lectures.length = 0;
            cible.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
            return lectures;
        },
    };
}

const lu = (p, cle) => {
    const l = p.envoyer();
    const valeurs = l.map((x) => x.lu[cle]);
    return valeurs.length === 2 && valeurs[0] === valeurs[1] ? valeurs[0] : `lectures incohérentes ${JSON.stringify(valeurs)}`;
};

const CAS = [
    ['valeur enregistrée avec espace : son option est toujours pré-remplie, rien touché au chargement', () => {
        const p = page({ specialite: 'Médecine générale ' });
        return [
            [p.select.selectedIndex, 4, 'option pré-remplie (celle avec espace)'],
            [JSON.stringify(p.valeursOptions()), JSON.stringify(OPTIONS), 'options intactes au chargement'],
        ];
    }],
    ['valeur enregistrée avec espace : Memberstack lit la valeur rognée', () => {
        const p = page({ specialite: 'Médecine générale ' });
        return [[lu(p, 'specialite'), 'Médecine générale', 'spécialité lue']];
    }],
    ['« Autre » avec espace choisi : envoyé rogné, libellé inchangé', () => {
        const p = page();
        p.select.selectedIndex = 3;
        const v = lu(p, 'specialite');
        return [
            [v, 'Autre', 'spécialité lue'],
            [p.select.options[3].textContent, 'Autre ', 'libellé affiché'],
            [p.select.selectedIndex, 3, 'option toujours choisie'],
        ];
    }],
    ['seule l option choisie est rognée', () => {
        const p = page({ specialite: 'Médecine générale ' });
        p.envoyer();
        const attendu = OPTIONS.slice();
        attendu[4] = 'Médecine générale';
        return [[JSON.stringify(p.valeursOptions()), JSON.stringify(attendu), 'options après envoi']];
    }],
    ['option déjà propre : rien ne change', () => {
        const p = page({ specialite: 'Psychiatrie' });
        return [
            [lu(p, 'specialite'), 'Psychiatrie', 'spécialité lue'],
            [JSON.stringify(p.valeursOptions()), JSON.stringify(OPTIONS), 'options intactes'],
        ];
    }],
    ['après l enregistrement, la valeur rognée se pré-remplit', () => {
        const p = page({ specialite: 'Médecine générale ' });
        p.envoyer();
        p.select.value = 'Médecine générale'; // Memberstack, avec la valeur enregistrée
        return [[p.select.value, 'Médecine générale', 'valeur affichée']];
    }],
    ['prénom et nom : espaces de bord retirés', () => {
        const p = page({ prnom: '  Marie ', nom: 'Dupont ' });
        const l = p.envoyer()[0].lu;
        return [[l.prnom, 'Marie', 'prénom lu'], [l.nom, 'Dupont', 'nom lu']];
    }],
    ['prénom et nom : casse et espaces intérieurs laissés', () => {
        const p = page({ prnom: 'jean  pierre ', nom: 'de la FONTAINE' });
        const l = p.envoyer()[0].lu;
        return [[l.prnom, 'jean  pierre', 'prénom lu'], [l.nom, 'de la FONTAINE', 'nom lu']];
    }],
    ['valeur faite d espaces seuls : laissée', () => {
        const p = page({ prnom: '   ' });
        return [[lu(p, 'prnom'), '   ', 'prénom lu']];
    }],
    ['autre champ : non touché', () => {
        const p = page({ comment: ' note ' });
        return [[lu(p, 'comment'), ' note ', 'commentaire lu']];
    }],
    ['formulaire hors Memberstack : non touché', () => {
        const p = page();
        const autre = p.d.getElementById('hors-memberstack');
        autre.addEventListener('submit', (e) => e.preventDefault());
        autre.querySelector('input').value = ' Marie ';
        p.envoyer(autre);
        return [[autre.querySelector('input').value, ' Marie ', 'valeur']];
    }],
    ['erreur : l envoi continue, signalée une seule fois', () => {
        const p = page({ specialite: 'Autre ' });
        // Seul notre script lit `options` : Memberstack, lui, lit `value`.
        Object.defineProperty(p.select, 'options', { get() { throw new Error('cassé'); } });
        p.envoyer();
        p.envoyer();
        return [
            [p.lectures.length, 2, 'Memberstack a lu'],
            [p.signales.length, 1, 'signalements'],
            [p.erreurs.length, 0, `erreurs ${p.erreurs.join(' | ')}`],
        ];
    }],
];

let echecs = 0;
for (const [nom, cas] of CAS) {
    let verifs;
    try {
        verifs = cas();
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
