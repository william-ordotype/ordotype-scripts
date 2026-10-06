/**
 * Ordotype Account - Carte « E-mails » de Mon profil
 *
 * Une carte sous « Contact », avec un bouton vers la page /preferences-email où
 * le membre règle ses e-mails marketing. Elle n'appelle aucun serveur : l'état
 * des préférences se lit sur la page elle-même, pas à chaque ouverture de Mon
 * compte.
 *
 * La carte reprend les classes des cartes du Designer (`compte-v2_*`), dans le
 * bloc « Mon profil » de la nouvelle présentation ([data-ordo-v2="profil"]).
 * Sans ce bloc, rien n'est ajouté : la page reste joignable par le lien des
 * e-mails.
 *
 * Depends on: profile-overview.js (le bloc [data-ordo-v2]), shared/error-reporter.js (facultatif)
 */
(function() {
  'use strict';

  var PREFIX = '[EmailPreferencesCard]';
  var PAGE_URL = '/preferences-email';
  var MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s

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

  // Même grille que la carte « Contact » : libellé (dt), valeur (dd), aide (hint).
  function field(label, value, hint) {
    var f = document.createElement('div');
    f.className = 'compte-v2_field';
    var dt = document.createElement('div');
    dt.className = 'compte-v2_dt';
    dt.textContent = label;
    var dd = document.createElement('div');
    dd.className = 'compte-v2_dd';
    dd.textContent = value;
    f.appendChild(dt);
    f.appendChild(dd);
    if (hint) {
      var h = document.createElement('div');
      h.className = 'compte-v2_hint';
      h.textContent = hint;
      f.appendChild(h);
    }
    return f;
  }

  function build() {
    var card = document.createElement('div');
    card.className = 'compte-v2_card';
    card.setAttribute('data-ordo-section', 'emails');

    var head = document.createElement('div');
    head.className = 'compte-v2_card-head';
    var title = document.createElement('h3');
    title.className = 'compte-v2_card-title';
    title.textContent = 'E-mails';
    var link = document.createElement('a');
    link.className = 'compte-v2_btn';
    link.href = PAGE_URL;
    link.textContent = 'Modifier';
    link.setAttribute('aria-label', 'Modifier mes préférences d’e-mail');
    link.addEventListener('click', function() {
      track({ event: 'email_preferences_open', email_prefs_from: 'compte' });
    });
    head.appendChild(title);
    head.appendChild(link);

    var list = document.createElement('div');
    list.className = 'compte-v2_dl';
    list.appendChild(field('E-mails liés à votre compte', 'Toujours envoyés', 'Factures, abonnement, sécurité.'));
    list.appendChild(field('Newsletter, conseils et offres', 'Selon vos préférences'));

    card.appendChild(head);
    card.appendChild(list);
    return card;
  }

  function place() {
    var root = document.querySelector('[data-ordo-v2="profil"]');
    if (!root) return false;
    if (root.querySelector('[data-ordo-section="emails"]')) return true;
    var contact = root.querySelector('[data-ordo-section="contact"]');
    if (!contact || !contact.parentNode) return false;
    contact.parentNode.insertBefore(build(), contact.nextSibling);
    return true;
  }

  var attempts = 0;
  (function tryPlace() {
    if (place()) return;
    if (++attempts >= MAX_ATTEMPTS) {
      console.warn(PREFIX, 'Contact card not found, E-mails card not added');
      return;
    }
    setTimeout(tryPlace, 200);
  })();
})();
