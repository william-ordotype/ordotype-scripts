/**
 * Ordotype Account - Mes abonnements
 * Read-only list of the member's subscriptions, discounts and next payment dates.
 * Depends on: core.js (window.OrdoAccount), shared/error-reporter.js
 */
(function() {
  'use strict';

  var PREFIX = '[SubscriptionsOverview]';
  var API_URL = 'https://webhooks.ordotype.fr/.netlify/functions/account-subscriptions';
  var ANCHOR_ID = 'ordotype-subscriptions';
  var PAYMENT_URL = '/membership/moyen-de-paiement';
  var MS_MAX_ATTEMPTS = 50;
  var SKELETON_DELAY_MS = 200;
  var RETRY_DELAY_MS = 400;
  var EXPECTED = [401, 409, 429, 503];

  var member = window.OrdoAccount && window.OrdoAccount.member;
  if (!member || !member.id) return;

  var anchor = null;
  var skeletonTimer = null;

  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'];

  var STATUS = {
    active: { text: 'Actif', tone: 'ok' },
    free: { text: 'Gratuit', tone: 'free' },
    past_due: { text: 'Paiement à régulariser', tone: 'alert' },
    pending: { text: 'Paiement en cours', tone: 'muted' },
    canceling: { text: 'Résiliation programmée', tone: 'muted' },
    pause_scheduled: { text: 'Pause programmée', tone: 'muted' },
    paused: { text: 'En pause', tone: 'muted' },
    ended: { text: 'Terminé', tone: 'muted' }
  };

  var STYLE_ID = 'ordo-subs-style';
  var CSS = [
    '.ordo-subs{display:flex;flex-direction:column;gap:1rem;margin-bottom:2.5rem;padding:1rem;border:1px solid var(--base-200,#0c0e1633);border-radius:.25rem;color:var(--base-900,#0c0e16)}',
    '.ordo-subs-title{margin:0;font-size:1rem;line-height:1.5;font-weight:600}',
    '.ordo-subs-flash{margin:0;font-size:.875rem;line-height:1.5;font-weight:600;color:var(--success-700,#106820)}',
    '.ordo-subs-list{display:flex;flex-direction:column;gap:1rem}',
    '.ordo-subs-card{background:#0c0e1608;border:1px solid var(--base-100,#0c0e161a);border-radius:.25rem;padding:1.5rem;display:flex;flex-direction:column;gap:.75rem}',
    '.ordo-subs-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:.5rem 1rem}',
    '.ordo-subs-label{font-size:1rem;line-height:1.5;font-weight:600}',
    '.ordo-subs-tag{flex:none;height:1.5rem;padding:0 .5rem;border-radius:.25rem;font-size:.75rem;font-weight:600;line-height:1.5rem;white-space:nowrap}',
    '.ordo-subs-tone-ok,.ordo-subs-tone-free{background:var(--primary-500,#3454f6);color:var(--inverted-900,#ffffffe6)}',
    '.ordo-subs-tone-alert{background:var(--error-500,#ee4343);color:var(--inverted-900,#ffffffe6)}',
    '.ordo-subs-tone-muted{background:var(--inverted-900,#ffffffe6);color:var(--base-900,#0c0e16)}',
    '.ordo-subs-body{display:flex;flex-direction:column;gap:.5rem}',
    '.ordo-subs-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .5rem}',
    '.ordo-subs-amount{font-size:1.25rem;line-height:1.4;font-weight:600}',
    '.ordo-subs-period,.ordo-subs-old,.ordo-subs-muted,.ordo-subs-note{color:var(--neutral-500,#47505c)}',
    '.ordo-subs-period,.ordo-subs-old{font-size:.875rem}',
    '.ordo-subs-offer{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}',
    '.ordo-subs-badge{height:1.5rem;padding:0 .5rem;border-radius:.25rem;background:var(--primary-50,#f0f3ff);color:var(--primary-600,#263fd3);font-size:.75rem;font-weight:600;line-height:1.5rem;white-space:nowrap}',
    '.ordo-subs-note,.ordo-subs-muted{font-size:.875rem;line-height:1.5}',
    '.ordo-subs-foot{border-top:1px solid var(--base-100,#0c0e161a);padding-top:.75rem;display:flex;flex-wrap:wrap;justify-content:space-between;gap:.125rem 1rem;font-size:.875rem;line-height:1.5}',
    '.ordo-subs-foot-label{color:var(--neutral-500,#47505c)}',
    '.ordo-subs-foot-value{font-weight:600}',
    '.ordo-subs-link{background:none;border:0;padding:0;font:inherit;font-weight:600;text-align:left;align-self:flex-start;color:var(--primary-1,#153cf5);text-decoration:underline;cursor:pointer}',
    '.ordo-subs-link:hover{color:var(--primary-600,#263fd3)}',
    '.ordo-subs-empty{margin:0;font-size:.875rem;line-height:1.5;color:var(--neutral-500,#47505c)}',
    '.ordo-subs-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem}',
    '.ordo-subs-btn{display:inline-flex;align-items:center;justify-content:center;padding:.5rem 1rem;border-radius:.25rem;border:1px solid var(--base-500,#0c0e1680);background:transparent;color:var(--base-900,#0c0e16);font:inherit;font-size:.875rem;font-weight:600;line-height:1.2;text-align:center;text-decoration:none;cursor:pointer;transition:background-color .2s}',
    '.ordo-subs-btn:hover{background:var(--base-100,#0c0e161a);color:var(--base-900,#0c0e16)}',
    '.ordo-subs-btn.is-primary{background:var(--primary-500,#3454f6);border-color:var(--primary-500,#3454f6);color:#fff}',
    '.ordo-subs-btn.is-primary:hover{background:var(--primary-600,#263fd3);border-color:var(--primary-600,#263fd3);color:#fff}',
    '.ordo-subs-btn[disabled]{opacity:.5;cursor:default}',
    '.ordo-subs-msg{flex-basis:100%;text-align:right}',
    '.ordo-pm-row{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1rem}',
    '.ordo-pm-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:48px;height:32px;box-sizing:border-box;border:1px solid var(--base-200,#0c0e1633);border-radius:.25rem;color:var(--base-900,#0c0e16)}',
    '.ordo-pm-icon.is-alert{border-color:var(--error-300,#fca6a6);color:var(--error-700,#ba1b1b)}',
    '.ordo-pm-text{flex:1 1 12rem;min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.ordo-pm-name{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .5rem;font-size:1rem;line-height:1.5;font-weight:600}',
    '.ordo-pm-others{display:flex;flex-direction:column;gap:2px;border-top:1px solid var(--base-100,#0c0e161a);padding-top:.75rem}',
    '.ordo-pm-tone-expired{background:var(--error-100,#fee1e1);color:var(--error-700,#ba1b1b)}',
    '.ordo-pm-tone-soon{background:var(--warning-100,#fef9c3);color:var(--warning-800,#864e0e)}',
    '.ordo-inv-table{display:flex;flex-direction:column}',
    '.ordo-inv-row{display:grid;grid-template-columns:7.5rem minmax(0,1fr) 6rem 10rem 6.5rem;gap:.25rem 1rem;align-items:center;padding:.75rem 0;border-bottom:1px solid var(--base-100,#0c0e161a);font-size:.875rem;line-height:1.5}',
    '.ordo-inv-row:last-child{border-bottom:0}',
    '.ordo-inv-head{padding-top:0;color:var(--neutral-500,#47505c);font-weight:500}',
    '.ordo-inv-amount,.ordo-inv-head .ordo-inv-cell:nth-child(3){text-align:right}',
    '.ordo-inv-amount{font-weight:600}',
    '.ordo-inv-action,.ordo-inv-head .ordo-inv-cell:nth-child(5){text-align:right}',
    '.ordo-inv-pdf{display:inline-flex;align-items:center;gap:.375rem;background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--base-900,#0c0e16);text-decoration:underline;cursor:pointer}',
    '.ordo-inv-pdf:hover{color:var(--primary-600,#263fd3)}',
    '.ordo-inv-pdf[disabled]{opacity:.5;cursor:default}',
    '.ordo-inv-tone-paid{background:var(--success-100,#defce9);color:var(--success-700,#106820)}',
    '.ordo-inv-tone-pending{background:var(--primary-50,#f0f3ff);color:var(--primary-600,#263fd3)}',
    '.ordo-inv-tone-due{background:var(--error-100,#fee1e1);color:var(--error-700,#ba1b1b)}',
    '.ordo-inv-emails:empty{display:none}',
    '.ordo-help{margin-bottom:2.5rem;padding:1.5rem;background:#0c0e1608;border:1px solid var(--base-100,#0c0e161a);border-radius:.25rem;display:flex;flex-direction:column;align-items:center;gap:1rem;text-align:center;color:var(--base-900,#0c0e16)}',
    '.ordo-help-title{margin:0;font-size:1rem;line-height:1.5}',
    '.ordo-help-row{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:.75rem 2.5rem}',
    '.ordo-help-contact{display:inline-flex;align-items:center;gap:.625rem;min-height:1.75rem;font-size:1rem;font-weight:600;color:var(--base-900,#0c0e16);text-decoration:none}',
    '.ordo-help-contact:hover{color:var(--primary-600,#263fd3)}',
    '.ordo-help-phone{display:flex;flex-direction:column;align-items:center;gap:2px}',
    '.ordo-help-note{font-size:.75rem;line-height:1.5;color:var(--neutral-500,#47505c)}',
    '.ordo-help-divider{align-self:stretch;border-top:1px solid var(--base-100,#0c0e161a)}',
    '.ordo-help-video{display:inline-flex;align-items:center;gap:.5rem;min-height:1.75rem;font-size:.875rem;font-weight:600;color:var(--primary-500,#3454f6);text-decoration:none}',
    '.ordo-help-video:hover{color:var(--primary-600,#263fd3)}',
    '@media (max-width:767px){.ordo-inv-head{display:none}.ordo-inv-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"date amount" "label status" "label action"}.ordo-inv-date{grid-area:date}.ordo-inv-amount{grid-area:amount}.ordo-inv-label{grid-area:label;color:var(--neutral-500,#47505c)}.ordo-inv-status{grid-area:status;text-align:right}.ordo-inv-action{grid-area:action}.ordo-help-row{flex-direction:column;align-items:center}}',
    '.ordo-subs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.ordo-subs-skel{height:132px;border-radius:.25rem;background:#0c0e1608;border:1px solid var(--base-100,#0c0e161a);animation:ordo-subs-pulse 1.2s ease-in-out infinite}',
    '@keyframes ordo-subs-pulse{0%,100%{opacity:.5}50%{opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.ordo-subs-skel{animation:none}}',
    '@media (max-width:479px){.ordo-subs-card{padding:1rem}.ordo-subs-amount{font-size:1.125rem}.ordo-subs-foot{flex-direction:column}.ordo-subs-btn{width:100%}.ordo-subs-msg{text-align:left}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function day(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    var d = Number(m[3]);
    return (d === 1 ? '1er' : String(d)) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
  }

  function money(cents, currency) {
    var code = String(currency || 'eur').toUpperCase();
    var value = cents / 100;
    var whole = cents % 100 === 0;
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch (e) {
      return (whole ? String(value) : value.toFixed(2).replace('.', ',')) + ' ' + (code === 'EUR' ? '€' : code);
    }
  }

  function period(price) {
    var n = price.intervalCount || 1;
    var unit = {
      month: 'mois',
      year: n > 1 ? 'ans' : 'an',
      week: n > 1 ? 'semaines' : 'semaine',
      day: n > 1 ? 'jours' : 'jour'
    }[price.interval] || 'mois';
    return '/ ' + (n > 1 ? n + ' ' : '') + unit;
  }

  function percent(p) {
    return String(p).replace('.', ',') + ' %';
  }

  function badgeText(discount, currency) {
    if (discount.percentOff === 100) return 'Offert';
    if (typeof discount.percentOff === 'number') return '-' + percent(discount.percentOff);
    if (typeof discount.amountOff === 'number') return '-' + money(discount.amountOff, discount.currency || currency);
    return 'Remise';
  }

  function noteText(discount) {
    if (discount.duration === 'forever') return 'à vie';
    if (discount.duration === 'once') return 'sur votre prochaine facture';
    if (discount.end) return 'jusqu’au ' + day(discount.end);
    return '';
  }

  function thenText(c) {
    if (c.status !== 'active' || !c.price) return '';
    if (c.offeredUntil && !c.discount) return 'Puis ' + money(c.price.current, c.price.currency) + ' ' + period(c.price);
    if (c.discount && !c.offeredUntil && c.discount.duration !== 'forever') {
      return 'Puis ' + money(c.price.amount, c.price.currency) + ' ' + period(c.price);
    }
    return '';
  }

  function offerRow(badge, note) {
    var row = el('div', 'ordo-subs-offer');
    row.appendChild(el('span', 'ordo-subs-badge', badge));
    if (note) row.appendChild(el('span', 'ordo-subs-note', note));
    return row;
  }

  function priceRow(c) {
    var row = el('div', 'ordo-subs-price');
    var shown = c.offeredUntil ? 0 : c.price.current;
    row.appendChild(el('span', 'ordo-subs-amount', money(shown, c.price.currency)));
    row.appendChild(el('span', 'ordo-subs-period', period(c.price)));
    if (shown < c.price.amount) {
      var old = el('s', 'ordo-subs-old');
      old.appendChild(el('span', 'ordo-subs-sr', 'au lieu de '));
      old.appendChild(document.createTextNode(money(c.price.amount, c.price.currency)));
      row.appendChild(old);
    }
    return row;
  }

  function footRow(label, value) {
    var foot = el('div', 'ordo-subs-foot');
    foot.appendChild(el('span', 'ordo-subs-foot-label', label));
    if (typeof value === 'string') foot.appendChild(el('span', 'ordo-subs-foot-value', value));
    else foot.appendChild(value);
    return foot;
  }

  function footOf(c) {
    if (c.status === 'past_due') {
      // Saving a new payment method also retries the unpaid invoice.
      return footRow('Paiement en échec', paymentLink('ordo-subs-link', 'Modifier le moyen de paiement'));
    }
    if ((c.status === 'paused' || c.status === 'pause_scheduled') && c.resumesOn) {
      return footRow('Reprise automatique le', day(c.resumesOn));
    }
    if (c.next && c.next.date) {
      if (typeof c.next.amount !== 'number') return footRow('Prochaine échéance', day(c.next.date));
      var label = c.next.amount > 0 ? 'Prochain prélèvement' : 'Prochaine échéance';
      var currency = c.price ? c.price.currency : 'eur';
      return footRow(label, money(c.next.amount, currency) + ' le ' + day(c.next.date));
    }
    if ((c.status === 'canceling' || c.status === 'free') && c.endsOn) return footRow('Se termine le', day(c.endsOn));
    return null;
  }

  function reportProblem(name, detail) {
    var reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    var err = new Error(detail);
    err.name = name;
    try { reporter.report('SubscriptionsOverview', err); } catch (e) { /* no-op */ }
  }

  // Updating the payment method opens Stripe's secure page directly, with the same request, return page
  // and tracking as the payment method page. The link keeps that page as its address: a new tab, a
  // member without a Stripe customer, or any failure lands there instead.
  var SETUP_URL = 'https://billing.ordotype.fr/.netlify/functions/create-checkout';
  var SETUP_HOOK_URL = 'https://billing.ordotype.fr/.netlify/functions/notify-webhook';
  var SETUP_SUCCESS_PATH = '/membership/moyen-de-paiement-ajoute';
  var CHECKOUT_URL = /^https:\/\/[a-z0-9.-]+\/c\/pay\/([^?#\/]+)/;

  function sendSetupTracking(payload) {
    var data = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(SETUP_HOOK_URL, new Blob([data], { type: 'text/plain' }))) return;
    } catch (e) { /* fall back to fetch */ }
    try {
      fetch(SETUP_HOOK_URL, { method: 'POST', keepalive: true, body: data }).catch(function() {});
    } catch (e) { /* no-op */ }
  }

  function openPaymentSetup(e, link) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var ms = window.OrdoMemberstack || {};
    var customer = ms.stripeCustomerId || (member && member.stripeCustomerId);
    if (!customer) return;
    e.preventDefault();
    if (link.getAttribute('aria-busy') === 'true') return;
    link.setAttribute('aria-busy', 'true');
    var label = link.textContent;
    link.textContent = 'Patientez…';
    fetch(SETUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stripeCustomerId: customer,
        cancelUrl: window.location.href,
        successUrl: window.location.origin + SETUP_SUCCESS_PATH,
        payment_method_types: ['sepa_debit']
      })
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(data) {
        var m = data && typeof data.url === 'string' ? CHECKOUT_URL.exec(data.url) : null;
        if (!res.ok || !m) {
          var err = new Error('create-checkout ' + res.status + ': no checkout url');
          err.status = res.status;
          throw err;
        }
        sendSetupTracking({
          type: 'setup-tracking',
          checkoutSessionId: data.id || m[1],
          stripeCustomerId: customer,
          memberstackUserId: ms.memberId || (member && member.id) || null,
          memberstackEmail: ms.email || null,
          option: 'setup-sepa',
          paymentMethods: ['sepa_debit'],
          originPage: window.location.href
        });
        window.location.assign(data.url);
      });
    }).catch(function(err) {
      var reporter = window.OrdoErrorReporter;
      if (reporter) {
        try {
          if (err && !err.status && typeof reporter.reportNetwork === 'function') reporter.reportNetwork('SubscriptionsOverview', err);
          else reporter.report('SubscriptionsOverview', err);
        } catch (x) { /* no-op */ }
      }
      link.textContent = label;
      link.removeAttribute('aria-busy');
      window.location.assign(PAYMENT_URL);
    });
  }

  function paymentLink(cls, label) {
    var a = el('a', cls, label);
    a.setAttribute('href', PAYMENT_URL);
    a.addEventListener('click', function(e) { openPaymentSetup(e, a); });
    return a;
  }

  var SITE_LINK = /^\/(?!\/)[A-Za-z0-9\-._~\/?=&%]*$/;
  var ELEMENT_LINK = /^#[A-Za-z][\w-]*$/;

  function showElement(id) {
    var target = document.getElementById(id);
    if (!target) {
      reportProblem('SubscriptionsOverviewMissingElement', '#' + id + ' not found');
      return;
    }
    target.style.display = 'block';
    target.style.opacity = '0';
    target.style.transition = 'opacity 0.4s ease';
    void target.offsetHeight;
    target.style.opacity = '1';
  }

  function button(label, primary) {
    var b = el('button', 'ordo-subs-btn' + (primary ? ' is-primary' : ''), label);
    b.type = 'button';
    return b;
  }

  function pauseActions() {
    var row = el('div', 'ordo-subs-actions');
    var resume = button('Reprendre mon abonnement', true);
    var cancel = button('Annuler définitivement', false);
    var msg = el('div', 'ordo-subs-note ordo-subs-msg');
    msg.setAttribute('role', 'status');
    var pause = window.OrdoPause;
    function busy(on) {
      resume.disabled = on;
      cancel.disabled = on;
    }
    function after(okText, then) {
      return function(ok) {
        if (ok) {
          msg.textContent = okText;
          setTimeout(then, pause.redirectDelay || 3000);
          return;
        }
        busy(false);
        msg.textContent = 'Une erreur est survenue. Merci de réessayer.';
      };
    }
    resume.addEventListener('click', function() {
      busy(true);
      msg.textContent = 'Traitement en cours…';
      pause.resume(after('Votre abonnement a été réactivé !', function() {
        window.location.href = pause.resumedUrl || '/membership/abonnement-repris';
      }));
    });
    cancel.addEventListener('click', function() {
      if (!window.confirm('Êtes-vous sûr de vouloir annuler définitivement votre abonnement ?')) return;
      busy(true);
      msg.textContent = 'Traitement en cours…';
      pause.cancelDefinitive(after('Votre abonnement a été annulé.', function() {
        window.location.reload();
      }));
    });
    row.appendChild(cancel);
    row.appendChild(resume);
    row.appendChild(msg);
    return row;
  }

  var REF = /^[0-9a-f]{20}$/;

  function reactivateActions(c) {
    var row = el('div', 'ordo-subs-actions');
    var btn = button('Me réabonner', true);
    var msg = el('div', 'ordo-subs-note ordo-subs-msg');
    msg.setAttribute('role', 'status');
    btn.addEventListener('click', function() {
      var question = 'Votre abonnement continuera après le ' + day(c.endsOn) + ', aux mêmes conditions. Confirmer ?';
      if (!window.confirm(question)) return;
      btn.disabled = true;
      msg.textContent = 'Traitement en cours…';
      request('POST', { action: 'reactivate', ref: c.reactivation }).then(function(data) {
        render(data.list, 'C’est fait : votre abonnement continue.', data.pms, data.invoices, data.others);
      }).catch(function(err) {
        btn.disabled = false;
        if (err && err.status === 409) msg.textContent = 'Ce réabonnement n’est pas possible depuis cette page : écrivez-nous.';
        else if (err && err.status === 401) msg.textContent = 'Votre session a expiré : reconnectez-vous puis réessayez.';
        else msg.textContent = 'Une erreur est survenue. Merci de réessayer.';
        reportIfActionable(err);
      });
    });
    row.appendChild(btn);
    row.appendChild(msg);
    return row;
  }

  function actionsOf(c) {
    if (c.status === 'canceling' && typeof c.reactivation === 'string' && REF.test(c.reactivation)) {
      return reactivateActions(c);
    }
    if (c.status === 'paused' || c.status === 'pause_scheduled') {
      var pause = window.OrdoPause;
      return pause && typeof pause.resume === 'function' ? pauseActions() : null;
    }
    var action = c.action;
    if (!action || !action.label || typeof action.href !== 'string') return null;
    var row = el('div', 'ordo-subs-actions');
    if (ELEMENT_LINK.test(action.href)) {
      var b = button(action.label, false);
      b.addEventListener('click', function() { showElement(action.href.slice(1)); });
      row.appendChild(b);
    } else if (SITE_LINK.test(action.href)) {
      var a = el('a', 'ordo-subs-btn', action.label);
      a.setAttribute('href', action.href);
      row.appendChild(a);
    } else {
      return null;
    }
    return row;
  }

  function card(c) {
    var root = el('div', 'ordo-subs-card');
    root.setAttribute('role', 'listitem');

    var head = el('div', 'ordo-subs-head');
    head.appendChild(el('div', 'ordo-subs-label', c.label || 'Abonnement'));
    var st = STATUS[c.status] || STATUS.active;
    head.appendChild(el('span', 'ordo-subs-tag ordo-subs-tone-' + st.tone, st.text));
    root.appendChild(head);

    var body = el('div', 'ordo-subs-body');
    if (c.price && c.status !== 'paused') body.appendChild(priceRow(c));
    if (c.note) body.appendChild(el('div', 'ordo-subs-muted', c.note));
    if (c.offeredUntil) body.appendChild(offerRow('Offert', 'jusqu’au ' + day(c.offeredUntil)));
    if (c.discount) body.appendChild(offerRow(badgeText(c.discount, c.price && c.price.currency), noteText(c.discount)));
    var then = thenText(c);
    if (then) body.appendChild(el('div', 'ordo-subs-muted', then));
    if (c.status === 'pause_scheduled' && c.endsOn) {
      body.appendChild(el('div', 'ordo-subs-muted', 'Accès maintenu jusqu’au ' + day(c.endsOn) + ', puis mise en pause.'));
    }
    if (c.status === 'canceling' && c.next && c.endsOn) {
      body.appendChild(el('div', 'ordo-subs-muted', 'Se termine le ' + day(c.endsOn) + '.'));
    }
    if (c.status === 'pending') body.appendChild(el('div', 'ordo-subs-muted', 'Votre paiement est en cours de validation.'));
    if (body.firstChild) root.appendChild(body);

    var foot = footOf(c);
    if (foot) root.appendChild(foot);
    var actions = actionsOf(c);
    if (actions) root.appendChild(actions);
    return root;
  }

  function closestSection(node) {
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains('inner-block-wraper')) return node;
      node = node.parentElement;
    }
    return null;
  }

  // The previous per-plan blocks stay as the fallback until the list is shown.
  function hideOldSection() {
    var blocks = document.querySelectorAll('.abonnement-wrapper');
    var hidden = [];
    for (var i = 0; i < blocks.length; i++) {
      var section = closestSection(blocks[i]);
      if (section && hidden.indexOf(section) === -1 && !section.contains(anchor)) {
        section.style.display = 'none';
        hidden.push(section);
      }
    }
  }

  // Adding a payment method only matters when something is billed or paused.
  var BILLED = ['active', 'past_due', 'pending', 'canceling', 'pause_scheduled', 'paused'];

  // The page's own block stays only while the list cannot show the payment method itself.
  function togglePaymentBlock(list, pms) {
    var block = document.getElementById('payment-method-block');
    if (!block) return;
    var billed = false;
    for (var i = 0; i < list.length; i++) {
      if (BILLED.indexOf(list[i].status) !== -1) billed = true;
    }
    block.style.display = billed && !pms.length ? '' : 'none';
  }

  var CARD_BRANDS = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    diners: 'Diners Club',
    discover: 'Discover',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    cartes_bancaires: 'CB'
  };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICON_PATHS = {
    card: ['M4.5 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M2.5 9.5h19', 'M6 15h4'],
    bank: ['M3 9.5 12 4l9 5.5', 'M5 10v8M9.5 10v8M14.5 10v8M19 10v8', 'M3 20h18'],
    mail: ['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'm3.5 6.5 8.5 6.5 8.5-6.5'],
    phone: ['M5.5 3.5h3l1.5 4.5-2 1.5a11.5 11.5 0 0 0 6.5 6.5l1.5-2 4.5 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 4 5.1a1.5 1.5 0 0 1 1.5-1.6z'],
    play: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M10 8.8v6.4l5.2-3.2z'],
    download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 19h14']
  };

  function svgIcon(name, size) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size || 20));
    svg.setAttribute('height', String(size || 20));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var paths = ICON_PATHS[name];
    for (var i = 0; i < paths.length; i++) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', paths[i]);
      svg.appendChild(p);
    }
    return svg;
  }

  function pmIcon(pm) {
    var box = el('span', 'ordo-pm-icon' + (pm.expired ? ' is-alert' : ''));
    box.setAttribute('aria-hidden', 'true');
    box.appendChild(svgIcon(pm.type === 'sepa_debit' ? 'bank' : 'card', 22));
    return box;
  }

  function pmName(pm) {
    var dots = pm.last4 ? ' •••• ' + pm.last4 : '';
    if (pm.type === 'card') {
      var known = Object.prototype.hasOwnProperty.call(CARD_BRANDS, pm.brand);
      return 'Carte ' + (known ? CARD_BRANDS[pm.brand] : 'bancaire') + dots;
    }
    if (pm.type === 'sepa_debit') return 'Prélèvement SEPA' + dots;
    if (pm.type === 'link') return 'Paiement via Link';
    if (pm.type === 'none') return 'Aucun moyen de paiement enregistré';
    return 'Moyen de paiement enregistré';
  }

  // "A", "A et B", "A, B et C"
  function joinLabels(labels) {
    if (labels.length < 2) return labels.join('');
    return labels.slice(0, -1).join(', ') + ' et ' + labels[labels.length - 1];
  }

  function pmDetail(pm, several) {
    var parts = [];
    var month = Number(pm.expMonth);
    if (pm.type === 'card' && month >= 1 && month <= 12 && pm.expYear) {
      var when = MOIS[month - 1] + ' ' + pm.expYear;
      parts.push(pm.expired ? 'A expiré en ' + when + '.' : 'Expire en ' + when + '.');
    }
    var used = Array.isArray(pm.usedBy) ? pm.usedBy : [];
    if (used.length && pm.type !== 'none') {
      parts.push((pm.type === 'card' ? 'Utilisée' : 'Utilisé') + ' pour : ' + joinLabels(used) + '.');
    } else if (used.length && several) {
      parts.push('Pour : ' + joinLabels(used) + '.');
    }
    return parts.join(' ');
  }

  // Saved methods nothing charges: named, never offered.
  function otherName(o) {
    var dots = o.last4 ? ' •••• ' + o.last4 : '';
    if (o.type === 'card') return 'Aussi enregistrée : carte' + dots + ', non utilisée';
    if (o.type === 'sepa_debit') return 'Aussi enregistré : prélèvement SEPA' + dots + ', non utilisé';
    if (o.type === 'link') return 'Aussi enregistré : paiement via Link, non utilisé';
    return null;
  }

  function othersBox(others) {
    var box = el('div', 'ordo-pm-others');
    for (var i = 0; i < others.length; i++) {
      var name = others[i] && otherName(others[i]);
      if (name) box.appendChild(el('div', 'ordo-subs-muted', name));
    }
    return box.firstChild ? box : null;
  }

  function paymentSection(list, pms, others) {
    var root = el('div', 'ordo-subs ordo-pm');
    root.appendChild(el('h3', 'ordo-subs-title', 'Moyen de paiement'));
    var several = pms.length > 1;
    var urgent = false;
    var none = true;
    var rows = [];
    for (var i = 0; i < pms.length; i++) {
      var pm = pms[i];
      if (pm.type !== 'none') none = false;
      if (pm.expired || pm.expiresSoon) urgent = true;
      var row = el('div', 'ordo-pm-row');
      row.appendChild(pmIcon(pm));
      var text = el('div', 'ordo-pm-text');
      var name = el('div', 'ordo-pm-name');
      name.appendChild(el('span', null, pmName(pm)));
      if (pm.expired) name.appendChild(el('span', 'ordo-subs-tag ordo-pm-tone-expired', 'Expirée'));
      else if (pm.expiresSoon) name.appendChild(el('span', 'ordo-subs-tag ordo-pm-tone-soon', 'Expire bientôt'));
      text.appendChild(name);
      var detail = pmDetail(pm, several);
      if (detail) text.appendChild(el('div', 'ordo-subs-muted', detail));
      row.appendChild(text);
      rows.push(row);
      root.appendChild(row);
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].status === 'past_due') urgent = true;
    }
    var saved = none ? null : othersBox(others || []);
    if (saved) root.appendChild(saved);
    var label = none ? 'Ajouter un moyen de paiement' : (urgent ? 'Mettre à jour' : 'Modifier');
    var link = paymentLink('ordo-subs-btn' + (none || urgent ? ' is-primary' : ''), label);
    if (several) {
      var actions = el('div', 'ordo-subs-actions');
      actions.appendChild(link);
      root.appendChild(actions);
    } else {
      rows[0].appendChild(link);
    }
    return root;
  }

  function intro() {
    return el('h3', 'ordo-subs-title', 'Mes abonnements');
  }

  function clear() {
    while (anchor.firstChild) anchor.removeChild(anchor.firstChild);
  }

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

  function showSkeleton() {
    injectStyle();
    clear();
    var root = el('div', 'ordo-subs');
    root.setAttribute('aria-busy', 'true');
    root.appendChild(intro());
    var skel = el('div', 'ordo-subs-skel');
    skel.setAttribute('aria-hidden', 'true');
    root.appendChild(skel);
    root.appendChild(el('span', 'ordo-subs-sr', 'Chargement de vos abonnements…'));
    anchor.appendChild(root);
    show();
  }

  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  function shortDay(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    var d = Number(m[3]);
    return (d === 1 ? '1er' : String(d)) + ' ' + MOIS_COURTS[Number(m[2]) - 1] + ' ' + m[1];
  }

  var INVOICE_STATUS = {
    paid: { text: 'Payée', tone: 'paid' },
    processing: { text: 'Prélèvement en cours', tone: 'pending' },
    open: { text: 'En attente', tone: 'pending' },
    due: { text: 'À régler', tone: 'due' },
    uncollectible: { text: 'Impayée', tone: 'due' }
  };

  function downloadInvoice(inv, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    call('POST', { action: 'invoice_pdf', ref: inv.ref }).then(function(payload) {
      if (!payload || typeof payload.pdf !== 'string' || !payload.pdf) {
        var bad = new Error('account-subscriptions: invoice pdf missing');
        bad.status = 200;
        throw bad;
      }
      var bin = window.atob(payload.pdf);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = typeof payload.filename === 'string' && payload.filename ? payload.filename : 'Facture-Ordotype.pdf';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
      btn.removeAttribute('title');
      btn.lastChild.textContent = 'PDF';
    }).catch(function(err) {
      btn.setAttribute('title', 'Téléchargement impossible pour le moment. Réessayez.');
      btn.lastChild.textContent = 'Réessayer';
      reportIfActionable(err);
    }).then(function() {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    });
  }

  function invoiceAction(inv) {
    if (inv.status === 'due' || inv.status === 'uncollectible') return paymentLink('ordo-subs-link', 'Régler');
    if (!inv.pdf || typeof inv.ref !== 'string' || !REF.test(inv.ref)) return null;
    var btn = el('button', 'ordo-inv-pdf');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Télécharger la facture du ' + day(inv.date));
    btn.appendChild(svgIcon('download', 16));
    btn.appendChild(el('span', null, 'PDF'));
    btn.addEventListener('click', function() { downloadInvoice(inv, btn); });
    return btn;
  }

  function invoicesSection(invoices) {
    var root = el('div', 'ordo-subs ordo-inv');
    root.appendChild(el('h3', 'ordo-subs-title', 'Factures'));
    var table = el('div', 'ordo-inv-table');
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Dernières factures');
    var head = el('div', 'ordo-inv-row ordo-inv-head');
    head.setAttribute('role', 'row');
    var titles = ['Date', 'Abonnement', 'Montant', 'Statut', 'Facture'];
    for (var h = 0; h < titles.length; h++) {
      var th = el('span', 'ordo-inv-cell', titles[h]);
      th.setAttribute('role', 'columnheader');
      head.appendChild(th);
    }
    table.appendChild(head);
    for (var i = 0; i < invoices.length; i++) {
      var inv = invoices[i];
      var st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.open;
      var row = el('div', 'ordo-inv-row');
      row.setAttribute('role', 'row');
      var cells = [
        el('span', 'ordo-inv-cell ordo-inv-date', shortDay(inv.date)),
        el('span', 'ordo-inv-cell ordo-inv-label', inv.label || 'Abonnement'),
        el('span', 'ordo-inv-cell ordo-inv-amount', typeof inv.amount === 'number' ? money(inv.amount, inv.currency) : ''),
        el('span', 'ordo-inv-cell ordo-inv-status'),
        el('span', 'ordo-inv-cell ordo-inv-action')
      ];
      cells[3].appendChild(el('span', 'ordo-subs-tag ordo-inv-tone-' + st.tone, st.text));
      var action = invoiceAction(inv);
      if (action) cells[4].appendChild(action);
      for (var c = 0; c < cells.length; c++) {
        cells[c].setAttribute('role', 'cell');
        row.appendChild(cells[c]);
      }
      table.appendChild(row);
    }
    root.appendChild(table);
    if (window.OrdoBillingPortal && typeof window.OrdoBillingPortal.open === 'function') {
      var more = el('button', 'ordo-subs-link', 'Toutes mes factures et mes informations de facturation');
      more.type = 'button';
      more.addEventListener('click', function() { window.OrdoBillingPortal.open(); });
      root.appendChild(more);
    }
    var slot = el('div', 'ordo-inv-emails');
    root.appendChild(slot);
    return { root: root, slot: slot };
  }

  var HELP_EMAIL = 'comptabilite@ordotype.fr';
  var HELP_PHONE = { href: 'tel:+33676520055', text: '+33 (0)6 76 52 00 55' };
  var HELP_VIDEOS = [
    { href: '/academie/ajouter-moyen-paiement', text: 'Vidéo : ajouter un moyen de paiement' },
    { href: '/academie/obtenir-factures', text: 'Vidéo : obtenir mes factures' }
  ];

  function iconLink(cls, href, icon, text) {
    var a = el('a', cls);
    a.setAttribute('href', href);
    a.appendChild(svgIcon(icon, 20));
    a.appendChild(el('span', null, text));
    return a;
  }

  function helpSection() {
    var root = el('aside', 'ordo-help');
    root.setAttribute('aria-label', 'Aide');
    root.appendChild(el('p', 'ordo-help-title', 'Une question sur votre abonnement ou vos factures ?'));
    var contacts = el('div', 'ordo-help-row');
    contacts.appendChild(iconLink('ordo-help-contact', 'mailto:' + HELP_EMAIL, 'mail', HELP_EMAIL));
    var phone = el('div', 'ordo-help-phone');
    phone.appendChild(iconLink('ordo-help-contact', HELP_PHONE.href, 'phone', HELP_PHONE.text));
    phone.appendChild(el('span', 'ordo-help-note', 'Appel non surtaxé'));
    contacts.appendChild(phone);
    root.appendChild(contacts);
    root.appendChild(el('div', 'ordo-help-divider'));
    var videos = el('div', 'ordo-help-row');
    for (var i = 0; i < HELP_VIDEOS.length; i++) {
      videos.appendChild(iconLink('ordo-help-video', HELP_VIDEOS[i].href, 'play', HELP_VIDEOS[i].text));
    }
    root.appendChild(videos);
    return root;
  }

  // The page's invoices block (portal button, help, invoice emails toggle) gives way to the
  // invoices section and the help box, once the invoices are known. The toggle moves into the
  // section, and back into the block whenever a later render has no section to hold it.
  var toggleMoved = false;

  function moveToggle(container) {
    var emails = window.OrdoInvoiceEmails;
    if (!container || !emails || typeof emails.relocate !== 'function') return false;
    try { return emails.relocate(container) !== false; } catch (e) { return false; }
  }

  function placeInvoices(invoices) {
    var block = document.getElementById('invoices-block');
    if (!Array.isArray(invoices)) {
      if (block) block.style.display = '';
      if (toggleMoved && moveToggle(block)) toggleMoved = false;
      return;
    }
    if (invoices.length) {
      var section = invoicesSection(invoices);
      anchor.appendChild(section.root);
      if (moveToggle(section.slot)) toggleMoved = true;
    } else if (toggleMoved && moveToggle(block)) {
      toggleMoved = false;
    }
    anchor.appendChild(helpSection());
    if (block) block.style.display = 'none';
  }

  function render(list, flash, pms, invoices, others) {
    pms = Array.isArray(pms) ? pms : [];
    others = Array.isArray(others) ? others : [];
    injectStyle();
    clear();
    var root = el('div', 'ordo-subs');
    root.appendChild(intro());
    if (flash) {
      var line = el('p', 'ordo-subs-flash', flash);
      line.setAttribute('role', 'status');
      root.appendChild(line);
    }
    if (!list.length) {
      root.appendChild(el('p', 'ordo-subs-empty', 'Vous n’avez pas d’abonnement en cours.'));
    } else {
      var box = el('div', 'ordo-subs-list');
      box.setAttribute('role', 'list');
      for (var i = 0; i < list.length; i++) box.appendChild(card(list[i]));
      root.appendChild(box);
    }
    anchor.appendChild(root);
    if (pms.length) anchor.appendChild(paymentSection(list, pms, others));
    placeInvoices(invoices);
    show();
    hideOldSection();
    togglePaymentBlock(list, pms);
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

  function call(method, body) {
    return memberToken().then(function(token) {
      if (!token) {
        var e = new Error('no member token');
        e.status = 401;
        throw e;
      }
      var opts = {
        method: method || 'GET',
        credentials: 'omit',
        headers: { Authorization: 'Bearer ' + token }
      };
      if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      return fetch(API_URL, opts);
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(payload) {
        if (!res.ok) {
          var err = new Error('account-subscriptions ' + res.status + ' ' + (payload.error || ''));
          err.status = res.status;
          throw err;
        }
        return payload;
      });
    });
  }

  function request(method, body) {
    return call(method, body).then(function(payload) {
      if (!payload || !Array.isArray(payload.subscriptions)) {
        var bad = new Error('account-subscriptions: unexpected body');
        bad.status = 200;
        throw bad;
      }
      return {
        list: payload.subscriptions,
        pms: Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [],
        others: Array.isArray(payload.otherPaymentMethods) ? payload.otherPaymentMethods : [],
        invoices: Array.isArray(payload.invoices) ? payload.invoices : null
      };
    });
  }

  function load() {
    return request('GET').catch(function(err) {
      if (err && err.status) throw err;
      return new Promise(function(resolve) {
        setTimeout(resolve, RETRY_DELAY_MS);
      }).then(function() { return request('GET'); });
    });
  }

  function reportIfActionable(err) {
    if (err && EXPECTED.indexOf(err.status) !== -1) return;
    var reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    if (err && !err.status && typeof reporter.reportNetwork === 'function') {
      reporter.reportNetwork('SubscriptionsOverview', err);
      return;
    }
    reporter.report('SubscriptionsOverview', err);
  }

  function observed() {
    var w = wrapper();
    return (w && w.parentElement) || anchor.parentElement || anchor;
  }

  function whenVisible(run) {
    var done = false;
    function fire() {
      if (done) return;
      done = true;
      run();
    }
    if (typeof window.IntersectionObserver !== 'function') return fire();
    var obs = new window.IntersectionObserver(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          obs.disconnect();
          fire();
          return;
        }
      }
    }, { rootMargin: '200px' });
    obs.observe(observed());
  }

  function init() {
    anchor = document.getElementById(ANCHOR_ID);
    if (!anchor) {
      console.log(PREFIX + ' Anchor not found');
      return;
    }
    if (anchor.firstElementChild) {
      console.log(PREFIX + ' Already rendered');
      return;
    }
    hide();
    whenVisible(function() {
      skeletonTimer = setTimeout(showSkeleton, SKELETON_DELAY_MS);
      load().then(function(data) {
        clearTimeout(skeletonTimer);
        render(data.list, null, data.pms, data.invoices, data.others);
        console.log(PREFIX + ' Rendered ' + data.list.length + ' subscription(s)');
      }).catch(function(err) {
        clearTimeout(skeletonTimer);
        clear();
        hide();
        console.error(PREFIX + ' Load error:', err && err.message);
        reportIfActionable(err);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
