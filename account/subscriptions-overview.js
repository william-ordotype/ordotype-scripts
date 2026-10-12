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
  // Same delay as the page head rule that brings the page's own blocks back: past it, the
  // member already sees those blocks, so the list is recorded as timed out instead of silent.
  var LIST_TIMEOUT_MS = 8000;
  // An unanswered list request is sent a second time, without cancelling the first: the first answer wins.
  var HEDGE_MS = 4000;
  var SLOW_MS = 3000;
  var EXPECTED = [401, 409, 429];
  // Labels, logos and order of the cards, for the members whose list can be shown without waiting.
  var PLANS_URL = 'https://webhooks.ordotype.fr/.netlify/functions/abonnements-affiches';
  var PLANS_KEY = 'ordo_subs_plans';
  var PLANS_TIMEOUT_MS = 2500;
  var PLANS_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
  var JUST_PAID_MS = 24 * 3600 * 1000;
  var DEFAULT_ORDER = 50;

  var member = window.OrdoAccount && window.OrdoAccount.member;
  if (!member || !member.id) return;

  var anchor = null;
  var skeletonTimer = null;
  var slowTimer = null;
  var startedAt = Date.now();

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
    '.ordo-subs-head{display:flex;justify-content:space-between;align-items:center;gap:.5rem 1rem}',
    '.ordo-subs-label{font-size:1rem;line-height:1.5;font-weight:600}',
    '.ordo-subs-tag{flex:none;height:1.5rem;padding:0 .5rem;border-radius:.25rem;font-size:.75rem;font-weight:600;line-height:1.5rem;white-space:nowrap}',
    '.ordo-subs-tone-ok{background:var(--primary-500,#3454f6);color:var(--inverted-900,#ffffffe6)}',
    '.ordo-subs-tone-free{background:var(--success-700,#106820);color:#fff}',
    '.ordo-subs-tone-alert{background:var(--error-500,#ee4343);color:var(--inverted-900,#ffffffe6)}',
    '.ordo-subs-tone-muted{background:var(--inverted-900,#ffffffe6);color:var(--base-900,#0c0e16)}',
    '.ordo-subs-body{display:flex;flex-direction:column;gap:.5rem}',
    '.ordo-subs-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .5rem}',
    '.ordo-subs-amount{font-size:1.25rem;line-height:1.4;font-weight:600}',
    '.ordo-subs-period,.ordo-subs-old,.ordo-subs-muted,.ordo-subs-note{color:var(--neutral-500,#47505c)}',
    '.ordo-subs-period,.ordo-subs-old{font-size:.875rem}',
    '.ordo-subs-offer{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}',
    '.ordo-subs-badge{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:0 .375rem;min-height:1.5rem;box-sizing:border-box;padding:.1875rem .5rem;border-radius:.25rem;background:var(--primary-50,#f0f3ff);color:var(--primary-600,#263fd3);font-size:.8125rem;font-weight:500;line-height:1.125rem}',
    '.ordo-subs-badge strong{font-weight:700;white-space:nowrap}',
    '.ordo-subs-name{flex:1 1 auto;display:flex;align-items:center;gap:.75rem;min-width:0;overflow-wrap:anywhere}',
    '.ordo-subs-logo{flex:none;width:40px;height:40px;object-fit:contain}',
    '.ordo-subs-logo.is-small{width:16px;height:16px;vertical-align:-3px;margin-right:.25rem}',
    '.ordo-pm-use{white-space:nowrap}',
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
    '.ordo-addr-sub{margin:-.75rem 0 0;font-size:.875rem;line-height:1.5;color:var(--neutral-500,#47505c)}',
    '.ordo-addr-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.75rem 1rem}',
    '.ordo-addr-grid{flex:1 1 20rem;min-width:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem 1.5rem}',
    '.ordo-addr-label{font-size:.875rem;line-height:1.5;color:var(--neutral-500,#47505c)}',
    '.ordo-addr-value{font-size:1rem;line-height:1.5;font-weight:500;overflow-wrap:anywhere}',
    '.ordo-addr-value.is-empty{font-weight:400;color:var(--neutral-500,#47505c)}',
    '.ordo-addr-form{display:flex;flex-direction:column;gap:1rem}',
    '.ordo-addr-line{display:flex;flex-wrap:wrap;gap:1rem}',
    '.ordo-addr-field{flex:1 1 12rem;min-width:0;display:flex;flex-direction:column;gap:.375rem}',
    '.ordo-addr-field.is-short{flex:0 1 10rem}',
    '.ordo-addr-field label{font-size:.875rem;line-height:1.5;font-weight:600}',
    '.ordo-addr-field label span{font-weight:400;color:var(--neutral-500,#47505c)}',
    '.ordo-addr-input{width:100%;min-height:44px;box-sizing:border-box;margin:0;padding:.5rem .75rem;border:1px solid var(--base-500,#0c0e1680);border-radius:.25rem;background:#fff;color:var(--base-900,#0c0e16);font:inherit;font-size:1rem}',
    '.ordo-addr-input:focus{outline:2px solid var(--primary-500,#3454f6);outline-offset:1px}',
    'select.ordo-addr-input{-webkit-appearance:none;appearance:none;padding-right:2.75rem;background:#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%230c0e16\' stroke-width=\'1.8\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right .875rem center}',
    '.ordo-addr-error{margin:0;font-size:.875rem;line-height:1.5;color:var(--error-700,#ba1b1b)}',
    '.ordo-addr-tva{display:flex;flex-direction:column;gap:.75rem;border-top:1px solid var(--base-100,#0c0e161a);padding-top:1rem}',
    '.ordo-addr-tva[hidden]{display:none}',
    '.ordo-addr-tva p{margin:0}',
    '.ordo-addr-tva .ordo-addr-field{flex:none;max-width:20rem}',
    '.ordo-addr-main{flex:1 1 16rem;min-width:0}',
    '.ordo-addr-ask{font-size:.875rem;line-height:1.5;font-weight:600}',
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
    '.ordo-subs-skels{display:flex;flex-direction:column;gap:1rem}',
    '@keyframes ordo-subs-pulse{0%,100%{opacity:.5}50%{opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.ordo-subs-skel{animation:none}}',
    '@media (max-width:767px){.ordo-addr-grid{grid-template-columns:minmax(0,1fr)}.ordo-addr-field.is-short{flex:1 1 12rem}}',
    '@media (max-width:479px){.ordo-subs-card{padding:1rem}.ordo-subs-amount{font-size:1.125rem}.ordo-subs-foot{flex-direction:column}.ordo-subs-btn{width:100%}.ordo-subs-msg{text-align:left}.ordo-addr-row>.ordo-subs-actions{flex:1 1 100%}}'
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

  // --- Deux présentations, une seule logique ---------------------------------------------------
  // Héritée : ce script construit les sections et leur feuille de style dans #ordotype-subscriptions.
  // Designer (palier facturation-designer.js du chargeur) : les sections, leurs classes et leurs textes
  // fixes sont dessinés dans Webflow ([data-ordo-facturation]) ; les états à recopier vivent dans le bloc
  // [data-ordo-gabarits="facturation"], visible seulement dans le Designer. Le script n'y met que les
  // données et les actions. `ui` porte ce qui diffère entre les deux présentations.
  var DESIGNER_GATE = 'facturation-designer.js';
  var D = null;

  var KIND_CLASS = { bouton: 'ordo-subs-btn', 'bouton-primaire': 'ordo-subs-btn is-primary', lien: 'ordo-subs-link' };

  var legacyUi = {
    actions: function() { return el('div', 'ordo-subs-actions'); },
    // kind : 'bouton', 'bouton-primaire' ou 'lien'.
    button: function(kind, label) {
      var b = el('button', KIND_CLASS[kind], label);
      b.type = 'button';
      return b;
    },
    anchor: function(kind, label, href) {
      var a = el('a', KIND_CLASS[kind], label);
      a.setAttribute('href', href);
      return a;
    },
    message: function() {
      var m = el('div', 'ordo-subs-note ordo-subs-msg');
      m.setAttribute('role', 'status');
      return m;
    },
    flash: function(text) {
      var p = el('p', 'ordo-subs-flash', text);
      p.setAttribute('role', 'status');
      return p;
    }
  };
  var ui = legacyUi;

  // Le libellé d'un bouton d'envoi : un <input type="submit"> (formulaire Webflow) le porte dans `value`.
  function setLabel(node, text) {
    if (node.tagName === 'INPUT') node.value = text;
    else node.textContent = text;
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

  // The whole offer (amount and end date) in one blue chip.
  function offerRow(badge, note) {
    var row = el('div', 'ordo-subs-offer');
    var chip = el('span', 'ordo-subs-badge');
    chip.appendChild(el('strong', null, badge));
    if (note) chip.appendChild(el('span', null, note));
    row.appendChild(chip);
    return row;
  }

  var LOGO_URL = /^https:\/\/(cdn\.prod\.website-files\.com|uploads-ssl\.webflow\.com|assets\.website-files\.com)\//;

  function logo(src, size) {
    if (typeof src !== 'string' || !LOGO_URL.test(src)) return null;
    var px = String(size || 40);
    var img = el('img', size ? 'ordo-subs-logo is-small' : 'ordo-subs-logo');
    img.setAttribute('src', src);
    img.setAttribute('alt', '');
    img.setAttribute('width', px);
    img.setAttribute('height', px);
    return img;
  }

  // The price line: what is charged now, and the full price struck through when it is lower.
  function priceInfo(c) {
    var shown = c.offeredUntil ? 0 : c.price.current;
    return {
      amount: money(shown, c.price.currency),
      period: period(c.price),
      old: shown < c.price.amount ? money(c.price.amount, c.price.currency) : null
    };
  }

  function priceRow(c) {
    var info = priceInfo(c);
    var row = el('div', 'ordo-subs-price');
    row.appendChild(el('span', 'ordo-subs-amount', info.amount));
    row.appendChild(el('span', 'ordo-subs-period', info.period));
    if (info.old) {
      var old = el('s', 'ordo-subs-old');
      old.appendChild(el('span', 'ordo-subs-sr', 'au lieu de '));
      old.appendChild(document.createTextNode(info.old));
      row.appendChild(old);
    }
    return row;
  }

  // The lines under a card's title, in order: { price }, { badge, note } (offer chip) or { text }.
  function bodyLines(c) {
    var lines = [];
    if (c.price && c.status !== 'paused') lines.push({ price: true });
    if (c.note) lines.push({ text: c.note });
    if (c.offeredUntil) lines.push({ badge: 'Offert', note: 'jusqu’au ' + day(c.offeredUntil) });
    if (c.discount) lines.push({ badge: badgeText(c.discount, c.price && c.price.currency), note: noteText(c.discount) });
    var then = thenText(c);
    if (then) lines.push({ text: then });
    if (c.status === 'pause_scheduled' && c.endsOn) {
      lines.push({ text: 'Accès maintenu jusqu’au ' + day(c.endsOn) + ', puis mise en pause.' });
    }
    if (c.status === 'canceling' && c.next && c.endsOn) lines.push({ text: 'Se termine le ' + day(c.endsOn) + '.' });
    if (c.status === 'pending') lines.push({ text: 'Votre paiement est en cours de validation.' });
    return lines;
  }

  function footRow(label, value) {
    var foot = el('div', 'ordo-subs-foot');
    foot.appendChild(el('span', 'ordo-subs-foot-label', label));
    if (typeof value === 'string') foot.appendChild(el('span', 'ordo-subs-foot-value', value));
    else foot.appendChild(value);
    return foot;
  }

  // The card's last line: { label, value }, or { label, link } for the payment method link; null when none.
  function footInfo(c) {
    if (c.status === 'past_due') {
      // Saving a new payment method also retries the unpaid invoice.
      return { label: 'Paiement en échec', link: 'Modifier le moyen de paiement' };
    }
    if ((c.status === 'paused' || c.status === 'pause_scheduled') && c.resumesOn) {
      return { label: 'Reprise automatique le', value: day(c.resumesOn) };
    }
    if (c.next && c.next.date) {
      if (typeof c.next.amount !== 'number') return { label: 'Prochaine échéance', value: day(c.next.date) };
      var label = c.next.amount > 0 ? 'Prochain prélèvement' : 'Prochaine échéance';
      var currency = c.price ? c.price.currency : 'eur';
      return { label: label, value: money(c.next.amount, currency) + ' le ' + day(c.next.date) };
    }
    if ((c.status === 'canceling' || c.status === 'free') && c.endsOn) return { label: 'Se termine le', value: day(c.endsOn) };
    return null;
  }

  function footOf(c) {
    var f = footInfo(c);
    if (!f) return null;
    return footRow(f.label, f.link ? paymentLink('lien', f.link, c.status) : f.value);
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
  // Only the scheme and host are checked: Stripe serves the same page under several paths
  // (/c/pay/, /g/pay/, /f/pay/...), and rejecting one of them sent the member back to the page.
  var CHECKOUT_URL = /^https:\/\/[a-z0-9.-]+\//;
  var SESSION_ID = /\b(cs_(?:live|test)_[A-Za-z0-9]+)/;

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
          checkoutSessionId: data.id || (SESSION_ID.exec(data.url) || [])[1] || null,
          stripeCustomerId: customer,
          memberstackUserId: ms.memberId || (member && member.id) || null,
          memberstackEmail: ms.email || null,
          option: 'setup-sepa',
          paymentMethods: ['sepa_debit'],
          originPage: window.location.href
        });
        trackOutcome(link.getAttribute('data-subs-action'), link.getAttribute('data-subs-status'), 'ok');
        window.location.assign(data.url);
      });
    }).catch(function(err) {
      trackOutcome(link.getAttribute('data-subs-action'), link.getAttribute('data-subs-status'), 'failed');
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

  // --- Measurement (GA4 through GTM). Never allowed to break the page.
  var TRACK_SLUG = /[^a-z0-9]+/g;

  function slug(text) {
    var t = String(text || '').toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(TRACK_SLUG, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  }

  function track(eventName, params) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;
    var payload = { event: eventName };
    var rollout = window.OrdoRollout && window.OrdoRollout['subscriptions-overview.js'];
    if (rollout) {
      payload.rollout_percent = rollout.percent;
      payload.rollout_bucket = rollout.bucket;
      payload.rollout_reason = rollout.reason;
    }
    for (var k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
    }
    try { window.dataLayer.push(payload); } catch (e) { /* no-op */ }
  }

  // Every clickable element of the list says what it is; one listener counts the clicks.
  function mark(node, action, status) {
    node.setAttribute('data-subs-action', slug(action));
    if (status) node.setAttribute('data-subs-status', String(status));
    return node;
  }

  function trackOutcome(action, status, outcome) {
    track('subscriptions_action', { subs_action: slug(action), subs_status: status || '', subs_outcome: outcome });
  }

  // "active+free", sorted and without duplicates: what the member actually saw.
  function statusesOf(list) {
    var seen = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && seen.indexOf(list[i].status) === -1) seen.push(list[i].status);
    }
    return seen.sort().join('+') || 'empty';
  }

  function listenClicks() {
    anchor.addEventListener('click', function(e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-subs-action]') : null;
      if (!t || !anchor.contains(t)) return;
      trackOutcome(t.getAttribute('data-subs-action'), t.getAttribute('data-subs-status'), 'click');
    }, true);
  }

  function portalAvailable() {
    return Boolean(window.OrdoBillingPortal && typeof window.OrdoBillingPortal.open === 'function');
  }

  function portalButton(kind, label) {
    var b = mark(ui.button(kind, label), label === 'Modifier' ? 'modifier_moyen' : label);
    b.addEventListener('click', function() { window.OrdoBillingPortal.open(); });
    return b;
  }

  var PAYMENT_ACTIONS = {
    'Modifier': 'modifier_moyen',
    'Mettre à jour': 'mettre_a_jour_moyen',
    'Ajouter un moyen de paiement': 'ajouter_moyen',
    'Modifier le moyen de paiement': 'impaye_modifier_moyen',
    'Régler': 'regler'
  };

  // kind : 'bouton', 'bouton-primaire' ou 'lien'.
  function paymentLink(kind, label, status) {
    var a = mark(ui.anchor(kind, label, PAYMENT_URL), PAYMENT_ACTIONS[label] || label, status);
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
    return ui.button(primary ? 'bouton-primaire' : 'bouton', label);
  }

  function pauseActions(c) {
    var row = ui.actions();
    var resume = mark(button('Reprendre mon abonnement', true), 'reprendre_pause', c.status);
    var cancel = mark(button('Annuler définitivement', false), 'annuler_pause', c.status);
    var msg = ui.message();
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
    var row = ui.actions();
    var btn = mark(button('Me réabonner', true), 'reabonner', c.status);
    var msg = ui.message();
    btn.addEventListener('click', function() {
      var question = 'Votre abonnement continuera après le ' + day(c.endsOn) + ', aux mêmes conditions. Confirmer ?';
      if (!window.confirm(question)) return;
      btn.disabled = true;
      msg.textContent = 'Traitement en cours…';
      request({ action: 'reactivate', ref: c.reactivation }).then(function(data) {
        trackOutcome('reabonner', c.status, 'ok');
        render(data.list, 'C’est fait : votre abonnement continue.', data.pms, data.invoices, data.others, data.address, data.taxId, data.taxIdAllowed);
      }).catch(function(err) {
        btn.disabled = false;
        if (err && err.status === 409) msg.textContent = 'Ce réabonnement n’est pas possible depuis cette page : écrivez-nous.';
        else if (err && err.status === 401) msg.textContent = 'Votre session a expiré : reconnectez-vous puis réessayez.';
        else msg.textContent = 'Une erreur est survenue. Merci de réessayer.';
        trackOutcome('reabonner', c.status, 'failed');
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
      return pause && typeof pause.resume === 'function' ? pauseActions(c) : null;
    }
    var action = c.action;
    if (!action || !action.label || typeof action.href !== 'string') return null;
    var row = ui.actions();
    if (ELEMENT_LINK.test(action.href)) {
      var b = mark(button(action.label, false), action.label, c.status);
      b.addEventListener('click', function() { showElement(action.href.slice(1)); });
      row.appendChild(b);
    } else if (SITE_LINK.test(action.href)) {
      var a = mark(ui.anchor('bouton', action.label, action.href), action.label, c.status);
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
    var name = el('div', 'ordo-subs-name');
    var img = logo(c.icon);
    if (img) name.appendChild(img);
    name.appendChild(el('div', 'ordo-subs-label', c.label || 'Abonnement'));
    head.appendChild(name);
    var st = STATUS[c.status] || STATUS.active;
    head.appendChild(el('span', 'ordo-subs-tag ordo-subs-tone-' + st.tone, st.text));
    root.appendChild(head);

    var body = el('div', 'ordo-subs-body');
    var lines = bodyLines(c);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].price) body.appendChild(priceRow(c));
      else if (lines[i].badge) body.appendChild(offerRow(lines[i].badge, lines[i].note));
      else body.appendChild(el('div', 'ordo-subs-muted', lines[i].text));
    }
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
  // The page's own blocks start hidden on www (page head CSS, class `ordo-subs-pending` on <html>):
  // `ordo-keep` shows one that the list still needs, `ordo-subs-fallback` brings them all back.
  function keepBlock(block, keep) {
    if (!block) return;
    if (keep) block.classList.add('ordo-keep');
    else block.classList.remove('ordo-keep');
    block.style.display = keep ? '' : 'none';
  }

  function fallbackToPageBlocks() {
    document.documentElement.classList.add('ordo-subs-fallback');
  }

  function togglePaymentBlock(list, pms) {
    var block = document.getElementById('payment-method-block');
    if (!block) return;
    var billed = false;
    for (var i = 0; i < list.length; i++) {
      if (BILLED.indexOf(list[i].status) !== -1) billed = true;
    }
    keepBlock(block, billed && !pms.length);
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

  // "A.", "A et B.", "A, B et C.", each subscription with its logo when it has one; the punctuation
  // stays with the name so that a line never starts with it.
  // `makeItem(text, icon)` draws one subscription of the list (legacy span, or the Designer's « usage »).
  function usedList(box, used, icons, makeItem) {
    var last = used.length - 1;
    for (var i = 0; i < used.length; i++) {
      if (i) box.appendChild(document.createTextNode(i === last ? ' et ' : ' '));
      box.appendChild(makeItem(used[i] + (i === last ? '.' : (i === last - 1 ? '' : ',')), icons[i]));
    }
  }

  function legacyUsage(text, icon) {
    var item = el('span', 'ordo-pm-use');
    var img = logo(icon, 16);
    if (img) item.appendChild(img);
    item.appendChild(document.createTextNode(text));
    return item;
  }

  // Expiry and "Utilisée pour : …" in `box`; false when there is nothing to say.
  function fillDetail(box, pm, several, makeItem) {
    var month = Number(pm.expMonth);
    if (pm.type === 'card' && month >= 1 && month <= 12 && pm.expYear) {
      var when = MOIS[month - 1] + ' ' + pm.expYear;
      box.appendChild(document.createTextNode(pm.expired ? 'A expiré en ' + when + '. ' : 'Expire en ' + when + '. '));
    }
    var used = Array.isArray(pm.usedBy) ? pm.usedBy : [];
    var icons = Array.isArray(pm.usedByIcons) ? pm.usedByIcons : [];
    var prefix = pm.type !== 'none' ? (pm.type === 'card' ? 'Utilisée' : 'Utilisé') + ' pour : ' : (several ? 'Pour : ' : '');
    if (used.length && prefix) {
      box.appendChild(document.createTextNode(prefix));
      usedList(box, used, icons, makeItem);
    }
    return Boolean(box.firstChild);
  }

  function pmDetail(pm, several) {
    var box = el('div', 'ordo-subs-muted ordo-pm-detail');
    return fillDetail(box, pm, several, legacyUsage) ? box : null;
  }

  // Saved methods nothing charges: named, never offered.
  function otherName(o) {
    var dots = o.last4 ? ' •••• ' + o.last4 : '';
    if (o.type === 'card') return 'Aussi enregistrée : carte' + dots + ', non utilisée';
    if (o.type === 'sepa_debit') return 'Aussi enregistré : prélèvement SEPA' + dots + ', non utilisé';
    if (o.type === 'link') return 'Aussi enregistré : paiement via Link, non utilisé';
    return null;
  }

  function otherNames(others) {
    var names = [];
    for (var i = 0; i < others.length; i++) {
      var name = others[i] && otherName(others[i]);
      if (name) names.push(name);
    }
    return names;
  }

  // What the payment method section says, whatever draws it.
  function pmModel(list, pms, others) {
    var urgent = false;
    var none = true;
    for (var i = 0; i < pms.length; i++) {
      if (pms[i].type !== 'none') none = false;
      if (pms[i].expired || pms[i].expiresSoon) urgent = true;
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].status === 'past_due') urgent = true;
    }
    return {
      several: pms.length > 1,
      none: none,
      urgent: urgent,
      saved: none ? [] : otherNames(others || []),
      label: none ? 'Ajouter un moyen de paiement' : (urgent ? 'Mettre à jour' : 'Modifier'),
      // "Modifier" opens the billing portal, where a saved method can be made the default. Adding one, or
      // replacing an expired or failing one, goes through the SEPA setup, which also retries the unpaid invoice.
      portal: !none && !urgent && portalAvailable(),
      primary: none || urgent
    };
  }

  function pmAction(m) {
    return m.portal ? portalButton('bouton', m.label) : paymentLink(m.primary ? 'bouton-primaire' : 'bouton', m.label);
  }

  function paymentSection(list, pms, others) {
    var root = el('div', 'ordo-subs ordo-pm');
    root.appendChild(el('h3', 'ordo-subs-title', 'Moyen de paiement'));
    var m = pmModel(list, pms, others);
    var rows = [];
    for (var i = 0; i < pms.length; i++) {
      var pm = pms[i];
      var row = el('div', 'ordo-pm-row');
      row.appendChild(pmIcon(pm));
      var text = el('div', 'ordo-pm-text');
      var name = el('div', 'ordo-pm-name');
      name.appendChild(el('span', null, pmName(pm)));
      if (pm.expired) name.appendChild(el('span', 'ordo-subs-tag ordo-pm-tone-expired', 'Expirée'));
      else if (pm.expiresSoon) name.appendChild(el('span', 'ordo-subs-tag ordo-pm-tone-soon', 'Expire bientôt'));
      text.appendChild(name);
      var detail = pmDetail(pm, m.several);
      if (detail) text.appendChild(detail);
      row.appendChild(text);
      rows.push(row);
      root.appendChild(row);
    }
    if (m.saved.length) {
      var box = el('div', 'ordo-pm-others');
      for (var k = 0; k < m.saved.length; k++) box.appendChild(el('div', 'ordo-subs-muted', m.saved[k]));
      root.appendChild(box);
    }
    var link = pmAction(m);
    if (m.several) {
      var actions = ui.actions();
      actions.appendChild(link);
      root.appendChild(actions);
    } else {
      rows[0].appendChild(link);
    }
    return root;
  }

  // --- Adresse de facturation --------------------------------------------------------------

  // Pays proposés : France et outre-mer d'abord (codes ISO propres à Stripe), puis les autres.
  var COUNTRIES = ['FR', 'RE', 'GP', 'MQ', 'GF', 'YT', 'PM', 'BL', 'MF', 'NC', 'PF', 'WF',
    'BE', 'LU', 'CH', 'MC', 'DE', 'ES', 'IT', 'PT', 'NL', 'GB', 'IE', 'MA', 'DZ', 'TN', 'SN', 'CI',
    'CM', 'MG', 'MU', 'LB', 'CA', 'US'];

  function countryName(code) {
    if (!code) return '';
    try {
      var names = new Intl.DisplayNames(['fr'], { type: 'region' });
      return names.of(code) || code;
    } catch (e) {
      return code;
    }
  }

  function addressFilled(a) {
    return !!(a && a.line1);
  }

  function addressValue(label, lines) {
    var box = el('div');
    box.appendChild(el('div', 'ordo-addr-label', label));
    var value = el('div', 'ordo-addr-value' + (lines.length ? '' : ' is-empty'));
    if (!lines.length) value.textContent = 'Non renseigné';
    for (var i = 0; i < lines.length; i++) {
      if (i) value.appendChild(document.createElement('br'));
      value.appendChild(document.createTextNode(lines[i]));
    }
    box.appendChild(value);
    return box;
  }

  function addressLines(a) {
    var lines = [];
    if (a.line1) lines.push(a.line1);
    if (a.line2) lines.push(a.line2);
    var city = [a.postalCode, a.city].filter(Boolean).join(' ');
    if (city) lines.push(city);
    if (a.country) lines.push(countryName(a.country));
    return lines;
  }

  function addressField(name, label, value, opts) {
    opts = opts || {};
    var field = el('div', 'ordo-addr-field' + (opts.short ? ' is-short' : ''));
    var id = 'ordo-addr-' + name;
    var lab = el('label', null, label);
    if (opts.optional) lab.appendChild(el('span', null, ' (facultatif)'));
    lab.setAttribute('for', id);
    field.appendChild(lab);
    var input;
    if (opts.options) {
      input = el('select', 'ordo-addr-input');
      var codes = opts.options.slice();
      if (value && codes.indexOf(value) === -1) codes.unshift(value);
      if (!value) {
        var none = el('option', null, 'Choisir un pays');
        none.value = '';
        input.appendChild(none);
      }
      for (var i = 0; i < codes.length; i++) {
        var o = el('option', null, countryName(codes[i]));
        o.value = codes[i];
        input.appendChild(o);
      }
      input.value = value || '';
    } else {
      input = el('input', 'ordo-addr-input');
      input.type = 'text';
      input.value = value || '';
      if (opts.placeholder) input.placeholder = opts.placeholder;
      if (opts.autocomplete) input.setAttribute('autocomplete', opts.autocomplete);
      if (opts.required) input.required = true;
      input.maxLength = opts.max || 200;
    }
    input.id = id;
    input.name = name;
    field.appendChild(input);
    if (opts.hint) field.appendChild(el('span', 'ordo-subs-muted', opts.hint));
    return field;
  }

  // La carte s'affiche dès qu'un élément de facturation existe : adresse remplie, moyen de paiement,
  // factures (ou factures illisibles), abonnement facturé ou numéro de TVA.
  function billingCardWanted(list, pms, invoices, others, addr, taxId) {
    if (addressFilled(addr) || pms.length || others.length || taxIdOf(taxId)) return true;
    if (!Array.isArray(invoices) || invoices.length) return true;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && BILLED.indexOf(list[i].status) !== -1) return true;
    }
    return false;
  }

  // --- Numéro de TVA intracommunautaire ------------------------------------------------------

  var TAX_LABEL = 'Numéro de TVA intracommunautaire';
  var SESSION_EXPIRED = 'Votre session a expiré : reconnectez-vous puis réessayez.';

  function taxIdOf(t) {
    return t && typeof t === 'object' && typeof t.value === 'string' && t.value ? t : null;
  }

  function taxSaveError(err) {
    var status = err && err.status;
    if (status === 400) return 'Ce numéro n’est pas un numéro de TVA français valide (FR suivi de 11 chiffres).';
    if (status === 422) return 'Ce numéro ne peut pas être ajouté depuis votre compte. Écrivez-nous pour le faire.';
    if (status === 401) return SESSION_EXPIRED;
    return 'Le numéro n’a pas pu être enregistré. Réessayez dans un instant.';
  }

  function errorLine() {
    var error = el('p', 'ordo-addr-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    return error;
  }

  // --- Vues de l'adresse et du numéro de TVA, présentation héritée --------------------------------
  // Chaque vue rend ses éléments et les poignées dont la logique a besoin ; la logique (envois, erreurs,
  // focus, mesure) est commune aux deux présentations (voir taxIdBlock et addressSection).

  function legacyValueRow(value) {
    var row = el('div', 'ordo-addr-row');
    var box = addressValue(TAX_LABEL, [value]);
    box.className = 'ordo-addr-main';
    row.appendChild(box);
    return row;
  }

  legacyUi.addressShell = function() {
    var root = el('div', 'ordo-subs ordo-addr');
    root.appendChild(el('h3', 'ordo-subs-title', 'Adresse de facturation'));
    root.appendChild(el('p', 'ordo-addr-sub', 'Elle figure sur vos factures.'));
    var body = el('div');
    root.appendChild(body);
    var taxBox = el('div', 'ordo-addr-tva');
    root.appendChild(taxBox);
    return { root: root, body: body, taxBox: taxBox };
  };

  legacyUi.addressRead = function(addr) {
    var row = el('div', 'ordo-addr-row');
    var grid = el('div', 'ordo-addr-grid');
    grid.appendChild(addressValue('Nom sur les factures', addr.name ? [addr.name] : []));
    grid.appendChild(addressValue('Adresse', addressFilled(addr) ? addressLines(addr) : []));
    row.appendChild(grid);
    var edit = button(addressFilled(addr) ? 'Modifier' : 'Ajouter', !addressFilled(addr));
    row.appendChild(edit);
    return { root: row, edit: edit };
  };

  legacyUi.addressForm = function(addr) {
    var form = el('form', 'ordo-addr-form');
    form.noValidate = true;
    var l1 = el('div', 'ordo-addr-line');
    l1.appendChild(addressField('name', 'Nom sur les factures', addr.name, { placeholder: 'Nom et prénom, ou raison sociale', autocomplete: 'name', optional: true, max: 100 }));
    form.appendChild(l1);
    var l2 = el('div', 'ordo-addr-line');
    l2.appendChild(addressField('line1', 'Adresse', addr.line1, { autocomplete: 'address-line1', required: true }));
    l2.appendChild(addressField('line2', 'Complément', addr.line2, { placeholder: 'Bâtiment, étage…', autocomplete: 'address-line2', optional: true }));
    form.appendChild(l2);
    var l3 = el('div', 'ordo-addr-line');
    l3.appendChild(addressField('postalCode', 'Code postal', addr.postalCode, { autocomplete: 'postal-code', required: true, short: true, max: 20 }));
    l3.appendChild(addressField('city', 'Ville', addr.city, { autocomplete: 'address-level2', required: true, max: 100 }));
    l3.appendChild(addressField('country', 'Pays (outre-mer inclus)', addr.country, {
      options: COUNTRIES,
      hint: 'Le pays ou la collectivité d\'outre-mer détermine la TVA appliquée à vos prochaines factures.'
    }));
    form.appendChild(l3);
    form.appendChild(el('p', 'ordo-subs-muted', 'La nouvelle adresse s’applique à vos prochaines factures. Les factures déjà émises ne changent pas.'));
    var error = errorLine();
    form.appendChild(error);
    var actions = el('div', 'ordo-subs-actions');
    var cancel = button('Annuler', false);
    var save = button('Enregistrer', true);
    save.type = 'submit';
    actions.appendChild(cancel);
    actions.appendChild(save);
    form.appendChild(actions);
    return { root: form, form: form, error: error, cancel: cancel, save: save };
  };

  legacyUi.taxRead = function(value, allowed) {
    var row = legacyValueRow(value);
    var actions = el('div', 'ordo-subs-actions');
    var edit = null;
    if (allowed) {
      edit = button('Modifier', false);
      actions.appendChild(edit);
    }
    var remove = button('Retirer', false);
    actions.appendChild(remove);
    row.appendChild(actions);
    return { root: row, edit: edit, remove: remove };
  };

  legacyUi.taxAsk = function() {
    var line = el('p', 'ordo-subs-muted', 'Vous avez un numéro de TVA intracommunautaire ? ');
    var add = el('button', 'ordo-subs-link', 'L’ajouter');
    add.type = 'button';
    line.appendChild(add);
    return { root: line, add: add };
  };

  legacyUi.taxForm = function(value) {
    var form = el('form', 'ordo-addr-form');
    form.noValidate = true;
    var field = addressField('taxId', TAX_LABEL, value, { placeholder: 'FR12345678901', autocomplete: 'off', max: 20 });
    form.appendChild(field);
    var input = field.querySelector('input');
    input.setAttribute('spellcheck', 'false');
    var hint = el('p', 'ordo-subs-muted', 'Il figurera sur vos prochaines factures. Les factures déjà émises ne changent pas.');
    hint.id = 'ordo-addr-taxId-hint';
    input.setAttribute('aria-describedby', hint.id);
    form.appendChild(hint);
    var error = errorLine();
    form.appendChild(error);
    var actions = el('div', 'ordo-subs-actions');
    var cancel = button('Annuler', false);
    var save = button('Enregistrer', true);
    save.type = 'submit';
    actions.appendChild(cancel);
    actions.appendChild(save);
    form.appendChild(actions);
    return { root: form, form: form, input: input, error: error, cancel: cancel, save: save };
  };

  legacyUi.taxConfirm = function(value) {
    var row = legacyValueRow(value);
    var ask = el('p', 'ordo-addr-ask', 'Retirer ce numéro de vos prochaines factures ?');
    ask.id = 'ordo-addr-tva-ask';
    var error = errorLine();
    var actions = el('div', 'ordo-subs-actions');
    var cancel = button('Annuler', false);
    var confirm = button('Retirer', true);
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    return { nodes: [row, ask, error, actions], ask: ask, error: error, cancel: cancel, confirm: confirm };
  };

  // Sous l'adresse, dans son propre conteneur : l'adresse et le numéro se modifient chacun sans
  // toucher à l'autre. Sans numéro, un simple lien quand l'ajout est permis, rien sinon ; un numéro
  // enregistré reste affiché, avec « Retirer » seulement quand l'ajout n'est pas permis.
  // `update` applique l'état renvoyé par un enregistrement de l'adresse, sans fermer une saisie en cours.
  function taxIdBlock(box, taxId, allowed) {
    taxId = taxIdOf(taxId);
    allowed = allowed === true;
    var mode = 'read';

    function reset(flash) {
      box.textContent = '';
      afficher(box, true);
      if (flash) box.appendChild(ui.flash(flash));
    }

    // `focus` : 'edit' rend le focus au bouton qui ouvre la saisie, 'remove' à « Retirer ».
    function showRead(flash, focus) {
      mode = 'read';
      reset(flash);
      var target = null;
      if (taxId) {
        var view = ui.taxRead(taxId.value, allowed);
        if (view.edit) {
          mark(view.edit, 'tva_modifier');
          view.edit.addEventListener('click', function(e) { e.preventDefault(); showEdit(); });
        }
        mark(view.remove, 'tva_retirer');
        view.remove.addEventListener('click', function(e) { e.preventDefault(); showConfirm(); });
        box.appendChild(view.root);
        target = focus === 'remove' ? view.remove : (view.edit || view.remove);
      } else if (allowed) {
        var ask = ui.taxAsk();
        mark(ask.add, 'tva_ajouter');
        ask.add.addEventListener('click', function(e) { e.preventDefault(); showEdit(); });
        box.appendChild(ask.root);
        target = ask.add;
      }
      afficher(box, Boolean(box.firstChild));
      if (focus && target && typeof target.focus === 'function') target.focus();
    }

    function showEdit() {
      mode = 'edit';
      reset();
      var view = ui.taxForm(taxId ? taxId.value : '');
      var form = view.form;
      var input = view.input;
      var error = view.error;
      var cancel = mark(view.cancel, 'tva_annuler');
      var save = mark(view.save, 'tva_enregistrer');
      cancel.addEventListener('click', function(e) { e.preventDefault(); showRead(null, 'edit'); });

      function fail(message, invalid) {
        error.textContent = message;
        afficher(error, true);
        if (!invalid) return;
        input.setAttribute('aria-invalid', 'true');
        if (typeof input.focus === 'function') input.focus();
      }

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        // Le formulaire Webflow posterait la saisie vers Webflow : l'envoi ne doit pas lui parvenir.
        e.stopPropagation();
        var value = String(input.value || '').trim();
        if (!value) {
          fail('Saisissez votre numéro de TVA.', true);
          return;
        }
        afficher(error, false);
        input.removeAttribute('aria-invalid');
        save.disabled = true;
        cancel.disabled = true;
        setLabel(save, 'Enregistrement…');
        call({ action: 'tax_id_update', value: value }).then(function(payload) {
          var saved = taxIdOf(payload && payload.taxId);
          if (!saved) {
            var bad = new Error('account-subscriptions: unexpected tax id body');
            bad.status = 200;
            throw bad;
          }
          taxId = saved;
          trackOutcome('tva_enregistrer', '', 'ok');
          showRead('Numéro de TVA enregistré.', 'edit');
        }).catch(function(err) {
          trackOutcome('tva_enregistrer', '', 'failed');
          // Un numéro refusé (format, compte) est une réponse attendue : seul le reste est signalé.
          if (!err || (err.status !== 400 && err.status !== 422)) reportIfActionable(err);
          save.disabled = false;
          cancel.disabled = false;
          setLabel(save, 'Enregistrer');
          fail(taxSaveError(err), Boolean(err && err.status === 400));
        });
      });
      box.appendChild(view.root);
      if (typeof input.focus === 'function') input.focus();
    }

    function showConfirm() {
      mode = 'confirm';
      reset();
      var view = ui.taxConfirm(taxId.value);
      for (var i = 0; i < view.nodes.length; i++) box.appendChild(view.nodes[i]);
      var error = view.error;
      var cancel = mark(view.cancel, 'tva_annuler');
      var confirm = mark(view.confirm, 'tva_retirer');
      if (view.ask && view.ask.id) {
        cancel.setAttribute('aria-describedby', view.ask.id);
        confirm.setAttribute('aria-describedby', view.ask.id);
      }
      cancel.addEventListener('click', function(e) { e.preventDefault(); showRead(null, 'remove'); });
      confirm.addEventListener('click', function(e) {
        e.preventDefault();
        afficher(error, false);
        confirm.disabled = true;
        cancel.disabled = true;
        setLabel(confirm, 'Retrait…');
        call({ action: 'tax_id_remove' }).then(function(payload) {
          if (!payload || payload.ok !== true) {
            var bad = new Error('account-subscriptions: unexpected tax id body');
            bad.status = 200;
            throw bad;
          }
          taxId = null;
          trackOutcome('tva_retirer', '', 'ok');
          showRead('Numéro de TVA retiré.', 'edit');
        }).catch(function(err) {
          trackOutcome('tva_retirer', '', 'failed');
          reportIfActionable(err);
          error.textContent = err && err.status === 401
            ? SESSION_EXPIRED
            : 'Le numéro n’a pas pu être retiré. Réessayez dans un instant.';
          afficher(error, true);
          confirm.disabled = false;
          cancel.disabled = false;
          setLabel(confirm, 'Retirer');
        });
      });
      if (typeof cancel.focus === 'function') cancel.focus();
    }

    showRead();
    return {
      // Champ absent de la réponse (`undefined`) : valeur précédente gardée.
      update: function(nextTaxId, nextAllowed) {
        if (nextTaxId !== undefined) taxId = taxIdOf(nextTaxId);
        if (nextAllowed !== undefined) allowed = nextAllowed === true;
        if (mode === 'read') showRead();
      }
    };
  }

  function addressSection(addr, taxId, taxAllowed) {
    var shell = ui.addressShell();
    var body = shell.body;
    var tax = taxIdBlock(shell.taxBox, taxId, taxAllowed);

    function showRead(flash, focus) {
      body.textContent = '';
      if (flash) body.appendChild(ui.flash(flash));
      var view = ui.addressRead(addr);
      var edit = mark(view.edit, 'adresse_modifier');
      edit.addEventListener('click', function(e) { e.preventDefault(); showEdit(); });
      body.appendChild(view.root);
      if (focus && typeof edit.focus === 'function') edit.focus();
    }

    function showEdit() {
      body.textContent = '';
      var view = ui.addressForm(addr);
      var form = view.form;
      var error = view.error;
      var cancel = mark(view.cancel, 'adresse_annuler');
      var save = mark(view.save, 'adresse_enregistrer');
      cancel.addEventListener('click', function(e) { e.preventDefault(); showRead(null, true); });
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        // Le formulaire Webflow posterait la saisie vers Webflow : l'envoi ne doit pas lui parvenir.
        e.stopPropagation();
        var values = {};
        ['name', 'line1', 'line2', 'postalCode', 'city', 'country'].forEach(function(k) {
          var field = form.elements[k];
          values[k] = String((field && field.value) || '').trim();
        });
        // Un nom vidé n'efface pas celui des factures : il n'est simplement pas envoyé.
        if (!values.name && addr.name) delete values.name;
        if (!values.line1 || !values.postalCode || !values.city || !values.country) {
          error.textContent = 'Renseignez l’adresse, le code postal, la ville et le pays.';
          afficher(error, true);
          return;
        }
        afficher(error, false);
        save.disabled = true;
        cancel.disabled = true;
        setLabel(save, 'Enregistrement…');
        call({ action: 'address_update', address: values }).then(function(payload) {
          if (!payload || !payload.billingAddress) {
            var bad = new Error('account-subscriptions: unexpected address body');
            bad.status = 200;
            throw bad;
          }
          addr = payload.billingAddress;
          trackOutcome('adresse_enregistrer', '', 'ok');
          showRead('Adresse enregistrée.', true);
          // La réponse porte aussi l'état du numéro de TVA, appliqué au bloc qui l'affiche.
          tax.update(payload.taxId, payload.taxIdAllowed);
        }).catch(function(err) {
          trackOutcome('adresse_enregistrer', '', 'failed');
          reportIfActionable(err);
          error.textContent = err && err.status === 401
            ? SESSION_EXPIRED
            : (err && err.status === 400
              ? 'Vérifiez les champs de l’adresse.'
              : 'L’adresse n’a pas pu être enregistrée. Réessayez dans un instant.');
          afficher(error, true);
          save.disabled = false;
          cancel.disabled = false;
          setLabel(save, 'Enregistrer');
        });
      });
      body.appendChild(view.root);
      var first = form.elements.line1;
      if (first && typeof first.focus === 'function') first.focus();
    }

    showRead();
    return shell.root;
  }

  function intro() {
    return el('h3', 'ordo-subs-title', 'Mes abonnements');
  }

  function clear() {
    if (D) return resetD();
    while (anchor.firstChild) anchor.removeChild(anchor.firstChild);
  }

  function wrapper() {
    var p = anchor && anchor.parentElement;
    return p && p.classList && p.classList.contains('w-embed') ? p : null;
  }

  function hide() {
    if (D) return hideD();
    if (anchor) anchor.style.display = 'none';
    var w = wrapper();
    if (w) w.style.display = 'none';
  }

  function show() {
    if (D) return showD();
    if (anchor) anchor.style.display = '';
    var w = wrapper();
    if (w) w.style.display = '';
  }

  // As many placeholders as the member has plans that are not cancelled, between one and three.
  function skeletonCount() {
    var conns = Array.isArray(member.planConnections) ? member.planConnections : [];
    var n = 0;
    for (var i = 0; i < conns.length; i++) {
      if (conns[i] && conns[i].status && conns[i].status !== 'CANCELED') n++;
    }
    return Math.max(1, Math.min(3, n));
  }

  function showSkeleton() {
    if (D) return skeletonD();
    injectStyle();
    clear();
    var root = el('div', 'ordo-subs');
    root.setAttribute('aria-busy', 'true');
    root.appendChild(intro());
    var skels = el('div', 'ordo-subs-skels');
    skels.setAttribute('aria-hidden', 'true');
    for (var i = skeletonCount(); i > 0; i--) skels.appendChild(el('div', 'ordo-subs-skel'));
    root.appendChild(skels);
    root.appendChild(el('span', 'ordo-subs-sr', 'Chargement de vos abonnements…'));
    anchor.appendChild(root);
    show();
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function() {
      if (!anchor.contains(root)) return;
      var slow = el('p', 'ordo-subs-empty', 'Le chargement prend plus de temps que d’habitude…');
      slow.setAttribute('role', 'status');
      root.appendChild(slow);
    }, Math.max(0, SLOW_MS - (Date.now() - startedAt)));
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
    call({ action: 'invoice_pdf', ref: inv.ref }).then(function(payload) {
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
      trackOutcome('pdf', inv.status, 'ok');
    }).catch(function(err) {
      trackOutcome('pdf', inv.status, 'failed');
      btn.setAttribute('title', 'Téléchargement impossible pour le moment. Réessayez.');
      btn.lastChild.textContent = 'Réessayer';
      reportIfActionable(err);
    }).then(function() {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    });
  }

  var INVOICE_PAGE = /^https:\/\/invoice\.stripe\.com\//;

  // An unpaid invoice that a new payment method would not settle opens its own Stripe payment page.
  function payInvoice(inv, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Patientez…';
    call({ action: 'invoice_pay', ref: inv.ref }).then(function(payload) {
      if (!payload || typeof payload.url !== 'string' || !INVOICE_PAGE.test(payload.url)) {
        var bad = new Error('account-subscriptions: invoice payment page missing');
        bad.status = 200;
        throw bad;
      }
      trackOutcome('regler', inv.status, 'ok');
      window.location.assign(payload.url);
    }).catch(function(err) {
      trackOutcome('regler', inv.status, 'failed');
      btn.textContent = 'Réessayer';
      btn.setAttribute('title', 'Paiement impossible pour le moment. Réessayez.');
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      reportIfActionable(err);
    });
  }

  function invoiceAction(inv) {
    if (inv.status === 'due' || inv.status === 'uncollectible') {
      if (inv.pay !== 'invoice' || typeof inv.ref !== 'string' || !REF.test(inv.ref)) return paymentLink('lien', 'Régler', inv.status);
      var pay = mark(ui.button('lien', 'Régler'), 'regler', inv.status);
      pay.setAttribute('aria-label', 'Régler la facture du ' + day(inv.date));
      pay.addEventListener('click', function() { payInvoice(inv, pay); });
      return pay;
    }
    if (!inv.pdf || typeof inv.ref !== 'string' || !REF.test(inv.ref)) return null;
    var btn = mark(ui.pdfButton(), 'pdf', inv.status);
    btn.setAttribute('aria-label', 'Télécharger la facture du ' + day(inv.date));
    btn.addEventListener('click', function() { downloadInvoice(inv, btn); });
    return btn;
  }

  // The PDF button ends with its label: downloadInvoice writes « Réessayer » there.
  legacyUi.pdfButton = function() {
    var btn = el('button', 'ordo-inv-pdf');
    btn.type = 'button';
    btn.appendChild(svgIcon('download', 16));
    btn.appendChild(el('span', null, 'PDF'));
    return btn;
  };

  function invoicesSection(invoices) {
    var root = el('div', 'ordo-subs ordo-inv');
    root.appendChild(el('h3', 'ordo-subs-title', 'Factures'));
    var table = el('div', 'ordo-inv-table');
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Dernières factures');
    var head = el('div', 'ordo-inv-row ordo-inv-head');
    head.setAttribute('role', 'row');
    var titles = ['Date', 'Abonnement', 'Montant', 'Statut', 'Factures'];
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
      var more = mark(el('button', 'ordo-subs-link', 'Toutes mes factures et mes informations de facturation'), 'portail');
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
    { href: '/academie/ajouter-moyen-paiement', text: 'Vidéo : ajouter un moyen de paiement', action: 'video_moyen_de_paiement' },
    { href: '/academie/obtenir-factures', text: 'Vidéo : obtenir mes factures', action: 'video_factures' }
  ];

  function iconLink(cls, href, icon, text, action) {
    var a = mark(el('a', cls), action);
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
    contacts.appendChild(iconLink('ordo-help-contact', 'mailto:' + HELP_EMAIL, 'mail', HELP_EMAIL, 'aide_email'));
    var phone = el('div', 'ordo-help-phone');
    phone.appendChild(iconLink('ordo-help-contact', HELP_PHONE.href, 'phone', HELP_PHONE.text, 'aide_telephone'));
    phone.appendChild(el('span', 'ordo-help-note', 'Appel non surtaxé'));
    contacts.appendChild(phone);
    root.appendChild(contacts);
    root.appendChild(el('div', 'ordo-help-divider'));
    var videos = el('div', 'ordo-help-row');
    for (var i = 0; i < HELP_VIDEOS.length; i++) {
      videos.appendChild(iconLink('ordo-help-video', HELP_VIDEOS[i].href, 'play', HELP_VIDEOS[i].text, HELP_VIDEOS[i].action));
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

  // invoice-emails.js runs after this script: the list can be ready first, so the move waits for it.
  function whenInvoiceEmails(run) {
    var tries = 0;
    (function poll() {
      var emails = window.OrdoInvoiceEmails;
      if (emails && typeof emails.relocate === 'function') return run();
      if (++tries > MS_MAX_ATTEMPTS) return;
      setTimeout(poll, 200);
    })();
  }

  function placeInvoices(invoices) {
    var block = document.getElementById('invoices-block');
    if (!Array.isArray(invoices)) {
      keepBlock(block, true);
      if (toggleMoved && moveToggle(block)) toggleMoved = false;
      return;
    }
    if (invoices.length) {
      var section = invoicesSection(invoices);
      anchor.appendChild(section.root);
      whenInvoiceEmails(function() {
        if (anchor.contains(section.slot) && moveToggle(section.slot)) toggleMoved = true;
      });
    } else if (toggleMoved && moveToggle(block)) {
      toggleMoved = false;
    }
    anchor.appendChild(helpSection());
    keepBlock(block, false);
  }

  function render(list, flash, pms, invoices, others, address, taxId, taxIdAllowed) {
    pms = Array.isArray(pms) ? pms : [];
    others = Array.isArray(others) ? others : [];
    if (D) return renderD(list, flash, pms, invoices, others, address, taxId, taxIdAllowed);
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
    if (address && billingCardWanted(list, pms, invoices, others, address, taxId)) {
      anchor.appendChild(addressSection(address, taxId, taxIdAllowed));
    }
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

  // `body` is an action (`{ action, … }`), or null for the list. `timeoutMs` is only passed for the
  // list: actions (PDF, payment, reactivation) can legitimately take longer and must never be cut short.
  function call(body, timeoutMs) {
    var controller = null;
    var timer = null;
    function stop() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
    function aborted() {
      return !!(controller && controller.signal.aborted);
    }
    return memberToken().then(function(token) {
      if (!token) {
        var e = new Error('no member token');
        e.status = 401;
        throw e;
      }
      var payload = { token: token };
      var fields = body || { action: 'list' };
      for (var k in fields) {
        if (Object.prototype.hasOwnProperty.call(fields, k)) payload[k] = fields[k];
      }
      // A CORS simple request (POST, text/plain, no Authorization header): no preflight.
      var opts = {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      };
      // Without AbortController (very old browsers) the request keeps its previous behaviour.
      if (timeoutMs && typeof AbortController === 'function') {
        controller = new AbortController();
        opts.signal = controller.signal;
        timer = setTimeout(function() { controller.abort(); }, timeoutMs);
      }
      return fetch(API_URL, opts);
    }).then(function(res) {
      return res.json().catch(function(e) {
        // A body that stalls past the delay is a timeout, not an empty answer.
        if (aborted()) throw e;
        // A body that could not be read (page left, connection lost) is not an answer.
        if (res.ok && !(e && e.name === 'SyntaxError')) throw e;
        return {};
      }).then(function(payload) {
        stop();
        if (!res.ok) {
          var err = new Error('account-subscriptions ' + res.status + ' ' + (payload.error || ''));
          err.status = res.status;
          throw err;
        }
        return payload;
      });
    }).catch(function(err) {
      stop();
      if (aborted()) {
        // Given a status on purpose: `load` retries status-less errors, which would double the wait.
        var timeout = new Error('account-subscriptions: no answer after ' + timeoutMs + ' ms');
        timeout.status = 'timeout';
        throw timeout;
      }
      throw err;
    });
  }

  function request(body, timeoutMs) {
    return call(body, timeoutMs).then(function(payload) {
      if (!payload || !Array.isArray(payload.subscriptions)) {
        var bad = new Error('account-subscriptions: unexpected body');
        bad.status = 200;
        throw bad;
      }
      return {
        list: payload.subscriptions,
        pms: Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [],
        others: Array.isArray(payload.otherPaymentMethods) ? payload.otherPaymentMethods : [],
        invoices: Array.isArray(payload.invoices) ? payload.invoices : null,
        address: payload.billingAddress && typeof payload.billingAddress === 'object' ? payload.billingAddress : null,
        // Absents d'une réponse plus ancienne : aucun numéro, ajout non permis.
        taxId: taxIdOf(payload.taxId),
        taxIdAllowed: payload.taxIdAllowed === true
      };
    });
  }

  // At most two requests, both over by LIST_TIMEOUT_MS. The second starts when the first has no answer
  // after HEDGE_MS, or shortly after the first fails without a status (network). The first answer wins,
  // and an HTTP error is an answer. `hedged` says the second request gave it.
  function load() {
    return new Promise(function(resolve, reject) {
      var sentAt = Date.now();
      var done = false;
      var pending = 0;
      var second = false;
      var lastErr = null;
      var hedgeTimer = null;
      function end() {
        done = true;
        clearTimeout(hedgeTimer);
      }
      function send(isSecond) {
        pending++;
        var budget = isSecond ? Math.max(1, LIST_TIMEOUT_MS - (Date.now() - sentAt)) : LIST_TIMEOUT_MS;
        request(null, budget).then(function(data) {
          pending--;
          if (done) return;
          end();
          data.hedged = isSecond;
          resolve(data);
        }, function(err) {
          pending--;
          if (done) return;
          if (err && err.status && err.status !== 'timeout') {
            end();
            reject(err);
            return;
          }
          lastErr = err;
          if (!second && !(err && err.status)) {
            clearTimeout(hedgeTimer);
            hedgeTimer = setTimeout(startSecond, RETRY_DELAY_MS);
            return;
          }
          if (!pending) {
            end();
            reject(lastErr);
          }
        });
      }
      function startSecond() {
        if (done || second) return;
        second = true;
        send(true);
      }
      send(false);
      hedgeTimer = setTimeout(startSecond, HEDGE_MS);
    });
  }

  // --- Members who only have free plans: their list is known without waiting for it.
  function readStorage(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function recentlyPaid() {
    var ts = parseInt(readStorage('justPaidTs') || '0', 10);
    return ts > 0 && Date.now() - ts < JUST_PAID_MS;
  }

  // The active free plans, or null as soon as anything else is there: a paid plan (cancelled ones
  // included), a connection without a type, no active free plan, a pause, or a payment just made.
  function freeOnlyPlans() {
    var conns = Array.isArray(member.planConnections) ? member.planConnections : [];
    var free = [];
    for (var i = 0; i < conns.length; i++) {
      var c = conns[i];
      if (!c || c.type !== 'FREE') return null;
      if (c.status === 'ACTIVE' && typeof c.planId === 'string' && c.planId) free.push(c.planId);
    }
    if (!free.length) return null;
    var meta = member.metaData || {};
    if (meta['pause-end-date'] || meta['paused-group-key']) return null;
    if (recentlyPaid()) return null;
    return free;
  }

  function validPlans(plans) {
    return plans && typeof plans === 'object' && !Array.isArray(plans) ? plans : null;
  }

  function storedPlans() {
    try {
      var saved = JSON.parse(readStorage(PLANS_KEY) || 'null');
      if (saved && typeof saved.at === 'number' && Date.now() - saved.at < PLANS_MAX_AGE_MS) return validPlans(saved.plans);
    } catch (e) { /* no copy */ }
    return null;
  }

  function storePlans(plans) {
    try { window.localStorage.setItem(PLANS_KEY, JSON.stringify({ at: Date.now(), plans: plans })); } catch (e) { /* no-op */ }
  }

  // No credentials and no custom header: a simple request, cached by the browser and the CDN.
  // Past PLANS_TIMEOUT_MS the list is awaited, and a later answer is only stored for the next visit.
  function fetchPlans() {
    return new Promise(function(resolve) {
      var timer = setTimeout(function() { resolve(null); }, PLANS_TIMEOUT_MS);
      fetch(PLANS_URL, { method: 'GET', credentials: 'omit' }).then(function(res) {
        return res.json().then(null, function(e) {
          // A body that could not be read (page left, connection lost) is not an answer.
          if (res.ok && !(e && e.name === 'SyntaxError')) throw e;
          return null;
        }).then(function(body) {
          var plans = res.ok ? validPlans(body && body.plans) : null;
          if (!plans) {
            var err = new Error('abonnements-affiches ' + res.status + ': no plans');
            err.status = res.status;
            throw err;
          }
          return plans;
        });
      }).then(function(plans) {
        storePlans(plans);
        return plans;
      }, function(err) {
        // Unavailable or rate limited: the list is simply awaited, as before.
        if (err && err.status && err.status !== 429 && err.status !== 503) reportProblem('SubscriptionsPlansUnavailable', err.message);
        return null;
      }).then(function(plans) {
        clearTimeout(timer);
        resolve(plans);
      });
    });
  }

  // The same cards the list gives for free plans: visible plans only, one card per label, a plan that
  // marks an ended access only when nothing else is shown, sorted by order then label. Null when a plan
  // needs the member's own data (the free trial end date): the list is awaited then.
  function freeCards(planIds, plans) {
    var shown = [];
    var ended = [];
    var labels = {};
    for (var i = 0; i < planIds.length; i++) {
      var p = plans[planIds[i]];
      if (!p || typeof p.label !== 'string' || !p.label) continue;
      if (p.trial) return null;
      if (labels[p.label]) continue;
      labels[p.label] = true;
      var status = p.ended ? 'ended' : 'free';
      var entry = {
        order: typeof p.order === 'number' ? p.order : DEFAULT_ORDER,
        card: {
          label: p.label,
          icon: typeof p.icon === 'string' ? p.icon : null,
          status: status,
          price: null,
          discount: null,
          offeredUntil: null,
          next: null,
          endsOn: null,
          resumesOn: null,
          action: p.action && typeof p.action === 'object' ? p.action : null,
          note: typeof p.note === 'string' ? p.note : null,
          reactivation: null
        }
      };
      (p.ended ? ended : shown).push(entry);
    }
    if (!shown.length) shown = ended;
    shown.sort(function(a, b) {
      return (a.order - b.order) || String(a.card.label).localeCompare(String(b.card.label), 'fr');
    });
    var cards = [];
    for (var j = 0; j < shown.length; j++) cards.push(shown[j].card);
    return cards;
  }

  // Only a paid card is a real difference: labels may lag behind a stored copy, and the list fixes them.
  function paidIn(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].status !== 'free' && list[i].status !== 'ended') return true;
    }
    return false;
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

  // --- Présentation Designer -------------------------------------------------------------------
  // Tout le dessin vient de Webflow : les cartes de [data-ordo-facturation] (avec un exemple en place
  // qui sert de gabarit : carte d'abonnement, moyen de paiement, adresse, ligne de facture) et les états
  // du bloc [data-ordo-gabarits="facturation"] (statuts, boutons, formulaires, messages). Le script les
  // recopie et n'y écrit que des données ; il ne crée d'éléments que pour des boutons, dont la classe
  // vient alors du gabarit. Un repère manquant fait retomber sur la présentation héritée, en le signalant.

  var GABARITS = [
    'statut-active', 'statut-free', 'statut-past_due', 'statut-pending', 'statut-canceling',
    'statut-pause_scheduled', 'statut-paused', 'statut-ended',
    'facture-paid', 'facture-processing', 'facture-open', 'facture-due', 'facture-uncollectible',
    'moyen-expire', 'moyen-bientot', 'icone-banque', 'icone-carte', 'icone-carte-alerte', 'usage', 'moyen-autres',
    'bouton', 'bouton-primaire', 'lien', 'flash', 'vide', 'lent', 'erreur', 'message', 'valeur-vide', 'sr', 'squelette',
    'adresse-formulaire', 'tva-lecture', 'tva-formulaire', 'tva-confirmation'
  ];
  // Exemples visibles dans la page du Designer : retirés au démarrage, recopiés pour chaque donnée.
  var EN_PLACE = ['abonnement', 'moyen', 'adresse-lecture', 'tva-demande', 'facture'];
  var SECTIONS = ['abonnements', 'moyen-de-paiement', 'adresse', 'factures'];
  var AIDE_ACTIONS = {
    email: 'aide_email',
    telephone: 'aide_telephone',
    demo: 'aide_demo',
    'video-1': 'video_moyen_de_paiement',
    'video-2': 'video_factures'
  };

  function designerWanted() {
    var d = null;
    try { d = window.OrdoRollout && window.OrdoRollout[DESIGNER_GATE]; } catch (e) { d = null; }
    return Boolean(d && d.enabled);
  }

  function champ(node, name) {
    return node ? node.querySelector('[data-ordo-champ="' + name + '"]') : null;
  }

  function poser(node, text) {
    if (node) node.textContent = text;
  }

  function retirer(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function remplacer(oldNode, newNode) {
    if (oldNode && oldNode.parentNode) oldNode.parentNode.replaceChild(newNode, oldNode);
    return newNode;
  }

  // Masquer ou montrer un élément du Designer. L'attribut `hidden` seul ne suffit pas : la feuille Webflow
  // ne le rend prioritaire que dans un cas précis, et une classe qui fixe `display` (carte, zone en flex)
  // l'emporte sur lui. Le style en ligne, lui, gagne toujours.
  function afficher(node, visible) {
    if (!node) return;
    node.hidden = !visible;
    node.style.display = visible ? '' : 'none';
  }

  // Ce que le script ajoute à la page, retiré au rendu suivant.
  function rendu(node) {
    node.setAttribute('data-ordo-rendu', '1');
    return node;
  }

  function prepareDesigner() {
    var root = document.querySelector('[data-ordo-facturation]');
    var store = document.querySelector('[data-ordo-gabarits="facturation"]');
    if (!root || !store) {
      reportProblem('FacturationDesignerAbsent', (root ? '' : '[data-ordo-facturation] ') + (store ? '' : '[data-ordo-gabarits]'));
      return null;
    }
    var g = {};
    var missing = [];
    var i;
    for (i = 0; i < GABARITS.length; i++) {
      g[GABARITS[i]] = store.querySelector('[data-ordo-gabarit="' + GABARITS[i] + '"]');
      if (!g[GABARITS[i]]) missing.push(GABARITS[i]);
    }
    for (i = 0; i < EN_PLACE.length; i++) {
      g[EN_PLACE[i]] = root.querySelector('[data-ordo-gabarit="' + EN_PLACE[i] + '"]');
      if (!g[EN_PLACE[i]]) missing.push(EN_PLACE[i]);
    }
    var cards = {};
    for (i = 0; i < SECTIONS.length; i++) {
      cards[SECTIONS[i]] = root.querySelector('[data-ordo-section="' + SECTIONS[i] + '"]');
      if (!cards[SECTIONS[i]]) missing.push('section ' + SECTIONS[i]);
    }
    var d = {
      root: root,
      g: g,
      cards: cards,
      liste: root.querySelector('[data-ordo-liste="abonnements"]'),
      zoneAdresse: root.querySelector('[data-ordo-zone="adresse"]'),
      zoneTva: root.querySelector('[data-ordo-zone="tva"]'),
      portail: root.querySelector('[data-ordo-champ="portail"]'),
      slot: root.querySelector('[data-ordo-slot="factures-email"]'),
      aide: root.querySelector('[data-ordo-aide-bloc]')
    };
    ['liste', 'zoneAdresse', 'zoneTva', 'portail', 'slot', 'aide'].forEach(function(k) { if (!d[k]) missing.push(k); });
    var pdf = g.facture && g.facture.querySelector('[data-ordo-gabarit="pdf"]');
    if (!pdf) missing.push('pdf');
    var actions = g.abonnement && champ(g.abonnement, 'actions');
    if (!actions) missing.push('abonnement > actions');
    if (missing.length) {
      reportProblem('FacturationGabaritAbsent', missing.join(', '));
      return null;
    }
    g.pdf = pdf;
    root.setAttribute('data-ordo-pret', '1');
    d.actionsClass = actions.className;
    d.table = g.facture.parentNode;
    for (i = 0; i < EN_PLACE.length; i++) retirer(g[EN_PLACE[i]]);
    // L'interrupteur « factures par e-mail » n'apparaît que si invoice-emails.js l'a pris en charge.
    var toggleRow = d.slot.querySelector('[data-ordo-factures-email]');
    if (toggleRow) afficher(toggleRow, false);
    // Le lien vers le portail Stripe devient un bouton : il ouvre le portail, sans adresse à suivre.
    var portail = enBouton(d.portail);
    mark(portail, 'portail');
    portail.addEventListener('click', function() { window.OrdoBillingPortal.open(); });
    d.portail = portail;
    var aideLinks = d.aide.querySelectorAll('[data-ordo-aide]');
    for (i = 0; i < aideLinks.length; i++) {
      var action = AIDE_ACTIONS[aideLinks[i].getAttribute('data-ordo-aide')];
      if (action) mark(aideLinks[i], action);
    }
    return d;
  }

  // Une copie du gabarit, sans son repère ni ses identifiants (la page ne doit jamais en avoir deux).
  function copie(name) {
    var n = D.g[name].cloneNode(true);
    n.removeAttribute('data-ordo-gabarit');
    if (n.id) n.removeAttribute('id');
    var ids = n.querySelectorAll('[id]');
    for (var i = 0; i < ids.length; i++) ids[i].removeAttribute('id');
    return n;
  }

  // Un lien du Designer qui déclenche une action devient un vrai bouton : même classe, même contenu.
  function enBouton(node) {
    if (!node) return null;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = node.className;
    var champName = node.getAttribute('data-ordo-champ');
    if (champName) b.setAttribute('data-ordo-champ', champName);
    while (node.firstChild) b.appendChild(node.firstChild);
    remplacer(node, b);
    return b;
  }

  function erreurD(node) {
    if (!node) {
      node = copie('erreur');
    }
    node.textContent = '';
    node.setAttribute('role', 'alert');
    afficher(node, false);
    return node;
  }

  // Les identifiants des champs d'un formulaire recopié, et le libellé qui pointe dessus.
  function nommerChamps(form, prefix) {
    var fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.type === 'submit') continue;
      f.id = prefix + f.name;
      var wrap = f.parentNode;
      var label = wrap && wrap.querySelector('label');
      if (label) label.setAttribute('for', f.id);
    }
  }

  function placeholderParDefaut(field, text) {
    if (field && !field.getAttribute('placeholder')) field.setAttribute('placeholder', text);
  }

  // Texte d'exemple que Webflow pose d'office dans un champ neuf : un champ qui le porte n'en a pas.
  var WEBFLOW_PLACEHOLDER = 'Example text';

  function formulaireD(name) {
    var root = copie(name);
    var form = root.querySelector('form');
    form.noValidate = true;
    form.removeAttribute('action');
    var inputs = form.querySelectorAll('[placeholder]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].getAttribute('placeholder') === WEBFLOW_PLACEHOLDER) inputs[i].removeAttribute('placeholder');
    }
    var cancel = enBouton(champ(form, 'annuler'));
    var save = form.querySelector('[type="submit"]');
    return { root: root, form: form, error: erreurD(champ(form, 'erreur')), cancel: cancel, save: save };
  }

  var designerUi = {
    actions: function() {
      var row = document.createElement('div');
      row.className = D.actionsClass;
      return row;
    },
    button: function(kind, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = D.g[kind].className;
      b.textContent = label;
      return b;
    },
    anchor: function(kind, label, href) {
      var a = copie(kind);
      a.textContent = label;
      a.setAttribute('href', href);
      return a;
    },
    message: function() {
      var m = copie('message');
      m.textContent = '';
      m.setAttribute('role', 'status');
      return m;
    },
    flash: function(text) {
      var f = copie('flash');
      f.textContent = text;
      f.setAttribute('role', 'status');
      return f;
    },
    pdfButton: function() {
      var holder = document.createElement('div');
      holder.appendChild(D.g.pdf.cloneNode(true));
      var b = enBouton(holder.firstChild);
      b.removeAttribute('data-ordo-gabarit');
      return b;
    },
    addressShell: function() {
      D.zoneAdresse.textContent = '';
      D.zoneTva.textContent = '';
      return { root: D.cards.adresse, body: D.zoneAdresse, taxBox: D.zoneTva };
    },
    addressRead: function(addr) {
      var view = copie('adresse-lecture');
      var nom = champ(view, 'nom');
      if (addr.name) poser(nom, addr.name);
      else remplacer(nom, copie('valeur-vide'));
      var adresse = champ(view, 'adresse');
      if (addressFilled(addr)) {
        adresse.textContent = '';
        var lines = addressLines(addr);
        for (var i = 0; i < lines.length; i++) {
          if (i) adresse.appendChild(document.createElement('br'));
          adresse.appendChild(document.createTextNode(lines[i]));
        }
      } else {
        remplacer(adresse, copie('valeur-vide'));
      }
      var edit = remplacer(champ(view, 'action'), button(addressFilled(addr) ? 'Modifier' : 'Ajouter', !addressFilled(addr)));
      return { root: view, edit: edit };
    },
    addressForm: function(addr) {
      var f = formulaireD('adresse-formulaire');
      var form = f.form;
      nommerChamps(form, 'ordo-addr-');
      placeholderParDefaut(form.elements.name, 'Nom et prénom, ou raison sociale');
      placeholderParDefaut(form.elements.line2, 'Bâtiment, étage…');
      ['line1', 'postalCode', 'city'].forEach(function(k) { if (form.elements[k]) form.elements[k].required = true; });
      ['name', 'line1', 'line2', 'postalCode', 'city'].forEach(function(k) {
        if (form.elements[k]) form.elements[k].value = addr[k] || '';
      });
      var select = form.elements.country;
      if (select) {
        while (select.firstChild) select.removeChild(select.firstChild);
        var codes = COUNTRIES.slice();
        if (addr.country && codes.indexOf(addr.country) === -1) codes.unshift(addr.country);
        if (!addr.country) {
          var none = document.createElement('option');
          none.value = '';
          none.textContent = 'Choisir un pays';
          select.appendChild(none);
        }
        for (var i = 0; i < codes.length; i++) {
          var o = document.createElement('option');
          o.value = codes[i];
          o.textContent = countryName(codes[i]);
          select.appendChild(o);
        }
        select.value = addr.country || '';
      }
      return f;
    },
    taxRead: function(value, allowed) {
      var view = copie('tva-lecture');
      poser(champ(view, 'valeur'), value);
      var edit = enBouton(champ(view, 'modifier'));
      var remove = enBouton(champ(view, 'retirer'));
      if (!allowed) {
        retirer(edit);
        edit = null;
      }
      return { root: view, edit: edit, remove: remove };
    },
    taxAsk: function() {
      var view = copie('tva-demande');
      return { root: view, add: enBouton(champ(view, 'action')) };
    },
    taxForm: function(value) {
      var f = formulaireD('tva-formulaire');
      nommerChamps(f.form, 'ordo-addr-');
      var input = f.form.elements.taxId;
      placeholderParDefaut(input, 'FR12345678901');
      input.setAttribute('spellcheck', 'false');
      input.value = value || '';
      f.input = input;
      return f;
    },
    taxConfirm: function(value) {
      var view = copie('tva-confirmation');
      poser(champ(view, 'valeur'), value);
      var ask = champ(view, 'question');
      if (ask) ask.id = 'ordo-addr-tva-ask';
      return {
        nodes: [view],
        ask: ask,
        error: erreurD(champ(view, 'erreur')),
        cancel: enBouton(champ(view, 'annuler')),
        confirm: enBouton(champ(view, 'confirmer'))
      };
    }
  };

  function showD() {
    afficher(D.root, true);
    document.documentElement.classList.add('ordo-subs-v2');
  }

  function hideD() {
    afficher(D.root, false);
    document.documentElement.classList.remove('ordo-subs-v2');
  }

  function resetD() {
    var added = D.root.querySelectorAll('[data-ordo-rendu]');
    for (var i = 0; i < added.length; i++) retirer(added[i]);
    D.zoneAdresse.textContent = '';
    D.zoneTva.textContent = '';
    D.cards.abonnements.removeAttribute('aria-busy');
  }

  function logoD(img, src) {
    if (!img) return;
    if (typeof src !== 'string' || !LOGO_URL.test(src)) {
      retirer(img);
      return;
    }
    img.setAttribute('src', src);
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.setAttribute('alt', '');
  }

  function cardD(c) {
    var root = copie('abonnement');
    var nom = champ(root, 'nom');
    logoD(nom && nom.querySelector('img'), c.icon);
    poser(champ(root, 'libelle'), c.label || 'Abonnement');
    remplacer(champ(root, 'statut'), copie('statut-' + (STATUS[c.status] ? c.status : 'active')));

    var corps = champ(root, 'corps');
    var prix = champ(root, 'prix');
    var offre = champ(root, 'offre');
    var note = champ(root, 'note');
    while (corps.firstChild) corps.removeChild(corps.firstChild);
    var lines = bodyLines(c);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.price) {
        var info = priceInfo(c);
        poser(champ(prix, 'montant'), info.amount);
        poser(champ(prix, 'periode'), info.period);
        var old = champ(prix, 'ancien-prix');
        if (info.old) {
          old.textContent = '';
          var sr = copie('sr');
          sr.textContent = 'au lieu de ';
          old.appendChild(sr);
          old.appendChild(document.createTextNode(info.old));
        } else {
          retirer(old);
        }
        corps.appendChild(prix);
      } else if (line.badge) {
        var chip = offre.cloneNode(true);
        poser(champ(chip, 'offre-valeur'), line.badge);
        var chipNote = champ(chip, 'offre-note');
        if (line.note) poser(chipNote, line.note);
        else retirer(chipNote);
        corps.appendChild(chip);
      } else {
        var text = note.cloneNode(true);
        text.textContent = line.text;
        corps.appendChild(text);
      }
    }
    if (!corps.firstChild) retirer(corps);

    var pied = champ(root, 'pied');
    var f = footInfo(c);
    if (!f) {
      retirer(pied);
    } else {
      poser(champ(pied, 'pied-libelle'), f.label);
      var value = champ(pied, 'pied-valeur');
      value.textContent = '';
      if (f.link) value.appendChild(paymentLink('lien', f.link, c.status));
      else value.textContent = f.value;
    }

    var actions = actionsOf(c);
    if (actions) remplacer(champ(root, 'actions'), actions);
    else retirer(champ(root, 'actions'));
    root.setAttribute('role', 'listitem');
    return root;
  }

  function usageD(text, icon) {
    var item = copie('usage');
    logoD(item.querySelector('img'), icon);
    poser(champ(item, 'nom'), text);
    return item;
  }

  function paymentD(list, pms, others) {
    var card = D.cards['moyen-de-paiement'];
    var m = pmModel(list, pms, others);
    var rows = [];
    for (var i = 0; i < pms.length; i++) {
      var pm = pms[i];
      var row = rendu(copie('moyen'));
      var icon = pm.type === 'sepa_debit' ? 'icone-banque' : (pm.expired ? 'icone-carte-alerte' : 'icone-carte');
      remplacer(champ(row, 'icone'), copie(icon));
      var nom = champ(row, 'nom');
      poser(champ(nom, 'libelle'), pmName(pm));
      if (pm.expired) nom.appendChild(copie('moyen-expire'));
      else if (pm.expiresSoon) nom.appendChild(copie('moyen-bientot'));
      var detail = champ(row, 'detail');
      detail.textContent = '';
      if (!fillDetail(detail, pm, m.several, usageD)) retirer(detail);
      retirer(champ(row, 'action'));
      rows.push(row);
      card.appendChild(row);
    }
    if (m.saved.length) {
      var box = rendu(copie('moyen-autres'));
      var line = champ(box, 'ligne');
      while (box.firstChild) box.removeChild(box.firstChild);
      for (var k = 0; k < m.saved.length; k++) {
        var l = line.cloneNode(true);
        l.textContent = m.saved[k];
        box.appendChild(l);
      }
      card.appendChild(box);
    }
    var link = pmAction(m);
    if (m.several) {
      var actions = rendu(ui.actions());
      actions.appendChild(link);
      card.appendChild(actions);
    } else {
      rows[0].appendChild(link);
    }
  }

  function invoicesD(invoices) {
    for (var i = 0; i < invoices.length; i++) {
      var inv = invoices[i];
      var row = rendu(copie('facture'));
      poser(champ(row, 'date'), shortDay(inv.date));
      poser(champ(row, 'libelle'), inv.label || 'Abonnement');
      poser(champ(row, 'montant'), typeof inv.amount === 'number' ? money(inv.amount, inv.currency) : '');
      var status = champ(row, 'statut');
      status.textContent = '';
      status.appendChild(copie('facture-' + (INVOICE_STATUS[inv.status] ? inv.status : 'open')));
      var cell = champ(row, 'action');
      cell.textContent = '';
      var action = invoiceAction(inv);
      if (action) cell.appendChild(action);
      D.table.appendChild(row);
    }
    afficher(D.portail, portalAvailable());
  }

  function placeInvoicesD(invoices) {
    var block = document.getElementById('invoices-block');
    if (!Array.isArray(invoices)) {
      afficher(D.cards.factures, false);
      afficher(D.aide, false);
      keepBlock(block, true);
      if (toggleMoved && moveToggle(block)) toggleMoved = false;
      return;
    }
    if (invoices.length) {
      invoicesD(invoices);
      afficher(D.cards.factures, true);
      whenInvoiceEmails(function() {
        if (!D.cards.factures.hidden && moveToggle(D.slot)) toggleMoved = true;
      });
    } else {
      afficher(D.cards.factures, false);
      if (toggleMoved && moveToggle(block)) toggleMoved = false;
    }
    afficher(D.aide, true);
    keepBlock(block, false);
  }

  function renderD(list, flash, pms, invoices, others, address, taxId, taxIdAllowed) {
    resetD();
    var subs = D.cards.abonnements;
    if (flash) subs.insertBefore(rendu(ui.flash(flash)), D.liste);
    if (!list.length) {
      D.liste.appendChild(rendu(copie('vide')));
    } else {
      for (var i = 0; i < list.length; i++) D.liste.appendChild(rendu(cardD(list[i])));
    }
    afficher(D.cards['moyen-de-paiement'], pms.length > 0);
    if (pms.length) paymentD(list, pms, others);
    var withAddress = Boolean(address && billingCardWanted(list, pms, invoices, others, address, taxId));
    afficher(D.cards.adresse, withAddress);
    if (withAddress) addressSection(address, taxId, taxIdAllowed);
    placeInvoicesD(invoices);
    showD();
    hideOldSection();
    togglePaymentBlock(list, pms);
  }

  function skeletonD() {
    resetD();
    var subs = D.cards.abonnements;
    subs.setAttribute('aria-busy', 'true');
    for (var k = 0; k < SECTIONS.length; k++) afficher(D.cards[SECTIONS[k]], SECTIONS[k] === 'abonnements');
    afficher(D.aide, false);
    for (var i = skeletonCount(); i > 0; i--) {
      var s = rendu(copie('squelette'));
      s.setAttribute('aria-hidden', 'true');
      D.liste.appendChild(s);
    }
    var sr = rendu(copie('sr'));
    sr.textContent = 'Chargement de vos abonnements…';
    subs.appendChild(sr);
    showD();
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function() {
      if (subs.getAttribute('aria-busy') !== 'true') return;
      var slow = rendu(copie('lent'));
      slow.setAttribute('role', 'status');
      subs.appendChild(slow);
    }, Math.max(0, SLOW_MS - (Date.now() - startedAt)));
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
    // Une seconde exécution (bundle périmé servi à côté de l'épinglé) trouverait les gabarits déjà retirés
    // et retomberait sur la présentation héritée : la page aurait deux listes.
    var drawn = document.querySelector('[data-ordo-facturation][data-ordo-pret]');
    if (drawn) {
      console.log(PREFIX + ' Already rendered');
      return;
    }
    if (designerWanted()) D = prepareDesigner();
    if (D) {
      ui = designerUi;
      anchor = D.root;
    } else {
      anchor = document.getElementById(ANCHOR_ID);
      if (!anchor) {
        console.log(PREFIX + ' Anchor not found');
        fallbackToPageBlocks();
        track('subscriptions_list', { subs_outcome: 'no-anchor' });
        return;
      }
      if (anchor.firstElementChild) {
        console.log(PREFIX + ' Already rendered');
        return;
      }
    }
    hide();
    listenClicks();
    // The list is requested with the page, not when its tab opens: it is usually ready (and rendered,
    // replacing the page's own blocks) before the member gets there. The skeleton only shows if not.
    var settled = false;
    var instant = null;
    var seen = false;
    var hidden = document.visibilityState === 'hidden';
    function onVisibility() {
      if (document.visibilityState === 'hidden') hidden = true;
    }
    document.addEventListener('visibilitychange', onVisibility);
    function stopWaiting() {
      settled = true;
      clearTimeout(skeletonTimer);
      clearTimeout(slowTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    // Free plans only: their cards are shown at once, and the list, still requested, replaces them.
    var freePlans = freeOnlyPlans();
    function showInstant(plans) {
      if (settled || instant || !plans) return;
      var cards = freeCards(freePlans, plans);
      if (!cards) return;
      instant = cards;
      clearTimeout(skeletonTimer);
      clearTimeout(slowTimer);
      render(cards, null, [], [], [], null);
      track('subscriptions_list', { subs_outcome: 'instant', subs_status: statusesOf(cards) });
      console.log(PREFIX + ' Shown before the list: ' + cards.length + ' free plan(s)');
    }
    if (freePlans) {
      showInstant(storedPlans());
      fetchPlans().then(showInstant);
    }

    load().then(function(data) {
      stopWaiting();
      render(data.list, null, data.pms, data.invoices, data.others, data.address, data.taxId, data.taxIdAllowed);
      if (!instant) {
        track('subscriptions_list', { subs_outcome: data.hedged ? 'shown-retry' : 'shown', subs_status: statusesOf(data.list) });
      } else if (paidIn(data.list)) {
        reportProblem('SubscriptionsInstantMismatch', 'free plans only in the member data, list: ' + statusesOf(data.list));
      }
      console.log(PREFIX + ' Rendered ' + data.list.length + ' subscription(s)');
    }).catch(function(err) {
      stopWaiting();
      var timedOut = Boolean(err && err.status === 'timeout');
      if (instant) {
        // The free plans stay shown: only the check is missing.
        console.error(PREFIX + ' Load error after the free plans were shown:', err && err.message);
        if (!timedOut) reportIfActionable(err);
        return;
      }
      // A wait the member did not see (tab in the background, section never on screen) is not a failure.
      var unseen = timedOut && (hidden || !seen);
      // `timeout` goes in subs_outcome, the dimension registered in GA4: subs_status is sent but
      // not registered, so a value placed there alone would never be readable.
      track('subscriptions_list', {
        subs_outcome: timedOut ? (unseen ? 'timeout-unseen' : 'timeout') : 'failed',
        subs_status: err && err.status ? String(err.status) : 'network'
      });
      clear();
      hide();
      fallbackToPageBlocks();
      console.error(PREFIX + ' Load error:', err && err.message);
      if (!unseen) reportIfActionable(err);
    });
    whenVisible(function() {
      seen = true;
      if (settled || instant) return;
      skeletonTimer = setTimeout(function() {
        if (!settled && !instant) showSkeleton();
      }, SKELETON_DELAY_MS);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
