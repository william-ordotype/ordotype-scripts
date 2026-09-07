/**
 * Ordotype Account - Invoice emails opt-in
 *
 * Interrupteur « Recevoir mes factures par e-mail » de la page Mon compte.
 * L'état vit côté serveur : le module le lit au chargement, l'écrit au
 * changement, et revient en arrière si l'écriture est refusée.
 *
 * ⚠️ Ce que la confirmation dit, et ce qu'elle ne dit pas. Le serveur répond
 * avant que la fiche soit écrite (la réponse est posée en tête de la chaîne
 * pour ne pas faire attendre le navigateur). Un 200 signifie donc « la demande
 * est partie », pas « la fiche est écrite ». Le message affiché reste volon-
 * tairement sobre pour cette raison, et ce qui couvre l'écart est une alerte
 * côté serveur sur l'échec d'écriture. Ne pas transformer ce message en
 * promesse d'enregistrement sans faire d'abord répondre le serveur après coup.
 *
 * Le balisage est produit ici, pas dans Webflow : la page ne porte qu'un point
 * d'ancrage vide, comme le bloc de double authentification. Faire évoluer
 * l'interrupteur ne demande donc pas de republier le site. L'ancrage doit
 * contenir le bloc en entier, libellé compris : quand il n'y a rien à afficher
 * le module le masque, et un titre resté en dehors surplomberait un trou.
 *
 * Depends on: core.js (window.OrdoAccount), shared/error-reporter.js
 */
(function() {
  'use strict';

  var PREFIX = '[InvoiceEmails]';
  var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/invoice-emails';
  var ANCHOR_ID = 'ordotype-invoice-emails';
  var INPUT_ID = 'invoice-emails-toggle';
  var MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s

  var member = window.OrdoAccount && window.OrdoAccount.member;
  if (!member || !member.id) return;

  var anchor = null;
  var input = null;
  var status = null;
  var busy = false;

  /**
   * Les codes attendus ne sont pas des incidents : session expirée, membre non
   * éligible, quota par IP, service non configuré. Les remonter noierait les
   * vraies pannes sous des évènements qui ne demandent aucune action.
   */
  var EXPECTED = [400, 401, 409, 429, 503];

  function reportIfActionable(err) {
    if (err && EXPECTED.indexOf(err.status) !== -1) return;
    if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('InvoiceEmails', err);
  }

  function messageFor(err) {
    var status = err && err.status;
    if (status === 401) return 'Votre session a expiré : reconnectez-vous puis réessayez.';
    if (status === 429) return 'Trop de tentatives. Merci de réessayer dans une minute.';
    if (status === 409 || status === 503) {
      return 'Cette option n’est pas disponible sur votre compte pour le moment.';
    }
    return 'Votre choix n’a pas pu être enregistré. Merci de réessayer.';
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
    // La couleur d'erreur vient de la classe du système de design, jamais d'un
    // littéral : deux modules de la même page afficheraient sinon deux rouges.
    status.className = 'text-size-small' + (isError ? ' text-color-error' : '');
  }

  function hide() {
    if (anchor) anchor.style.display = 'none';
  }

  // Les couleurs viennent des jetons `:root` du système de design, avec un
  // repli littéral au cas où la feuille ne serait pas encore appliquée.
  var STYLE_ID = 'ordo-invmail-style';
  var CSS = [
    '.ordo-invmail-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
    '.ordo-invmail-text{flex:1 1 auto}',
    '.ordo-invmail-help{margin-top:2px;color:var(--base-600,#0c0e1699)}',
    '.ordo-invmail-sw{position:relative;display:inline-block;width:44px;height:26px;flex:0 0 auto}',
    '.ordo-invmail-sw input{position:absolute;top:0;left:0;width:100%;height:100%;margin:0;opacity:0;z-index:2;cursor:pointer}',
    '.ordo-invmail-track{position:absolute;top:0;left:0;right:0;bottom:0;border-radius:999px;background:var(--base-300,#0c0e164d);transition:background .2s ease}',
    '.ordo-invmail-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s ease}',
    '.ordo-invmail-sw input:checked~.ordo-invmail-track{background:var(--primary-500,#3454f6)}',
    '.ordo-invmail-sw input:checked~.ordo-invmail-knob{transform:translateX(18px)}',
    '.ordo-invmail-sw input:disabled{cursor:default}',
    '.ordo-invmail-sw input:disabled~.ordo-invmail-track{opacity:.5}',
    '.ordo-invmail-sw input:focus-visible~.ordo-invmail-track{outline:2px solid var(--primary-500,#3454f6);outline-offset:2px}'
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function render(enabled) {
    // Une seconde exécution (embed dupliqué, bundle périmé servi à côté du
    // bundle épinglé) produirait deux interrupteurs portant le même id : les
    // libellés pointeraient tous sur le premier, le code lirait le second, et
    // le membre écrirait l'inverse de ce qu'il voit.
    if (anchor.firstChild) {
      console.log(PREFIX + ' Already rendered');
      return;
    }
    injectStyle();

    var row = document.createElement('div');
    row.className = 'ordo-invmail-row';

    var text = document.createElement('div');
    text.className = 'ordo-invmail-text';

    var label = document.createElement('label');
    label.setAttribute('for', INPUT_ID);
    label.className = 'text-weight-semibold';
    label.style.cursor = 'pointer';
    label.textContent = 'Recevoir mes factures par e-mail';

    var help = document.createElement('div');
    help.className = 'text-size-small ordo-invmail-help';
    help.textContent = 'Chaque facture vous sera envoyée automatiquement dès son émission, '
      + 'sans que vous ayez à venir la chercher dans votre espace.';

    text.appendChild(label);
    text.appendChild(help);

    // L'interrupteur reste une vraie case à cocher, seulement rendue
    // invisible : le clavier, les lecteurs d'écran et l'évènement `change`
    // continuent de fonctionner sans qu'on ait à les réimplémenter.
    var sw = document.createElement('span');
    sw.className = 'ordo-invmail-sw';

    input = document.createElement('input');
    input.type = 'checkbox';
    input.id = INPUT_ID;
    input.setAttribute('role', 'switch');
    input.checked = Boolean(enabled);
    input.setAttribute('aria-checked', enabled ? 'true' : 'false');

    var track = document.createElement('span');
    track.className = 'ordo-invmail-track';
    var knob = document.createElement('span');
    knob.className = 'ordo-invmail-knob';

    sw.appendChild(input);
    sw.appendChild(track);
    sw.appendChild(knob);

    row.appendChild(text);
    row.appendChild(sw);

    status = document.createElement('div');
    status.className = 'text-size-small';
    status.style.display = 'none';
    status.style.marginTop = '6px';

    anchor.appendChild(row);
    anchor.appendChild(status);
    anchor.style.display = '';

    input.addEventListener('change', onChange);
  }

  function onChange() {
    if (busy) return;
    var wanted = input.checked;
    busy = true;
    input.disabled = true;
    setStatus('Enregistrement...');

    function release() {
      busy = false;
      if (input) {
        input.disabled = false;
        // L'état annoncé aux lecteurs d'écran doit suivre l'état réel, y
        // compris après un retour en arrière.
        input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
      }
    }

    request('POST', { enabled: wanted }).then(function(payload) {
      // Un 200 sans `ok` est le corps d'une autre réponse, pas un succès
      // d'écriture : le traiter comme tel afficherait une confirmation pour un
      // choix jamais transmis.
      if (!payload || payload.ok !== true) {
        var e = new Error('invoice-emails: unexpected body');
        throw e;
      }
      setStatus(wanted
        ? 'C’est noté, vos factures vous seront envoyées par e-mail.'
        : 'C’est noté, vous ne recevrez plus vos factures par e-mail.');
    }).catch(function(err) {
      // L'affichage doit refléter ce qui a été accepté : on remet
      // l'interrupteur dans son état précédent plutôt que de laisser croire que
      // le choix est pris en compte.
      if (input) input.checked = !wanted;
      setStatus(messageFor(err), true);
      console.error(PREFIX + ' Save error:', err && err.message);
      reportIfActionable(err);
    // Le rétablissement passe par les DEUX branches : posé dans un `.then`
    // final, il ne tournerait pas si le gestionnaire d'erreur levait, et
    // l'interrupteur resterait mort jusqu'au rechargement.
    }).then(release, release);
  }

  function init() {
    anchor = document.getElementById(ANCHOR_ID);
    if (!anchor) {
      console.log(PREFIX + ' Anchor not found');
      return;
    }
    // Rien n'est visible tant que l'état n'est pas connu : un interrupteur dont
    // on ignore la position ferait mentir la page.
    hide();

    // Sans client Stripe, l'interrupteur n'a rien à piloter. Le savoir ici
    // évite un aller-retour qui coûte plusieurs appels sur un quota partagé,
    // pour une réponse déjà lisible dans l'instantané du membre.
    if (!member.stripeCustomerId) {
      console.log(PREFIX + ' No Stripe customer, hidden');
      return;
    }

    request('GET').then(function(state) {
      if (!state || !state.eligible) {
        console.log(PREFIX + ' Not eligible, hidden');
        return;
      }
      render(state.enabled);
      console.log(PREFIX + ' Initialized (enabled=' + Boolean(state.enabled) + ')');
    }).catch(function(err) {
      // Lecture impossible : rien ne s'affiche, y compris l'ancrage.
      console.error(PREFIX + ' Load error:', err && err.message);
      reportIfActionable(err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
