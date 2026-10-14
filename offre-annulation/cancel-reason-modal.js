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
     *            refermable : revenir en arrière n'est pas contourner la
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

    var MSG_NO_CHOICE = 'Sélectionnez au moins un motif pour résilier votre abonnement.';
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

    /**
     * Mise en page seulement : le fond, la fenêtre, les cases, le champ et les
     * boutons portent les classes du site (fond `section_view compte-modal` de
     * la fenêtre de résiliation de Mon compte, fenêtre `view_wrapper
     * sauvegarder-ordonnance` de Mes documents, cases `checkbox-ins` de
     * l'inscription, `form_input is-champ`, `button`, `form_link`). Aucune
     * couleur, ombre ni rayon propre au script.
     */
    var CROSS_ICON = 'https://cdn.prod.website-files.com/604b9ac88b080efc7ce802bd/6409a60abee24b0929f62f72_cross.svg';

    var CSS = [
        '.ordo-reason-lock,.ordo-reason-lock body{overflow:hidden}',
        // Page floutée derrière le fond : sur mobile, la carte d'offre a presque
        // la taille de la fenêtre et son bord dessinait un double cadre.
        '.ordo-reason-lock .page-wrapper{filter:blur(3px);pointer-events:none;user-select:none;-webkit-user-select:none}',
        // Au-dessus de la barre de navigation, et défilable quand la fenêtre
        // dépasse l'écran : les marges automatiques la centrent tant qu'elle
        // tient, sans couper le haut quand elle déborde.
        '.ordo-reason-backdrop.compte-modal{z-index:10000;align-items:flex-start;overflow-y:auto;',
        'padding-top:24px;padding-bottom:24px}',
        '.ordo-reason-dialog.sauvegarder-ordonnance{flex:none;margin-top:auto;margin-bottom:auto}',
        // Les boutons suivent le contenu (pas de pied en position absolue).
        '.inputs_wrapper.ordo-reason-body{padding-bottom:0}',
        '.checkbox_form.ordo-reason-option{margin-bottom:12px}',
        '.ordo-reason-hint{display:block}',
        '.form_link.ordo-reason-escape{background:none;border:0;padding:0;cursor:pointer}'
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
        var backdrop = el('div', 'section_view compte-modal ordo-reason-backdrop');
        backdrop.setAttribute('role', 'presentation');
        if (dismissible()) {
            backdrop.addEventListener('click', function (event) {
                if (event.target === backdrop) dismiss();
            });
        }

        var dialog = el('div', 'view_wrapper sauvegarder-ordonnance ordo-reason-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'ordo-reason-title');
        dialog.setAttribute('aria-describedby', 'ordo-reason-intro');

        // En-tête des fenêtres de Mes documents : titre centré, filet, croix.
        var header = el('div', 'header_holder');
        var inner = el('div', 'inner_header');
        var title = el('div', 'display-inlineflex text_space', 'Dernière étape avant la résiliation');
        title.id = 'ordo-reason-title';
        inner.appendChild(title);
        if (dismissible()) {
            // La croix du site est une image : rôle et clavier pour qu'elle
            // reste un vrai bouton.
            var closeBtn = document.createElement('img');
            closeBtn.className = 'close_icon is_corner';
            closeBtn.src = CROSS_ICON;
            closeBtn.alt = 'Fermer sans résilier';
            closeBtn.setAttribute('role', 'button');
            closeBtn.setAttribute('tabindex', '0');
            closeBtn.addEventListener('click', dismiss);
            closeBtn.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    dismiss();
                }
            });
            inner.appendChild(closeBtn);
        }
        header.appendChild(inner);
        dialog.appendChild(header);

        var body = el('div', 'inputs_wrapper ordo-reason-body');

        // Le membre vient de cliquer sur « annuler mon abonnement » : il croit
        // en avoir fini. Le premier mot doit être que non, et que sa réponse est
        // ce qui déclenche la résiliation, pas une enquête qu'on peut ignorer.
        var intro = el('p', 'text-size-regular margin-bottom-3');
        intro.appendChild(el('strong', null, 'Votre abonnement n\u2019est pas encore résilié.'));
        intro.appendChild(document.createTextNode(
            ' Dites-nous ce qui vous fait partir, puis confirmez '));
        // Pas de coupure au trait d'union de « ci-dessous ».
        var below = el('span', null, 'ci-dessous.');
        below.style.whiteSpace = 'nowrap';
        intro.appendChild(below);
        intro.id = 'ordo-reason-intro';
        body.appendChild(intro);

        var fieldset = el('fieldset');
        // Légende visible, et pas seulement pour les lecteurs d'écran : c'est
        // elle qui dit que la question n'est pas facultative.
        var legend = el('legend', 'action_field_label', 'Pourquoi partez-vous ?');
        legend.appendChild(el('span', 'text-weight-normal text-color-base-600', ' (obligatoire)'));
        fieldset.appendChild(legend);

        els.inputs = [];
        REASONS.forEach(function (reason, index) {
            // Case à cocher de l'inscription : <label> englobant (sans `for`,
            // sinon certains navigateurs comptent le clic deux fois), case
            // dessinée `checkbox-ins`, vraie case invisible pour le clavier.
            var option = el('label', 'w-checkbox checkbox_form ordo-reason-option');
            var box = el('div', 'w-checkbox-input w-checkbox-input--inputType-custom checkbox-ins');
            option.appendChild(box);

            var input = document.createElement('input');
            input.type = 'checkbox';
            input.id = 'ordo-reason-' + reason.code;
            input.value = reason.code;
            input.setAttribute('data-index', String(index));
            input.style.cssText = 'opacity:0;position:absolute;z-index:-1';
            option.appendChild(input);

            var text = el('span', 'w-form-label text-size-regular', reason.label);
            if (reason.hint) text.appendChild(el('span', 'ordo-reason-hint text-size-small text-color-base-600', reason.hint));
            option.appendChild(text);

            // État posé, pas basculé : webflow.js ne gère ces cases que dans
            // un formulaire Webflow, et un double basculement les inverserait.
            input.addEventListener('change', function () {
                setClass(box, 'w--redirected-checked', input.checked);
                if (reason.other) toggleOtherField(input.checked);
                refreshSubmitState();
                hideAlert();
            });
            // Halo de focus au clavier seulement : la fenêtre place le focus sur
            // la première case à l'ouverture, ce n'est pas un choix du membre.
            input.addEventListener('focus', function () { setClass(box, 'w--redirected-focus', focusVisible(input)); });
            input.addEventListener('blur', function () { setClass(box, 'w--redirected-focus', false); });

            els.inputs.push(input);
            fieldset.appendChild(option);
        });
        body.appendChild(fieldset);

        var otherWrap = el('div');
        otherWrap.style.display = 'none';
        var textarea = document.createElement('textarea');
        textarea.className = 'form_input is-champ is-text-area';
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
        body.appendChild(otherWrap);
        els.otherWrap = otherWrap;
        els.textarea = textarea;

        var alert = el('div', 'text-size-small text-color-error');
        alert.setAttribute('role', 'alert');
        alert.style.display = 'none';
        body.appendChild(alert);
        els.alert = alert;

        // Volontairement pas `disabled` : un bouton désactivé n'émet aucun
        // clic, donc le membre qui insiste n'obtiendrait aucune explication.
        // aria-disabled donne le même sens aux lecteurs d'écran, et le clic
        // reste capté pour afficher l'alerte.
        var actions = el('div', 'margin-top margin-small');
        var submit = el('button', 'button', submitLabel);
        submit.type = 'button';
        submit.setAttribute('aria-disabled', 'true');
        submit.addEventListener('click', handleSubmitClick);
        actions.appendChild(submit);
        els.submit = submit;

        var escape = el('div', 'text-align-center margin-top margin-small');
        if (dismissible()) {
            var back = el('button', 'form_link ordo-reason-escape', 'Finalement, je ne résilie pas');
            back.type = 'button';
            back.addEventListener('click', dismiss);
            escape.appendChild(back);
        } else {
            var link = el('a', 'form_link', 'Revenir à mon compte');
            link.href = ACCOUNT_URL;
            escape.appendChild(link);
        }
        actions.appendChild(escape);
        body.appendChild(actions);

        dialog.appendChild(body);
        backdrop.appendChild(dialog);
        els.backdrop = backdrop;
        els.dialog = dialog;
        return backdrop;
    }

    function focusVisible(node) {
        try {
            return node.matches(':focus-visible');
        } catch (e) {
            return true;
        }
    }

    function setClass(node, name, on) {
        var classes = (' ' + node.className + ' ').replace(' ' + name + ' ', ' ');
        node.className = (classes + (on ? name : '')).replace(/\s+/g, ' ').trim();
    }

    function toggleOtherField(visible) {
        els.otherWrap.style.display = visible ? 'block' : 'none';
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
        els.alert.style.display = 'block';
    }

    function hideAlert() {
        els.alert.style.display = 'none';
    }

    function handleSubmitClick() {
        if (submitting) return;
        if (!validate()) {
            var codes = checkedCodes();
            showAlert(codes.length ? MSG_OTHER_EMPTY : MSG_NO_CHOICE);
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
        var focusables = els.dialog.querySelectorAll('[role="button"],input,textarea,button,a[href]');
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
        try { els.inputs[0].focus(); } catch (e) {}
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
        if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
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
     * Une seule livraison, quoi qu'il arrive.
     *
     * La version précédente envoyait un `fetch(keepalive)` et retombait sur
     * `sendBeacon` dans le `.catch`, ce qui a produit deux lignes identiques
     * dans la feuille le 27/08/2026. Avec `keepalive`, quand la page se ferme
     * pendant la requête (et ici elle se ferme : la résiliation repart juste
     * après et redirige), le navigateur LIVRE quand même la requête mais
     * rejette la promesse côté JS. Le secours partait donc sur une requête
     * déjà arrivée.
     *
     * `sendBeacon` est fait exactement pour ce cas : le navigateur prend le
     * corps en charge, le livre une fois, et survit à la navigation. Son
     * `false` est synchrone et fiable (file pleine, corps trop gros), donc le
     * repli sur `fetch` ne peut pas faire doublon. On perd la lecture du code
     * de réponse : les échecs se voient côté fonction, dans Sentry.
     */
    var sent = false;

    function send(payload) {
        if (sent) return;
        sent = true;
        var body = JSON.stringify(payload);
        if (beacon(body)) {
            console.log(PREFIX, 'Reason queued');
            return;
        }
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
                report('CancelReasonWriteFailed', (err && err.message) || String(err));
            });
            return;
        }
        report('CancelReasonWriteFailed', 'no transport available');
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
