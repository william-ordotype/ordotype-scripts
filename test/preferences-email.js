#!/usr/bin/env node
/**
 * Page /preferences-email : les trois interrupteurs marketing.
 *
 * Ce qui doit tenir :
 *   - la clé du lien part dans le corps, en `text/plain` et sans en-tête
 *     Authorization (requête simple, pas de requête préalable CORS), puis
 *     disparaît de la barre d'adresse et reste en session ;
 *   - une clé inconnue retombe sur le compte connecté, sinon propose la connexion ;
 *   - « Enregistrer » envoie l'état des trois interrupteurs, « Ne plus recevoir
 *     aucun e-mail marketing » les trois éteints ;
 *   - le bandeau « plus aucun e-mail marketing » suit l'état rendu par le serveur ;
 *   - une adresse piégée ne s'injecte pas dans la page ;
 *   - un code attendu (404, 401, 429) n'est pas signalé comme un incident.
 *
 * Usage : node test/preferences-email.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'preferences-email/preferences.js'), 'utf8');
const PAGE = '<!doctype html><html><head></head><body><main><div id="ordotype-email-preferences"></div></main></body></html>';
const CLE = 'Ab3dEf6hIj9kLm2nOp5qRs';
const AUTRE = 'Zz9yXx8wWv7uUt6sSr5qQp';

let echecs = 0;
function verifier(nom, ok, detail) {
  if (ok) console.log('ok   ' + nom);
  else { echecs++; console.log('ÉCHEC ' + nom + (detail === undefined ? '' : ' → ' + JSON.stringify(detail))); }
}

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/**
 * `serveur(body)` rend { status, body } pour chaque appel.
 * `jeton` : ce que rend getMemberCookie (null = pas connecté).
 */
function jouer({ hash = '', serveur, jeton = null, session = null, msDom = true, cookie = null, local = null, prefetch = null }) {
  const dom = new JSDOM(PAGE, { url: 'https://www.ordotype.fr/preferences-email' + hash, runScripts: 'outside-only' });
  const w = dom.window;
  if (cookie) w.document.cookie = '_ms-mid=' + cookie;
  if (local) w.localStorage.setItem('_ms-mid', local);
  if (prefetch) w.__ordoPrefsPrefetch = prefetch;
  const appels = [];
  const evenements = [];
  if (session) w.sessionStorage.setItem('ordo-email-prefs-key', session);
  w.OrdoErrorReporter = {
    track: (p) => evenements.push(p),
    report: (a, b) => evenements.push({ report: a, msg: String(b && b.message || b) }),
    reportNetwork: (a, b) => evenements.push({ reportNetwork: a, msg: String(b && b.message || b) }),
  };
  if (msDom) w.$memberstackDom = { getMemberCookie: () => Promise.resolve(jeton) };
  w.console = { log() {}, warn() {}, error() {} };
  w.fetch = (url, opts) => {
    const corps = JSON.parse(opts.body);
    appels.push({ url, opts, corps });
    const r = serveur(corps);
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.body) });
  };
  w.eval(SOURCE);
  return { w, d: w.document, appels, evenements };
}

const interrupteur = (r, cle) => r.d.querySelector('[data-ordo-pref="' + cle + '"]');
const etat = (r) => ['newsletter', 'onboarding', 'offers'].map((k) => interrupteur(r, k).getAttribute('aria-checked')).join(',');
const texte = (r) => r.d.getElementById('ordotype-email-preferences').textContent;

(async () => {
  // --- lien valide
  let r = jouer({
    hash: '#c=' + CLE,
    serveur: (b) => (b.prefs
      ? { status: 200, body: { ok: true, email: 'c•••n@exemple.fr', prefs: b.prefs, unsubscribedAll: !b.prefs.newsletter && !b.prefs.onboarding && !b.prefs.offers, via: 'key' } }
      : { status: 200, body: { email: 'c•••n@exemple.fr', prefs: { newsletter: true, onboarding: false, offers: true }, unsubscribedAll: false, via: 'key' } }),
  });
  await attendre();
  const premier = r.appels[0];
  verifier('lien : un appel, la clé dans le corps', r.appels.length === 1 && premier.corps.key === CLE && !('token' in premier.corps), premier && premier.corps);
  verifier('lien : requête simple (text/plain, sans Authorization)',
    /^text\/plain/.test(premier.opts.headers['Content-Type']) && !premier.opts.headers.Authorization && premier.opts.method === 'POST');
  verifier('lien : fragment effacé de l\'adresse', r.w.location.hash === '' && r.w.location.href === 'https://www.ordotype.fr/preferences-email', r.w.location.href);
  verifier('lien : clé gardée en session', r.w.sessionStorage.getItem('ordo-email-prefs-key') === CLE);
  verifier('lien valide : locat pas touché', r.w.localStorage.getItem('locat') === null);
  verifier('lien : adresse masquée affichée', texte(r).includes('c•••n@exemple.fr'));
  verifier('lien : interrupteurs à l\'état du serveur', etat(r) === 'true,false,true', etat(r));
  verifier('lien : e-mails du compte verrouillés', texte(r).includes('Toujours actifs'));
  verifier('lien : pas de bandeau', !r.d.querySelector('.ordo-prefs__banner'));
  verifier('mesure : vue', r.evenements.some((e) => e.event === 'email_preferences_view' && e.email_prefs_via === 'key'));
  verifier('interrupteurs : rôle switch, libellé relié',
    interrupteur(r, 'offers').getAttribute('role') === 'switch'
    && r.d.getElementById(interrupteur(r, 'offers').getAttribute('aria-labelledby')).textContent.includes('Offres et promotions'));

  interrupteur(r, 'onboarding').click();
  interrupteur(r, 'newsletter').click();
  verifier('bascule locale sans appel', etat(r) === 'false,true,true' && r.appels.length === 1, etat(r));
  r.d.querySelector('[data-ordo-save]').click();
  await attendre();
  const sauve = r.appels[1];
  verifier('enregistrer : les trois interrupteurs envoyés avec la clé',
    sauve && sauve.corps.key === CLE && JSON.stringify(sauve.corps.prefs) === JSON.stringify({ newsletter: false, onboarding: true, offers: true }), sauve && sauve.corps);
  verifier('enregistrer : confirmation', texte(r).includes('Vos choix sont enregistrés.'));
  verifier('mesure : enregistrement', r.evenements.some((e) => e.event === 'email_preferences_save'
    && e.email_prefs_newsletter === 0 && e.email_prefs_onboarding === 1 && e.email_prefs_offers === 1));
  interrupteur(r, 'offers').click();
  verifier('basculer efface la confirmation', !texte(r).includes('Vos choix sont enregistrés.'));

  r.d.querySelector('[data-ordo-all-off]').click();
  await attendre();
  verifier('tout couper : trois éteints envoyés', JSON.stringify(r.appels[2].corps.prefs) === JSON.stringify({ newsletter: false, onboarding: false, offers: false }));
  verifier('tout couper : interrupteurs éteints et bandeau', etat(r) === 'false,false,false' && !!r.d.querySelector('.ordo-prefs__banner'));
  verifier('aucun incident signalé', !r.evenements.some((e) => e.report || e.reportNetwork), r.evenements);

  // --- rechargement : la clé vient de la session
  r = jouer({ session: CLE, serveur: () => ({ status: 200, body: { email: 'x•••@y.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false } }) });
  await attendre();
  verifier('rechargement : clé reprise de la session', r.appels.length === 1 && r.appels[0].corps.key === CLE);

  // --- désinscrit de tout au chargement
  r = jouer({ hash: '#c=' + CLE, serveur: () => ({ status: 200, body: { email: 'x•••@y.fr', prefs: { newsletter: false, onboarding: false, offers: false }, unsubscribedAll: true } }) });
  await attendre();
  verifier('déjà tout coupé : bandeau au chargement', !!r.d.querySelector('.ordo-prefs__banner') && texte(r).includes('plus aucun e-mail marketing'));

  // --- clé inconnue, pas connecté
  r = jouer({ hash: '#c=' + CLE, serveur: () => ({ status: 404, body: { error: 'unknown_key' } }) });
  await attendre();
  verifier('clé inconnue sans compte : « Ce lien n\'est plus valide »', texte(r).includes('Ce lien n’est plus valide') && !!r.d.querySelector('a[href="/membership/login-ms"]'));
  verifier('clé inconnue : oubliée de la session', r.w.sessionStorage.getItem('ordo-email-prefs-key') === null);
  verifier('clé inconnue : retour après connexion sur la page, sans la clé',
    r.w.localStorage.getItem('locat') === 'https://www.ordotype.fr/preferences-email');
  verifier('clé inconnue : pas un incident', !r.evenements.some((e) => e.report || e.reportNetwork));

  // --- clé inconnue, connecté : son compte
  r = jouer({
    hash: '#c=' + CLE,
    jeton: 'tok_ok',
    serveur: (b) => (b.key ? { status: 404, body: { error: 'unknown_key' } } : { status: 200, body: { email: 'c.martin@exemple.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false, via: 'member' } }),
  });
  await attendre();
  verifier('clé inconnue mais connecté : le compte est chargé', r.appels.length === 2 && r.appels[1].corps.token === 'tok_ok' && !('key' in r.appels[1].corps) && texte(r).includes('c.martin@exemple.fr'));

  // --- sans clé
  r = jouer({ serveur: () => ({ status: 500, body: {} }) });
  await attendre();
  verifier('sans clé ni compte : invitation à se connecter, aucun appel', r.appels.length === 0 && texte(r).includes('Gérez vos e-mails Ordotype'));
  verifier('sans clé ni compte : retour après connexion écrit', r.w.localStorage.getItem('locat') === 'https://www.ordotype.fr/preferences-email');
  r = jouer({ jeton: 'tok_ok', serveur: () => ({ status: 200, body: { email: 'c.martin@exemple.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false } }) });
  await attendre();
  verifier('connecté : jeton dans le corps', r.appels.length === 1 && r.appels[0].corps.token === 'tok_ok' && !r.appels[0].opts.headers.Authorization);
  verifier('connecté : adresse entière', texte(r).includes('c.martin@exemple.fr'));

  // --- clé mal formée dans le fragment : ignorée
  r = jouer({ hash: '#c=pas-une-cle', serveur: () => ({ status: 200, body: {} }) });
  await attendre();
  verifier('clé mal formée : ignorée, invitation à se connecter', r.appels.length === 0);

  // --- pannes
  r = jouer({ hash: '#c=' + CLE, serveur: () => ({ status: 502, body: { error: 'upstream_error' } }) });
  await attendre();
  verifier('502 au chargement : message et bouton Réessayer', texte(r).includes('n’ont pas pu être chargées') && !!r.d.querySelector('[data-ordo-retry]'));
  verifier('502 : signalé', r.evenements.some((e) => e.report === 'EmailPreferences'));
  let nAvant = r.appels.length;
  r.d.querySelector('[data-ordo-retry]').click();
  await attendre();
  verifier('Réessayer relance la lecture', r.appels.length === nAvant + 1);

  let lecture = true;
  r = jouer({
    hash: '#c=' + CLE,
    serveur: () => {
      if (lecture) { lecture = false; return { status: 200, body: { email: 'x•••@y.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false } }; }
      return { status: 429, body: { error: 'rate_limited' } };
    },
  });
  await attendre();
  interrupteur(r, 'offers').click();
  r.d.querySelector('[data-ordo-save]').click();
  await attendre();
  verifier('429 à l\'enregistrement : message, interrupteurs gardés, pas d\'incident',
    texte(r).includes('Trop de tentatives') && etat(r) === 'true,true,false' && !r.evenements.some((e) => e.report));
  verifier('boutons réactivés après l\'échec', !r.d.querySelector('[data-ordo-save]').disabled);

  // --- adresse piégée
  r = jouer({ hash: '#c=' + CLE, serveur: () => ({ status: 200, body: { email: '<img src=x onerror=alert(1)>@x.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false } }) });
  await attendre();
  verifier('adresse échappée', !r.d.querySelector('#ordotype-email-preferences img') && texte(r).includes('<img src=x'));

  // --- vitesse : session lue sans attendre Memberstack
  r = jouer({ msDom: false, cookie: encodeURIComponent('tok_cookie=='), serveur: () => ({ status: 200, body: { email: 'c.martin@exemple.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false } }) });
  await attendre();
  verifier('session lue dans le cookie _ms-mid (décodé), sans Memberstack chargé', r.appels.length === 1 && r.appels[0].corps.token === 'tok_cookie==', r.appels[0] && r.appels[0].corps);
  r = jouer({ msDom: false, local: 'tok_local', cookie: 'tok_cookie', serveur: () => ({ status: 200, body: { email: 'c.martin@exemple.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false } }) });
  await attendre();
  verifier('localStorage _ms-mid prioritaire sur le cookie (comme getMemberCookie)', r.appels.length === 1 && r.appels[0].corps.token === 'tok_local');
  r = jouer({ msDom: false, serveur: () => ({ status: 500, body: {} }) });
  await attendre(5);
  verifier('ni session ni Memberstack : invitation à se connecter tout de suite', texte(r).includes('Gérez vos e-mails Ordotype') && r.appels.length === 0);

  // --- vitesse : lecture lancée par le script de tête
  const lu = { email: 'c•••n@exemple.fr', prefs: { newsletter: false, onboarding: true, offers: true }, unsubscribedAll: false };
  r = jouer({ hash: '#c=' + CLE, prefetch: { body: { key: CLE }, promise: Promise.resolve({ status: 200, payload: lu }) }, serveur: () => ({ status: 500, body: {} }) });
  await attendre();
  verifier('lecture anticipée reprise : aucun nouvel appel, cases affichées', r.appels.length === 0 && etat(r) === 'false,true,true', etat(r));
  verifier('lecture anticipée consommée une seule fois', r.w.__ordoPrefsPrefetch === null);
  r = jouer({ hash: '#c=' + CLE, prefetch: { body: { key: AUTRE }, promise: Promise.resolve({ status: 200, payload: lu }) }, serveur: () => ({ status: 200, body: { email: 'x•••@y.fr', prefs: { newsletter: true, onboarding: true, offers: true }, unsubscribedAll: false } }) });
  await attendre();
  verifier('lecture anticipée pour une autre clé : ignorée, appel normal', r.appels.length === 1 && etat(r) === 'true,true,true');
  r = jouer({ hash: '#c=' + CLE, prefetch: { body: { key: CLE }, promise: Promise.reject(new TypeError('Failed to fetch')) }, serveur: () => ({ status: 200, body: { email: 'x•••@y.fr', prefs: { newsletter: true, onboarding: false, offers: true }, unsubscribedAll: false } }) });
  await attendre();
  verifier('lecture anticipée en panne réseau : appel normal en secours', r.appels.length === 1 && etat(r) === 'true,false,true' && !r.evenements.some((e) => e.report));
  r = jouer({ hash: '#c=' + CLE, prefetch: { body: { key: CLE }, promise: Promise.resolve({ status: 404, payload: { error: 'unknown_key' } }) }, serveur: () => ({ status: 500, body: {} }) });
  await attendre();
  verifier('lecture anticipée en 404 : clé inconnue traitée (pas de nouvel appel avec la clé)', texte(r).includes('Ce lien n’est plus valide') && r.appels.length === 0);

  console.log(echecs ? `\n${echecs} échec(s)` : '\npreferences-email : tout passe');
  process.exit(echecs ? 1 : 0);
})();
