/**
 * Ordotype Account - SIREN Finder
 * Collecte en self-service du SIREN/SIRET du membre pour la facturation
 * électronique (le SIREN du client est l'adresse de routage de la facture
 * dans l'annuaire des plateformes agréées, obligation d'émission PME au
 * 01/09/2027). Trois chemins : « Rechercher mon entreprise » (SIRENE par nom
 * et département), « J'ai mon numéro » (SIREN 9 ou SIRET 14 chiffres, vérifié
 * dans SIRENE) et une suggestion à confirmer. Rien n'est enregistré sans un
 * clic du membre ; l'écriture passe par le serveur (siren-select), jamais par
 * le navigateur.
 *
 * Depends on: core.js (window.OrdoAccount), shared/error-reporter.js,
 *             Memberstack DOM SDK ($memberstackDom, pour le cookie membre)
 * Expected DOM (Webflow): input#SIRET[data-ms-member="siret"] dans le
 *             formulaire profil (bloc « Professionnel » de /membership/compte),
 *             select#mon-statut-2 (statut, pour masquer le bloc aux internes).
 *             L'input reste dans le DOM (masqué) et porte toujours la valeur
 *             enregistrée : le formulaire profil Memberstack continue de la
 *             sauvegarder telle quelle.
 *
 * Backend : webhooks.ordotype.fr (repo ordotype-webhooks, siren-search /
 *           siren-select). Jamais *.netlify.app (bloqué par les bloqueurs).
 * Spec : ~/Documents/Scripts/siren-calibration/SPEC.md (v1.1).
 */
(function() {
  'use strict';

  var PREFIX = '[SirenFinder]';
  var API_BASE = 'https://webhooks.ordotype.fr/.netlify/functions';
  var SEARCH_URL = API_BASE + '/siren-search';
  var SELECT_URL = API_BASE + '/siren-select';
  var DECLINE_KEY = 'ordo_siren_suggestion_declined_at';
  var DECLINE_DAYS = 30;
  var MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s
  var DEBOUNCE_MS = 400;
  var POSTAL_FIELDS = ['code-postal', 'codepostal', 'cp', 'zip', 'postal-code'];

  var account = window.OrdoAccount;
  var member = account && account.member;
  if (!member || !member.id) return;

  var input = document.getElementById('SIRET');
  if (!input) {
    console.log(PREFIX, 'No #SIRET input on this page');
    return;
  }

  var customFields = member.customFields || {};
  var state = {
    statut: customFields.statut || '',
    // Seul champ membre : `siret` (9 ou 14 chiffres). Le SIREN en est dérivé,
    // il n'existe pas de customField `siren` (reporting).
    siret: String(customFields.siret || ''),
    siren: '',
    nom: String(customFields.nom || ''),
    prenom: String(customFields.prnom || ''),
    suggestionShown: false
  };

  // ---------------------------------------------------------------------------
  // Helpers purs
  // ---------------------------------------------------------------------------

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

  // Même règle que le serveur : 9 ou 14 chiffres, Luhn sur les deux niveaux.
  function normalizeNumber(raw) {
    var d = digits(raw);
    if (d.length === 9) return luhnOk(d) ? { siren: d, siret: null } : null;
    if (d.length === 14) {
      var siren = d.slice(0, 9);
      return luhnOk(d) && luhnOk(siren) ? { siren: siren, siret: d } : null;
    }
    return null;
  }

  function formatSiren(siren) {
    var d = digits(siren);
    return d.length === 9 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d;
  }

  function departementFromInput(value) {
    var s = String(value || '').trim().toUpperCase();
    var d = digits(s);
    if (d.length === 5) {
      if (d.indexOf('97') === 0 || d.indexOf('98') === 0) return d.slice(0, 3);
      if (d.indexOf('20') === 0) return (d.indexOf('200') === 0 || d.indexOf('201') === 0) ? '2A' : '2B';
      return d.slice(0, 2);
    }
    if (/^(2A|2B)$/.test(s)) return s;
    if (/^\d{2}$/.test(d) && d === s) return d;
    if (/^\d{3}$/.test(d) && d === s && (d.indexOf('97') === 0 || d.indexOf('98') === 0)) return d;
    return '';
  }

  function memberPostalCode() {
    for (var i = 0; i < POSTAL_FIELDS.length; i++) {
      var v = customFields[POSTAL_FIELDS[i]];
      if (v && digits(v).length === 5) return digits(v);
    }
    return '';
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function track(eventName, params) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;
    var payload = { event: eventName };
    if (params) {
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
      }
    }
    try { window.dataLayer.push(payload); } catch (e) { /* no-op */ }
  }

  function debounce(fn, wait) {
    var timer = null;
    return function() {
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() {
        timer = null;
        fn.apply(null, args);
      }, wait);
    };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function candidateLabel(c) {
    var parts = [];
    if (c.nom) parts.push(c.nom);
    if (c.siren) parts.push('SIREN ' + formatSiren(c.siren));
    if (c.libelle_activite) parts.push(c.libelle_activite);
    var lieu = [c.code_postal, c.commune].filter(Boolean).join(' ');
    if (lieu) parts.push(lieu);
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------------------
  // Memberstack : cookie membre pour authentifier l'écriture
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

  // ---------------------------------------------------------------------------
  // Appels réseau
  // ---------------------------------------------------------------------------

  function apiSearch(params) {
    var qs = [];
    for (var k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k) && params[k] !== '' && params[k] != null) {
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    }
    return fetch(SEARCH_URL + '?' + qs.join('&'), { method: 'GET', credentials: 'omit' }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(body) {
        if (!res.ok) {
          var err = new Error('siren-search ' + res.status + ' ' + (body && body.error ? body.error : ''));
          err.status = res.status;
          err.code = body && body.error;
          throw err;
        }
        return body;
      });
    });
  }

  function apiSelect(mode, siren, siret) {
    return memberToken().then(function(token) {
      if (!token) {
        var e = new Error('no member token');
        e.status = 401;
        throw e;
      }
      return fetch(SELECT_URL, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ mode: mode, siren: siren, siret: siret || null })
      });
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(body) {
        if (!res.ok) {
          var err = new Error('siren-select ' + res.status + ' ' + (body && body.error ? body.error : ''));
          err.status = res.status;
          err.code = body && body.error;
          err.body = body;
          throw err;
        }
        return body;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  var root = el('div', 'ordo-siren');
  root.setAttribute('aria-live', 'polite');
  var css = [
    '.ordo-siren{margin:8px 0 16px;font-size:15px;line-height:1.45}',
    '.ordo-siren[hidden]{display:none}',
    '.ordo-siren-banner{background:#f3f6fb;border:1px solid #d9e2f0;border-radius:8px;padding:12px 14px;margin-bottom:10px}',
    '.ordo-siren-banner strong{display:block;margin-bottom:2px}',
    '.ordo-siren-tabs{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}',
    '.ordo-siren-tab{background:#fff;border:1px solid #c9d3e3;border-radius:999px;padding:6px 14px;cursor:pointer;font:inherit}',
    '.ordo-siren-tab[aria-selected="true"]{background:#1f3b73;border-color:#1f3b73;color:#fff}',
    '.ordo-siren-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}',
    '.ordo-siren-row input{flex:1 1 160px;min-width:0}',
    '.ordo-siren-btn{background:#1f3b73;color:#fff;border:0;border-radius:6px;padding:9px 14px;cursor:pointer;font:inherit}',
    '.ordo-siren-btn[disabled]{opacity:.5;cursor:default}',
    '.ordo-siren-btn-secondary{background:#fff;color:#1f3b73;border:1px solid #1f3b73}',
    '.ordo-siren-list{list-style:none;margin:0;padding:0;border:1px solid #d9e2f0;border-radius:8px;overflow:hidden}',
    '.ordo-siren-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #e6ecf5}',
    '.ordo-siren-list li:first-child{border-top:0}',
    '.ordo-siren-list li:hover{background:#f6f8fc}',
    '.ordo-siren-muted{color:#5b6b85;font-size:13px}',
    '.ordo-siren-error{color:#a8323a;margin-top:6px}',
    '.ordo-siren-warn{color:#8a5a00;margin-top:6px}',
    '.ordo-siren-card{border:1px solid #d9e2f0;border-radius:8px;padding:12px 14px;margin-top:8px}',
    '.ordo-siren-link{background:none;border:0;padding:0;color:#1f3b73;text-decoration:underline;cursor:pointer;font:inherit}',
    '.ordo-siren-done{background:#eef8f0;border:1px solid #bfe3c7;border-radius:8px;padding:12px 14px}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('ordo-siren-styles')) return;
    var style = el('style');
    style.id = 'ordo-siren-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setError(container, message, kind) {
    var old = container.querySelector('.ordo-siren-error, .ordo-siren-warn');
    if (old) old.parentNode.removeChild(old);
    if (!message) return;
    container.appendChild(el('div', kind === 'warn' ? 'ordo-siren-warn' : 'ordo-siren-error', message));
  }

  function messageFor(err) {
    var status = err && err.status;
    var code = err && err.code;
    if (status === 401) return 'Votre session a expiré : reconnectez-vous puis réessayez.';
    if (code === 'interne') return 'Les internes n\'ont pas besoin de renseigner de SIREN.';
    if (code === 'unknown_siren') return 'Ce numéro est inconnu du répertoire SIRENE. Vérifiez les chiffres.';
    if (code === 'closed') return 'Cette entreprise apparaît fermée dans le répertoire SIRENE. Vérifiez votre numéro.';
    if (code === 'invalid_number') return 'Numéro invalide : 9 chiffres (SIREN) ou 14 chiffres (SIRET).';
    if (code === 'upstream_rejected' || code === 'invalid_query' || code === 'invalid_departement') return 'Recherche impossible avec ces critères : essayez un autre nom ou département, ou saisissez votre numéro.';
    if (status === 429 || status === 503) return 'Service momentanément indisponible, réessayez dans quelques secondes.';
    if (status === 0 || !status) return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
    return 'Une erreur est survenue. Réessayez, ou saisissez votre numéro directement.';
  }

  function reportIfActionable(context, err) {
    var status = err && err.status;
    if (status === 401) {
      console.warn(PREFIX, 'Session expired (401)');
      return;
    }
    if (status === 400 || status === 404 || status === 409 || status === 429 || status === 503) return;
    if (window.OrdoErrorReporter) window.OrdoErrorReporter.report(context, err);
  }

  // --- État « Renseigné » ------------------------------------------------------

  function renderDone(info) {
    clear(root);
    var box = el('div', 'ordo-siren-done');
    var who = [info.name, info.commune].filter(Boolean).join(', ');
    box.appendChild(el('div', null, 'Vos factures électroniques seront adressées au SIREN ' + formatSiren(info.siren) + (who ? ' (' + who + ')' : '') + '.'));
    if (info.etat === 'C') {
      box.appendChild(el('div', 'ordo-siren-warn', 'Cette entreprise apparaît fermée dans le répertoire SIRENE, merci de vérifier.'));
    }
    if (info.siretNote) {
      box.appendChild(el('div', 'ordo-siren-muted', 'L\'établissement saisi est introuvable ou fermé dans le répertoire SIRENE : seul le SIREN a été enregistré, ce qui suffit pour vos factures.'));
    }
    var edit = el('button', 'ordo-siren-link', 'Modifier');
    edit.type = 'button';
    edit.addEventListener('click', function() {
      track('siren_finder_open', { from: 'done' });
      renderEmpty();
    });
    box.appendChild(el('div', 'ordo-siren-muted')).appendChild(edit);
    root.appendChild(box);
  }

  // --- État « Vide » : bandeau + onglets ------------------------------------------

  var activeTab = 'search';

  function renderEmpty() {
    clear(root);
    var banner = el('div', 'ordo-siren-banner');
    banner.appendChild(el('strong', null, 'Vos factures électroniques ont besoin de votre SIREN'));
    banner.appendChild(el('span', 'ordo-siren-muted', 'Le SIREN correspond aux 9 premiers chiffres de votre SIRET. Il sert uniquement à adresser vos factures électroniques à votre plateforme de facturation.'));
    root.appendChild(banner);

    var tabs = el('div', 'ordo-siren-tabs');
    tabs.setAttribute('role', 'tablist');
    var tabSearch = el('button', 'ordo-siren-tab', 'Rechercher mon entreprise');
    var tabNumber = el('button', 'ordo-siren-tab', 'J\'ai mon numéro');
    tabSearch.type = 'button';
    tabNumber.type = 'button';
    tabSearch.setAttribute('role', 'tab');
    tabNumber.setAttribute('role', 'tab');
    tabs.appendChild(tabSearch);
    tabs.appendChild(tabNumber);
    root.appendChild(tabs);

    var panel = el('div', 'ordo-siren-panel');
    root.appendChild(panel);

    function select(tab) {
      activeTab = tab;
      tabSearch.setAttribute('aria-selected', tab === 'search' ? 'true' : 'false');
      tabNumber.setAttribute('aria-selected', tab === 'number' ? 'true' : 'false');
      clear(panel);
      if (tab === 'search') renderSearch(panel); else renderNumber(panel);
    }
    tabSearch.addEventListener('click', function() { select('search'); });
    tabNumber.addEventListener('click', function() { select('number'); });
    select(activeTab);
  }

  // --- Onglet recherche ------------------------------------------------------------

  function renderSearch(panel) {
    var row = el('div', 'ordo-siren-row');
    var nameInput = el('input', 'form-input w-input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Nom et prénom, ou raison sociale';
    nameInput.value = (state.prenom + ' ' + state.nom).trim();
    nameInput.setAttribute('aria-label', 'Nom de l\'entreprise ou du praticien');
    nameInput.maxLength = 80;
    var cpInput = el('input', 'form-input w-input');
    cpInput.type = 'text';
    cpInput.placeholder = 'Code postal ou département';
    cpInput.value = memberPostalCode();
    cpInput.setAttribute('aria-label', 'Code postal ou département');
    cpInput.maxLength = 5;
    cpInput.style.flex = '0 1 200px';
    var btn = el('button', 'ordo-siren-btn', 'Rechercher');
    btn.type = 'button';
    row.appendChild(nameInput);
    row.appendChild(cpInput);
    row.appendChild(btn);
    panel.appendChild(row);

    var results = el('div');
    panel.appendChild(results);

    var lastKey = '';
    var withoutActivity = false;

    function run(force) {
      var q = nameInput.value.replace(/\s+/g, ' ').trim();
      var dep = departementFromInput(cpInput.value);
      if (q.length < 3 || !dep) {
        if (force) setError(panel, q.length < 3 ? 'Indiquez au moins 3 caractères.' : 'Indiquez un code postal (5 chiffres) ou un département.');
        return;
      }
      var key = q + '|' + dep + '|' + (withoutActivity ? 0 : 1);
      if (!force && key === lastKey) return;
      lastKey = key;
      setError(panel, '');
      clear(results);
      results.appendChild(el('div', 'ordo-siren-muted', 'Recherche en cours…'));
      btn.disabled = true;

      var first = !state.suggestionShown && !withoutActivity && !suggestionDeclined() && state.nom && state.prenom
        ? apiSearch({ mode: 'suggest', prenom: state.prenom, nom: state.nom, dep: dep })
        : Promise.resolve({ results: [] });

      first.catch(function() { return { results: [] }; }).then(function(sug) {
        if (sug && sug.results && sug.results.length === 1 && key === lastKey) {
          state.suggestionShown = true;
          track('siren_suggestion_shown');
          renderSuggestion(results, sug.results[0], function() {
            // « Non » → recherche classique
            safeSet(DECLINE_KEY, String(Date.now()));
            track('siren_suggestion_declined');
            lastKey = '';
            run(true);
          });
          btn.disabled = false;
          return;
        }
        track('siren_search', { mode: 'name', act: withoutActivity ? 0 : 1 });
        return apiSearch({ mode: 'name', q: q, dep: dep, act: withoutActivity ? '0' : '1' }).then(function(body) {
          if (key !== lastKey) return;
          renderResults(results, body.results || [], body.total || 0);
        });
      }).catch(function(err) {
        if (key !== lastKey) return;
        clear(results);
        setError(panel, messageFor(err));
        reportIfActionable('SirenFinder.search', err);
      }).then(function() {
        btn.disabled = false;
      });
    }

    function renderResults(container, list, total) {
      clear(container);
      if (!list.length) {
        container.appendChild(el('div', 'ordo-siren-muted', withoutActivity
          ? 'Aucun résultat. Si vous avez demandé la non-diffusion de vos données à l\'INSEE, votre nom n\'apparaît pas dans les recherches : saisissez directement votre numéro.'
          : 'Aucun résultat avec ce nom dans ce département.'));
      } else {
        var ul = el('ul', 'ordo-siren-list');
        list.forEach(function(c) {
          var li = el('li');
          li.appendChild(el('span', null, candidateLabel(c)));
          var pick = el('button', 'ordo-siren-btn ordo-siren-btn-secondary', 'C\'est moi');
          pick.type = 'button';
          pick.addEventListener('click', function() { confirmCandidate(c, 'search', li); });
          li.appendChild(pick);
          ul.appendChild(li);
        });
        container.appendChild(ul);
        if (total > list.length) {
          container.appendChild(el('div', 'ordo-siren-muted', total + ' résultats, seuls les ' + list.length + ' premiers sont affichés : précisez le nom.'));
        }
      }
      var more = el('div', 'ordo-siren-muted');
      var link = el('button', 'ordo-siren-link', withoutActivity ? 'Saisir mon numéro directement' : 'Je ne trouve pas mon entreprise');
      link.type = 'button';
      link.addEventListener('click', function() {
        if (withoutActivity) {
          activeTab = 'number';
          renderEmpty();
        } else {
          withoutActivity = true;
          run(true);
        }
      });
      more.appendChild(link);
      if (withoutActivity) {
        more.appendChild(el('span', null, ' (les entreprises ayant demandé la non-diffusion INSEE n\'apparaissent jamais par le nom).'));
      }
      container.appendChild(more);
    }

    var debounced = debounce(function() { run(false); }, DEBOUNCE_MS);
    nameInput.addEventListener('input', debounced);
    cpInput.addEventListener('input', debounced);
    nameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); run(true); } });
    cpInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); run(true); } });
    btn.addEventListener('click', function() { run(true); });

    if (nameInput.value.length >= 3 && departementFromInput(cpInput.value)) run(false);
  }

  function suggestionDeclined() {
    var at = Number(safeGet(DECLINE_KEY) || 0);
    return at > 0 && (Date.now() - at) < DECLINE_DAYS * 86400000;
  }

  // --- Suggestion (« Est-ce votre entreprise ? ») ----------------------------------------

  function renderSuggestion(container, c, onDecline) {
    clear(container);
    var card = el('div', 'ordo-siren-card');
    card.appendChild(el('strong', null, 'Est-ce votre entreprise ?'));
    card.appendChild(el('div', null, candidateLabel(c)));
    card.appendChild(el('div', 'ordo-siren-muted', 'Proposition issue du répertoire SIRENE de l\'INSEE à partir de votre nom et de votre département. Rien n\'est enregistré sans votre confirmation.'));
    var row = el('div', 'ordo-siren-row');
    row.style.marginTop = '10px';
    var yes = el('button', 'ordo-siren-btn', 'Oui, c\'est moi');
    yes.type = 'button';
    var no = el('button', 'ordo-siren-btn ordo-siren-btn-secondary', 'Non');
    no.type = 'button';
    yes.addEventListener('click', function() {
      track('siren_suggestion_confirmed');
      confirmCandidate(c, 'suggestion', card);
    });
    no.addEventListener('click', onDecline);
    row.appendChild(yes);
    row.appendChild(no);
    card.appendChild(row);
    container.appendChild(card);
  }

  // --- Onglet numéro ---------------------------------------------------------------------

  function renderNumber(panel) {
    var row = el('div', 'ordo-siren-row');
    var numInput = el('input', 'form-input w-input');
    numInput.type = 'text';
    numInput.inputMode = 'numeric';
    numInput.placeholder = 'SIREN (9 chiffres) ou SIRET (14 chiffres)';
    numInput.setAttribute('aria-label', 'SIREN ou SIRET');
    numInput.maxLength = 20;
    var btn = el('button', 'ordo-siren-btn', 'Vérifier');
    btn.type = 'button';
    btn.disabled = true;
    row.appendChild(numInput);
    row.appendChild(btn);
    panel.appendChild(row);
    var out = el('div');
    panel.appendChild(out);

    numInput.addEventListener('input', function() {
      var d = digits(numInput.value);
      var ok = normalizeNumber(d);
      btn.disabled = !ok;
      if (d.length === 9 || d.length === 14) {
        setError(panel, ok ? '' : 'Ce numéro ne passe pas le contrôle de validité : vérifiez les chiffres.');
      } else {
        setError(panel, '');
      }
    });

    function verify() {
      var num = normalizeNumber(numInput.value);
      if (!num) return;
      clear(out);
      out.appendChild(el('div', 'ordo-siren-muted', 'Vérification dans le répertoire SIRENE…'));
      btn.disabled = true;
      track('siren_search', { mode: 'number' });
      apiSearch({ mode: 'number', n: num.siret || num.siren }).then(function(body) {
        clear(out);
        var c = body.results && body.results[0];
        if (!c) {
          setError(panel, 'Ce numéro est inconnu du répertoire SIRENE. Vérifiez les chiffres.');
          return;
        }
        var card = el('div', 'ordo-siren-card');
        card.appendChild(el('div', null, candidateLabel(c) + (c.etat === 'C' ? ' · fermée' : ' · active')));
        if (c.diffusion === 'P') {
          card.appendChild(el('div', 'ordo-siren-muted', 'Entreprise non diffusible : le nom n\'est pas affiché, vérifiez la commune et l\'activité.'));
        } else if (state.nom && !nameMatches(state.nom, c.nom)) {
          card.appendChild(el('div', 'ordo-siren-warn', 'Ce numéro correspond à « ' + c.nom + ' ». Est-ce bien votre structure ?'));
        }
        if (num.siret && c.siret_known === false) {
          card.appendChild(el('div', 'ordo-siren-warn', 'Cet établissement (14 chiffres) est introuvable dans le répertoire : seul le SIREN sera enregistré. Vérifiez les 5 derniers chiffres si vous tenez au SIRET.'));
        } else if (num.siret && c.siret_etat === 'F') {
          card.appendChild(el('div', 'ordo-siren-warn', 'Cet établissement est fermé dans le répertoire : seul le SIREN sera enregistré.'));
        }
        if (c.etat === 'C') {
          card.appendChild(el('div', 'ordo-siren-error', 'Cette entreprise est fermée dans le répertoire SIRENE : elle ne peut pas recevoir vos factures. Vérifiez votre numéro.'));
        } else {
          var confirm = el('button', 'ordo-siren-btn', 'Confirmer');
          confirm.type = 'button';
          confirm.style.marginTop = '10px';
          confirm.addEventListener('click', function() {
            c.siret_chosen = num.siret;
            confirmCandidate(c, 'number', card);
          });
          card.appendChild(confirm);
        }
        out.appendChild(card);
      }).catch(function(err) {
        clear(out);
        setError(panel, messageFor(err));
        reportIfActionable('SirenFinder.number', err);
      }).then(function() {
        btn.disabled = !normalizeNumber(numInput.value);
      });
    }

    btn.addEventListener('click', verify);
    numInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); verify(); } });
  }

  // Garde-fou de plausibilité côté affichage (le serveur trace la même chose).
  function nameMatches(nom, nomComplet) {
    var norm = function(s) {
      return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/[\s'-]+/).filter(Boolean);
    };
    var wanted = norm(nom).filter(function(t) { return t.length > 2; });
    var have = norm(nomComplet);
    if (!wanted.length) return true;
    return wanted.every(function(t) { return have.indexOf(t) !== -1; });
  }

  // --- Enregistrement ------------------------------------------------------------------------

  function confirmCandidate(c, mode, sourceNode) {
    var buttons = sourceNode ? sourceNode.querySelectorAll('button') : [];
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    // Établissement qui a fait correspondre la recherche (sinon le siège) ; le serveur
    // ne conserve le SIRET que s'il le retrouve dans SIRENE.
    var siret = c.siret_chosen || c.siret || c.siret_siege || null;
    setError(root, '');
    apiSelect(mode, c.siren, siret).then(function(body) {
      state.siren = body.siren;
      state.siret = body.siret || body.siren;
      input.value = state.siret;
      if (window.OrdoMemberstack && window.OrdoMemberstack.customFields) {
        window.OrdoMemberstack.customFields.siret = state.siret;
      }
      track('siren_selected', { mode: mode, source: body.source, name_match: body.name_match, stripe: body.stripe });
      if (body.stripe === 'failed') {
        // Memberstack est la source de vérité : enregistré côté membre, la projection Stripe sera rattrapée.
        console.warn(PREFIX, 'Saved in Memberstack, Stripe projection deferred (reconciliation)');
      }
      console.log(PREFIX, 'Saved', body.siren, 'source=' + body.source, 'match=' + body.name_match, 'stripe=' + body.stripe);
      renderDone({
        siren: body.siren,
        name: body.name,
        commune: body.commune,
        etat: 'A',
        siretNote: body.siret_status === 'unknown' || body.siret_status === 'closed'
      });
    }).catch(function(err) {
      for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
      if (err && err.code === 'interne') {
        hideAll();
        return;
      }
      setError(root, messageFor(err));
      reportIfActionable('SirenFinder.select', err);
    });
  }

  // --- Visibilité (internes) ------------------------------------------------------------------

  function hideAll() {
    root.hidden = true;
    input.style.display = 'none';
  }

  function showAll() {
    root.hidden = false;
  }

  function applyStatut(statut) {
    state.statut = statut || '';
    if (state.statut === 'Interne') hideAll(); else showAll();
  }

  // --- Init ------------------------------------------------------------------------------------

  function init() {
    injectStyles();
    input.style.display = 'none';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    if (input.parentNode) input.parentNode.insertBefore(root, input.nextSibling);

    var current = normalizeNumber(state.siret || state.siren);
    if (current) {
      state.siren = current.siren;
      renderDone({ siren: current.siren, name: (member.metaData && member.metaData['siren-name']) || '', commune: '', etat: (member.metaData && member.metaData['siren-etat']) || 'A' });
    } else {
      if (state.siret) {
        // Valeur héritée invalide (saisie libre d'avant le finder)
        renderEmpty();
        setError(root, 'Le numéro enregistré (' + state.siret + ') est invalide, merci de le corriger.');
      } else {
        renderEmpty();
      }
      track('siren_finder_open', { from: 'empty' });
    }

    applyStatut(state.statut);
    var statutSelector = document.getElementById('mon-statut-2');
    if (statutSelector) {
      statutSelector.addEventListener('change', function(e) { applyStatut(e.target.value); });
    }
    console.log(PREFIX, 'Initialized', current ? '(siren set)' : '(empty)', 'statut=' + (state.statut || '?'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
