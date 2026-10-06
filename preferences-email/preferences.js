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
 * propose de se connecter.
 *
 * 🔴 La clé ne reste pas dans la barre d'adresse : elle est rangée dans
 * sessionStorage (un rechargement la retrouve) et le fragment est effacé. Le
 * petit script en tête de page (voir README) fait la même chose plus tôt,
 * avant le chargement des outils de mesure ; ce fichier le refait au cas où.
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
  var MS_MAX_ATTEMPTS = 25; // 25 x 200 ms = 5 s
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

  var CSS = [
    '.ordo-prefs{max-width:640px;margin:24px auto 64px auto;padding:0 16px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;color:#0c0e16;font-family:inherit}',
    '.ordo-prefs *{box-sizing:border-box}',
    '.ordo-prefs>div:empty{display:none}',
    '.ordo-prefs h1{margin:0;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:-0.02em}',
    '.ordo-prefs__intro{display:flex;flex-direction:column;gap:8px}',
    '.ordo-prefs__lead{margin:0;font-size:16px;line-height:1.6;color:#4b5162}',
    '.ordo-prefs__lead strong{color:#0c0e16;overflow-wrap:anywhere}',
    '.ordo-prefs__card{background:#fff;border:1px solid #0c0e161a;border-radius:12px;display:flex;flex-direction:column}',
    '.ordo-prefs__row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:20px 24px;border-bottom:1px solid #0c0e1614}',
    '.ordo-prefs__row:last-child{border-bottom:0}',
    '.ordo-prefs__label{display:flex;flex-direction:column;gap:4px;min-width:0}',
    '.ordo-prefs__title{font-size:16px;font-weight:600}',
    '.ordo-prefs__text{font-size:14px;line-height:1.5;color:#4b5162}',
    '.ordo-prefs__lock{display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:13px;font-weight:500;color:#4b5162}',
    '.ordo-prefs__switch{width:52px;height:30px;flex-shrink:0;border-radius:999px;border:0;padding:3px;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;background:#c9ccd6;transition:background .15s}',
    '.ordo-prefs__switch[aria-checked="true"]{justify-content:flex-end;background:#263fd3}',
    '.ordo-prefs__switch:focus-visible{outline:3px solid #263fd366;outline-offset:2px}',
    '.ordo-prefs__switch:disabled{cursor:default;opacity:.6}',
    '.ordo-prefs__knob{width:24px;height:24px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(12,14,22,.25);display:block}',
    '.ordo-prefs__actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}',
    '.ordo-prefs__save{min-height:48px;padding:0 24px;border:0;border-radius:999px;background:#263fd3;color:#fff;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer}',
    '.ordo-prefs__save:disabled{opacity:.6;cursor:default}',
    '.ordo-prefs__all-off{min-height:44px;padding:0 4px;border:0;background:transparent;color:#263fd3;font-family:inherit;font-size:15px;font-weight:500;text-decoration:underline;cursor:pointer}',
    '.ordo-prefs__status{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:10px;font-size:15px;font-weight:500}',
    '.ordo-prefs__status--ok{background:#e9f6ee;color:#1b5e33}',
    '.ordo-prefs__status--error{background:#fdecea;color:#8a1c12}',
    '.ordo-prefs__banner{display:flex;align-items:flex-start;gap:12px;padding:16px 20px;border-radius:12px;background:#f0f3ff;border:1px solid #263fd333;font-size:15px;line-height:1.55}',
    '.ordo-prefs__banner span{color:#4b5162}',
    '.ordo-prefs__note{background:#0c0e1608;border:1px solid #0c0e161a;border-radius:12px;padding:16px 20px;font-size:14px;line-height:1.6;color:#4b5162}',
    '.ordo-prefs__note a,.ordo-prefs__lead a{color:#263fd3}',
    '.ordo-prefs__buttons{display:flex;gap:12px;flex-wrap:wrap}',
    '.ordo-prefs__link-btn{min-height:48px;display:inline-flex;align-items:center;padding:0 24px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none}',
    '.ordo-prefs__link-btn--primary{background:#263fd3;color:#fff}',
    '.ordo-prefs__link-btn--secondary{border:1px solid #0c0e1626;background:#fff;color:#0c0e16}',
    '.ordo-prefs__skeleton{height:280px;border-radius:12px;background:linear-gradient(90deg,#eef0f5 25%,#f7f8fb 50%,#eef0f5 75%);background-size:200% 100%;animation:ordo-prefs-wave 1.2s infinite}',
    '@keyframes ordo-prefs-wave{0%{background-position:200% 0}100%{background-position:-200% 0}}',
    '@media (max-width:479px){.ordo-prefs h1{font-size:26px}.ordo-prefs__row{gap:16px;padding:16px}.ordo-prefs__save{width:100%}}'
  ].join('\n');

  var LOCK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5162" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
  var CHECK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
  var INFO_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#263fd3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>';

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

  function memberToken() {
    return new Promise(function(resolve) {
      var attempts = 0;
      (function poll() {
        if (window.$memberstackDom) return resolve(window.$memberstackDom);
        if (++attempts > MS_MAX_ATTEMPTS) return resolve(null);
        setTimeout(poll, 200);
      })();
    }).then(function(ms) {
      if (!ms || typeof ms.getMemberCookie !== 'function') return '';
      return Promise.resolve(ms.getMemberCookie()).then(function(t) {
        return t ? String(t) : '';
      }, function() { return ''; });
    });
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

  function renderSkeleton() {
    root.innerHTML = '<div class="ordo-prefs__intro"><h1>Vos e-mails Ordotype</h1></div>'
      + '<div class="ordo-prefs__skeleton" aria-hidden="true"></div>'
      + '<p class="ordo-prefs__lead" role="status">Chargement de vos préférences…</p>';
  }

  function renderSignIn(linkWasInvalid) {
    var title = linkWasInvalid ? 'Ce lien n’est plus valide' : 'Gérez vos e-mails Ordotype';
    root.innerHTML = '<div class="ordo-prefs__intro">'
      + '<h1>' + title + '</h1>'
      + '<p class="ordo-prefs__lead">Connectez-vous pour gérer vos préférences d’e-mail depuis votre compte.</p>'
      + '<p class="ordo-prefs__lead">Pour ne plus recevoir aucun e-mail marketing sans vous connecter, utilisez le lien « Se désinscrire » en bas de nos e-mails.</p>'
      + '</div>'
      + '<div class="ordo-prefs__buttons">'
      + '<a class="ordo-prefs__link-btn ordo-prefs__link-btn--primary" href="' + LOGIN_URL + '">Me connecter</a>'
      + '<a class="ordo-prefs__link-btn ordo-prefs__link-btn--secondary" href="mailto:contact@ordotype.fr">Nous écrire</a>'
      + '</div>';
  }

  function renderError(message) {
    root.innerHTML = '<div class="ordo-prefs__intro"><h1>Vos e-mails Ordotype</h1></div>'
      + '<div class="ordo-prefs__status ordo-prefs__status--error" role="alert">' + escapeHtml(message) + '</div>'
      + '<div class="ordo-prefs__buttons"><button type="button" class="ordo-prefs__save" data-ordo-retry>Réessayer</button></div>';
    root.querySelector('[data-ordo-retry]').addEventListener('click', start);
  }

  function rowHtml(c, on) {
    return '<div class="ordo-prefs__row">'
      + '<div class="ordo-prefs__label" id="ordo-prefs-' + c.key + '-label">'
      + '<div class="ordo-prefs__title">' + escapeHtml(c.title) + '</div>'
      + '<div class="ordo-prefs__text">' + escapeHtml(c.text) + '</div>'
      + '</div>'
      + '<button type="button" role="switch" class="ordo-prefs__switch" data-ordo-pref="' + c.key + '"'
      + ' aria-checked="' + (on ? 'true' : 'false') + '" aria-labelledby="ordo-prefs-' + c.key + '-label">'
      + '<span class="ordo-prefs__knob"></span></button>'
      + '</div>';
  }

  function renderForm() {
    var html = '<div class="ordo-prefs__intro"><h1>Vos e-mails Ordotype</h1>'
      + '<p class="ordo-prefs__lead">Choisissez les e-mails que vous souhaitez recevoir à l’adresse <strong>'
      + escapeHtml(state.email) + '</strong>.</p></div>'
      + '<div data-ordo-banner></div>'
      + '<section class="ordo-prefs__card" aria-label="Vos préférences d’e-mail">'
      + '<div class="ordo-prefs__row"><div class="ordo-prefs__label">'
      + '<div class="ordo-prefs__title">E-mails liés à votre compte</div>'
      + '<div class="ordo-prefs__text">Factures, abonnement, pause, sécurité, certificats. Toujours envoyés : ils concernent votre compte.</div>'
      + '</div><div class="ordo-prefs__lock">' + LOCK_SVG + '<span>Toujours actifs</span></div></div>';
    for (var i = 0; i < CATEGORIES.length; i += 1) html += rowHtml(CATEGORIES[i], state.prefs[CATEGORIES[i].key]);
    html += '</section>'
      + '<div data-ordo-status aria-live="polite"></div>'
      + '<div class="ordo-prefs__actions">'
      + '<button type="button" class="ordo-prefs__save" data-ordo-save>Enregistrer mes choix</button>'
      + '<button type="button" class="ordo-prefs__all-off" data-ordo-all-off>Ne plus recevoir aucun e-mail marketing</button>'
      + '</div>'
      + '<div class="ordo-prefs__note">Les e-mails liés à votre compte ne peuvent pas être désactivés tant que votre compte existe. '
      + 'Une question ? Écrivez-nous à <a href="mailto:contact@ordotype.fr">contact@ordotype.fr</a>.</div>';
    root.innerHTML = html;
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
      ? '<div class="ordo-prefs__banner" role="status">' + INFO_SVG + '<div><strong>Vous ne recevez plus aucun e-mail marketing d’Ordotype.</strong><br>'
        + '<span>Vous continuerez de recevoir les e-mails liés à votre compte. Vous pouvez réactiver une catégorie à tout moment ci-dessous.</span></div></div>'
      : '';
  }

  function setStatus(kind, message) {
    var slot = root.querySelector('[data-ordo-status]');
    if (!slot) return;
    slot.innerHTML = kind
      ? '<div class="ordo-prefs__status ordo-prefs__status--' + kind + '"' + (kind === 'error' ? ' role="alert"' : '') + '>'
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
    return request(withAuth({})).then(function(payload) {
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
