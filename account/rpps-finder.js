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
 */
(function() {
  'use strict';

  var PREFIX = '[RppsFinder]';
  var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/account-rpps';
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

  // Même règle que la coche « Vérifié » de profile-overview.js.
  function isVerified() {
    return /^[CEM]$/.test(text(fields()['statut-rpps']).toUpperCase()) && !!text(fields()['n-rpps']);
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
    return parts.filter(Boolean).join(' · ');
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

  function track(outcome) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;
    var payload = { event: 'profile_action', profile_action: 'rpps', profile_section: 'pro', profile_outcome: outcome };
    payload.profile_step = 'rpps:pro:' + outcome;
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

  function api(payload) {
    return memberToken().then(function(token) {
      if (!token) {
        var e = new Error('no member token');
        e.status = 401;
        throw e;
      }
      return fetch(API_URL, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(body) {
        if (!res.ok) {
          var err = new Error('account-rpps ' + res.status + ' ' + (body && body.error ? body.error : ''));
          err.status = res.status;
          err.code = body && body.error;
          throw err;
        }
        return body;
      });
    });
  }

  function messageFor(err) {
    var status = err && err.status;
    var code = err && err.code;
    if (status === 401) return 'Votre session a expiré : reconnectez-vous puis réessayez.';
    if (code === 'unknown_rpps') return 'Ce numéro est introuvable dans l’Annuaire santé. Vérifiez les chiffres.';
    if (code === 'name_mismatch') return 'Cette fiche ne porte pas le nom de votre profil. S’il s’agit bien de vous (nom d’usage, par exemple), écrivez-nous à ' + CONTACT + '.';
    if (code === 'name_missing') return 'Renseignez d’abord votre nom dans « Informations personnelles ».';
    if (code === 'unverifiable') return 'Cette fiche ne peut pas être vérifiée automatiquement. Écrivez-nous à ' + CONTACT + '.';
    if (code === 'invalid_number') return 'Numéro invalide : le RPPS compte 11 chiffres.';
    if (code === 'invalid_name') return 'Indiquez au moins 2 lettres du nom.';
    if (status === 429 || status === 503) return 'Service momentanément indisponible, réessayez dans quelques secondes.';
    if (!status) return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
    return 'Une erreur est survenue. Réessayez dans un instant.';
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

  var BTN_PRIMARY = 'button is-gradient w-button ordo-rpps-btn';
  var BTN_SMALL = 'button is-grey is-small w-button ordo-rpps-btn';

  var CSS = [
    '.ordo-rpps{margin:8px 0 16px;font-size:15px;line-height:1.45;max-width:48rem;text-align:left}',
    '.ordo-rpps[hidden]{display:none}',
    '.ordo-rpps-cta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}',
    '.ordo-rpps-panel{border:1px solid #d9e2f0;border-radius:8px;padding:14px 16px}',
    '.ordo-rpps-panel>strong{display:block;margin-bottom:2px}',
    '.ordo-rpps-row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 8px}',
    '.ordo-rpps-row input{flex:1 1 160px;min-width:0}',
    '@media (max-width:479px){.ordo-rpps-row input{flex-basis:100%}.ordo-rpps-list li{flex-direction:column;align-items:flex-start;text-align:left}.ordo-rpps-list li>*{align-self:flex-start;margin-left:0;margin-right:0}.ordo-rpps-list li .ordo-rpps-note{text-align:left}}',
    '.ordo-rpps-btn[disabled]{opacity:.5;cursor:default}',
    '.ordo-rpps-list{list-style:none;margin:0;padding:0;border:1px solid #d9e2f0;border-radius:8px;overflow:hidden}',
    '.ordo-rpps-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #e6ecf5}',
    '.ordo-rpps-list li:first-child{border-top:0}',
    '.ordo-rpps-list li>span:first-child{flex:1 1 auto;min-width:0}',
    '.ordo-rpps-list li .ordo-rpps-btn{flex:0 0 auto;white-space:nowrap}',
    '.ordo-rpps-list li .ordo-rpps-note{flex:0 1 auto;text-align:right}',
    '.ordo-rpps-direct{margin-top:14px;padding-top:12px;border-top:1px solid #e6ecf5}',
    '.ordo-rpps-muted,.ordo-rpps-note{color:#5b6b85;font-size:13px}',
    '.ordo-rpps-error{color:#a8323a;margin-top:6px}',
    '.ordo-rpps-warn{color:#8a5a00;margin-top:6px}',
    '.ordo-rpps-card{border:1px solid #d9e2f0;border-radius:8px;padding:12px 14px;margin-top:8px}',
    '.ordo-rpps-link{background:none;border:0;padding:0;color:#1f3b73;text-decoration:underline;cursor:pointer;font:inherit;text-align:left}',
    '.ordo-rpps-scope{margin-top:6px}',
    '.ordo-rpps-done{background:#eef8f0;border:1px solid #bfe3c7;border-radius:8px;padding:12px 14px}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('ordo-rpps-styles')) return;
    var style = el('style');
    style.id = 'ordo-rpps-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  var root = el('div', 'ordo-rpps');
  root.setAttribute('aria-live', 'polite');

  function setMessage(container, message, kind) {
    var old = container.querySelector(':scope > .ordo-rpps-error, :scope > .ordo-rpps-warn');
    if (old) old.parentNode.removeChild(old);
    if (message) container.appendChild(el('div', kind === 'warn' ? 'ordo-rpps-warn' : 'ordo-rpps-error', message));
  }

  // --- Replié -------------------------------------------------------------------------------------

  function renderCollapsed() {
    clear(root);
    root.hidden = false;
    var line = el('div', 'ordo-rpps-cta');
    var hasNumber = !!normalizeRpps(fields()['n-rpps']);
    line.appendChild(el('span', 'ordo-rpps-muted', hasNumber
      ? 'Votre numéro RPPS n’est pas encore vérifié dans l’Annuaire santé.'
      : 'Retrouvez votre numéro RPPS dans l’Annuaire santé : il sera vérifié immédiatement.'));
    var open = button('ordo-rpps-link', hasNumber ? 'Vérifier maintenant' : 'Rechercher mon RPPS');
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
    root.hidden = false;
    var panel = el('div', 'ordo-rpps-panel');
    panel.appendChild(el('strong', null, 'Vérifier mon numéro RPPS'));
    panel.appendChild(el('span', 'ordo-rpps-muted', 'Recherchez votre fiche dans l’Annuaire santé, puis confirmez-la. Rien n’est enregistré sans votre confirmation.'));
    root.appendChild(panel);
    renderSearch(panel);
    var direct = el('div', 'ordo-rpps-direct');
    panel.appendChild(direct);
    renderNumber(direct);
    var close = button('ordo-rpps-link', 'Fermer');
    close.addEventListener('click', function() {
      searchSeq++;
      track('close');
      renderCollapsed();
    });
    var foot = el('div', 'ordo-rpps-muted');
    foot.style.marginTop = '10px';
    foot.appendChild(close);
    panel.appendChild(foot);
  }

  function renderSearch(panel) {
    var row = el('div', 'ordo-rpps-row');
    var family = el('input', 'form-input w-input');
    family.type = 'text';
    family.placeholder = 'Nom';
    family.maxLength = 60;
    family.setAttribute('aria-label', 'Nom');
    family.value = text(fields().nom);
    var given = el('input', 'form-input w-input');
    given.type = 'text';
    given.placeholder = 'Prénom (facultatif)';
    given.maxLength = 60;
    given.setAttribute('aria-label', 'Prénom (facultatif)');
    given.value = text(fields().prnom).split(/\s+/)[0] || '';
    var go = button(BTN_PRIMARY, 'Rechercher');
    row.appendChild(family);
    row.appendChild(given);
    row.appendChild(go);
    panel.appendChild(row);
    var results = el('div');
    panel.appendChild(results);
    var scopeLine = el('div', 'ordo-rpps-muted ordo-rpps-scope');
    panel.appendChild(scopeLine);

    function renderScopeLink() {
      clear(scopeLine);
      var link = button('ordo-rpps-link', scope === 'medecin'
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
      setMessage(panel, '');
      if (f.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 2) {
        setMessage(panel, 'Indiquez au moins 2 lettres du nom.');
        return;
      }
      var seq = ++searchSeq;
      clear(results);
      results.appendChild(el('div', 'ordo-rpps-muted', 'Recherche dans l’Annuaire santé…'));
      go.disabled = true;
      track('search');
      api({ action: 'search', family: f, given: g, scope: scope }).then(function(body) {
        if (seq !== searchSeq) return;
        renderResults(results, body.results || [], body.total || 0);
      }).catch(function(err) {
        if (seq !== searchSeq) return;
        clear(results);
        setMessage(panel, messageFor(err));
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
      container.appendChild(el('div', 'ordo-rpps-muted', 'Aucune fiche à ce nom dans l’Annuaire santé. Vérifiez l’orthographe, ou saisissez votre numéro ci-dessous.'));
      return;
    }
    track('results');
    if (list.some(function(c) { return c.name_match === 'n/a'; })) {
      container.appendChild(el('div', 'ordo-rpps-warn', 'Renseignez votre nom dans « Informations personnelles » pour pouvoir confirmer votre fiche.'));
    }
    var ul = el('ul', 'ordo-rpps-list');
    list.forEach(function(c) {
      var li = el('li');
      li.appendChild(el('span', null, candidateLabel(c)));
      if (c.name_match === 'yes') {
        var pick = button(BTN_SMALL, 'C’est moi');
        pick.addEventListener('click', function() { confirmCandidate(c, 'search', li); });
        li.appendChild(pick);
      } else if (c.name_match === 'no') {
        li.appendChild(el('span', 'ordo-rpps-note', 'Nom différent de votre profil'));
      }
      ul.appendChild(li);
    });
    container.appendChild(ul);
    if (total > list.length) {
      container.appendChild(el('div', 'ordo-rpps-muted', total + ' fiches correspondent, seules les ' + list.length + ' premières sont affichées : précisez le prénom.'));
    }
  }

  function renderNumber(container) {
    container.appendChild(el('div', 'ordo-rpps-muted', 'Ou saisissez directement votre numéro RPPS (11 chiffres) :'));
    var row = el('div', 'ordo-rpps-row');
    var num = el('input', 'form-input w-input');
    num.type = 'text';
    num.inputMode = 'numeric';
    num.placeholder = 'N° RPPS (11 chiffres)';
    num.maxLength = 20;
    num.setAttribute('aria-label', 'Numéro RPPS');
    num.value = normalizeRpps(fields()['n-rpps']);
    var check = button(BTN_PRIMARY, 'Vérifier');
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
      out.appendChild(el('div', 'ordo-rpps-muted', 'Vérification dans l’Annuaire santé…'));
      check.disabled = true;
      track('lookup');
      api({ action: 'lookup', rpps: n }).then(function(body) {
        clear(out);
        var c = body.results && body.results[0];
        if (!c) {
          setMessage(container, messageFor({ status: 404, code: 'unknown_rpps' }));
          return;
        }
        var card = el('div', 'ordo-rpps-card');
        card.appendChild(el('div', null, candidateLabel(c)));
        if (c.name_match === 'yes') {
          var ok = button(BTN_PRIMARY, 'Confirmer');
          ok.style.marginTop = '10px';
          ok.addEventListener('click', function() { confirmCandidate(c, 'number', card); });
          card.appendChild(ok);
        } else if (c.name_match === 'n/a') {
          card.appendChild(el('div', 'ordo-rpps-warn', messageFor({ code: 'name_missing', status: 409 })));
        } else {
          track('mismatch');
          card.appendChild(el('div', 'ordo-rpps-warn', 'Ce numéro correspond à ' + displayName(c) + ' dans l’Annuaire santé, pas au nom de votre profil. S’il s’agit bien de vous (nom d’usage, par exemple), écrivez-nous à ' + CONTACT + '.'));
        }
        out.appendChild(card);
      }).catch(function(err) {
        clear(out);
        setMessage(container, messageFor(err));
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
      merge(fields(), custom);
      var shared = window.OrdoMemberstack && window.OrdoMemberstack.customFields;
      if (shared && shared !== fields()) merge(shared, custom);
      // Le formulaire du bloc professionnel renvoie ce champ à chaque enregistrement.
      input.value = body.rpps;
      patchSnapshot(custom, { 'rpps-tested': body.rpps, 'date-check-RPPS': body.verified_at });
      track('saved');
      console.log(PREFIX, 'Saved', 'source=' + source, 'category=' + body.category);
      renderDone(body);
      try {
        document.dispatchEvent(new CustomEvent('ordo:member-updated', { detail: { source: 'rpps-finder' } }));
      } catch (e) { /* no-op */ }
    }).catch(function(err) {
      for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
      track(err && err.code === 'name_mismatch' ? 'mismatch' : 'failed');
      setMessage(node, messageFor(err));
      reportIfActionable('RppsFinder.select', err);
    });
  }

  function renderDone(body) {
    clear(root);
    root.hidden = false;
    var box = el('div', 'ordo-rpps-done');
    var who = [displayName(body), body.profession].filter(Boolean).join(', ');
    box.appendChild(el('div', null, 'Numéro RPPS vérifié dans l’Annuaire santé : ' + body.rpps + (who ? ' (' + who + ')' : '') + '.'));
    root.appendChild(box);
  }

  // --- Init --------------------------------------------------------------------------------------

  function render() {
    if (isVerified()) {
      clear(root);
      root.hidden = true;
      return;
    }
    renderCollapsed();
  }

  function init() {
    injectStyles();
    var cell = input.closest('.form-field-wrapper') || input.parentNode;
    if (cell && cell.parentNode) cell.parentNode.insertBefore(root, cell.nextSibling);
    render();
    if (!root.hidden) track('shown');
    console.log(PREFIX, 'Initialized', isVerified() ? '(verified)' : '(not verified)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
