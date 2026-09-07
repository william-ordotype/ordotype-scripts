/**
 * Ordotype Account - Invoice emails opt-in
 *
 * Interrupteur « Recevoir mes factures par e-mail » de la page Mon compte.
 * L'état vit côté serveur : le module lit au chargement, écrit au changement,
 * et revient en arrière si l'écriture échoue — jamais d'état affiché qui ne
 * correspondrait pas à ce qui est enregistré.
 *
 * Le balisage est produit ici, pas dans Webflow : la page ne porte qu'un point
 * d'ancrage vide, comme le bloc de double authentification. Faire évoluer
 * l'interrupteur ne demande donc pas de republier le site.
 *
 * Depends on: core.js (window.OrdoAccount), shared/error-reporter.js
 */
(function() {
  'use strict';

  var PREFIX = '[InvoiceEmails]';
  var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/invoice-emails';
  var ANCHOR_ID = 'ordotype-invoice-emails';
  var MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s

  var member = window.OrdoAccount && window.OrdoAccount.member;
  if (!member || !member.id) return;

  var anchor = document.getElementById(ANCHOR_ID);
  if (!anchor) {
    console.log(PREFIX + ' Anchor not found');
    return;
  }

  var input = null;
  var status = null;
  var busy = false;

  function report(context, err) {
    if (window.OrdoErrorReporter) {
      window.OrdoErrorReporter.report(context, err);
      return;
    }
    // Le repli vit dans l'appelant : si le reporter n'a pas pu être chargé,
    // l'évènement reste la seule trace possible.
    try {
      window.dispatchEvent(new ErrorEvent('error', {
        error: err instanceof Error ? err : new Error(String(err)),
        message: context + ': ' + (err && err.message ? err.message : String(err))
      }));
    } catch (e) { /* no-op */ }
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
      });
    });
  }

  function request(method, body) {
    return memberToken().then(function(token) {
      if (!token) {
        var e = new Error('no member token');
        e.status = 401;
        throw e;
      }
      var opts = {
        method: method,
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
      };
      if (body) opts.body = JSON.stringify(body);
      return fetch(API_URL, opts);
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(payload) {
        if (!res.ok) {
          var err = new Error('invoice-emails ' + res.status + ' ' + (payload.error || ''));
          err.status = res.status;
          err.code = payload.error;
          throw err;
        }
        return payload;
      });
    });
  }

  function setStatus(message, isError) {
    if (!status) return;
    status.textContent = message || '';
    status.style.display = message ? 'block' : 'none';
    status.style.color = isError ? '#d92d20' : '';
  }

  function render(enabled) {
    var wrapper = document.createElement('div');

    var row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'flex-start';

    input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'checkbox';
    input.id = 'invoice-emails-toggle';
    input.checked = Boolean(enabled);
    input.style.marginRight = '10px';
    input.style.marginTop = '2px';

    var label = document.createElement('label');
    label.setAttribute('for', input.id);
    label.style.fontWeight = 'normal';
    label.textContent = 'Recevoir mes factures par e-mail dès leur émission';

    row.appendChild(input);
    row.appendChild(label);

    status = document.createElement('div');
    status.className = 'text-size-small';
    status.style.display = 'none';
    status.style.marginTop = '6px';

    wrapper.appendChild(row);
    wrapper.appendChild(status);
    anchor.appendChild(wrapper);

    input.addEventListener('change', onChange);
  }

  function onChange() {
    if (busy) return;
    var wanted = input.checked;
    busy = true;
    input.disabled = true;
    setStatus('Enregistrement...');

    request('POST', { enabled: wanted }).then(function() {
      setStatus(wanted
        ? 'C’est noté, vous recevrez vos factures par e-mail.'
        : 'C’est noté, vous ne recevrez plus vos factures par e-mail.');
    }).catch(function(err) {
      // L'affichage doit toujours refléter ce qui est enregistré : on remet
      // l'interrupteur dans son état précédent plutôt que de laisser croire
      // que le choix est pris en compte.
      input.checked = !wanted;
      setStatus('Votre choix n’a pas pu être enregistré. Merci de réessayer.', true);
      console.error(PREFIX + ' Save error:', err && err.message);
      report('InvoiceEmails', err);
    }).then(function() {
      busy = false;
      input.disabled = false;
    });
  }

  function init() {
    request('GET').then(function(state) {
      // Sans abonnement payant, l'interrupteur n'a rien à piloter : on
      // n'affiche rien plutôt qu'une case grisée sans explication.
      if (!state || !state.eligible) {
        console.log(PREFIX + ' Not eligible, hidden');
        return;
      }
      render(state.enabled);
      console.log(PREFIX + ' Initialized (enabled=' + Boolean(state.enabled) + ')');
    }).catch(function(err) {
      // Lecture impossible : rien n'est affiché. Montrer un interrupteur dont
      // on ignore la position ferait mentir la page.
      console.error(PREFIX + ' Load error:', err && err.message);
      if (!err || err.status !== 401) report('InvoiceEmails', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
