/**
 * Ordotype - Préférences e-mail
 *
 * La page /preferences-email : trois interrupteurs pour les e-mails marketing
 * (newsletter et nouvelles recommandations, conseils de prise en main, offres et
 * promotions), et les e-mails liés au compte, affichés verrouillés.
 *
 * Deux façons d'arriver :
 *   - par le lien « Gérer mes préférences » d'un e-mail, qui porte une clé dans
 *     le fragment (`#c=<clé>`) : aucune connexion demandée ;
 *   - connecté, depuis Mon compte : le jeton Memberstack suffit.
 * Une clé inconnue retombe sur le compte connecté s'il y en a un, sinon la page
 * propose de se connecter, et y revient après la connexion (`locat`).
 *
 * 🔴 La clé ne reste pas dans la barre d'adresse : elle est rangée dans
 * sessionStorage (un rechargement la retrouve) et le fragment est effacé. Le
 * script de tête de la page (preferences-email/head.html) fait la même chose
 * plus tôt, avant le chargement des outils de mesure ; ce fichier le refait au
 * cas où.
 *
 * Vitesse : le script de tête lance aussi la lecture des préférences pendant que
 * le site charge (`window.__ordoPrefsPrefetch`), et ce fichier la reprend au lieu
 * d'en refaire une. La session du membre est lue directement dans le stockage de
 * Memberstack (même lecture que getMemberCookie), sans attendre son chargement.
 *
 * 🔴 Requête « simple » : corps JSON envoyé en `text/plain`, sans en-tête
 * Authorization. Le navigateur n'envoie donc pas de requête préalable CORS, et
 * chaque geste ne coûte qu'un appel.
 *
 * Le balisage est produit ici : la page Webflow ne porte qu'un ancrage vide
 * `<div id="ordotype-email-preferences"></div>`.
 *
 * Depends on: shared/error-reporter.js (facultatif)
 */
(function() {
  'use strict';

  var PREFIX = '[EmailPreferences]';
  var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/email-preferences';
  var ANCHOR_ID = 'ordotype-email-preferences';
  var STORAGE_KEY = 'ordo-email-prefs-key';
  var KEY_RE = /^[A-Za-z0-9]{22}$/;
  var LOGIN_URL = '/membership/login-ms';
  // Clé de la session dans memberstack.js v2 : localStorage d'abord, sinon cookie.
  var MS_TOKEN_KEY = '_ms-mid';
  var EXPECTED = [400, 401, 404, 409, 429, 503];

  var CATEGORIES = [
    {
      key: 'newsletter',
      title: 'Newsletter et nouvelles recommandations',
      text: 'Les nouvelles fiches et les mises à jour des recommandations.'
    },
    {
      key: 'onboarding',
      title: 'Conseils de prise en main',
      text: 'Quelques e-mails dans les semaines qui suivent votre inscription, pour découvrir Ordotype.'
    },
    {
      key: 'offers',
      title: 'Offres et promotions',
      text: 'Offres d’abonnement, rappel si une inscription n’a pas été finalisée, offres de retour.'
    }
  ];

  // Mise en page seulement : typographie, cartes, lignes, badges et boutons sont
  // les classes du site (charte Client-First et cartes compte-v2_* de Mon compte).
  // L'interrupteur reprend celui des factures par e-mail de Mon compte
  // (account/invoice-emails.js), sur les mêmes variables de couleur.
  var CSS = [
    '.ordo-prefs__inner{display:flex;flex-direction:column;gap:24px}',
    '.ordo-prefs__intro{display:flex;flex-direction:column;gap:12px}',
    '.ordo-prefs__lead{margin:0}',
    '.ordo-prefs__lead strong{color:var(--base-900,#0c0e16);font-weight:600;overflow-wrap:anywhere}',
    '.ordo-prefs .compte-v2_card.is-liste{padding-top:0;padding-bottom:0}',
    '.ordo-prefs .compte-v2_ligne-bloc:last-child{border-bottom:0}',
    '.ordo-prefs .compte-v2_ligne{flex-wrap:nowrap}',
    '.ordo-prefs .compte-v2_ligne-texte{flex-basis:auto}',
    '.ordo-prefs__badge{gap:6px;flex-shrink:0}',
    '.ordo-prefs__sw{position:relative;flex:0 0 auto;width:44px;height:26px;padding:0;border:0;border-radius:999px;background:var(--base-300,#0c0e164d);cursor:pointer;transition:background .2s ease}',
    '.ordo-prefs__sw[aria-checked="true"]{background:var(--primary-500,#3454f6)}',
    '.ordo-prefs__knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s ease}',
    '.ordo-prefs__sw[aria-checked="true"] .ordo-prefs__knob{transform:translateX(18px)}',
    '.ordo-prefs__sw:focus-visible{outline:2px solid var(--primary-500,#3454f6);outline-offset:2px}',
    '.ordo-prefs__sw:disabled{cursor:default;opacity:.5}',
    '.ordo-prefs__actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}',
    '.ordo-prefs__all-off{background:none;border:0;padding:0;font-family:inherit;font-size:14px;cursor:pointer}',
    '.ordo-prefs__all-off:disabled{opacity:.5;cursor:default}',
    '.ordo-prefs .button:disabled{opacity:.6;cursor:default}',
    '.ordo-prefs .compte-v2_help-text{font-size:12px;line-height:1.5}',
    '.ordo-prefs__banner{display:flex;gap:12px;align-items:flex-start;padding:16px;border-radius:4px;border:1px solid var(--base-200,#0c0e1633);background:var(--primary-50,#f0f3ff)}',
    '.ordo-prefs__status{display:flex;align-items:center;gap:8px}',
    '.ordo-prefs__status--ok{color:var(--primary-600,#263fd3);font-weight:600}',
    '.ordo-prefs__sw.is-loading{cursor:default;animation:ordo-prefs-pulse 1.2s ease-in-out infinite}',
    '.ordo-prefs__sw.is-loading .ordo-prefs__knob{visibility:hidden}',
    '@keyframes ordo-prefs-pulse{0%,100%{opacity:1}50%{opacity:.5}}',
    '.ordo-prefs>div:empty,.ordo-prefs__inner>div:empty{display:none}'
  ].join('\n');

  // Pictogrammes au trait, comme ceux des lignes de Mon compte (20 px, 1,5).
  function icon(paths) {
    return '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var ICONS = {
    compte: icon('<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>'),
    newsletter: icon('<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 9h10M7 13h10M7 17h6"></path>'),
    onboarding: icon('<circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l3 2"></path>'),
    offers: icon('<path d="M3 12V4h8l10 10-8 8L3 12z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle>')
  };
  var LOCK_SMALL = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
  var CHECK_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';

  var root = null;
  var auth = null; // { key } ou { token }
  var state = null; // { email, prefs, unsubscribedAll }
  var busy = false;

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function reportIfActionable(err) {
    if (err && EXPECTED.indexOf(err.status) !== -1) return;
    var reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    if (err && !err.status && typeof reporter.reportNetwork === 'function') {
      reporter.reportNetwork('EmailPreferences', err);
      return;
    }
    reporter.report('EmailPreferences', err);
  }

  function track(fields) {
    var reporter = window.OrdoErrorReporter;
    if (reporter && typeof reporter.track === 'function') {
      reporter.track(fields);
      return;
    }
    try {
      (window.dataLayer = window.dataLayer || []).push(fields);
    } catch (e) { /* une mesure ne casse jamais la page */ }
  }

  /** La clé du lien : prise dans le fragment, rangée en session, puis effacée de l'adresse. */
  function readKey() {
    var key = '';
    var m = /(?:^#|&)c=([A-Za-z0-9]{22})(?:&|$)/.exec(window.location.hash || '');
    if (m) {
      key = m[1];
      try { window.sessionStorage.setItem(STORAGE_KEY, key); } catch (e) { /* navigation privée */ }
      try {
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      } catch (e) { /* ancien navigateur : le fragment reste, sans conséquence côté serveur */ }
    } else {
      try { key = window.sessionStorage.getItem(STORAGE_KEY) || ''; } catch (e) { key = ''; }
    }
    return KEY_RE.test(key) ? key : '';
  }

  function forgetKey() {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* rien */ }
  }

  /** Même lecture que $memberstackDom.getMemberCookie() (memberstack.js v2), sans attendre son chargement. */
  function storedMemberToken() {
    var t = '';
    try { t = window.localStorage.getItem(MS_TOKEN_KEY) || ''; } catch (e) { t = ''; }
    if (t) return t;
    var m = new RegExp('(?:^|;\\s*)' + MS_TOKEN_KEY + '=([^;]*)').exec(document.cookie || '');
    if (!m || !m[1]) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  function memberToken() {
    var direct = storedMemberToken();
    if (direct) return Promise.resolve(direct);
    var ms = window.$memberstackDom;
    if (!ms || typeof ms.getMemberCookie !== 'function') return Promise.resolve('');
    return Promise.resolve(ms.getMemberCookie()).then(function(t) {
      return t ? String(t) : '';
    }, function() { return ''; });
  }

  function request(body) {
    return fetch(API_URL, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(payload) {
        if (!res.ok) {
          var err = new Error('email-preferences ' + res.status + ' ' + (payload.error || ''));
          err.status = res.status;
          err.code = payload.error;
          throw err;
        }
        return payload;
      });
    });
  }

  /**
   * La lecture lancée par le script de tête, si elle porte les mêmes identifiants.
   * Utilisée une seule fois. Une panne réseau (aucun statut) retombe sur une
   * lecture normale ; une réponse du serveur, même en erreur, fait foi.
   */
  function takePrefetch(body) {
    var p = window.__ordoPrefsPrefetch;
    window.__ordoPrefsPrefetch = null;
    if (!p || !p.promise || !p.body || p.body.key !== body.key || p.body.token !== body.token) return null;
    return Promise.resolve(p.promise).then(function(r) {
      if (!r || typeof r.status !== 'number') throw new Error('prefetch sans réponse');
      if (r.status < 200 || r.status >= 300) {
        var payload = r.payload || {};
        var err = new Error('email-preferences ' + r.status + ' ' + (payload.error || ''));
        err.status = r.status;
        err.code = payload.error;
        throw err;
      }
      return r.payload || {};
    }).catch(function(err) {
      if (err && err.status) throw err;
      return request(body);
    });
  }

  function withAuth(extra) {
    var body = {};
    if (auth.key) body.key = auth.key;
    else body.token = auth.token;
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) body[k] = extra[k];
    return body;
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  // Le cadre de toutes les vues : marges et largeur du site, titre de Mon compte.
  function frame(title, body) {
    return '<div class="padding-global"><div class="container-small"><div class="padding-section-compte">'
      + '<div class="ordo-prefs__inner">'
      + '<div class="ordo-prefs__intro"><h1 class="heading-h1-docs">' + title + '</h1>' + (body.intro || '') + '</div>'
      + (body.main || '')
      + '</div></div></div></div>';
  }

  // La page s'affiche tout de suite, complète : seules les positions des cases
  // attendent la réponse du serveur (démarrage à froid possible de la fonction).
  function renderSkeleton() {
    renderForm(true);
  }

  /**
   * Retour ici après la connexion : chaîne existante du site. La page de
   * connexion envoie sur /membership/successful-login (après la 2FA aussi), qui
   * relit `localStorage.locat`. L'adresse écrite n'a ni fragment ni paramètre :
   * jamais la clé d'un lien.
   */
  function rememberReturn() {
    try {
      window.localStorage.setItem('locat', window.location.origin + window.location.pathname);
    } catch (e) { /* navigation privée : le membre reviendra par Mon compte */ }
  }

  function renderSignIn(linkWasInvalid) {
    rememberReturn();
    root.innerHTML = frame(linkWasInvalid ? 'Ce lien n’est plus valide' : 'Gérez vos e-mails Ordotype', {
      intro: '<p class="ordo-prefs__lead text-size-regular text-color-base-700">Connectez-vous pour gérer vos préférences d’e-mail depuis votre compte.</p>'
        + '<p class="ordo-prefs__lead text-size-regular text-color-base-700">Pour ne plus recevoir aucun e-mail marketing sans vous connecter, utilisez le lien « Se désinscrire » en bas de nos e-mails.</p>',
      main: '<div class="ordo-prefs__actions">'
        + '<a class="button no-full-width" href="' + LOGIN_URL + '">Me connecter</a>'
        + '<a class="button is-secondary no-full-width" href="mailto:contact@ordotype.fr">Nous écrire</a>'
        + '</div>'
    });
  }

  function renderError(message) {
    root.innerHTML = frame('Vos e-mails Ordotype', {
      main: '<div class="ordo-prefs__status text-size-small text-color-error" role="alert">' + escapeHtml(message) + '</div>'
        + '<div class="ordo-prefs__actions"><button type="button" class="button no-full-width" data-ordo-retry>Réessayer</button></div>'
    });
    root.querySelector('[data-ordo-retry]').addEventListener('click', start);
  }

  function line(pictogram, id, title, text, action) {
    return '<div class="compte-v2_ligne-bloc"><div class="compte-v2_ligne">'
      + '<div class="compte-v2_picto">' + pictogram + '</div>'
      + '<div class="compte-v2_ligne-texte"' + (id ? ' id="' + id + '"' : '') + '>'
      + '<div class="compte-v2_ligne-titre">' + escapeHtml(title) + '</div>'
      + '<div class="compte-v2_muted">' + escapeHtml(text) + '</div>'
      + '</div>' + action + '</div></div>';
  }

  function rowHtml(c, on, loading) {
    var id = 'ordo-prefs-' + c.key + '-label';
    return line(ICONS[c.key], id, c.title, c.text,
      '<button type="button" role="switch" class="ordo-prefs__sw' + (loading ? ' is-loading' : '') + '" data-ordo-pref="' + c.key + '"'
      + ' aria-checked="' + (on ? 'true' : 'false') + '" aria-labelledby="' + id + '"'
      + (loading ? ' disabled aria-busy="true"' : '') + '>'
      + '<span class="ordo-prefs__knob"></span></button>');
  }

  /** `loading` : même page, cases et boutons inactifs, en attendant la lecture. */
  function renderForm(loading) {
    var lines = line(ICONS.compte, '', 'E-mails liés à votre compte',
      'Factures, paiements, sécurité, certificats : uniquement des informations sur votre compte, jamais d’offre commerciale. '
      + 'Nous devons pouvoir vous les adresser tant que votre compte est ouvert.',
      '<span class="compte-v2_badge ordo-prefs__badge">' + LOCK_SMALL + 'Toujours actifs</span>');
    for (var i = 0; i < CATEGORIES.length; i += 1) {
      lines += rowHtml(CATEGORIES[i], loading ? false : state.prefs[CATEGORIES[i].key], loading);
    }
    var off = loading ? ' disabled' : '';
    root.innerHTML = frame('Vos e-mails Ordotype', {
      intro: loading
        ? '<p class="ordo-prefs__lead text-size-regular text-color-base-700" role="status">Choisissez les e-mails que vous souhaitez recevoir. Chargement de vos préférences…</p>'
        : '<p class="ordo-prefs__lead text-size-regular text-color-base-700">Choisissez les e-mails que vous souhaitez recevoir à l’adresse <strong>'
          + escapeHtml(state.email) + '</strong>.</p>',
      main: '<div data-ordo-banner></div>'
        + '<section class="compte-v2_card is-liste" aria-label="Vos préférences d’e-mail">' + lines + '</section>'
        + '<div data-ordo-status aria-live="polite"></div>'
        + '<div class="ordo-prefs__actions">'
        + '<button type="button" class="button no-full-width" data-ordo-save' + off + '>Enregistrer mes choix</button>'
        + '<button type="button" class="compte-v2_lien ordo-prefs__all-off" data-ordo-all-off' + off + '>Ne plus recevoir aucun e-mail marketing</button>'
        + '</div>'
        + '<div class="compte-v2_help is-colonne">'
        + '<div class="compte-v2_help-text"><strong>Pourquoi ces e-mails restent actifs ?</strong> Ils ne sont jamais commerciaux '
        + 'et servent uniquement au bon fonctionnement de votre compte, comme le prévoit le RGPD. '
        + 'Vous gardez la main sur tout le reste, ci-dessus. Une question ? '
        + '<a class="compte-v2_lien" href="mailto:rgpd@ordotype.fr">rgpd@ordotype.fr</a></div>'
        + '</div>'
    });
    if (loading) return;
    renderBanner();

    var switches = root.querySelectorAll('[data-ordo-pref]');
    for (var j = 0; j < switches.length; j += 1) {
      switches[j].addEventListener('click', onToggle);
    }
    root.querySelector('[data-ordo-save]').addEventListener('click', function() { save(readSwitches()); });
    root.querySelector('[data-ordo-all-off]').addEventListener('click', function() {
      save({ newsletter: false, onboarding: false, offers: false });
    });
  }

  function renderBanner() {
    var slot = root.querySelector('[data-ordo-banner]');
    if (!slot) return;
    slot.innerHTML = state.unsubscribedAll
      ? '<div class="ordo-prefs__banner" role="status"><div class="compte-v2_ligne-texte">'
        + '<div class="compte-v2_ligne-titre">Vous ne recevez plus aucun e-mail marketing d’Ordotype.</div>'
        + '<div class="compte-v2_muted">Vous continuerez de recevoir les e-mails liés à votre compte. Vous pouvez réactiver une catégorie à tout moment ci-dessous.</div>'
        + '</div></div>'
      : '';
  }

  function setStatus(kind, message) {
    var slot = root.querySelector('[data-ordo-status]');
    if (!slot) return;
    slot.innerHTML = kind
      ? '<div class="ordo-prefs__status text-size-small' + (kind === 'ok' ? ' ordo-prefs__status--ok' : ' text-color-error') + '"'
        + (kind === 'error' ? ' role="alert"' : '') + '>'
        + (kind === 'ok' ? CHECK_SVG : '') + '<span>' + escapeHtml(message) + '</span></div>'
      : '';
  }

  function setBusy(on) {
    busy = on;
    var buttons = root.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = on;
    var saveBtn = root.querySelector('[data-ordo-save]');
    if (saveBtn) saveBtn.textContent = on ? 'Enregistrement…' : 'Enregistrer mes choix';
  }

  function readSwitches() {
    var prefs = {};
    for (var i = 0; i < CATEGORIES.length; i += 1) {
      var el = root.querySelector('[data-ordo-pref="' + CATEGORIES[i].key + '"]');
      prefs[CATEGORIES[i].key] = Boolean(el && el.getAttribute('aria-checked') === 'true');
    }
    return prefs;
  }

  function writeSwitches(prefs) {
    for (var i = 0; i < CATEGORIES.length; i += 1) {
      var el = root.querySelector('[data-ordo-pref="' + CATEGORIES[i].key + '"]');
      if (el) el.setAttribute('aria-checked', prefs[CATEGORIES[i].key] ? 'true' : 'false');
    }
  }

  function onToggle(ev) {
    if (busy) return;
    var el = ev.currentTarget;
    el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    setStatus(null);
  }

  // ---------------------------------------------------------------------------
  // Échanges
  // ---------------------------------------------------------------------------

  function messageFor(err) {
    var status = err && err.status;
    if (status === 401) return 'Votre session a expiré : reconnectez-vous puis réessayez.';
    if (status === 429) return 'Trop de tentatives. Merci de réessayer dans une minute.';
    return 'Vos préférences n’ont pas pu être enregistrées. Merci de réessayer.';
  }

  function save(prefs) {
    if (busy || !state) return;
    setBusy(true);
    setStatus(null);
    request(withAuth({ prefs: prefs })).then(function(payload) {
      state = { email: payload.email || state.email, prefs: payload.prefs || prefs, unsubscribedAll: Boolean(payload.unsubscribedAll) };
      setBusy(false);
      writeSwitches(state.prefs);
      renderBanner();
      setStatus('ok', 'Vos choix sont enregistrés.');
      track({
        event: 'email_preferences_save',
        email_prefs_via: auth.key ? 'key' : 'member',
        email_prefs_newsletter: state.prefs.newsletter ? 1 : 0,
        email_prefs_onboarding: state.prefs.onboarding ? 1 : 0,
        email_prefs_offers: state.prefs.offers ? 1 : 0
      });
    }, function(err) {
      setBusy(false);
      console.warn(PREFIX, 'save', err && err.message);
      reportIfActionable(err);
      // Le lien a perdu sa validité entre la lecture et l'enregistrement : repartir de zéro.
      if (err && err.status === 404) {
        forgetKey();
        start();
        return;
      }
      setStatus('error', messageFor(err));
    });
  }

  function load(credentials) {
    auth = credentials;
    var body = withAuth({});
    return (takePrefetch(body) || request(body)).then(function(payload) {
      state = { email: payload.email, prefs: payload.prefs, unsubscribedAll: Boolean(payload.unsubscribedAll) };
      renderForm();
      track({ event: 'email_preferences_view', email_prefs_via: auth.key ? 'key' : 'member' });
    });
  }

  function viaMember(linkWasInvalid) {
    return memberToken().then(function(token) {
      if (!token) {
        renderSignIn(linkWasInvalid);
        return null;
      }
      return load({ token: token });
    });
  }

  function start() {
    renderSkeleton();
    var key = readKey();
    var run = key
      ? load({ key: key }).catch(function(err) {
        if (err && err.status === 404) {
          forgetKey();
          return viaMember(true);
        }
        throw err;
      })
      : viaMember(false);
    run.catch(function(err) {
      console.warn(PREFIX, 'load', err && err.message);
      reportIfActionable(err);
      if (err && err.status === 401) {
        renderSignIn(false);
        return;
      }
      renderError(err && err.status === 429
        ? 'Trop de tentatives. Merci de réessayer dans une minute.'
        : 'Vos préférences n’ont pas pu être chargées. Merci de réessayer.');
    });
  }

  function init() {
    root = document.getElementById(ANCHOR_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ANCHOR_ID;
      (document.querySelector('main') || document.body).appendChild(root);
    }
    root.classList.add('ordo-prefs');
    if (!document.getElementById('ordo-prefs-style')) {
      var style = document.createElement('style');
      style.id = 'ordo-prefs-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
