/**
 * Ordotype Account - Invoice emails opt-in
 *
 * Interrupteur « Recevoir mes factures par e-mail » de la page Mon compte.
 * L'état vit côté serveur : le module le lit au chargement, l'écrit au
 * changement, et revient en arrière si l'écriture est refusée.
 *
 * 🔴 Ce que la confirmation a le droit de dire. Le choix vit dans deux copies :
 * celle que cette page relit, et celle que lit le programme d'envoi. Le serveur
 * rend `stored` et `projected` pour dire laquelle a reçu quoi, et il n'est PAS
 * permis de les ignorer : confirmer « vous ne recevrez plus vos factures »
 * quand seule la première a été écrite, c'est accuser réception d'un retrait de
 * consentement que rien n'honore, et aucune relecture ne viendra le contredire
 * puisque la page lit justement celle des deux qui a été mise à jour.
 *
 * Le serveur rejoue une projection restée en souffrance au chargement suivant :
 * le message dégradé annonce donc un rattrapage réel, pas une espérance.
 *
 * Le balisage est produit ici, pas dans Webflow : la page ne porte qu'un point
 * d'ancrage vide, comme le bloc de double authentification. Faire évoluer
 * l'interrupteur ne demande donc pas de republier le site.
 *
 * Quand il n'y a rien à afficher, le module masque l'ancrage ET le conteneur
 * `.w-embed` qui l'entoure. L'Embed peut donc recevoir librement marges et
 * espacements depuis le Designer : ils disparaissent avec le bloc. En revanche
 * un titre placé EN DEHORS de l'Embed surplomberait un trou, comme le finder
 * SIREN l'a appris à ses dépens.
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
    var reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    // Sans statut, la requête n'a produit aucune réponse : seul le fichier
    // partagé sait si la page était en train de partir, auquel cas il n'y a
    // pas d'incident. `report` reste le repli, pour une version servie
    // antérieure à cette méthode.
    if (err && !err.status && typeof reporter.reportNetwork === 'function') {
      reporter.reportNetwork('InvoiceEmails', err);
      return;
    }
    reporter.report('InvoiceEmails', err);
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

  /**
   * Le message d'accusé, accordé à ce qui a réellement eu lieu.
   *
   * `projected` porte la copie que lit le programme d'envoi. Tant qu'elle n'a
   * pas reçu le choix, l'envoi suit encore l'ancien : on ne peut donc ni
   * promettre les factures, ni promettre leur arrêt. Le serveur rejoue cette
   * projection au chargement suivant, d'où « peut demander quelques minutes ».
   *
   * `stored` porte la copie que cette page relit. Elle seule en échec ne change
   * rien pour le membre — son choix est bien appliqué — mais la page pourra
   * afficher l'ancienne position au prochain passage, et le lui taire ferait
   * passer un affichage périmé pour un choix perdu.
   *
   * 🔴 On ne dégrade que sur un `false` EXPLICITE, jamais sur un champ absent.
   * Ce fichier part par jsDelivr et le serveur par Netlify : les deux ne sont
   * jamais à la même version au même instant. Lire une absence comme un échec
   * ferait afficher un avertissement à tout le monde pendant l'intervalle, pour
   * des enregistrements pourtant parfaits.
   */
  function confirmation(wanted, payload) {
    if (payload.projected === false) {
      return wanted
        ? 'C’est enregistré. L’envoi automatique peut demander quelques minutes avant de devenir effectif.'
        : 'C’est enregistré. L’arrêt peut demander quelques minutes : si une facture vous parvient encore, écrivez-nous.';
    }
    if (payload.stored === false) {
      return wanted
        ? 'C’est noté, vos factures vous seront envoyées par e-mail. L’affichage de cette page peut mettre un moment à suivre.'
        : 'C’est noté, vous ne recevrez plus vos factures par e-mail. L’affichage de cette page peut mettre un moment à suivre.';
    }
    return wanted
      ? 'C’est noté, vos factures vous seront envoyées par e-mail.'
      : 'C’est noté, vous ne recevrez plus vos factures par e-mail.';
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

  /**
   * Une requête qui n'a produit AUCUNE réponse HTTP arrive ici sans `status` :
   * connexion perdue, requête refusée avant d'être émise, onglet quitté pendant
   * l'aller-retour. Elle n'apprend donc rien sur le compte du membre, alors que
   * chacun des codes attendus, lui, dit quelque chose et se respecte.
   *
   * La rejouer une fois coûte un aller-retour et évite de masquer l'interrupteur
   * pour un incident déjà terminé. Ce n'est qu'ensuite, si la seconde tentative
   * échoue elle aussi, que le bloc disparaît et que l'incident est remonté.
   *
   * 🔴 Réservé à la LECTURE. Une écriture rejouée renverrait un choix dont la
   * première tentative a pu aboutir sans que la réponse revienne : sur un
   * enregistrement qu'on ne sait pas confirmer, c'est au membre de décider s'il
   * recommence, pas à ce script.
   */
  var RETRY_DELAY_MS = 400;

  function readState() {
    return request('GET').catch(function(err) {
      if (err && err.status) throw err;
      return new Promise(function(resolve) {
        setTimeout(resolve, RETRY_DELAY_MS);
      }).then(function() {
        return request('GET');
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

  /**
   * Masquer l'ancrage ne suffit pas : dans Webflow il vit à l'intérieur d'un
   * conteneur `.w-embed`, et tout espacement posé sur cet Embed depuis le
   * Designer survivrait au masquage. Chaque membre qui ne voit pas le bloc
   * verrait alors un blanc inexpliqué à sa place. On masque donc aussi le
   * conteneur, ce qui rend l'Embed librement stylable côté Webflow.
   */
  function wrapper() {
    var p = anchor && anchor.parentElement;
    return p && p.classList && p.classList.contains('w-embed') ? p : null;
  }

  function hide() {
    if (anchor) anchor.style.display = 'none';
    var w = wrapper();
    if (w) w.style.display = 'none';
  }

  function show() {
    if (anchor) anchor.style.display = '';
    var w = wrapper();
    if (w) w.style.display = '';
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

  /**
   * Un événement dataLayer, avec la cohorte de déploiement de CE fichier.
   *
   * 🔴 Jamais de `dataLayer.push` nu : le tableau peut ne pas exister quand GTM
   * n'a pas encore chargé, et une exception ici casserait l'interrupteur pour
   * une histoire de mesure.
   *
   * 🔴 La cohorte lue est `invoice-emails.js`, pas `siren-finder.js` : deux
   * fonctionnalités gatées séparément, deux paliers, et les confondre a déjà
   * fait lire un déploiement pour l'autre.
   *
   * 🔴 Les paramètres sont PRÉFIXÉS. `reason` existe déjà comme dimension GA4,
   * avec un autre sens : y verser ces valeurs mélangerait deux mesures dans une
   * dimension partagée par tous les événements, sans que rien ne le signale.
   */
  function track(eventName, params) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;
    var payload = { event: eventName };
    var rollout = window.OrdoRollout && window.OrdoRollout['invoice-emails.js'];
    if (rollout) {
      payload.rollout_percent = rollout.percent;
      payload.rollout_bucket = rollout.bucket;
      payload.rollout_reason = rollout.reason;
    }
    if (params) {
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
      }
    }
    try { window.dataLayer.push(payload); } catch (e) { /* no-op */ }
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
    // Mêmes classes utilitaires que le titre « Mes factures et informations de
    // facturation » juste au-dessus, plutôt qu'une taille en dur : les deux
    // lignes se lisent comme deux entrées de même niveau, et elles suivront le
    // système typographique si celui-ci change.
    label.className = 'text-size-regular text-weight-semibold';
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
    show();

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
      setStatus(confirmation(wanted, payload));
      // 🔴 Tracé APRÈS confirmation du serveur, pas au clic : un clic suivi
      // d'un échec d'écriture compterait comme une adhésion qui n'existe pas.
      track('invoice_emails_toggled', { invoice_toggle_state: wanted ? 'on' : 'off', invoice_toggle_outcome: 'saved' });
    }).catch(function(err) {
      // L'affichage doit refléter ce qui a été accepté : on remet
      // l'interrupteur dans son état précédent plutôt que de laisser croire que
      // le choix est pris en compte.
      if (input) input.checked = !wanted;
      setStatus(messageFor(err), true);
      track('invoice_emails_toggled', { invoice_toggle_state: wanted ? 'on' : 'off', invoice_toggle_outcome: 'failed' });
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
      // 🔴 Le masquage se DIT. Sans cet événement, « personne ne coche » et
      // « personne ne voit » sont indiscernables dans GA4, et on cherche une
      // adhésion faible là où il n'y a qu'un widget invisible.
      track('invoice_emails_hidden', { invoice_hidden_reason: 'no_anchor' });
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
      track('invoice_emails_hidden', { invoice_hidden_reason: 'no_stripe_customer' });
      return;
    }

    readState().then(function(state) {
      if (!state || !state.eligible) {
        console.log(PREFIX + ' Not eligible, hidden');
        track('invoice_emails_hidden', { invoice_hidden_reason: 'not_eligible' });
        return;
      }
      render(state.enabled);
      // Le dénominateur de l'entonnoir : les membres qui ont réellement
      // l'interrupteur sous les yeux, et dans quelle position il se présente.
      track('invoice_emails_shown', { invoice_toggle_state: state.enabled ? 'on' : 'off' });
      console.log(PREFIX + ' Initialized (enabled=' + Boolean(state.enabled) + ')');
    }).catch(function(err) {
      // Lecture impossible : rien ne s'affiche, y compris l'ancrage.
      console.error(PREFIX + ' Load error:', err && err.message);
      track('invoice_emails_hidden', { invoice_hidden_reason: 'load_error' });
      reportIfActionable(err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
