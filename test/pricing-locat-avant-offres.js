#!/usr/bin/env node
/**
 * Une page d'offres devient la page de retour après connexion (`locat`) : un
 * abonné déconnecté qui passait d'une fiche aux offres, puis se connectait,
 * revenait sur les prix au lieu de sa fiche (348 fois en 90 jours, GA4). La
 * page d'offres garde donc la page qu'elle remplace dans `locatBeforeOffers`,
 * que /membership/successful-login relit pour un membre déjà abonné.
 *
 * Ce qui doit tenir, sur chaque copie du fichier :
 *   - venant d'une fiche : la fiche est gardée, `locat` devient la page d'offres ;
 *   - venant d'une autre page d'offres (rechargement, onglet, /abonnement/…,
 *     /inscription/…) : la page gardée ne change pas ;
 *   - sans `locat` : rien n'est gardé, `locat` est quand même posé ;
 *   - stockage qui refuse (Safari privé) : aucune erreur ne remonte ;
 *   - la liste des pages d'offres est la même dans toutes les copies.
 *
 * Usage : node test/pricing-locat-avant-offres.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = ['pricing/core.js', 'pricing-v2/core.js'];
const ORIGINE = 'https://www.ordotype.fr';

function stockage(initial, refuse) {
    const donnees = Object.assign({}, initial);
    return {
        donnees,
        getItem(k) {
            if (refuse) throw new Error('SecurityError');
            return Object.prototype.hasOwnProperty.call(donnees, k) ? donnees[k] : null;
        },
        setItem(k, v) {
            if (refuse) throw new Error('QuotaExceededError');
            donnees[k] = String(v);
        },
    };
}

function lancer(source, page, initial, refuse) {
    const ls = stockage(initial, refuse);
    const url = new URL(page, ORIGINE);
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, source), 'utf8'), {
        localStorage: ls,
        location: { href: url.href, origin: url.origin, pathname: url.pathname },
        URL,
        console: { log() {} },
    });
    return ls.donnees;
}

const listes = SOURCES.map((s) => /OFFER_PATH = (\/.*\/);/.exec(fs.readFileSync(path.join(ROOT, s), 'utf8')));
listes.forEach((l, i) => assert.ok(l, `${SOURCES[i]} : liste OFFER_PATH introuvable`));
assert.strictEqual(new Set(listes.map((l) => l[1])).size, 1, 'les copies doivent porter la même liste OFFER_PATH');

for (const source of SOURCES) {
    const fiche = `${ORIGINE}/pathologies/cystite?tab=traitements`;

    let d = lancer(source, '/nos-offres', { locat: fiche });
    assert.strictEqual(d.locatBeforeOffers, fiche, `${source} : la fiche doit être gardée`);
    assert.strictEqual(d.locat, `${ORIGINE}/nos-offres`, `${source} : locat doit devenir la page d'offres`);

    for (const offre of ['/nos-offres', '/nos-offres-v2', '/nos-offres-belgique', '/abonnement/maroc', '/inscription/praticien-1-mois-offert-sepa']) {
        d = lancer(source, '/nos-offres', { locat: ORIGINE + offre, locatBeforeOffers: fiche });
        assert.strictEqual(d.locatBeforeOffers, fiche, `${source} : venant de ${offre}, la fiche gardée ne doit pas changer`);
    }

    d = lancer(source, '/nos-offres', { locat: '/specialites' });
    assert.strictEqual(d.locatBeforeOffers, '/specialites', `${source} : un chemin relatif est gardé tel quel`);

    d = lancer(source, '/nos-offres', {});
    assert.strictEqual(d.locatBeforeOffers, undefined, `${source} : sans locat, rien n'est gardé`);
    assert.strictEqual(d.locat, `${ORIGINE}/nos-offres`, `${source} : sans locat, locat est quand même posé`);

    assert.doesNotThrow(() => lancer(source, '/nos-offres', { locat: fiche }, true), `${source} : stockage refusé`);
}

console.log('pricing-locat-avant-offres : OK');
