/* Ordotype - module pages: prices in the member's billing currency. */
(function () {
  'use strict';

  if (window.__ordoModuleDevise) return;
  window.__ordoModuleDevise = true;

  var PREFIX = '[ModuleDevise]';

  var EUR_PRICES = {
    'prc_rhumatologie-discount-price-my1ki0tid': ['rhumatologie', 'praticien'],
    'prc_rhumatologie-full-price-nt2b09xz': ['rhumatologie', 'praticien'],
    'prc_rhumatologie-full-price-5zm20qh2': ['rhumatologie', 'praticien'],
    'prc_rhumatologie-discount-interne-6cow0xa7': ['rhumatologie', 'interne'],
    'prc_soins-palliatifs-discount-price-2w1bh0teo': ['soins-palliatifs', 'praticien'],
    'prc_soins-palliatifs-full-price-6x4s0c24': ['soins-palliatifs', 'praticien'],
    'prc_soins-palliatifs-discount-price-no-free-trial-9019j052f': ['soins-palliatifs', 'praticien'],
    'prc_soins-palliatifs-full-price-no-free-trial-j01ba0cy7': ['soins-palliatifs', 'praticien'],
    'prc_module-soins-palliatifs--zs4j0vat': ['soins-palliatifs', 'praticien'],
    'prc_soins-palliatifs-discount-interne-zyl2008f': ['soins-palliatifs', 'interne']
  };

  var LOCAL_PRICES = {
    'rhumatologie': {
      mad: { praticien: ['prc_rhumatologie-maroc-praticien-xf00bcr', 25], interne: ['prc_rhumatologie-maroc-interne-fk10bvg', 10] },
      dzd: { praticien: ['prc_rhumatologie-alg-rie-gv20bn0', 130] },
      xof: { praticien: ['prc_rhumatologie-afrique-de-l-ouest-og30bbo', 500] },
      xaf: { praticien: ['prc_rhumatologie-afrique-centrale-xo40bxt', 500] },
      xpf: { praticien: ['prc_rhumatologie-franc-pacifique-6c50bgq', 500] },
      chf: { praticien: ['prc_rhumatologie-suisse-praticien-f260b05', 8], interne: ['prc_rhumatologie-suisse-interne-n170bj5', 3] },
      usd: { praticien: ['prc_rhumatologie-usd-x480b3d', 1] }
    },
    'soins-palliatifs': {
      mad: { praticien: ['prc_soins-palliatifs-maroc-praticien-8u90b4h', 25], interne: ['prc_soins-palliatifs-maroc-interne-nra0b89', 10] },
      dzd: { praticien: ['prc_soins-palliatifs-alg-rie-vgb0byr', 130] },
      xof: { praticien: ['prc_soins-palliatifs-afrique-de-l-ouest-6cc0b8r', 500] },
      xaf: { praticien: ['prc_soins-palliatifs-afrique-centrale-ped0bk5', 500] },
      xpf: { praticien: ['prc_soins-palliatifs-franc-pacifique-rze0bum', 500] },
      chf: { praticien: ['prc_soins-palliatifs-suisse-praticien-2kf0b9r', 8], interne: ['prc_soins-palliatifs-suisse-interne-dsg0bzl', 3] },
      usd: { praticien: ['prc_soins-palliatifs-usd-jvh0b2v', 1] }
    }
  };

  var CURRENCY_NAMES = {
    mad: 'dirhams', dzd: 'dinars algériens', tnd: 'dinars tunisiens', xof: 'francs CFA',
    xaf: 'francs CFA', xpf: 'francs CFP', chf: 'francs suisses', usd: 'dollars'
  };

  var LIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID', 'REQUIRES_PAYMENT', 'REQUIRES_AUTHENTICATION', 'INCOMPLETE'];

  var applied = null;
  var reported = {};
  var reporterQueue = null;

  function log(msg) {
    try { console.log(PREFIX, msg); } catch (e) { /* ignore */ }
  }

  function memberCurrency(member) {
    var conns = member && Array.isArray(member.planConnections) ? member.planConnections : [];
    var found = null;
    for (var i = 0; i < conns.length; i++) {
      var c = conns[i] || {};
      var live = c.active === true || LIVE_STATUSES.indexOf(String(c.status || '').toUpperCase()) !== -1;
      var cur = c.payment && c.payment.currency ? String(c.payment.currency).toLowerCase() : '';
      if (!live || !cur) continue;
      if (cur === 'eur') { if (!found) found = 'eur'; continue; }
      if (found && found !== 'eur' && found !== cur) return 'mixed';
      found = cur;
    }
    return found;
  }

  function readCachedMember() {
    try {
      var raw = window.localStorage.getItem('_ms-mem');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function formatPrice(amount, currency) {
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: currency.toUpperCase(),
        minimumFractionDigits: 0, maximumFractionDigits: 0
      }).format(amount);
    } catch (e) {
      return amount + ' ' + currency.toUpperCase();
    }
  }

  function rewriteLabel(button, price) {
    var walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      if (/\d+(?:[.,]\d+)?\s*€/.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(/\d+(?:[.,]\d+)?\s*€/, price);
      }
    }
  }

  function loadReporter(done) {
    if (window.OrdoErrorReporter) return done();
    if (reporterQueue) { reporterQueue.push(done); return; }
    var me = document.querySelector('script[src*="/module/devise-locale.js"]');
    if (!me) return done();
    reporterQueue = [done];
    var flush = function () {
      var q = reporterQueue;
      reporterQueue = null;
      for (var k = 0; k < q.length; k++) q[k]();
    };
    var s = document.createElement('script');
    s.src = me.src.replace('/module/devise-locale.js', '/shared/error-reporter.js');
    s.crossOrigin = 'anonymous';
    s.onload = flush;
    s.onerror = flush;
    document.body.appendChild(s);
  }

  function reportGap(module, tier, currency) {
    var key = module + '|' + tier + '|' + currency;
    if (reported[key]) return;
    reported[key] = true;
    var msg = 'Prix ' + module + ' (' + tier + ') absent en ' + currency.toUpperCase();
    log(msg);
    loadReporter(function () {
      try {
        if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('ModuleDevise', msg);
      } catch (e) { /* ignore */ }
    });
  }

  function openContact(e) {
    if (window.$crisp && typeof window.$crisp.push === 'function') {
      e.preventDefault();
      try {
        window.$crisp.push(['do', 'chat:show']);
        window.$crisp.push(['do', 'chat:open']);
      } catch (err) {
        window.location.href = 'mailto:support@ordotype.fr';
      }
    }
  }

  function hideEuroLine(button) {
    var next = button.nextElementSibling;
    if (!next || next.hasAttribute('data-ms-price:add') || next.hasAttribute('data-ordo-devise-note')) return;
    if (!/€/.test(next.textContent || '')) return;
    next.style.display = 'none';
    next.setAttribute('data-ordo-devise-masque', '');
  }

  function replaceWithNote(button, currency) {
    if (button.getAttribute('data-ordo-devise') === 'note') return;
    button.setAttribute('data-ordo-devise', 'note');
    button.style.display = 'none';
    var note = document.createElement('div');
    note.className = 'text-size-small text-align-center text-color-base-600';
    note.setAttribute('data-ordo-devise-note', '');
    note.appendChild(document.createTextNode(
      'Votre abonnement est réglé en ' + (CURRENCY_NAMES[currency] || currency.toUpperCase()) + ' : '));
    var link = document.createElement('a');
    link.href = 'mailto:support@ordotype.fr?subject=' + encodeURIComponent('Ajouter un module');
    link.textContent = 'écrivez-nous';
    link.addEventListener('click', openContact);
    note.appendChild(link);
    note.appendChild(document.createTextNode(' pour ajouter ce module dans votre devise.'));
    button.parentNode.insertBefore(note, button.nextSibling);
  }

  function priceButtons() {
    var all = document.getElementsByTagName('*');
    var out = [];
    for (var j = 0; j < all.length; j++) {
      if (all[j].tagName !== 'FORM' && all[j].hasAttribute('data-ms-price:add')) out.push(all[j]);
    }
    return out;
  }

  function apply(currency) {
    if (!currency || currency === 'eur' || currency === applied) return;
    if (currency === 'mixed') {
      log('plusieurs devises, boutons inchangés');
      return;
    }
    applied = currency;
    var buttons = priceButtons();
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var eur = b.getAttribute('data-ordo-devise-eur') || b.getAttribute('data-ms-price:add');
      var target = EUR_PRICES[eur];
      if (!target) continue;
      var byCurrency = LOCAL_PRICES[target[0]] && LOCAL_PRICES[target[0]][currency];
      var local = byCurrency && byCurrency[target[1]];
      hideEuroLine(b);
      if (!local) {
        replaceWithNote(b, currency);
        reportGap(target[0], target[1], currency);
        continue;
      }
      b.setAttribute('data-ordo-devise-eur', eur);
      b.setAttribute('data-ms-price:add', local[0]);
      b.setAttribute('data-ordo-devise', currency);
      rewriteLabel(b, formatPrice(local[1], currency));
    }
    log('prix en ' + currency.toUpperCase());
  }

  function run() {
    apply(memberCurrency(readCachedMember()));
    var tries = 0;
    (function waitForMemberstack() {
      var ms = window.$memberstackDom;
      if (ms && typeof ms.getCurrentMember === 'function') {
        Promise.resolve(ms.getCurrentMember()).then(function (res) {
          apply(memberCurrency(res && res.data));
        }).catch(function () { /* ignore */ });
        return;
      }
      if (++tries < 50) setTimeout(waitForMemberstack, 200);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
