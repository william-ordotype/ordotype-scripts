/**
 * Ordotype Account - Mon profil / Connexion et Sécurité (nouvelle présentation)
 *
 * Les deux onglets ont une nouvelle présentation construite dans le Designer :
 * [data-ordo-v2="profil"] et [data-ordo-v2="securite"], masqués par leur classe.
 * Ce script les remplit, les affiche, puis masque les anciens blocs.
 *
 * La lecture est native (cartes Webflow). La modification réutilise les
 * formulaires déjà en place : « Modifier » déplace le formulaire existant dans
 * la carte. Les identifiants et les scripts qui s'y accrochent (finder SIREN,
 * statut, téléphone, suppression, module TOTP) restent donc inchangés.
 *
 * Secours : tant que le rendu n'a pas réussi, rien n'est masqué. Une erreur
 * laisse l'ancienne présentation telle quelle.
 *
 * Depends on: core.js (window.OrdoAccount), Memberstack DOM SDK.
 */
(function() {
  'use strict';

  var PREFIX = '[ProfileOverview]';
  var HTML_CLASS = 'ordo-profil-v2';
  var MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s
  var SAVE_CHECK_MS = 1500;
  var VIDE = 'Non renseigné';

  var account = window.OrdoAccount;
  var member = account && account.member;
  if (!member || !member.id) return;

  var profil = document.querySelector('[data-ordo-v2="profil"]');
  var securite = document.querySelector('[data-ordo-v2="securite"]');
  if (!profil && !securite) {
    console.log(PREFIX, 'No V2 block on this page');
    return;
  }

  // Formulaires existants, repérés par ce qu'ils sont (et non par leur place).
  var FORMS = {
    perso: function() { return document.getElementById('profile-tab-1'); },
    pro: function() { return document.getElementById('profile-tab-2'); },
    contact: function() { return document.getElementById('profile-tab-3'); },
    email: function() { return outsideV2('form[data-ms-form="email"]'); },
    password: function() { return outsideV2('form[data-ms-form="password"]'); }
  };

  // --- Petits outils ---------------------------------------------------------------------------

  function outsideV2(selector) {
    var list = document.querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) {
      if (!list[i].closest('[data-ordo-v2]')) return list[i];
    }
    // Déjà déplacé dans une carte : on le renvoie aussi.
    return list[0] || null;
  }

  function text(v) {
    return v == null ? '' : String(v).trim();
  }

  function fields() {
    return member.customFields || {};
  }

  function isInterne() {
    return text(fields().statut).toLowerCase() === 'interne';
  }

  function email() {
    return text((member.auth && member.auth.email) || member.email);
  }

  /** Libellé affiché d'une valeur de liste : le texte de l'option du formulaire existant. */
  function optionLabel(field, value) {
    var v = text(value);
    if (!v) return '';
    var select = document.querySelector('select[data-ms-member="' + field + '"]');
    if (select) {
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === v) return text(select.options[i].textContent) || v;
      }
    }
    return v;
  }

  function formatPhone(v) {
    var s = text(v);
    var fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
    return fr ? '+33 ' + fr.slice(1).join(' ') : s;
  }

  function displayValue(field) {
    var f = fields();
    switch (field) {
      case 'email': return email();
      case 'statut': return optionLabel('statut', f.statut);
      case 'mode-dexercice': return optionLabel('mode-dexercice', f['mode-dexercice']);
      case 'phone': return formatPhone(f.phone);
      default: return text(f[field]);
    }
  }

  function setValue(node, value) {
    node.textContent = value || VIDE;
    node.style.color = value ? '' : '#47505c';
    node.style.fontWeight = value ? '' : '400';
  }

  function show(node, on, display) {
    if (node) node.style.display = on ? (display || '') : 'none';
  }

  function track(action, section, outcome) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;
    var payload = { event: 'profile_action', profile_action: action, profile_section: section || '', profile_outcome: outcome || '' };
    var rollout = window.OrdoRollout && window.OrdoRollout['profile-overview.js'];
    if (rollout) {
      payload.rollout_percent = rollout.percent;
      payload.rollout_bucket = rollout.bucket;
      payload.rollout_reason = rollout.reason;
    }
    try { window.dataLayer.push(payload); } catch (e) { /* no-op */ }
  }

  function report(name, detail) {
    var reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    var err = detail instanceof Error ? detail : new Error(String(detail));
    err.name = name;
    try { reporter.report('ProfileOverview', err); } catch (e) { /* no-op */ }
  }

  function waitForMemberstack() {
    return new Promise(function(resolve) {
      var attempts = 0;
      (function check() {
        if (window.$memberstackDom) return resolve(window.$memberstackDom);
        attempts += 1;
        if (attempts >= MS_MAX_ATTEMPTS) return resolve(null);
        setTimeout(check, 200);
      })();
    });
  }

  // --- Lecture ---------------------------------------------------------------------------------

  function render() {
    var f = fields();
    var all = document.querySelectorAll('[data-ordo-v2] [data-ordo-champ]');
    for (var i = 0; i < all.length; i++) {
      setValue(all[i], displayValue(all[i].getAttribute('data-ordo-champ')));
    }

    if (profil) {
      var prenom = text(f.prnom);
      var nom = text(f.nom);
      var complet = (prenom + ' ' + nom).trim() || email();
      var initiales = ((prenom.charAt(0) || '') + (nom.charAt(0) || '')).toUpperCase() || email().charAt(0).toUpperCase();
      var ini = profil.querySelector('[data-ordo-initiales]');
      if (ini) ini.textContent = initiales;
      var nc = profil.querySelector('[data-ordo-nom-complet]');
      if (nc) nc.textContent = complet;
      var resume = profil.querySelector('[data-ordo-resume]');
      if (resume) {
        var parts = [displayValue('statut'), text(f.specialite)];
        if (!isInterne()) parts.push(displayValue('mode-dexercice'));
        var line = parts.filter(Boolean).join(' · ');
        resume.textContent = line;
        show(resume, !!line);
      }
      var interne = profil.querySelectorAll('[data-ordo-si-pas-interne]');
      for (var j = 0; j < interne.length; j++) show(interne[j], !isInterne());
    }
  }

  // --- Modification ----------------------------------------------------------------------------

  /** Le formulaire existant, avec son conteneur Webflow (messages de succès et d'échec compris). */
  function formBlock(section) {
    var form = FORMS[section] && FORMS[section]();
    if (!form) return null;
    return form.closest('.w-form') || form;
  }

  /** Remet dans les champs les valeurs enregistrées (après « Annuler »). */
  function refill(block) {
    var inputs = block.querySelectorAll('[data-ms-member]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var key = el.getAttribute('data-ms-member');
      if (el.type === 'password' || el.type === 'checkbox' || el.type === 'hidden') continue;
      if (key === 'email') { el.value = email(); continue; }
      if (Object.prototype.hasOwnProperty.call(fields(), key)) el.value = text(fields()[key]);
    }
  }

  /**
   * Une valeur enregistrée absente de la liste (statut ou mode d'exercice plus
   * ancien que la liste actuelle) : la liste retombait sur l'option vide, et un
   * enregistrement l'effaçait. On l'ajoute comme option pour la conserver.
   */
  function keepUnlistedValues(block) {
    var selects = block.querySelectorAll('select[data-ms-member]');
    for (var i = 0; i < selects.length; i++) {
      var s = selects[i];
      var v = text(fields()[s.getAttribute('data-ms-member')]);
      if (!v) continue;
      var found = false;
      for (var k = 0; k < s.options.length; k++) if (s.options[k].value === v) found = true;
      if (!found) {
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        s.appendChild(opt);
      }
      s.value = v;
    }
  }

  /** La TVA suit la même règle que le reste de la carte : masquée aux internes. */
  function applyInterneToForm(block) {
    var tva = block.querySelector('[data-ms-member="vat-id"]');
    var cell = tva && (tva.closest('.form-field-wrapper') || tva.parentNode);
    var statut = block.querySelector('select[data-ms-member="statut"]');
    function apply(value) {
      show(cell, text(value).toLowerCase() !== 'interne');
    }
    apply(statut ? statut.value : fields().statut);
    if (statut && !statut.getAttribute('data-ordo-tva-bound')) {
      statut.setAttribute('data-ordo-tva-bound', '1');
      statut.addEventListener('change', function(e) { apply(e.target.value); });
    }
  }

  /** Même règle que .ordo-siren-host, pour le cas où le finder n'a pas tourné. */
  function hideSiretCell(block) {
    var siret = block.querySelector('#SIRET');
    var cell = siret && (siret.closest('.form-field-wrapper') || siret.parentNode);
    show(cell, false);
  }

  function card(section) {
    var btn = document.querySelector('[data-ordo-v2] [data-ordo-edit="' + section + '"]');
    return {
      button: btn,
      slot: document.querySelector('[data-ordo-v2] [data-ordo-form-slot="' + section + '"]'),
      lecture: document.querySelector('[data-ordo-v2] [data-ordo-lecture="' + section + '"]')
    };
  }

  function openEdit(section) {
    var c = card(section);
    if (!c.slot) return false;
    var blocks = [];
    var main = formBlock(section);
    if (main) blocks.push(main);
    // « Contact » regroupe téléphone, pays et e-mail : le formulaire e-mail n'existe
    // que pour un compte avec mot de passe (bloc d'origine sous `has-password`).
    if (section === 'contact' && emailEditable()) {
      var mail = formBlock('email');
      if (mail) blocks.push(mail);
    }
    if (!blocks.length) {
      report('ProfileOverviewNoForm', 'No form to move for section ' + section);
      track('edit', section, 'no-form');
      return false;
    }
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].parentNode !== c.slot) c.slot.appendChild(blocks[i]);
      show(blocks[i], true);
      refill(blocks[i]);
      keepUnlistedValues(blocks[i]);
      if (section === 'pro') {
        applyInterneToForm(blocks[i]);
        hideSiretCell(blocks[i]);
      }
      bindForm(blocks[i], section);
    }
    closeOthers(section);
    show(c.lecture, false);
    show(c.button, false);
    show(c.slot, true, 'block');
    var focus = c.slot.querySelector('input:not([type=hidden]):not([type=checkbox]), select');
    if (focus && typeof focus.focus === 'function') focus.focus();
    track('edit', section, 'open');
    return true;
  }

  function closeEdit(section) {
    var c = card(section);
    if (!c.slot) return;
    show(c.slot, false);
    show(c.lecture, true);
    show(c.button, true);
    var blocks = c.slot.querySelectorAll('.w-form, form');
    for (var i = 0; i < blocks.length; i++) refill(blocks[i]);
  }

  function closeOthers(except) {
    var slots = document.querySelectorAll('[data-ordo-v2] [data-ordo-form-slot]');
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i].getAttribute('data-ordo-form-slot');
      if (s !== except && s !== 'suppression' && slots[i].style.display !== 'none' && slots[i].childNodes.length) closeEdit(s);
    }
  }

  /**
   * L'e-mail ne se change qu'avec un mot de passe : Memberstack masque ou retire tout
   * ce qui porte `data-ms-content="has-password"`. On lit la ligne e-mail de la
   * nouvelle carte (l'ancien bloc, lui, est masqué par ce script).
   */
  function emailEditable() {
    if (!FORMS.email()) return false;
    var gated = document.querySelectorAll('[data-ms-content="has-password"]');
    for (var i = 0; i < gated.length; i++) {
      if (gated[i].closest('[data-ordo-v2]')) return window.getComputedStyle(gated[i]).display !== 'none';
    }
    var gate = FORMS.email().closest('[data-ms-content="has-password"]');
    return !gate || gate.style.display !== 'none';
  }

  function bindForm(block, section) {
    if (block.getAttribute('data-ordo-bound')) return;
    block.setAttribute('data-ordo-bound', section);
    // « Annuler » des formulaires existants : referme la carte.
    var links = block.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      if (text(links[i].textContent).toLowerCase() !== 'annuler') continue;
      links[i].addEventListener('click', function(e) {
        e.preventDefault();
        var owner = block.parentNode && block.parentNode.getAttribute('data-ordo-form-slot');
        closeEdit(owner || section);
        track('edit', owner || section, 'cancel');
      });
    }
    var form = block.tagName === 'FORM' ? block : block.querySelector('form');
    if (!form) return;
    form.addEventListener('submit', function() {
      var owner = block.parentNode && block.parentNode.getAttribute('data-ordo-form-slot');
      track('edit', owner || section, 'submit');
      setTimeout(function() { afterSave(block, owner || section); }, SAVE_CHECK_MS);
    });
  }

  function failed(block) {
    var fail = block.querySelector('.w-form-fail');
    return !!(fail && window.getComputedStyle(fail).display !== 'none');
  }

  /** Après un enregistrement : relire le membre, remettre la lecture à jour, refermer sauf échec. */
  function afterSave(block, section) {
    refresh().then(function() {
      if (failed(block)) {
        track('edit', section, 'failed');
        return;
      }
      if (section !== 'password') closeEdit(section);
    });
  }

  // --- Blocs déplacés d'office -----------------------------------------------------------------

  /** Le finder SIREN prend place dans sa carte ; son bandeau d'accueil doublait le texte de la carte. */
  function placeSirenFinder() {
    var slot = profil && profil.querySelector('[data-ordo-siren-slot]');
    var root = document.querySelector('.ordo-siren');
    if (slot && root && root.parentNode !== slot) slot.appendChild(root);
  }

  function placeDelete() {
    var btn = securite && securite.querySelector('[data-ordo-supprimer]');
    if (!btn) return;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var slot = securite.querySelector('[data-ordo-form-slot="suppression"]');
      var form = document.getElementById('delete-account-form-v2');
      if (!slot || !form) {
        report('ProfileOverviewNoDeleteForm', 'Delete form not found');
        return;
      }
      if (form.parentNode !== slot) slot.appendChild(form);
      form.style.display = 'block';
      show(slot, true, 'block');
      show(btn, false);
      track('delete', 'suppression', 'open');
    });
  }

  function placeGoogle() {
    var btn = securite && securite.querySelector('[data-ordo-google]');
    if (!btn) return;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var original = outsideV2('[data-ms-auth-provider="google"]');
      track('google', 'connexion', original ? 'click' : 'missing');
      if (original && original !== btn) original.click();
      else report('ProfileOverviewNoGoogle', 'Google link not found');
    });
  }

  // --- Double authentification -----------------------------------------------------------------

  /**
   * Le module TOTP (auth-bundle) écrit data-ordo-2fa-state sur la carte quand il
   * rend APRÈS le déplacement. S'il a rendu avant, l'état se lit sur son
   * conteneur. La carte ne s'affiche qu'aux membres soumis au code de connexion.
   */
  function totpState(block, container) {
    var s = block.getAttribute('data-ordo-2fa-state');
    if (s) return s;
    if (!container) return 'absent';
    if (container.style.display === 'none') return 'not-required';
    if (container.querySelector('.ot-totp__error')) return 'error';
    if (container.querySelector('[data-ot-action]')) return 'required';
    return 'pending';
  }

  function placeTotp() {
    var block = securite && securite.querySelector('[data-ordo-2fa-block]');
    if (!block) return;
    var slot = block.querySelector('[data-ordo-totp-slot]');
    var container = document.getElementById('ordotype-totp-section');
    if (container && slot && container.parentNode !== slot) slot.appendChild(container);
    var last = null;
    function update() {
      var state = totpState(block, container);
      block.style.display = state === 'required' ? 'flex' : 'none';
      if (state !== last && state !== 'pending') {
        last = state;
        track('2fa', '2fa', state);
      }
    }
    update();
    if (typeof MutationObserver === 'function') {
      var obs = new MutationObserver(update);
      obs.observe(block, { attributes: true, attributeFilter: ['data-ordo-2fa-state'] });
      if (container) obs.observe(container, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
    }
  }

  // --- Styles ----------------------------------------------------------------------------------

  var CSS = [
    // Anciens blocs des deux onglets concernés (et d'eux seuls : l'onglet facturation a les
    // siens), masqués seulement une fois la nouvelle présentation rendue.
    'html.' + HTML_CLASS + ' .ordo-v2-host > .inner-block-wraper{display:none!important}',
    'html.' + HTML_CLASS + ' [data-ordo-v2]{display:flex!important}',
    '[data-ordo-v2] .compte-v2_edit .w-form,[data-ordo-v2] .compte-v2_edit form{margin:0}',
    '[data-ordo-v2] .compte-v2_edit .compte-form-wrapper + .compte-form-wrapper{margin-top:24px;padding-top:24px;border-top:1px solid #0c0e161a}',
    '[data-ordo-v2] .ordo-siren{margin:0;max-width:none}',
    '[data-ordo-v2] .ordo-siren-banner{display:none}',
    // Le SIREN a sa propre carte : sa cellule d'origine ne s'affiche plus dans le formulaire pro.
    '[data-ordo-v2] .ordo-siren-host{display:none!important}',
    // Module TOTP : même langage visuel que les cartes.
    '[data-ordo-v2] .ot-totp__card{background:transparent;border:0;border-radius:0;padding:16px 0 0;margin:0;box-shadow:none}',
    '[data-ordo-v2] .ot-totp__title{font-size:16px;line-height:1.5;font-weight:600;margin:0 0 4px}',
    '[data-ordo-v2] .ot-totp__hint{font-size:14px;line-height:1.5;color:#47505c;margin:0}',
    '[data-ordo-v2] .ot-totp__btn{border-radius:4px}',
    '[data-ordo-v2] .ot-totp__btn--primary{background:#3454f6;border-color:#3454f6}',
    '[data-ordo-v2] .ot-totp__btn--primary:hover{background:#263fd3;border-color:#263fd3}',
    '[data-ordo-v2] .ot-totp__btn--secondary{color:#3454f6;border-color:#3454f6}',
    '[data-ordo-v2] .ot-totp__btn--danger{color:#ba1b1b;border-color:#ba1b1b}',
    '[data-ordo-v2] .ot-totp__badge{border-radius:4px;background:#106820;color:#fff}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('ordo-profil-v2-styles')) return;
    var style = document.createElement('style');
    style.id = 'ordo-profil-v2-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // --- Mise à jour depuis Memberstack ----------------------------------------------------------

  function refresh() {
    return waitForMemberstack().then(function(ms) {
      if (!ms || typeof ms.getCurrentMember !== 'function') return null;
      return Promise.resolve(ms.getCurrentMember({ useCache: false })).then(function(res) {
        var data = res && res.data;
        if (!data || !data.id) return;
        member.customFields = data.customFields || member.customFields;
        if (data.auth) member.auth = data.auth;
        render();
      });
    }).catch(function(err) {
      console.warn(PREFIX, 'Member refresh failed (best effort):', err && err.message);
    });
  }

  // --- Init ------------------------------------------------------------------------------------

  function listenEdits() {
    document.addEventListener('click', function(e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-ordo-v2] [data-ordo-edit]') : null;
      if (!t) return;
      e.preventDefault();
      openEdit(t.getAttribute('data-ordo-edit'));
    });
  }

  function init() {
    try {
      injectStyles();
      render();
      if (profil && profil.parentNode) profil.parentNode.classList.add('ordo-v2-host');
      if (securite && securite.parentNode) securite.parentNode.classList.add('ordo-v2-host');
      placeSirenFinder();
      placeDelete();
      placeGoogle();
      placeTotp();
      listenEdits();
      document.documentElement.classList.add(HTML_CLASS);
      track('view', '', 'shown');
      console.log(PREFIX, 'Shown');
    } catch (err) {
      document.documentElement.classList.remove(HTML_CLASS);
      track('view', '', 'failed');
      report('ProfileOverviewInit', err);
      return;
    }
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
