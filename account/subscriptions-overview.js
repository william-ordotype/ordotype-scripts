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
    '.ordo-subs{display:flex;flex-direction:column;gap:20px;margin-bottom:2.5rem;color:var(--base-900,#0c0e16)}',
    '.ordo-subs-intro{display:flex;flex-direction:column;gap:6px}',
    '.ordo-subs-title{margin:0;font-size:1.375rem;line-height:1.3;font-weight:700}',
    '.ordo-subs-sub{margin:0;font-size:.9375rem;line-height:1.5;color:var(--neutral-500,#47505c)}',
    '.ordo-subs-list{display:flex;flex-direction:column;gap:16px}',
    '.ordo-subs-card{background:#fff;border:1px solid var(--gris300,#ecedef);border-radius:12px;padding:22px 24px;display:flex;flex-direction:column;gap:14px}',
    '.ordo-subs-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 16px}',
    '.ordo-subs-label{font-size:1.0625rem;line-height:1.4;font-weight:600}',
    '.ordo-subs-status{display:inline-flex;align-items:center;gap:8px;font-size:.8125rem;font-weight:500;white-space:nowrap}',
    '.ordo-subs-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}',
    '.ordo-subs-tone-ok{background:var(--success-500,#1ac057)}',
    '.ordo-subs-tone-free{background:var(--primary-500,#3454f6)}',
    '.ordo-subs-tone-alert{background:var(--error-500,#ee4343)}',
    '.ordo-subs-tone-muted{background:var(--neutral-400,#858c95)}',
    '.ordo-subs-body{display:flex;flex-direction:column;gap:8px}',
    '.ordo-subs-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px}',
    '.ordo-subs-amount{font-size:1.625rem;line-height:1.2;font-weight:700;letter-spacing:-.01em}',
    '.ordo-subs-period,.ordo-subs-old,.ordo-subs-muted,.ordo-subs-note{color:var(--neutral-500,#47505c)}',
    '.ordo-subs-period,.ordo-subs-old{font-size:.9375rem}',
    '.ordo-subs-offer{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
    '.ordo-subs-badge{background:var(--primary-50,#f0f3ff);color:var(--primary-600,#263fd3);font-size:.8125rem;font-weight:600;padding:4px 10px;border-radius:999px}',
    '.ordo-subs-note,.ordo-subs-muted{font-size:.875rem;line-height:1.5}',
    '.ordo-subs-foot{border-top:1px solid var(--gris300,#ecedef);padding-top:14px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 16px;font-size:.875rem}',
    '.ordo-subs-foot-label{color:var(--neutral-500,#47505c)}',
    '.ordo-subs-foot-value{font-weight:600}',
    '.ordo-subs-link{background:none;border:0;padding:0;font:inherit;font-weight:600;text-align:left;align-self:flex-start;color:var(--primary-1,#153cf5);text-decoration:underline;cursor:pointer}',
    '.ordo-subs-link:hover{color:var(--primary-600,#263fd3)}',
    '.ordo-subs-empty{font-size:.9375rem;color:var(--neutral-500,#47505c)}',
    '.ordo-subs-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}',
    '.ordo-subs-btn{display:inline-flex;align-items:center;justify-content:center;min-height:2.5rem;padding:0 16px;border-radius:4px;border:1px solid var(--neutral-400,#858c95);background:#fff;color:var(--base-900,#0c0e16);font:inherit;font-size:.9375rem;font-weight:600;line-height:1.2;text-decoration:none;cursor:pointer;transition:background-color .2s}',
    '.ordo-subs-btn:hover{background:var(--neutral-100,#f7f7fb);color:var(--base-900,#0c0e16)}',
    '.ordo-subs-btn.is-primary{background:var(--primary-500,#3454f6);border-color:var(--primary-500,#3454f6);color:#fff}',
    '.ordo-subs-btn.is-primary:hover{background:var(--primary-600,#263fd3);border-color:var(--primary-600,#263fd3);color:#fff}',
    '.ordo-subs-btn[disabled]{opacity:.5;cursor:default}',
    '.ordo-subs-msg{flex-basis:100%;text-align:right}',
    '.ordo-subs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.ordo-subs-skel{height:132px;border-radius:12px;background:var(--neutral-100,#f7f7fb);border:1px solid var(--gris300,#ecedef);animation:ordo-subs-pulse 1.2s ease-in-out infinite}',
    '@keyframes ordo-subs-pulse{0%,100%{opacity:.5}50%{opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.ordo-subs-skel{animation:none}}',
    '@media (max-width:479px){.ordo-subs-card{padding:18px 16px;gap:12px}.ordo-subs-amount{font-size:1.5rem}.ordo-subs-foot{flex-direction:column}.ordo-subs-btn{width:100%}.ordo-subs-msg{text-align:left}}'
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
    if (c.status === 'free') {
      row.appendChild(el('span', 'ordo-subs-amount', 'Gratuit'));
      return row;
    }
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
    if (c.status === 'canceling' && c.endsOn) return footRow('Se termine le', day(c.endsOn));
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

  function actionsOf(c) {
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
    var pill = el('div', 'ordo-subs-status');
    var dot = el('span', 'ordo-subs-dot ordo-subs-tone-' + st.tone);
    dot.setAttribute('aria-hidden', 'true');
    pill.appendChild(dot);
    pill.appendChild(el('span', null, st.text));
    head.appendChild(pill);
    root.appendChild(head);

    var body = el('div', 'ordo-subs-body');
    if (c.status === 'free' || (c.price && c.status !== 'paused')) body.appendChild(priceRow(c));
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

  function intro() {
    var box = el('div', 'ordo-subs-intro');
    box.appendChild(el('h3', 'ordo-subs-title', 'Mes abonnements'));
    box.appendChild(el('p', 'ordo-subs-sub', 'Vos accès Ordotype, vos remises en cours et vos prochaines échéances.'));
    return box;
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

  function render(list) {
    injectStyle();
    clear();
    var root = el('div', 'ordo-subs');
    root.appendChild(intro());
    if (!list.length) {
      root.appendChild(el('p', 'ordo-subs-empty', 'Vous n’avez pas d’abonnement en cours.'));
    } else {
      var box = el('div', 'ordo-subs-list');
      box.setAttribute('role', 'list');
      for (var i = 0; i < list.length; i++) box.appendChild(card(list[i]));
      root.appendChild(box);
    }
    anchor.appendChild(root);
    show();
    hideOldSection();
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

  function request() {
    return memberToken().then(function(token) {
      if (!token) {
        var e = new Error('no member token');
        e.status = 401;
        throw e;
      }
      return fetch(API_URL, {
        method: 'GET',
        credentials: 'omit',
        headers: { Authorization: 'Bearer ' + token }
      });
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
        return payload.subscriptions;
      });
    });
  }

  function load() {
    return request().catch(function(err) {
      if (err && err.status) throw err;
      return new Promise(function(resolve) {
        setTimeout(resolve, RETRY_DELAY_MS);
      }).then(request);
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
      load().then(function(list) {
        clearTimeout(skeletonTimer);
        render(list);
        console.log(PREFIX + ' Rendered ' + list.length + ' subscription(s)');
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
