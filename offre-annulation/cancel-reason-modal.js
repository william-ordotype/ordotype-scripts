/**
 * Ordotype - Motif de départ (popup /membership/offre-annulation)
 *
 * Ouvre une fenêtre modale qui demande POURQUOI le membre s'en va, avant de
 * lui donner accès à la grille d'offres de rétention. Au moins un motif doit
 * être coché : le bouton reste désactivé et affiche une alerte tant que rien
 * n'est sélectionné. Une fois le motif validé, la modale se referme, la grille
 * s'ouvre et le membre fait ce qu'il veut (offre 50 %, pause ou résiliation).
 *
 * Le motif part vers l'onglet "Motifs formulaire" du GSheet
 * "Motifs désinscriptions" (fonction Netlify cancel-reason) et se retrouve
 * aussi en champs cachés des trois formulaires de la page, pour que Make
 * puisse le mapper le jour où on le voudra.
 *
 * Rien ici ne peut bloquer une résiliation : l'écriture est en "fire and
 * forget", et un échec réseau ferme quand même la modale.
 *
 * Aucun élément à ajouter dans Webflow : la modale est construite ici.
 * Chargé par offre-annulation/loader.js, en tête de file (la grille reste
 * masquée tant que ce script n'a pas répondu).
 *
 * ES2019 max (parc Chrome 78 / Safari 13, cf. eslint.config.js).
 */
(function () {
    'use strict';

    var PREFIX = '[CancelReason]';
    var ENDPOINT = 'https://webhooks.ordotype.fr/.netlify/functions/cancel-reason';
    var STORAGE_KEY = 'ordo_cancel_reason';
    var ACCOUNT_URL = '/membership/compte';

    /**
     * 'cancel' : la modale s'intercale au clic sur « annuler mon abonnement »
     *            (choix de William le 27/08/2026). On ne capte donc que le
     *            motif de ceux qui résilient vraiment : une ligne par
     *            résiliation, qui se recoupe avec l'onglet Désinscription.
     *            La grille étant déjà sous les yeux du membre, la modale est
     *            refermable — revenir en arrière n'est pas contourner la
     *            question, c'est renoncer à résilier.
     * 'load'    : la modale s'ouvre à l'arrivée sur la page et garde la grille
     *            d'offres tant qu'aucun motif n'est coché. On capte alors le
     *            motif de tout le monde, y compris de ceux qui acceptent les
     *            -50 % ou la pause, et il n'y a pas de sortie sans répondre.
     */
    var TRIGGER = 'cancel';

    // Les libellés font foi côté serveur : le navigateur n'envoie que les codes,
    // la fonction Netlify réécrit les libellés depuis sa propre table. Toucher
    // à un code ici oblige donc à le faire aussi dans cancel-reason.mjs.
    var REASONS = [
        { code: 'prix', label: 'Le tarif est trop élevé pour moi' },
        { code: 'usage', label: 'Je ne l’utilise pas assez souvent' },
        { code: 'contenu', label: 'Il me manque des contenus ou des fonctionnalités' },
        {
            code: 'suspension',
            label: 'Je suspends mon activité pour un temps',
            hint: 'Congés, remplacement, congé maternité ou parental, arrêt temporaire'
        },
        {
            code: 'exercice',
            label: 'Mon exercice change durablement',
            hint: 'Passage en salariat, retraite, réorientation, fin d’internat'
        },
        { code: 'autre', label: 'Autre', other: true }
    ];

    var MSG_NO_CHOICE = 'Sélectionnez au moins un motif pour continuer.';
    var MSG_OTHER_EMPTY = 'Ajoutez une précision dans le champ « Autre » pour continuer.';

    if (window.__ordoCancelReasonInstalled) return;
    window.__ordoCancelReasonInstalled = true;

    // Reporter quand il est là, canal ErrorEvent du bundle d'auth sinon : les
    // réseaux qui cassent cette page sont ceux qui bloquent aussi le CDN.
    function report(name, detail) {
        try {
            var err = new Error(detail);
            err.name = name;
            if (window.OrdoErrorReporter) {
                window.OrdoErrorReporter.report('CancelReason', err);
                return;
            }
            window.dispatchEvent(new ErrorEvent('error', { message: detail, error: err }));
        } catch (e) {
            // ne jamais lever depuis le chemin de report
        }
    }

    // ---------------------------------------------------------------- membre

    /**
     * OrdoMemberstack quand memberstack-utils.js est déjà passé, lecture
     * directe de `_ms-mem` sinon : ce script est chargé en parallèle des
     * autres pour ouvrir la modale au plus tôt, il ne peut pas attendre.
     */
    function readMember() {
        var ms = window.OrdoMemberstack;
        if (ms && ms.memberId) {
            return {
                memberId: ms.memberId,
                email: ms.email || '',
                stripeCustomerId: ms.stripeCustomerId || '',
                plan: activePlan(ms.planConnections)
            };
        }
        try {
            var raw = localStorage.getItem('_ms-mem');
            var m = raw ? JSON.parse(raw) : null;
            if (!m || typeof m !== 'object') return { memberId: '', email: '', stripeCustomerId: '', plan: '' };
            return {
                memberId: m.id || m.userId || '',
                email: (m.auth && m.auth.email) || m.email || '',
                stripeCustomerId: m.stripeCustomerId || '',
                plan: activePlan(m.planConnections)
            };
        } catch (e) {
            return { memberId: '', email: '', stripeCustomerId: '', plan: '' };
        }
    }

    function activePlan(connections) {
        if (!Array.isArray(connections)) return '';
        for (var i = 0; i < connections.length; i++) {
            var c = connections[i];
            if (c && (c.status === 'ACTIVE' || c.status === 'TRIALING')) return c.planId || '';
        }
        return '';
    }

    // Un rechargement de page ne doit pas reposer la question ni créer une
    // deuxième ligne dans la feuille.
    function answeredKey(memberId) {
        return STORAGE_KEY + ':' + (memberId || 'anon');
    }

    function alreadyAnswered(memberId) {
        try {
            return !!sessionStorage.getItem(answeredKey(memberId));
        } catch (e) {
            return false;
        }
    }

    function markAnswered(memberId, payload) {
        try {
            sessionStorage.setItem(answeredKey(memberId), JSON.stringify({
                codes: payload.codes,
                autre: payload.autre,
                ts: Date.now()
            }));
        } catch (e) {}
    }

    // ----------------------------------------------------------------- styles

    var CSS = [
        '.ordo-reason-lock .page-wrapper{filter:blur(3px);pointer-events:none;user-select:none;-webkit-user-select:none}',
        '.ordo-reason-lock,.ordo-reason-lock body{overflow:hidden}',
        '.ordo-reason-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;',
        'background:rgba(16,24,44,.55);display:flex;align-items:flex-start;justify-content:center;',
        'padding:24px 16px;overflow-y:auto;opacity:0;transition:opacity 200ms ease}',
        '.ordo-reason-backdrop.is-open{opacity:1}',
        '.ordo-reason-dialog{position:relative;margin:auto;width:100%;max-width:560px;background:#fff;border-radius:16px;',
        'box-shadow:0 18px 50px rgba(0,0,0,.25);padding:32px 32px 24px;box-sizing:border-box;',
        'transform:translateY(14px);transition:transform 220ms ease;font-family:inherit;color:#1a2b4a;',
        '-webkit-font-smoothing:antialiased}',
        '.ordo-reason-backdrop.is-open .ordo-reason-dialog{transform:none}',
        // padding-right : garde le titre à l'écart de la croix de fermeture.
        '.ordo-reason-dialog h2{font-size:22px;line-height:1.3;font-weight:700;color:#1a2b4a;margin:0 0 8px;padding-right:34px}',
        '.ordo-reason-intro{font-size:15px;line-height:1.5;color:#666;margin:0 0 22px}',
        '.ordo-reason-fieldset{border:0;margin:0;padding:0}',
        '.ordo-reason-legend{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
        '.ordo-reason-option{display:block;position:relative;border:2px solid #e5e7eb;border-radius:12px;',
        'padding:15px 16px 15px 50px;margin:0 0 10px;cursor:pointer;background:#fff;',
        'transition:border-color 140ms ease,background-color 140ms ease}',
        '.ordo-reason-option:hover{border-color:#c7d6f7;background:#fafbff}',
        '.ordo-reason-option.is-checked{border-color:#2563eb;background:#f8faff}',
        '.ordo-reason-option input{position:absolute;left:18px;top:19px;width:1px;height:1px;opacity:0;margin:0}',
        '.ordo-reason-box{position:absolute;left:17px;top:17px;width:20px;height:20px;border:2px solid #cbd5e1;',
        'border-radius:6px;background:#fff;box-sizing:border-box;transition:border-color 140ms ease,background-color 140ms ease}',
        '.ordo-reason-option.is-checked .ordo-reason-box{border-color:#2563eb;background:#2563eb}',
        '.ordo-reason-box:after{content:"";position:absolute;left:5px;top:1px;width:5px;height:10px;',
        'border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg);opacity:0}',
        '.ordo-reason-option.is-checked .ordo-reason-box:after{opacity:1}',
        '.ordo-reason-option input:focus + .ordo-reason-box{box-shadow:0 0 0 3px rgba(37,99,235,.28)}',
        '.ordo-reason-text{display:block;font-size:15px;font-weight:600;line-height:1.35;color:#1a2b4a}',
        '.ordo-reason-hint{display:block;font-size:13px;line-height:1.45;color:#6b7280;margin-top:4px;font-weight:400}',
        '.ordo-reason-other{display:none;margin:-2px 0 12px}',
        '.ordo-reason-other.is-visible{display:block}',
        '.ordo-reason-other textarea{width:100%;box-sizing:border-box;min-height:86px;border:2px solid #e5e7eb;',
        'border-radius:10px;padding:12px 14px;font-family:inherit;font-size:14px;line-height:1.45;color:#1a2b4a;resize:vertical}',
        '.ordo-reason-other textarea:focus{outline:none;border-color:#2563eb}',
        '.ordo-reason-alert{display:none;margin:0 0 14px;padding:11px 14px;border-radius:10px;background:#fef2f2;',
        'border:1px solid #fecaca;color:#991b1b;font-size:14px;line-height:1.45}',
        '.ordo-reason-alert.is-visible{display:block}',
        '.ordo-reason-submit{display:block;width:100%;padding:14px;border:0;border-radius:10px;background:#2563eb;',
        'color:#fff;font-family:inherit;font-size:15px;font-weight:600;line-height:1.2;cursor:pointer;',
        'transition:background-color 140ms ease}',
        '.ordo-reason-submit:hover{background:#1d4ed8}',
        '.ordo-reason-submit[aria-disabled="true"]{background:#e9eaee;color:#9ca3af;cursor:not-allowed}',
        '.ordo-reason-submit.is-shaking{animation:ordoReasonShake 320ms ease}',
        '@keyframes ordoReasonShake{10%,90%{transform:translateX(-2px)}30%,70%{transform:translateX(4px)}',
        '50%{transform:translateX(-4px)}100%{transform:none}}',
        '.ordo-reason-escape{display:block;text-align:center;margin:16px 0 0;font-size:13px;color:#9ca3af}',
        '.ordo-reason-escape a,.ordo-reason-escape button{color:#9ca3af;text-decoration:underline;background:none;',
        'border:0;padding:0;font-family:inherit;font-size:13px;cursor:pointer}',
        '.ordo-reason-escape a:hover,.ordo-reason-escape button:hover{color:#6b7280}',
        '.ordo-reason-close{position:absolute;top:14px;right:14px;width:34px;height:34px;border:0;border-radius:50%;',
        'background:none;color:#9ca3af;font-size:22px;line-height:1;cursor:pointer;font-family:inherit;',
        'transition:background-color 140ms ease,color 140ms ease}',
        '.ordo-reason-close:hover{background:#f3f4f6;color:#4b5563}',
        '@media (max-width:640px){.ordo-reason-backdrop{padding:12px}',
        '.ordo-reason-dialog{padding:24px 20px 20px;border-radius:14px}',
        '.ordo-reason-dialog h2{font-size:19px}.ordo-reason-intro{font-size:14px;margin-bottom:18px}}',
        '@media (prefers-reduced-motion:reduce){.ordo-reason-backdrop,.ordo-reason-dialog{transition:none}',
        '.ordo-reason-submit.is-shaking{animation:none}}'
    ].join('');

    function injectStyles() {
        if (document.getElementById('ordo-reason-styles')) return;
        var style = document.createElement('style');
        style.id = 'ordo-reason-styles';
        style.appendChild(document.createTextNode(CSS));
        (document.head || document.documentElement).appendChild(style);
    }

    // ------------------------------------------------------------------ vue

    var els = {};
    var lastFocus = null;
    var submitting = false;
    var onValidated = null;

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.appendChild(document.createTextNode(text));
        return node;
    }

    /** En mode 'cancel' la grille est déjà là : refermer, c'est y retourner. */
    function dismissible() {
        return TRIGGER === 'cancel';
    }

    function buildDialog(submitLabel) {
        var backdrop = el('div', 'ordo-reason-backdrop');
        backdrop.setAttribute('role', 'presentation');
        if (dismissible()) {
            backdrop.addEventListener('click', function (event) {
                if (event.target === backdrop) dismiss();
            });
        }

        var dialog = el('div', 'ordo-reason-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'ordo-reason-title');
        dialog.setAttribute('aria-describedby', 'ordo-reason-intro');

        if (dismissible()) {
            var closeBtn = el('button', 'ordo-reason-close', '×');
            closeBtn.type = 'button';
            closeBtn.setAttribute('aria-label', 'Fermer et revenir aux offres');
            closeBtn.addEventListener('click', dismiss);
            dialog.appendChild(closeBtn);
        }

        var title = el('h2', null, 'Avant de partir, dites-nous pourquoi');
        title.id = 'ordo-reason-title';
        dialog.appendChild(title);

        var intro = el('p', 'ordo-reason-intro',
            'Votre réponse nous aide à améliorer Ordotype. Plusieurs choix possibles.');
        intro.id = 'ordo-reason-intro';
        dialog.appendChild(intro);

        var fieldset = el('fieldset', 'ordo-reason-fieldset');
        var legend = el('legend', 'ordo-reason-legend', 'Motif de départ');
        fieldset.appendChild(legend);

        els.inputs = [];
        REASONS.forEach(function (reason, index) {
            // <label> englobant, sans attribut `for` : avec les deux, certains
            // navigateurs comptent le clic deux fois et la case se re-décoche.
            var option = el('label', 'ordo-reason-option');

            var input = document.createElement('input');
            input.type = 'checkbox';
            input.id = 'ordo-reason-' + reason.code;
            input.value = reason.code;
            input.setAttribute('data-index', String(index));
            option.appendChild(input);
            option.appendChild(el('span', 'ordo-reason-box'));
            option.appendChild(el('span', 'ordo-reason-text', reason.label));
            if (reason.hint) option.appendChild(el('span', 'ordo-reason-hint', reason.hint));

            input.addEventListener('change', function () {
                option.className = 'ordo-reason-option' + (input.checked ? ' is-checked' : '');
                if (reason.other) toggleOtherField(input.checked);
                refreshSubmitState();
                hideAlert();
            });

            els.inputs.push(input);
            fieldset.appendChild(option);
        });
        dialog.appendChild(fieldset);

        var otherWrap = el('div', 'ordo-reason-other');
        var textarea = document.createElement('textarea');
        textarea.id = 'ordo-reason-other-text';
        textarea.rows = 3;
        textarea.maxLength = 500;
        textarea.placeholder = 'Dites-nous en quelques mots…';
        textarea.setAttribute('aria-label', 'Précisez votre motif');
        textarea.addEventListener('input', function () {
            hideAlert();
            refreshSubmitState();
        });
        otherWrap.appendChild(textarea);
        dialog.appendChild(otherWrap);
        els.otherWrap = otherWrap;
        els.textarea = textarea;

        var alert = el('div', 'ordo-reason-alert');
        alert.setAttribute('role', 'alert');
        dialog.appendChild(alert);
        els.alert = alert;

        // Volontairement pas `disabled` : un bouton désactivé n'émet aucun
        // clic, donc le membre qui insiste n'obtiendrait aucune explication.
        // aria-disabled donne le même sens aux lecteurs d'écran, et le clic
        // reste capté pour afficher l'alerte.
        var submit = el('button', 'ordo-reason-submit', submitLabel);
        submit.type = 'button';
        submit.setAttribute('aria-disabled', 'true');
        submit.addEventListener('click', handleSubmitClick);
        dialog.appendChild(submit);
        els.submit = submit;

        var escape = el('p', 'ordo-reason-escape');
        if (dismissible()) {
            var back = el('button', null, 'Revenir en arrière');
            back.type = 'button';
            back.addEventListener('click', dismiss);
            escape.appendChild(back);
        } else {
            var link = el('a', null, 'Revenir à mon compte');
            link.href = ACCOUNT_URL;
            escape.appendChild(link);
        }
        dialog.appendChild(escape);

        backdrop.appendChild(dialog);
        els.backdrop = backdrop;
        els.dialog = dialog;
        return backdrop;
    }

    function toggleOtherField(visible) {
        els.otherWrap.className = 'ordo-reason-other' + (visible ? ' is-visible' : '');
        if (visible) {
            try { els.textarea.focus(); } catch (e) {}
        }
    }

    function checkedCodes() {
        var codes = [];
        els.inputs.forEach(function (input) {
            if (input.checked) codes.push(input.value);
        });
        return codes;
    }

    function otherText() {
        return (els.textarea.value || '').trim();
    }

    function refreshSubmitState() {
        els.submit.setAttribute('aria-disabled', validate() ? 'false' : 'true');
    }

    /** true quand le formulaire est envoyable. */
    function validate() {
        var codes = checkedCodes();
        if (!codes.length) return false;
        // « Autre » seul et sans texte ne dit rien : on demande la précision.
        if (codes.length === 1 && codes[0] === 'autre' && !otherText()) return false;
        return true;
    }

    function showAlert(message) {
        els.alert.textContent = message;
        els.alert.className = 'ordo-reason-alert is-visible';
    }

    function hideAlert() {
        els.alert.className = 'ordo-reason-alert';
    }

    function shake() {
        els.submit.className = 'ordo-reason-submit';
        // Forcer un reflow pour rejouer l'animation sur un second clic.
        void els.submit.offsetWidth;
        els.submit.className = 'ordo-reason-submit is-shaking';
    }

    function handleSubmitClick() {
        if (submitting) return;
        if (!validate()) {
            var codes = checkedCodes();
            showAlert(codes.length ? MSG_OTHER_EMPTY : MSG_NO_CHOICE);
            shake();
            try {
                if (codes.length) els.textarea.focus();
                else els.inputs[0].focus();
            } catch (e) {}
            return;
        }
        submitting = true;
        hideAlert();
        finish();
    }

    // --------------------------------------------------------- ouvrir/fermer

    function onKeydown(event) {
        if (dismissible() && (event.key === 'Escape' || event.keyCode === 27)) {
            dismiss();
            return;
        }
        trapFocus(event);
    }

    function trapFocus(event) {
        if (event.key !== 'Tab' && event.keyCode !== 9) return;
        var focusables = els.dialog.querySelectorAll('input,textarea,button,a[href]');
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function open() {
        injectStyles();
        // Le libellé doit dire ce que le bouton fait vraiment : en mode
        // 'cancel', il relance la résiliation dans la foulée.
        var label = dismissible() ? 'Confirmer la résiliation' : 'Voir mes options';
        var backdrop = buildDialog(label);
        submitting = false;
        lastFocus = document.activeElement;
        document.body.appendChild(backdrop);
        document.documentElement.className += ' ordo-reason-lock';
        document.addEventListener('keydown', onKeydown, true);
        // Laisser un tick au navigateur pour poser l'état initial de la
        // transition, sinon l'ouverture est sèche.
        window.setTimeout(function () {
            backdrop.className = 'ordo-reason-backdrop is-open';
            try { els.inputs[0].focus(); } catch (e) {}
        }, 20);
        console.log(PREFIX, 'Modal opened (trigger: ' + TRIGGER + ')');
    }

    /**
     * Fermeture SANS réponse : le membre renonce à résilier et retrouve la
     * grille. Rien n'est enregistré, la question se reposera au prochain clic.
     */
    function dismiss() {
        if (submitting) return;
        onValidated = null;
        close();
        console.log(PREFIX, 'Dismissed, subscription untouched');
    }

    function close() {
        document.removeEventListener('keydown', onKeydown, true);
        var backdrop = els.backdrop;
        var html = document.documentElement;
        html.className = html.className.replace(/\s*\bordo-reason-lock\b/g, '');
        if (backdrop) {
            backdrop.className = 'ordo-reason-backdrop';
            window.setTimeout(function () {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
            }, 240);
        }
        if (lastFocus && lastFocus.focus) {
            try { lastFocus.focus(); } catch (e) {}
        }
    }

    // ------------------------------------------------------------- envoi

    function labelsFor(codes) {
        return codes.map(function (code) {
            for (var i = 0; i < REASONS.length; i++) {
                if (REASONS[i].code === code) return REASONS[i].label;
            }
            return code;
        });
    }

    /**
     * Recopie le motif en champs cachés des trois formulaires de la page.
     * Make ignore les champs qu'il ne connaît pas : rien ne casse tant que la
     * structure du webhook n'est pas re-déterminée, et le jour où on veut le
     * motif dans l'onglet Désinscription, il est déjà dans le payload.
     */
    function stampForms(payload) {
        ['cancel-form', 'redeem-form', 'pause-form'].forEach(function (id) {
            var form = document.getElementById(id);
            if (!form) return;
            setHidden(form, 'cancelReasonCodes', payload.codes.join(','));
            setHidden(form, 'cancelReasonLabels', labelsFor(payload.codes).join(' | '));
            setHidden(form, 'cancelReasonOther', payload.autre);
        });
    }

    function setHidden(form, name, value) {
        var input = form.querySelector('input[name="' + name + '"]');
        if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            form.appendChild(input);
        }
        input.value = value;
    }

    function track(payload) {
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                event: 'churn_reason_submitted',
                reason_codes: payload.codes.join(','),
                reason_has_other: payload.autre ? 'yes' : 'no',
                member_id: payload.memberId || null,
                plan: payload.plan || null,
                page_location: window.location.href
            });
        } catch (e) {}
    }

    /**
     * Requête "simple" au sens CORS (text/plain) : pas de préflight, donc pas
     * de tour de réseau supplémentaire avant l'ouverture de la grille.
     * sendBeacon en secours, pour les navigateurs où fetch est absent ou
     * refusé par une extension.
     */
    function send(payload) {
        var body = JSON.stringify(payload);
        if (typeof window.fetch === 'function') {
            window.fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: body,
                keepalive: true,
                mode: 'cors'
            }).then(function (res) {
                if (!res.ok) report('CancelReasonWriteFailed', 'sheet write answered ' + res.status);
                else console.log(PREFIX, 'Reason recorded');
            }).catch(function (err) {
                if (!beacon(body)) report('CancelReasonWriteFailed', (err && err.message) || String(err));
            });
            return;
        }
        if (!beacon(body)) report('CancelReasonWriteFailed', 'no transport available');
    }

    function beacon(body) {
        try {
            if (!navigator.sendBeacon) return false;
            return navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
        } catch (e) {
            return false;
        }
    }

    /** Motif validé : on enregistre, on ouvre la grille, on ne bloque personne. */
    function finish() {
        var member = readMember();
        var codes = checkedCodes();
        var payload = {
            codes: codes,
            autre: otherText(),
            memberId: member.memberId,
            email: member.email,
            stripeCustomerId: member.stripeCustomerId,
            plan: member.plan,
            page: window.location.pathname
        };

        markAnswered(member.memberId, payload);
        try { stampForms(payload); } catch (e) { report('CancelReasonStampFailed', (e && e.message) || String(e)); }
        track(payload);
        send(payload);

        close();
        if (onValidated) {
            var next = onValidated;
            onValidated = null;
            window.setTimeout(next, 260);
        }
    }

    // --------------------------------------------------- déclenchement

    /**
     * Mode 'cancel' : la modale s'intercale entre le clic « annuler mon
     * abonnement » et redeem-cancel-forms.js. Écoute en capture et coupe la
     * propagation pour passer avant lui, puis relance la soumission une fois
     * le motif donné.
     */
    function armCancelInterception() {
        var form = document.getElementById('cancel-form');
        if (!form) {
            report('CancelReasonNoForm', 'no #cancel-form on ' + window.location.pathname);
            return;
        }
        var passthrough = false;
        form.addEventListener('submit', function (event) {
            if (passthrough) return;
            var member = readMember();
            if (alreadyAnswered(member.memberId)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onValidated = function () {
                passthrough = true;
                if (form.requestSubmit) form.requestSubmit();
                else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            };
            open();
        }, true);
        console.log(PREFIX, 'Armed on #cancel-form');
    }

    function start() {
        if (TRIGGER === 'cancel') {
            armCancelInterception();
            return;
        }
        if (alreadyAnswered(readMember().memberId)) {
            console.log(PREFIX, 'Reason already given this session, grid stays open');
            return;
        }
        open();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
