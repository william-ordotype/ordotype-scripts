/**
 * Ordotype Account - Profile photo
 * Photo de profil dans l'en-tête de « Mon profil » : ajout, remplacement, retrait.
 * L'image est lue, recadrée en carré et réduite dans le navigateur, puis envoyée
 * à Memberstack en JPEG. Sans photo, le rond d'initiales reste affiché.
 *
 * Depends on: core.js (window.OrdoAccount), shared/error-reporter.js,
 *             Memberstack DOM SDK ($memberstackDom.updateMemberProfileImage)
 * Expected DOM (Webflow): [data-ordo-v2="profil"] .compte-v2_identity avec
 *             [data-ordo-initiales] (rond d'initiales) et .compte-v2_identity-text.
 */
(function() {
  'use strict';

  var PREFIX = '[ProfilePhoto]';
  var SIZE = 512; // côté du carré envoyé, en px
  var QUALITY = 0.86;
  var MAX_INPUT_BYTES = 25 * 1024 * 1024;
  var MS_MAX_ATTEMPTS = 50; // 50 x 200 ms = 10 s
  // Photos venues d'un fournisseur de connexion : pas affichées, le membre choisit la sienne.
  var PROVIDER_HOSTS = /(^|\.)googleusercontent\.com$/i;

  var MESSAGES = {
    read: 'Ce fichier n’est pas une image lisible. Choisissez une photo au format JPG ou PNG.',
    heavy: 'Cette photo est trop lourde : choisissez une image de moins de 25 Mo.',
    network: 'La photo n’a pas pu être envoyée. Vérifiez votre connexion puis réessayez.',
    session: 'Votre session a expiré : reconnectez-vous puis réessayez.',
    unavailable: 'L’envoi de photo n’est pas disponible pour le moment. Réessayez plus tard.',
    failed: 'La photo n’a pas pu être enregistrée. Réessayez dans un instant.',
    removeFailed: 'La photo n’a pas pu être retirée. Réessayez dans un instant.'
  };

  var account = window.OrdoAccount;
  var member = account && account.member;
  if (!member || !member.id) return;

  var profil = document.querySelector('[data-ordo-v2="profil"]');
  var avatar = profil && profil.querySelector('[data-ordo-initiales]');
  var textCol = profil && profil.querySelector('.compte-v2_identity-text');
  if (!avatar || !textCol) {
    console.log(PREFIX, 'No profile header on this page');
    return;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function button(className, label) {
    var b = el('button', className, label);
    b.type = 'button';
    return b;
  }

  /** URL de la photo à afficher, ou '' (aucune, adresse invalide ou photo d'un fournisseur de connexion). */
  function shownPhoto(url) {
    if (typeof url !== 'string' || !url) return '';
    var parsed;
    try { parsed = new URL(url); } catch (e) { return ''; }
    if (parsed.protocol !== 'https:') return '';
    if (PROVIDER_HOSTS.test(parsed.hostname)) return '';
    return url;
  }

  function track(outcome) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;
    var payload = { event: 'profile_action', profile_action: 'photo', profile_section: 'identite', profile_outcome: outcome };
    payload.profile_step = 'photo:identite:' + outcome;
    var rollout = window.OrdoRollout && window.OrdoRollout['profile-photo.js'];
    if (rollout) {
      payload.rollout_percent = rollout.percent;
      payload.rollout_bucket = rollout.bucket;
      payload.rollout_reason = rollout.reason;
    }
    try { window.dataLayer.push(payload); } catch (e) { /* no-op */ }
  }

  function report(context, err, network) {
    var reporter = window.OrdoErrorReporter;
    if (!reporter) return;
    if (network && typeof reporter.reportNetwork === 'function') reporter.reportNetwork(context, err);
    else if (typeof reporter.report === 'function') reporter.report(context, err);
  }

  /** Met à jour l'instantané `_ms-mem` lu au chargement suivant. */
  function patchSnapshot(url) {
    try {
      var raw = localStorage.getItem('_ms-mem');
      if (!raw) return;
      var snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return;
      snap.profileImage = url;
      localStorage.setItem('_ms-mem', JSON.stringify(snap));
    } catch (e) { /* no-op */ }
  }

  function waitForMemberstack() {
    return new Promise(function(resolve) {
      var attempts = 0;
      (function poll() {
        if (window.$memberstackDom) return resolve(window.$memberstackDom);
        if (attempts >= MS_MAX_ATTEMPTS) return resolve(null);
        attempts++;
        setTimeout(poll, 200);
      })();
    });
  }

  // ---------------------------------------------------------------------------
  // Préparation de l'image : lecture, recadrage carré, réduction, JPEG
  // ---------------------------------------------------------------------------

  function codedError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function decode(file) {
    if (typeof window.createImageBitmap === 'function') {
      return window.createImageBitmap(file).then(function(bitmap) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      }, function() {
        throw codedError('read');
      });
    }
    return new Promise(function(resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function() {
        URL.revokeObjectURL(url);
        resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(codedError('read'));
      };
      img.src = url;
    });
  }

  /**
   * Carré pris au centre ; sur une photo en hauteur, un peu plus haut que le centre, là où se
   * trouve d'habitude le visage.
   */
  function cropBox(width, height) {
    var side = Math.min(width, height);
    var sx = Math.round((width - side) / 2);
    var sy = height > width ? Math.round((height - side) * 0.25) : Math.round((height - side) / 2);
    return { sx: sx, sy: sy, side: side, out: Math.min(SIZE, side) };
  }

  function toJpeg(decoded) {
    if (!decoded.width || !decoded.height) return Promise.reject(codedError('read'));
    var box = cropBox(decoded.width, decoded.height);
    var canvas = document.createElement('canvas');
    canvas.width = box.out;
    canvas.height = box.out;
    var ctx = canvas.getContext('2d');
    if (!ctx) return Promise.reject(codedError('read'));
    // Fond blanc : la transparence d'un PNG deviendrait noire en JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, box.out, box.out);
    ctx.drawImage(decoded.source, box.sx, box.sy, box.side, box.side, 0, 0, box.out, box.out);
    if (decoded.source && typeof decoded.source.close === 'function') decoded.source.close();
    return new Promise(function(resolve, reject) {
      canvas.toBlob(function(blob) {
        if (blob) resolve(blob);
        else reject(codedError('read'));
      }, 'image/jpeg', QUALITY);
    });
  }

  function prepare(file) {
    if (file.size > MAX_INPUT_BYTES) return Promise.reject(codedError('heavy'));
    return decode(file).then(toJpeg);
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  var CSS = [
    // Le rond s'aligne en haut, sur le nom : l'en-tête compte jusqu'à quatre lignes.
    '.ordo-photo{position:relative;flex-shrink:0;align-self:flex-start;display:inline-flex;margin:0;padding:0;border:0;border-radius:50%;background:none;cursor:pointer;line-height:0}',
    '.ordo-photo:focus-visible{outline:2px solid var(--primary-500, #3454f6);outline-offset:3px}',
    '.ordo-photo[disabled]{cursor:default}',
    '.ordo-photo-img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:50%}',
    '.ordo-photo-img[hidden]{display:none}',
    '.ordo-photo.is-busy .ordo-photo-img,.ordo-photo.is-busy .compte-v2_avatar{opacity:.5}',
    '.ordo-photo-badge.compte-v2_badge{position:absolute;right:-2px;bottom:-2px;width:24px;height:24px;padding:0;justify-content:center;border-radius:50%}',
    '.ordo-photo-spin{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}',
    '.ordo-photo-spin[hidden]{display:none}',
    '@keyframes ordo-photo-spin{to{transform:rotate(360deg)}}',
    '.ordo-photo-spin{animation:ordo-photo-spin 1s linear infinite}',
    '@media (prefers-reduced-motion:reduce){.ordo-photo-spin{animation:none}}',
    '.ordo-photo-actions{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;margin-top:4px;font-size:14px;line-height:1.5}',
    '.ordo-photo-link{margin:0;padding:0;border:0;background:none;font:inherit;font-weight:600;text-align:left;cursor:pointer}',
    '.ordo-photo-link[hidden],.ordo-photo-actions .compte-v2_hint[hidden]{display:none}',
    '.ordo-photo-retirer.compte-v2_lien{color:var(--neutral-500, #47505c)}',
    '.ordo-photo-status{font-size:14px;line-height:1.5;color:var(--neutral-500, #47505c)}',
    '.ordo-photo-status:empty{display:none}',
    '.ordo-photo-status.is-error{color:var(--error-700, #ba1b1b)}',
    '@media (max-width:767px){.ordo-photo-badge.compte-v2_badge{width:22px;height:22px;right:-4px;bottom:-4px}.ordo-photo-link{display:inline-flex;align-items:center;min-height:44px}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('ordo-photo-styles')) return;
    var style = el('style');
    style.id = 'ordo-photo-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(width, viewBox, children) {
    var node = document.createElementNS(SVG_NS, 'svg');
    node.setAttribute('width', String(width));
    node.setAttribute('height', String(width));
    node.setAttribute('viewBox', viewBox);
    node.setAttribute('aria-hidden', 'true');
    children.forEach(function(c) {
      var child = document.createElementNS(SVG_NS, c[0]);
      for (var k in c[1]) {
        if (Object.prototype.hasOwnProperty.call(c[1], k)) child.setAttribute(k, c[1][k]);
      }
      node.appendChild(child);
    });
    return node;
  }

  function cameraIcon() {
    var stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    function withStroke(extra) {
      var o = {};
      for (var k in stroke) o[k] = stroke[k];
      for (var j in extra) o[j] = extra[j];
      return o;
    }
    return svg(14, '0 0 24 24', [
      ['path', withStroke({ d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' })],
      ['circle', withStroke({ cx: '12', cy: '13', r: '4' })]
    ]);
  }

  function spinner() {
    var node = svg(64, '0 0 64 64', [
      ['circle', { cx: '32', cy: '32', r: '30', fill: 'none', stroke: 'var(--primary-100, #d6dffe)', 'stroke-width': '3' }],
      ['path', { d: 'M32 2a30 30 0 0 1 30 30', fill: 'none', stroke: 'var(--primary-500, #3454f6)', 'stroke-width': '3', 'stroke-linecap': 'round' }]
    ]);
    node.setAttribute('class', 'ordo-photo-spin');
    node.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return node;
  }

  var trigger = button('ordo-photo');
  var img = el('img', 'ordo-photo-img');
  img.alt = '';
  img.hidden = true;
  var badge = el('span', 'compte-v2_badge ordo-photo-badge');
  badge.appendChild(cameraIcon());
  var spin = spinner();
  spin.setAttribute('hidden', '');

  var input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');

  var actions = el('div', 'ordo-photo-actions');
  var change = button('compte-v2_lien ordo-photo-link', 'Ajouter une photo');
  var remove = button('compte-v2_lien ordo-photo-link ordo-photo-retirer', 'Retirer');
  var hint = el('span', 'compte-v2_hint', 'Une photo de vous, cadrée sur le visage.');
  actions.appendChild(change);
  actions.appendChild(remove);
  actions.appendChild(hint);

  var status = el('div', 'ordo-photo-status');
  status.setAttribute('aria-live', 'polite');

  var busy = false;
  var broken = '';

  function setStatus(message, isError) {
    status.textContent = message || '';
    status.classList.toggle('is-error', !!isError);
    if (isError) status.setAttribute('role', 'alert');
    else status.removeAttribute('role');
  }

  function setBusy(on) {
    busy = on;
    trigger.disabled = on;
    change.disabled = on;
    remove.disabled = on;
    trigger.classList.toggle('is-busy', on);
    if (on) spin.removeAttribute('hidden');
    else spin.setAttribute('hidden', '');
  }

  function render() {
    var url = shownPhoto(member.profileImage);
    if (url && url === broken) url = '';
    if (url) {
      if (img.getAttribute('src') !== url) img.src = url;
      img.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
    }
    change.textContent = url ? 'Changer la photo' : 'Ajouter une photo';
    remove.hidden = !url;
    hint.hidden = !!url;
    trigger.setAttribute('aria-label', url ? 'Changer la photo de profil' : 'Ajouter une photo de profil');
  }

  // Image introuvable (adresse périmée) : les initiales reviennent, sans message au membre.
  img.addEventListener('error', function() {
    var src = img.getAttribute('src');
    if (!src) return;
    broken = src;
    track('image-error');
    render();
  });

  function messageFor(err) {
    var code = err && err.code;
    if (code === 'read' || code === 'invalid-file-type') return { key: 'read', text: MESSAGES.read };
    if (code === 'heavy' || code === 'file-size-too-large') return { key: 'heavy', text: MESSAGES.heavy };
    if (code === 'no-sdk') return { key: 'unavailable', text: MESSAGES.unavailable };
    if (err && (err.status === 401 || code === 'not-logged-in' || code === 'no-member')) return { key: 'session', text: MESSAGES.session };
    if (err && err.name === 'TypeError') return { key: 'network', text: MESSAGES.network };
    return { key: 'failed', text: MESSAGES.failed };
  }

  function sdk() {
    return waitForMemberstack().then(function(ms) {
      if (!ms || typeof ms.updateMemberProfileImage !== 'function') throw codedError('no-sdk');
      return ms;
    });
  }

  function saved(url) {
    member.profileImage = url;
    var shared = window.OrdoMemberstack && window.OrdoMemberstack.member;
    if (shared && shared !== member) shared.profileImage = url;
    patchSnapshot(url);
    broken = '';
    render();
    try {
      document.dispatchEvent(new CustomEvent('ordo:member-updated', { detail: { source: 'profile-photo' } }));
    } catch (e) { /* no-op */ }
  }

  function onFile(file) {
    if (!file || busy) return;
    setStatus('Enregistrement de la photo…');
    setBusy(true);
    track('upload');
    prepare(file).then(function(blob) {
      return sdk().then(function(ms) {
        var jpeg = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        return ms.updateMemberProfileImage({ profileImage: jpeg });
      });
    }).then(function(res) {
      var url = res && res.data && res.data.profileImage;
      if (!url) throw codedError('no-url', 'no profileImage in response');
      saved(url);
      setStatus('');
      track('saved');
      console.log(PREFIX, 'Saved', 'bytes~' + Math.round(file.size / 1024) + 'k');
    }).catch(function(err) {
      var m = messageFor(err);
      setStatus(m.text, true);
      track('error-' + m.key);
      if (m.key === 'network') report('ProfilePhoto.upload', err, true);
      else if (m.key === 'failed' || m.key === 'unavailable') report('ProfilePhoto.upload', err);
    }).then(function() {
      setBusy(false);
    });
  }

  function onRemove() {
    if (busy) return;
    setStatus('');
    setBusy(true);
    track('remove');
    sdk().then(function(ms) {
      return ms.updateMemberProfileImage({ profileImage: null });
    }).then(function() {
      saved(null);
      setStatus('Photo retirée.');
      track('removed');
    }).catch(function(err) {
      var m = messageFor(err);
      setStatus(m.key === 'failed' ? MESSAGES.removeFailed : m.text, true);
      track('error-' + m.key);
      if (m.key === 'network') report('ProfilePhoto.remove', err, true);
      else if (m.key === 'failed' || m.key === 'unavailable') report('ProfilePhoto.remove', err);
    }).then(function() {
      setBusy(false);
      // Le focus reste dans l'en-tête : le bouton « Retirer » vient de disparaître.
      try { change.focus(); } catch (e) { /* no-op */ }
    });
  }

  function choose() {
    if (busy) return;
    track('open');
    input.value = '';
    input.click();
  }

  // --- Init --------------------------------------------------------------------------------------

  function init() {
    injectStyles();
    avatar.parentNode.insertBefore(trigger, avatar);
    trigger.appendChild(avatar);
    trigger.appendChild(img);
    trigger.appendChild(spin);
    trigger.appendChild(badge);
    // Hors de tout formulaire : un champ fichier `required` ou non bloquerait l'envoi d'un formulaire Webflow.
    textCol.appendChild(actions);
    textCol.appendChild(status);
    textCol.appendChild(input);
    trigger.addEventListener('click', choose);
    change.addEventListener('click', choose);
    remove.addEventListener('click', onRemove);
    input.addEventListener('change', function() {
      onFile(input.files && input.files[0]);
    });
    render();
    track(shownPhoto(member.profileImage) ? 'shown-photo' : 'shown');
    console.log(PREFIX, 'Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.OrdoProfilePhoto = { cropBox: cropBox, shownPhoto: shownPhoto };
})();
