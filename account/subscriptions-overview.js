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
    '.ordo-pm-tone-expired{background:var(--error-100,#fee1e1);color:var(--error-700,#ba1b1b)}',
    '.ordo-pm-tone-soon{background:var(--warning-100,#fef9c3);color:var(--warning-800,#864e0e)}',
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

  function openPortal() {
    if (window.OrdoBillingPortal && typeof window.OrdoBillingPortal.open === 'function') {
      window.OrdoBillingPortal.open();
    }
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
      if (window.OrdoBillingPortal && typeof window.OrdoBillingPortal.open === 'function') {
        var btn = el('button', 'ordo-subs-link', 'Modifier le moyen de paiement');
        btn.type = 'button';
        btn.addEventListener('click', openPortal);
        return footRow('Paiement en échec', btn);
      }
      return footRow('Paiement en échec', 'Modifiez votre moyen de paiement');
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
        render(data.list, 'C’est fait : votre abonnement continue.', data.pms);
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

  var PAYMENT_URL = '/membership/moyen-de-paiement';
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
    bank: ['M3 9.5 12 4l9 5.5', 'M5 10v8M9.5 10v8M14.5 10v8M19 10v8', 'M3 20h18']
  };

  function pmIcon(pm) {
    var box = el('span', 'ordo-pm-icon' + (pm.expired ? ' is-alert' : ''));
    box.setAttribute('aria-hidden', 'true');
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var paths = pm.type === 'sepa_debit' ? ICON_PATHS.bank : ICON_PATHS.card;
    for (var i = 0; i < paths.length; i++) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', paths[i]);
      svg.appendChild(p);
    }
    box.appendChild(svg);
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

  function pmDetail(pm, several) {
    var parts = [];
    var month = Number(pm.expMonth);
    if (pm.type === 'card' && month >= 1 && month <= 12 && pm.expYear) {
      var when = MOIS[month - 1] + ' ' + pm.expYear;
      parts.push(pm.expired ? 'A expiré en ' + when + '.' : 'Expire en ' + when + '.');
    }
    if (several && pm.usedBy && pm.usedBy.length) parts.push('Pour : ' + pm.usedBy.join(', ') + '.');
    return parts.join(' ');
  }

  function paymentSection(list, pms) {
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
    var label = none ? 'Ajouter un moyen de paiement' : (urgent ? 'Mettre à jour' : 'Modifier');
    var link = el('a', 'ordo-subs-btn' + (none || urgent ? ' is-primary' : ''), label);
    link.setAttribute('href', PAYMENT_URL);
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

  function render(list, flash, pms) {
    pms = Array.isArray(pms) ? pms : [];
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
    if (pms.length) anchor.appendChild(paymentSection(list, pms));
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

  function request(method, body) {
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
        if (!payload || !Array.isArray(payload.subscriptions)) {
          var bad = new Error('account-subscriptions: unexpected body');
          bad.status = res.status;
          throw bad;
        }
        return {
          list: payload.subscriptions,
          pms: Array.isArray(payload.paymentMethods) ? payload.paymentMethods : []
        };
      });
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
        render(data.list, null, data.pms);
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
