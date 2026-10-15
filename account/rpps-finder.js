/**
 * Ordotype Account - RPPS Finder
 * Vérification du numéro RPPS dans l'Annuaire santé depuis « Mon profil » :
 * recherche par nom ou saisie du numéro, puis confirmation par le membre.
 * L'enregistrement passe par le serveur, jamais par le navigateur.
 *
 * Depends on: core.js (window.OrdoAccount), shared/error-reporter.js,
 *             Memberstack DOM SDK ($memberstackDom, pour le cookie membre)
 * Expected DOM (Webflow): input#RPPS[data-ms-member="n-rpps"] dans le
 *             formulaire du bloc professionnel de /membership/compte.
 *             profile-overview.js déplace ensuite le bloc dans la carte
 *             « Informations professionnelles ».
 * Contrat avec profile-overview.js : il annonce `ordo:edit-open` et
 *             `ordo:edit-close` sur document (detail.section). Pour la section
 *             `pro`, le bloc passe sous le champ RPPS du formulaire, le champ se
 *             verrouille (le numéro ne change que par la recherche), puis le bloc
 *             retourne à sa place dans la lecture.
 * Repli quand l'Annuaire santé est en panne : état lu à l'ouverture (STATUS_URL, `down`), ou
 *             recherche, vérification ou confirmation en échec faute de réponse de l'Annuaire
 *             (503, 504, délai dépassé). Le champ redevient saisissable jusqu'à la fermeture :
 *             le membre tape son numéro puis « Sauvegarder », et le serveur le vérifiera au retour
 *             de l'Annuaire. Rien n'est marqué vérifié par le navigateur.
 */
(function() {
  'use strict';

  var PREFIX = '[RppsFinder]';
  var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/account-rpps';
  // État public de l'Annuaire santé ({ state: 'up' | 'down' | 'unknown', since, checkedAt }, cache 60 s).
  // Quota Netlify serré : lu seulement à l'ouverture de la modification `pro`, jamais au chargement.
  var STATUS_URL = 'https://webhooks.ordotype.fr/.netlify/functions/annuaire-status';
  var STATUS_TIMEOUT_MS = 2000; // au-delà, comportement normal : champ verrouillé
  var API_TIMEOUT_MS = 15000; // le serveur répond avant 10 s ; au-delà, l'Annuaire est tenu pour en panne
  var MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s
  var CONTACT = 'contact@ordotype.fr';
  // Statuts pour lesquels la recherche porte d'emblée sur toutes les professions de santé.
  var ALL_PROFESSIONS_STATUTS = ['autre professionnel de sante', 'paramedical'];

  var account = window.OrdoAccount;
  var member = account && account.member;
  if (!member || !member.id) return;

  var input = document.getElementById('RPPS');
  if (!input) {
    console.log(PREFIX, 'No #RPPS input on this page');
    return;
  }

  // ---------------------------------------------------------------------------
  // Helpers purs
  // ---------------------------------------------------------------------------

  function fields() {
    if (!member.customFields) member.customFields = {};
    return member.customFields;
  }

  function text(v) {
    return v == null ? '' : String(v).trim();
  }

  function plain(s) {
    return text(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function digits(s) {
    return String(s == null ? '' : s).replace(/\D/g, '');
  }

  function luhnOk(s) {
    if (!s || !/^\d+$/.test(s)) return false;
    var total = 0;
    for (var i = 0; i < s.length; i++) {
      var d = Number(s.charAt(s.length - 1 - i));
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      total += d;
    }
    return total % 10 === 0;
  }

  // Même règle que le serveur : 11 chiffres avec clé de Luhn, ou 12 avec le « 8 » initial de l'identifiant national.
  function normalizeRpps(raw) {
    var d = digits(raw);
    if (d.length === 12 && d.charAt(0) === '8') d = d.slice(1);
    return d.length === 11 && luhnOk(d) ? d : '';
  }

  function meta() {
    if (!member.metaData) member.metaData = {};
    return member.metaData;
  }

  // Même règle que la coche « Vérifié » de profile-overview.js : le numéro affiché est celui contrôlé.
  function isVerified() {
    if (!/^[CEM]$/.test(text(fields()['statut-rpps']).toUpperCase())) return false;
    var numero = normalizeRpps(fields()['n-rpps']);
    return !!numero && numero === normalizeRpps(meta()['rpps-tested']);
  }

  function defaultScope() {
    return ALL_PROFESSIONS_STATUTS.indexOf(plain(fields().statut)) !== -1 ? 'all' : 'medecin';
  }

  function titleCase(s) {
    return text(s).toLowerCase().replace(/(^|[\s'-])(\S)/g, function(m, sep, c) { return sep + c.toUpperCase(); });
  }

  function displayName(c) {
    return [titleCase(c.given), text(c.family).toUpperCase()].filter(Boolean).join(' ');
  }

  function candidateLabel(c) {
    var parts = [displayName(c)];
    if (c.profession) parts.push(c.profession);
    if (c.specialty) parts.push(c.specialty);
    if (c.category === 'E') parts.push('Étudiant');
    parts.push('RPPS ' + c.rpps);
    return parts.filter(Boolean).join(', ');
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function merge(target, values) {
    for (var k in values) {
      if (Object.prototype.hasOwnProperty.call(values, k)) target[k] = values[k];
    }
  }

  /** Met à jour l'instantané `_ms-mem` lu au chargement suivant, en attendant que le SDK le rafraîchisse. */
  function patchSnapshot(custom, meta) {
    var raw = safeGet('_ms-mem');
    if (!raw) return;
    try {
      var snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return;
      snap.customFields = snap.customFields || {};
      merge(snap.customFields, custom);
      snap.metaData = snap.metaData || {};
      merge(snap.metaData, meta);
      safeSet('_ms-mem', JSON.stringify(snap));
    } catch (e) { /* no-op */ }
  }

  /** `detail` (facultatif) précise l'issue dans profile_step seulement : rpps:pro:<issue>:<detail>. */
  function track(outcome, detail) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;
    var payload = { event: 'profile_action', profile_action: 'rpps', profile_section: 'pro', profile_outcome: outcome };
    payload.profile_step = 'rpps:pro:' + outcome + (detail ? ':' + detail : '');
    var rollout = window.OrdoRollout && window.OrdoRollout['rpps-finder.js'];
    if (rollout) {
      payload.rollout_percent = rollout.percent;
      payload.rollout_bucket = rollout.bucket;
      payload.rollout_reason = rollout.reason;
    }
    try { window.dataLayer.push(payload); } catch (e) { /* no-op */ }
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function button(className, label) {
    var b = el('button', className, label);
    b.type = 'button';
    return b;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ---------------------------------------------------------------------------
  // Réseau
  // ---------------------------------------------------------------------------

  function waitForMemberstack() {
    return new Promise(function(resolve) {
      var attempts = 0;
      (function poll() {
        if (window.$memberstackDom) return resolve(window.$memberstackDom);
        if (attempts >= MS_MAX_ATTEMPTS) return resolve(null);
        attempts++;
        setTimeout(poll, 200);
      })();
    });
  }

  function memberToken() {
    return waitForMemberstack().then(function(ms) {
      if (!ms || typeof ms.getMemberCookie !== 'function') return '';
      return Promise.resolve(ms.getMemberCookie()).then(function(t) { return t ? String(t) : ''; });
    });
  }

  /**
   * Requête bornée dans le temps : au-delà de `ms`, elle est abandonnée et l'échec porte le code
   * `timeout` (sans statut HTTP).
   */
  function fetchWithin(url, options, ms) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctrl) options.signal = ctrl.signal;
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        if (ctrl) {
          try { ctrl.abort(); } catch (e) { /* no-op */ }
        }
        var err = new Error('timeout ' + url);
        err.code = 'timeout';
        reject(err);
      }, ms);
      fetch(url, options).then(function(res) {
        // Le corps compte dans le délai : des en-têtes reçus ne disent pas que la réponse arrivera.
        return res.json().catch(function() { return {}; }).then(function(body) {
          return { res: res, body: body };
        });
      }).then(function(r) {
        clearTimeout(timer);
        resolve(r);
      }, function(e) {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function api(payload) {
    return memberToken().then(function(token) {
      if (!token) {
        var e = new Error('no member token');
        e.status = 401;
        throw e;
      }
      return fetchWithin(API_URL, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload)
      }, API_TIMEOUT_MS);
    }).then(function(r) {
      var res = r.res;
      var body = r.body;
      if (!res.ok) {
        var err = new Error('account-rpps ' + res.status + ' ' + (body && body.error ? body.error : ''));
        err.status = res.status;
        err.code = body && body.error;
        throw err;
      }
      return body;
    });
  }

  /**
   * État de l'Annuaire santé, lu sans jeton : 'up', 'down', 'unknown', ou '' si le point d'accès
   * ne répond pas (absent, en erreur, délai dépassé). Jamais signalé : sans état, rien ne change.
   */
  function readStatus() {
    if (typeof fetch !== 'function') return Promise.resolve('');
    return fetchWithin(STATUS_URL, { method: 'GET', credentials: 'omit' }, STATUS_TIMEOUT_MS).then(function(r) {
      var state = r.res.ok && r.body && r.body.state;
      return typeof state === 'string' ? state : '';
    }).catch(function() { return ''; });
  }

  /** L'Annuaire ne répond pas (le serveur le dit par un 503, ou la réponse n'arrive pas) : repli possible. */
  function isOutage(err) {
    var outcome = failureOutcome(err);
    return outcome === 'unavailable' || outcome === 'timeout';
  }

  function messageFor(err) {
    var status = err && err.status;
    var code = err && err.code;
    // En modification, le champ vient d'être libéré : le message dit quoi faire. Espaces insécables
    // dans les guillemets : sinon « restait seul en bout de ligne.
    if (isOutage(err)) {
      return repli
        ? 'L’Annuaire santé ne répond pas en ce moment : saisissez votre numéro dans le champ ci\u2011dessus puis «\u00a0Sauvegarder\u00a0».'
        : 'L’Annuaire santé ne répond pas en ce moment. Réessayez un peu plus tard.';
    }
    if (status === 401) return 'Votre session a expiré : reconnectez-vous puis réessayez.';
    if (code === 'unknown_rpps') return 'Ce numéro est introuvable dans l’Annuaire santé. Vérifiez les chiffres.';
    if (code === 'name_mismatch') return 'Cette fiche ne porte pas le nom de votre profil. S’il s’agit bien de vous (nom d’usage, par exemple), écrivez-nous à ' + CONTACT + '.';
    if (code === 'name_missing') return 'Renseignez d’abord votre nom dans « Informations personnelles ».';
    if (code === 'unverifiable') return 'Cette fiche ne peut pas être vérifiée automatiquement. Écrivez-nous à ' + CONTACT + '.';
    if (code === 'invalid_number') return 'Numéro invalide : le RPPS compte 11 chiffres.';
    if (code === 'invalid_name') return 'Indiquez au moins 2 lettres du nom.';
    if (status === 429) return 'Trop de recherches à la suite : patientez une minute avant de réessayer.';
    if (!status) return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
    return 'Une erreur est survenue. Réessayez dans un instant.';
  }

  /** Issue d'un échec pour GA4 : panne de l'annuaire, délai dépassé, limite, session, réseau ou autre. */
  function failureOutcome(err) {
    var status = err && err.status;
    if (status === 503) return 'unavailable';
    if (status === 504 || (!status && err && err.code === 'timeout')) return 'timeout';
    if (status === 429) return 'rate-limited';
    if (status === 401) return 'session';
    if (status === 404) return 'unknown';
    if (!status) return 'network';
    return 'error';
  }

  function reportIfActionable(context, err) {
    var status = err && err.status;
    var reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    if (!status) {
      if (typeof reporter.reportNetwork === 'function') reporter.reportNetwork(context, err);
      return;
    }
    if (status === 400 || status === 401 || status === 404 || status === 409 || status === 422 || status === 429 || status === 503) return;
    reporter.report(context, err);
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  var BTN_PRIMARY = 'button no-full-width w-button ordo-rpps-btn';
  var BTN_SMALL = 'button is-grey is-small w-button ordo-rpps-btn';

  // Présentation d'origine : classes propres au script et leur feuille de style injectée.
  var ORIGINE = {
    'finder': 'ordo-rpps',
    'finder-cta': 'ordo-rpps-cta',
    'finder-note': 'ordo-rpps-muted',
    'finder-lien': 'ordo-rpps-link',
    'finder-panneau': 'ordo-rpps-panel',
    'finder-titre': '',
    'finder-ligne-haut': 'ordo-rpps-row',
    'finder-champ': 'form-input w-input',
    'finder-bouton': BTN_PRIMARY,
    'finder-choix': BTN_SMALL,
    'finder-confirmer': BTN_PRIMARY,
    'finder-liste': 'ordo-rpps-list',
    'finder-item': '',
    'finder-libelle': '',
    'finder-note-droite': 'ordo-rpps-note',
    'finder-note-haut': 'ordo-rpps-muted ordo-rpps-scope',
    'finder-note-pied': 'ordo-rpps-muted',
    'finder-direct': 'ordo-rpps-direct',
    'finder-carte': 'ordo-rpps-card',
    'finder-alerte': 'ordo-rpps-warn',
    'finder-erreur': 'ordo-rpps-error',
    'finder-fait': 'ordo-rpps-done'
  };
  // Classe de base que Webflow pose sur ses champs et ses boutons : le gabarit (un bloc) ne l'a pas.
  var BASE_WEBFLOW = { 'finder-champ': 'w-input', 'finder-bouton': 'w-button', 'finder-choix': 'w-button', 'finder-confirmer': 'w-button' };

  /**
   * Présentation dessinée dans le Designer : chaque morceau prend les classes de son gabarit dans le
   * bloc « GABARITS · Recherche RPPS et SIREN » de Mon profil ([data-ordo-gabarit="finder-…"]).
   * Changer le dessin d'un gabarit dans le Designer change celui de la recherche ; les textes restent
   * écrits ici. Sans ce bloc (page pas encore republiée) : présentation d'origine. Bloc incomplet :
   * présentation d'origine aussi, signalée.
   */
  function classesDuDesigner() {
    var box = document.querySelector('[data-ordo-gabarits="profil"]');
    if (!box || !box.querySelector('[data-ordo-gabarit="finder"]')) return null;
    var out = {};
    var manque = [];
    Object.keys(ORIGINE).forEach(function(name) {
      var g = box.querySelector('[data-ordo-gabarit="' + name + '"]');
      var cls = g && typeof g.className === 'string' ? g.className.trim() : '';
      if (!cls) {
        manque.push(name);
        return;
      }
      var base = BASE_WEBFLOW[name];
      out[name] = base && !g.classList.contains(base) ? cls + ' ' + base : cls;
    });
    if (manque.length) {
      console.warn(PREFIX, 'Gabarits incomplets, présentation d’origine :', manque.join(', '));
      var reporter = window.OrdoErrorReporter;
      if (reporter && typeof reporter.report === 'function') {
        reporter.report('RppsFinder.designer', new Error('Gabarits incomplets : ' + manque.join(', ')));
      }
      return null;
    }
    return out;
  }

  var DESSIN = classesDuDesigner();
  var C = DESSIN || ORIGINE;

  var CSS = [
    '.ordo-rpps{margin:8px 0 16px;font-size:15px;line-height:1.45;max-width:48rem;text-align:left}',
    '.ordo-rpps[hidden]{display:none}',
    '.ordo-rpps-cta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}',
    '.ordo-rpps-panel{border:1px solid var(--base-200, #0c0e1633);border-radius:4px;padding:14px 16px}',
    '.ordo-rpps-panel>strong{display:block;margin-bottom:2px}',
    '.ordo-rpps-row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 8px}',
    '.ordo-rpps-row input{flex:1 1 160px;min-width:0}',
    '@media (max-width:479px){.ordo-rpps-row input{flex-basis:100%}.ordo-rpps-list li{flex-direction:column;align-items:flex-start;text-align:left}.ordo-rpps-list li>*{align-self:flex-start;margin-left:0;margin-right:0}.ordo-rpps-list li .ordo-rpps-note{text-align:left}}',
    '.ordo-rpps-btn[disabled]{opacity:.5;cursor:default}',
    '.ordo-rpps-list{list-style:none;margin:0;padding:0;border:1px solid var(--base-200, #0c0e1633);border-radius:4px;overflow:hidden}',
    '.ordo-rpps-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid var(--base-100, #0c0e161a)}',
    '.ordo-rpps-list li:first-child{border-top:0}',
    '.ordo-rpps-list li>span:first-child{flex:1 1 auto;min-width:0}',
    '.ordo-rpps-list li .ordo-rpps-btn{flex:0 0 auto;white-space:nowrap}',
    '.ordo-rpps-list li .ordo-rpps-note{flex:0 1 auto;text-align:right}',
    '.ordo-rpps-direct{margin-top:14px;padding-top:12px;border-top:1px solid var(--base-100, #0c0e161a)}',
    '.ordo-rpps-muted,.ordo-rpps-note{color:var(--neutral-500, #47505c);font-size:13px}',
    '.ordo-rpps-error{color:var(--error-700, #ba1b1b);margin-top:6px}',
    '.ordo-rpps-warn{color:var(--warning-800, #864e0e);margin-top:6px}',
    '.ordo-rpps-card{border:1px solid var(--base-200, #0c0e1633);border-radius:4px;padding:12px 14px;margin-top:8px}',
    '.ordo-rpps-link{background:none;border:0;padding:0;color:var(--primary-500, #3454f6);text-decoration:underline;cursor:pointer;font:inherit;text-align:left}',
    '.ordo-rpps-scope{margin-top:6px}',
    '.ordo-rpps-done{background:var(--success-50, #f2fdf5);border:1px solid var(--success-200, #bbf7d0);border-radius:4px;padding:12px 14px}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('ordo-rpps-styles')) return;
    var style = el('style');
    style.id = 'ordo-rpps-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  var root = el('div', C.finder);
  root.setAttribute('data-ordo-finder', 'rpps');
  if (DESSIN) root.setAttribute('data-ordo-dessin', 'designer');
  root.setAttribute('aria-live', 'polite');

  /** Montre ou cache le bloc. Sur le site, `[hidden]` ne l'emporte pas sur une classe qui fixe `display`. */
  function showRoot(visible) {
    root.hidden = !visible;
    root.style.display = visible ? '' : 'none';
  }

  /** Message (alerte ou erreur) : un seul à la fois, marqué pour être retrouvé quelle que soit la présentation. */
  function message(text, kind) {
    var node = el('div', kind === 'warn' ? C['finder-alerte'] : C['finder-erreur'], text);
    node.setAttribute('data-ordo-message', kind === 'warn' ? 'alerte' : 'erreur');
    return node;
  }

  function setMessage(container, text, kind) {
    var old = container.querySelector(':scope > [data-ordo-message]');
    if (old) old.parentNode.removeChild(old);
    if (text) container.appendChild(message(text, kind));
  }

  // État affiché (hidden, collapsed, panel, done) et mode modification de la carte.
  var state = 'hidden';
  var editing = false;

  // --- Replié -------------------------------------------------------------------------------------

  function renderCollapsed() {
    clear(root);
    showRoot(true);
    state = 'collapsed';
    var line = el('div', C['finder-cta']);
    var hasNumber = !!normalizeRpps(fields()['n-rpps']);
    // Numéro déjà vérifié : seulement en modification, pour pouvoir en changer.
    var verified = editing && isVerified();
    // Annuaire en panne (repli) : ne pas promettre une vérification immédiate sous la mention de panne.
    var enPanne = editing && repli;
    line.appendChild(el('span', C['finder-note'], enPanne
      ? 'La recherche dans l’Annuaire santé est momentanément indisponible.'
      : verified
      ? 'Votre numéro RPPS est vérifié. Pour en changer, recherchez votre nouvelle fiche.'
      : hasNumber
        ? 'Votre numéro RPPS n’est pas encore vérifié dans l’Annuaire santé.'
        : 'Retrouvez votre numéro RPPS dans l’Annuaire santé : il sera vérifié immédiatement.'));
    var open = button(C['finder-lien'], enPanne ? 'Réessayer' : verified ? 'Changer de numéro' : hasNumber ? 'Vérifier maintenant' : 'Rechercher mon RPPS');
    open.addEventListener('click', function() {
      track('open');
      renderPanel();
    });
    line.appendChild(open);
    root.appendChild(line);
  }

  // --- Panneau ------------------------------------------------------------------------------------

  var scope = defaultScope();
  var searchSeq = 0;

  function renderPanel() {
    clear(root);
    showRoot(true);
    state = 'panel';
    var panel = el('div', C['finder-panneau']);
    panel.appendChild(el('strong', C['finder-titre'], 'Vérifier mon numéro RPPS'));
    panel.appendChild(el('span', C['finder-note'], 'Recherchez votre fiche dans l’Annuaire santé, puis confirmez-la. Rien n’est enregistré sans votre confirmation.'));
    root.appendChild(panel);
    renderSearch(panel);
    var direct = el('div', C['finder-direct']);
    panel.appendChild(direct);
    renderNumber(direct);
    var close = button(C['finder-lien'], 'Fermer');
    close.addEventListener('click', function() {
      searchSeq++;
      track('close');
      renderCollapsed();
    });
    var foot = el('div', C['finder-note-pied']);
    if (!DESSIN) foot.style.marginTop = '10px';
    foot.appendChild(close);
    panel.appendChild(foot);
  }

  function renderSearch(panel) {
    var row = el('div', C['finder-ligne-haut']);
    var family = el('input', C['finder-champ']);
    family.type = 'text';
    family.placeholder = 'Nom';
    family.maxLength = 60;
    family.setAttribute('aria-label', 'Nom');
    family.value = text(fields().nom);
    var given = el('input', C['finder-champ']);
    given.type = 'text';
    given.placeholder = 'Prénom (facultatif)';
    given.maxLength = 60;
    given.setAttribute('aria-label', 'Prénom (facultatif)');
    given.value = text(fields().prnom).split(/\s+/)[0] || '';
    var go = button(C['finder-bouton'], 'Rechercher');
    row.appendChild(family);
    row.appendChild(given);
    row.appendChild(go);
    panel.appendChild(row);
    var results = el('div');
    panel.appendChild(results);
    var scopeLine = el('div', C['finder-note-haut']);
    panel.appendChild(scopeLine);

    function renderScopeLink() {
      clear(scopeLine);
      var link = button(C['finder-lien'], scope === 'medecin'
        ? 'Vous n’êtes pas médecin ? Chercher dans toutes les professions de santé'
        : 'Chercher parmi les médecins seulement');
      link.addEventListener('click', function() {
        scope = scope === 'medecin' ? 'all' : 'medecin';
        renderScopeLink();
        run();
      });
      scopeLine.appendChild(link);
    }

    function run() {
      var f = family.value.replace(/\s+/g, ' ').trim();
      var g = given.value.replace(/\s+/g, ' ').trim();
      // Les messages de la recherche s'affichent sous ses champs, pas au bas du panneau.
      setMessage(results, '');
      if (f.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 2) {
        setMessage(results, 'Indiquez au moins 2 lettres du nom.');
        return;
      }
      var seq = ++searchSeq;
      clear(results);
      results.appendChild(el('div', C['finder-note'], 'Recherche dans l’Annuaire santé…'));
      go.disabled = true;
      track('search');
      api({ action: 'search', family: f, given: g, scope: scope }).then(function(body) {
        if (seq !== searchSeq) return;
        renderResults(results, body.results || [], body.total || 0);
      }).catch(function(err) {
        if (seq !== searchSeq) return;
        clear(results);
        if (isOutage(err)) repliPanne('erreur');
        setMessage(results, messageFor(err));
        track('search-' + failureOutcome(err));
        reportIfActionable('RppsFinder.search', err);
      }).then(function() {
        if (seq === searchSeq) go.disabled = false;
      });
    }

    function onEnter(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    }
    family.addEventListener('keydown', onEnter);
    given.addEventListener('keydown', onEnter);
    go.addEventListener('click', run);
    renderScopeLink();
  }

  function renderResults(container, list, total) {
    clear(container);
    if (!list.length) {
      track('empty');
      container.appendChild(el('div', C['finder-note'], 'Aucune fiche à ce nom dans l’Annuaire santé. Vérifiez l’orthographe, ou saisissez votre numéro ci-dessous.'));
      return;
    }
    track('results');
    if (list.some(function(c) { return c.name_match === 'n/a'; })) {
      container.appendChild(message('Renseignez votre nom dans « Informations personnelles » pour pouvoir confirmer votre fiche.', 'warn'));
    }
    var ul = el('ul', C['finder-liste']);
    list.forEach(function(c) {
      var li = el('li', C['finder-item']);
      li.appendChild(el('span', C['finder-libelle'], candidateLabel(c)));
      if (c.name_match === 'yes') {
        var pick = button(C['finder-choix'], 'C’est moi');
        pick.addEventListener('click', function() { confirmCandidate(c, 'search', li); });
        li.appendChild(pick);
      } else if (c.name_match === 'no') {
        li.appendChild(el('span', C['finder-note-droite'], 'Nom différent de votre profil'));
      }
      ul.appendChild(li);
    });
    container.appendChild(ul);
    if (total > list.length) {
      container.appendChild(el('div', C['finder-note'], total + ' fiches correspondent, seules les ' + list.length + ' premières sont affichées : précisez le prénom.'));
    }
  }

  function renderNumber(container) {
    container.appendChild(el('div', C['finder-note'], 'Ou saisissez directement votre numéro RPPS (11 chiffres) :'));
    var row = el('div', C['finder-ligne-haut']);
    var num = el('input', C['finder-champ']);
    num.type = 'text';
    num.inputMode = 'numeric';
    num.placeholder = 'N° RPPS (11 chiffres)';
    num.maxLength = 20;
    num.setAttribute('aria-label', 'Numéro RPPS');
    num.value = normalizeRpps(fields()['n-rpps']);
    var check = button(C['finder-bouton'], 'Vérifier');
    row.appendChild(num);
    row.appendChild(check);
    container.appendChild(row);
    var out = el('div');
    container.appendChild(out);

    function refreshState() {
      var d = digits(num.value);
      var valid = !!normalizeRpps(d);
      check.disabled = !valid;
      if ((d.length === 11 || d.length === 12) && !valid) setMessage(container, 'Ce numéro ne passe pas le contrôle de validité : vérifiez les chiffres.');
      else setMessage(container, '');
    }

    function verify() {
      var n = normalizeRpps(num.value);
      if (!n) return;
      clear(out);
      setMessage(container, '');
      out.appendChild(el('div', C['finder-note'], 'Vérification dans l’Annuaire santé…'));
      check.disabled = true;
      track('lookup');
      api({ action: 'lookup', rpps: n }).then(function(body) {
        clear(out);
        var c = body.results && body.results[0];
        if (!c) {
          setMessage(container, messageFor({ status: 404, code: 'unknown_rpps' }));
          return;
        }
        var card = el('div', C['finder-carte']);
        card.appendChild(el('div', null, candidateLabel(c)));
        if (c.name_match === 'yes') {
          var ok = button(C['finder-confirmer'], 'Confirmer');
          if (!DESSIN) ok.style.marginTop = '10px';
          ok.addEventListener('click', function() { confirmCandidate(c, 'number', card); });
          card.appendChild(ok);
        } else if (c.name_match === 'n/a') {
          card.appendChild(message(messageFor({ code: 'name_missing', status: 409 }), 'warn'));
        } else {
          track('mismatch');
          card.appendChild(message('Ce numéro correspond à ' + displayName(c) + ' dans l’Annuaire santé, pas au nom de votre profil. S’il s’agit bien de vous (nom d’usage, par exemple), écrivez-nous à ' + CONTACT + '.'));
        }
        out.appendChild(card);
      }).catch(function(err) {
        clear(out);
        if (isOutage(err)) repliPanne('erreur');
        setMessage(container, messageFor(err));
        track('lookup-' + failureOutcome(err));
        reportIfActionable('RppsFinder.lookup', err);
      }).then(function() {
        check.disabled = !normalizeRpps(num.value);
      });
    }

    num.addEventListener('input', refreshState);
    num.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        verify();
      }
    });
    check.addEventListener('click', verify);
    refreshState();
  }

  // --- Enregistrement ------------------------------------------------------------------------------

  function confirmCandidate(c, source, node) {
    var buttons = node.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    setMessage(node, '');
    api({ action: 'select', rpps: c.rpps, source: source }).then(function(body) {
      var custom = { 'n-rpps': body.rpps, 'statut-rpps': body.category, 'date-check-rpps': body.verified_at };
      var metaValues = { 'rpps-tested': body.rpps, 'date-check-RPPS': body.verified_at };
      merge(fields(), custom);
      merge(meta(), metaValues);
      var shared = window.OrdoMemberstack && window.OrdoMemberstack.customFields;
      if (shared && shared !== fields()) merge(shared, custom);
      // Le formulaire du bloc professionnel renvoie ce champ à chaque enregistrement.
      input.value = body.rpps;
      patchSnapshot(custom, metaValues);
      track('saved');
      console.log(PREFIX, 'Saved', 'source=' + source, 'category=' + body.category);
      renderDone(body);
      try {
        document.dispatchEvent(new CustomEvent('ordo:member-updated', { detail: { source: 'rpps-finder' } }));
      } catch (e) { /* no-op */ }
    }).catch(function(err) {
      for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
      track(err && err.code === 'name_mismatch' ? 'mismatch' : 'failed');
      if (isOutage(err)) repliPanne('erreur');
      setMessage(node, messageFor(err));
      reportIfActionable('RppsFinder.select', err);
    });
  }

  function renderDone(body) {
    clear(root);
    showRoot(true);
    state = 'done';
    var box = el('div', C['finder-fait']);
    var who = [displayName(body), body.profession].filter(Boolean).join(', ');
    box.appendChild(el('div', null, 'Numéro RPPS vérifié dans l’Annuaire santé : ' + body.rpps + (who ? ' (' + who + ')' : '') + '.'));
    root.appendChild(box);
  }

  // --- Init --------------------------------------------------------------------------------------

  function render() {
    // En lecture, un numéro vérifié n'a besoin de rien : la coche « Vérifié » suffit.
    if (isVerified() && !editing) {
      clear(root);
      showRoot(false);
      state = 'hidden';
      return;
    }
    renderCollapsed();
  }

  // --- Mode modification de la carte -----------------------------------------------------------------

  var PLACEHOLDER = 'ex. : 10000668540';
  // Cellule pleine largeur du formulaire (mêmes classes que la cellule SIRET du gabarit Webflow).
  var CELLULE = 'form-field-wrapper is-short is-pleine-largeur';
  // Trait d'union insécable : la cellule est étroite, « ci- » restait seul en bout de ligne.
  var NOTE_VERROU = 'Modifiable uniquement par la recherche dans l’Annuaire santé ci\u2011dessous.';
  // Espace insécable avant « : » : il ne commence jamais une ligne de la cellule étroite.
  var NOTE_PANNE = 'Annuaire santé indisponible\u00a0: saisissez votre numéro, il sera vérifié dès son retour.';
  var home = null;
  var host = null;
  var lockNote = null;
  // Champ libéré pendant cette modification parce que l'Annuaire santé est en panne.
  var repli = false;
  // Numéro de l'ouverture en cours : un état lu pour une ouverture déjà refermée est ignoré.
  var openSeq = 0;

  function inputCell() {
    return input.closest('.form-field-wrapper') || input.parentNode;
  }

  /**
   * Le numéro ne se saisit plus à la main pendant la modification : lecture seule, avec le dessin
   * natif de Webflow (.w-input[readonly] : fond gris, curseur interdit), et une mention sous le champ.
   */
  function lockInput(on) {
    input.readOnly = on;
    repli = false;
    if (on) {
      input.setAttribute('aria-readonly', 'true');
      if (!lockNote) {
        lockNote = el('div', C['finder-note-haut']);
        lockNote.id = 'ordo-rpps-verrou';
        lockNote.setAttribute('data-ordo-rpps-verrou', '1');
      }
      lockNote.textContent = NOTE_VERROU;
      var cell = inputCell();
      if (cell) cell.appendChild(lockNote);
      input.setAttribute('aria-describedby', lockNote.id);
      return;
    }
    input.removeAttribute('aria-readonly');
    if (input.getAttribute('aria-describedby') === 'ordo-rpps-verrou') input.removeAttribute('aria-describedby');
    if (lockNote && lockNote.parentNode) lockNote.parentNode.removeChild(lockNote);
  }

  /**
   * Annuaire santé en panne pendant la modification : le champ redevient saisissable, comme avant le
   * verrou, et la mention le dit. Le membre enregistre par « Sauvegarder » ; le serveur vérifiera le
   * numéro au retour de l'Annuaire. Une fois par ouverture ; la fermeture remet le verrou normal.
   * `cause` : `status` (état lu à l'ouverture) ou `erreur` (recherche, vérification ou confirmation).
   */
  function repliPanne(cause) {
    if (!editing || repli || !input.readOnly) return;
    repli = true;
    input.readOnly = false;
    input.removeAttribute('aria-readonly');
    if (lockNote) lockNote.textContent = NOTE_PANNE;
    if (state === 'collapsed') renderCollapsed();
    track('repli-panne', cause);
    console.log(PREFIX, 'Annuaire en panne : champ RPPS saisissable', 'cause=' + cause);
  }

  /**
   * Une lecture de l'état de l'Annuaire par ouverture, au début : un 503 de la recherche arrive donc
   * toujours après, et aucune autre lecture ne suit dans la même ouverture. Seul `down` change
   * quelque chose ; 404 (point d'accès pas encore en ligne), erreur ou délai : verrou normal.
   */
  function checkStatus() {
    var seq = openSeq;
    readStatus().then(function(state) {
      if (state === 'down' && seq === openSeq && editing) repliPanne('status');
    });
  }

  /**
   * « Modifier » sur la carte professionnelle : le bloc quitte la lecture (masquée) pour une cellule
   * pleine largeur juste sous le champ RPPS. Écart avec les boutons : celui entre deux lignes du
   * formulaire, soit la marge de cellule (1rem) plus l'écart de la grille des champs, relu sur la page
   * (1.5rem sur ordinateur, 0 sur mobile où les boutons ont déjà 1rem au-dessus). Avec la seule marge
   * de cellule, la recherche collait aux boutons.
   */
  function onEditOpen(e) {
    if (!e || !e.detail || e.detail.section !== 'pro') return;
    var cell = inputCell();
    if (!cell || !cell.parentNode) return;
    var opening = !editing;
    if (opening) home = { parent: root.parentNode, next: root.nextSibling };
    editing = true;
    if (!host) {
      host = el('div', CELLULE);
      host.setAttribute('data-ordo-rpps-hote', '1');
    }
    var gap = window.getComputedStyle(cell.parentNode).rowGap;
    host.style.paddingBottom = gap && gap !== 'normal' && parseFloat(gap) > 0 ? gap : '';
    cell.parentNode.insertBefore(host, cell.nextSibling);
    host.appendChild(root);
    // Annonce répétée sans fermeture : le champ garde son état (repli compris), pas de nouvelle lecture.
    if (opening) {
      openSeq++;
      lockInput(true);
      checkStatus();
    }
    // Une recherche en cours reste ouverte ; sinon le bloc se redessine pour la modification.
    if (state !== 'panel') render();
  }

  /** Annuler, enregistrement ou autre carte ouverte : le bloc retourne dans la lecture. */
  function onEditClose(e) {
    if (!e || !e.detail || e.detail.section !== 'pro' || !editing) return;
    editing = false;
    openSeq++;
    lockInput(false);
    if (home && home.parent) {
      home.parent.insertBefore(root, home.next && home.next.parentNode === home.parent ? home.next : null);
    }
    if (host && host.parentNode) host.parentNode.removeChild(host);
    home = null;
    searchSeq++;
    render();
  }

  function init() {
    if (!DESSIN) injectStyles();
    input.placeholder = PLACEHOLDER;
    var cell = inputCell();
    if (cell && cell.parentNode) cell.parentNode.insertBefore(root, cell.nextSibling);
    render();
    if (!root.hidden) track('shown');
    document.addEventListener('ordo:edit-open', onEditOpen);
    document.addEventListener('ordo:edit-close', onEditClose);
    console.log(PREFIX, 'Initialized', isVerified() ? '(verified)' : '(not verified)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
