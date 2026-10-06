#!/usr/bin/env node
/**
 * Page /preferences-email : le code d'en-tête (preferences-email/head.html).
 *
 * Ce qui doit tenir :
 *   - la clé du lien quitte la barre d'adresse et passe en sessionStorage ;
 *   - la lecture des préférences part tout de suite, en requête simple
 *     (text/plain, sans Authorization), avec la clé du lien, sinon la session
 *     Memberstack lue comme getMemberCookie (localStorage, puis cookie décodé) ;
 *   - sans clé ni session : aucun appel ;
 *   - un stockage refusé (navigation privée) n'empêche ni l'effacement du
 *     fragment ni la lecture ;
 *   - preferences.js reprend la lecture lancée ici au lieu d'en refaire une.
 *
 * Usage : node test/preferences-email-head.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HEAD = fs.readFileSync(path.join(ROOT, 'preferences-email/head.html'), 'utf8');
const SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(HEAD)[1];
const PAGE_JS = fs.readFileSync(path.join(ROOT, 'preferences-email/preferences.js'), 'utf8');
const CLE = 'Ab3dEf6hIj9kLm2nOp5qRs';

let echecs = 0;
function verifier(nom, ok, detail) {
  if (ok) console.log('ok   ' + nom);
  else { echecs++; console.log('ÉCHEC ' + nom + (detail === undefined ? '' : ' → ' + JSON.stringify(detail))); }
}

function jouer({ hash = '', cookie = null, local = null, session = null, stockageRefuse = false }) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main><div id="ordotype-email-preferences"></div></main></body></html>',
    { url: 'https://www.ordotype.fr/preferences-email' + hash, runScripts: 'outside-only' });
  const w = dom.window;
  if (cookie) w.document.cookie = '_ms-mid=' + cookie;
  if (local) w.localStorage.setItem('_ms-mid', local);
  if (session) w.sessionStorage.setItem('ordo-email-prefs-key', session);
  if (stockageRefuse) {
    Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
    Object.defineProperty(w, 'localStorage', { get() { throw new Error('SecurityError'); } });
  }
  const appels = [];
  w.fetch = (url, opts) => {
    appels.push({ url, opts, corps: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ email: 'c•••n@exemple.fr', prefs: { newsletter: true, onboarding: false, offers: true }, unsubscribedAll: false }) });
  };
  w.console = { log() {}, warn() {}, error() {} };
  w.eval(SCRIPT);
  return { w, appels };
}

(async () => {
  verifier('en-tête : noindex et préconnexion', /name="robots" content="noindex, nofollow"/.test(HEAD)
    && /rel="preconnect" href="https:\/\/webhooks\.ordotype\.fr" crossorigin/.test(HEAD));

  let r = jouer({ hash: '#c=' + CLE });
  verifier('clé du lien : fragment effacé', r.w.location.href === 'https://www.ordotype.fr/preferences-email', r.w.location.href);
  verifier('clé du lien : rangée en session', r.w.sessionStorage.getItem('ordo-email-prefs-key') === CLE);
  verifier('clé du lien : lecture lancée tout de suite, avec la clé', r.appels.length === 1 && r.appels[0].corps.key === CLE && !('token' in r.appels[0].corps));
  verifier('requête simple : text/plain, sans Authorization, sans cookie', /^text\/plain/.test(r.appels[0].opts.headers['Content-Type'])
    && !r.appels[0].opts.headers.Authorization && r.appels[0].opts.credentials === 'omit' && r.appels[0].opts.method === 'POST');
  const lu = await r.w.__ordoPrefsPrefetch.promise;
  verifier('lecture anticipée exposée : corps et réponse', r.w.__ordoPrefsPrefetch.body.key === CLE && lu.status === 200 && lu.payload.prefs.onboarding === false, lu);

  r = jouer({ session: CLE });
  verifier('rechargement : clé reprise de la session', r.appels.length === 1 && r.appels[0].corps.key === CLE);

  r = jouer({ local: 'tok_local', cookie: 'tok_cookie' });
  verifier('sans clé : session Memberstack du localStorage d\'abord', r.appels.length === 1 && r.appels[0].corps.token === 'tok_local');
  r = jouer({ cookie: encodeURIComponent('a.b=c') });
  verifier('sans clé : cookie _ms-mid décodé', r.appels.length === 1 && r.appels[0].corps.token === 'a.b=c', r.appels[0] && r.appels[0].corps);

  r = jouer({});
  verifier('ni clé ni session : aucun appel, rien d\'exposé', r.appels.length === 0 && r.w.__ordoPrefsPrefetch === undefined);

  r = jouer({ hash: '#c=pas-une-cle' });
  verifier('clé mal formée : ignorée, aucun appel', r.appels.length === 0);

  r = jouer({ hash: '#c=' + CLE, stockageRefuse: true });
  verifier('stockage refusé : fragment quand même effacé', r.w.location.href === 'https://www.ordotype.fr/preferences-email', r.w.location.href);
  verifier('stockage refusé : lecture quand même lancée', r.appels.length === 1 && r.appels[0].corps.key === CLE);

  // De bout en bout : le script de page reprend la lecture lancée par l'en-tête.
  r = jouer({ hash: '#c=' + CLE });
  r.w.OrdoErrorReporter = { track() {}, report() {}, reportNetwork() {} };
  r.w.eval(PAGE_JS);
  await new Promise((ok) => setTimeout(ok, 30));
  const etat = ['newsletter', 'onboarding', 'offers'].map((k) => r.w.document.querySelector('[data-ordo-pref="' + k + '"]').getAttribute('aria-checked')).join(',');
  verifier('en-tête + page : un seul appel au total, cases affichées', r.appels.length === 1 && etat === 'true,false,true', { appels: r.appels.length, etat });

  console.log(echecs ? `\n${echecs} échec(s)` : '\npreferences-email-head : tout passe');
  process.exit(echecs ? 1 : 0);
})();
