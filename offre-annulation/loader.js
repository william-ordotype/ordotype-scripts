/**
 * Ordotype Offre Annulation - Loader
 * Loads all scripts in correct order for the cancellation retention offer page.
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/offre-annulation/loader.js"></script>
 */
(function() {
    'use strict';

    const PREFIX = '[OrdoOffreAnnulation]';

    // Auto-detect loader's own commit/ref so sub-scripts load from the same
    // pinned version (sidesteps stale jsDelivr @main caches).
    function detectVersion() {
        const list = document.getElementsByTagName('script');
        for (let i = 0; i < list.length; i++) {
            const src = list[i].src || '';
            if (src.indexOf('/offre-annulation/loader.js') === -1) continue;
            const m = src.match(/ordotype-scripts@([^\/]+)\//);
            if (m) return m[1];
        }
        return 'main';
    }
    const VERSION = detectVersion();
    const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@' + VERSION;

    // The reason popup gates the offer grid, so it must not queue behind the
    // rest: it is started first and in parallel, and it reads Memberstack from
    // localStorage itself rather than waiting for memberstack-utils.js.
    const FIRST = 'offre-annulation/cancel-reason-modal.js';

    // The offer block waits on a server answer: started in parallel too, so the
    // request leaves without queuing behind the scripts below.
    const OFFER_SCRIPT = 'offre-annulation/current-offer.js';

    // Scripts to load in order
    // Note: tracking-churn-offers.js is injected site-wide by shared/global-utils.js
    // (path-guarded to cancel URLs) so it lives on every cancel page from one source.
    const scripts = [
        'shared/opacity-reveal.js',
        'shared/countdown.js',
        'offre-annulation/session-stats.js',
        'offre-annulation/pause-form.js',
        'shared/redeem-cancel-forms.js'
    ];

    // Les formulaires que branche chaque script : s'il ne se charge pas, ses formulaires affichent leur erreur.
    const FORM_SCRIPTS = {
        'offre-annulation/pause-form.js': ['pause-form'],
        'shared/redeem-cancel-forms.js': ['redeem-form', 'cancel-form']
    };

    // Bloc de l'offre -50 % : masqué (sa place gardée) jusqu'à ce que current-offer.js dise s'il reste
    // (attribut `data-ordo-offer`). Réaffiché si ce script ne se charge pas ou ne décide pas à temps
    // (il attend lui-même le serveur 6 s au plus).
    const OFFER_WAIT = 10000;
    const redeemForm = document.getElementById('redeem-form');
    const offerBlock = redeemForm && redeemForm.closest ? redeemForm.closest('.inscr-p_actions') : null;
    function revealOffer() {
        if (offerBlock && !offerBlock.hasAttribute('data-ordo-offer')) offerBlock.style.visibility = '';
    }
    if (offerBlock) {
        offerBlock.style.visibility = 'hidden';
        setTimeout(revealOffer, OFFER_WAIT);
    }

    // --------------------------------------------------------------------
    // Garde des formulaires. Un formulaire sans son écouteur part en envoi
    // natif du navigateur vers member-forms, qui répond par une page brute
    // {"error":"invalid_json"} (vu le 15/10/2026). Un clic arrivé avant que le
    // formulaire soit branché (attribut `data-ordo-bound`, posé par
    // pause-form.js et redeem-cancel-forms.js) est retenu, puis rejoué dès qu'il
    // l'est ; « annuler » attend aussi la fenêtre du motif, sinon la question
    // serait sautée. Si le script échoue ou si rien ne vient en 15 s, le message
    // d'erreur du formulaire s'affiche. Un envoi natif n'est jamais laissé partir.
    const GUARDED = { 'redeem-form': 'redeem', 'pause-form': 'pause', 'cancel-form': 'cancel' };
    const HOLD_TIMEOUT = 15000;
    const failedForms = {};
    let reasonSettled = false;
    let held = null;
    let holdTimer = null;

    function report(name, detail) {
        try {
            const err = new Error(detail);
            err.name = name;
            if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('OffreAnnulationLoader', err);
            else console.error(PREFIX, name, detail);
        } catch (e) {
            // ne jamais lever depuis le chemin de report
        }
    }

    function showMessage(form, kind, visible) {
        const el = document.getElementById(kind + '-message-' + GUARDED[form.id]);
        if (el) el.style.display = visible ? 'block' : 'none';
    }

    function formReady(form) {
        if (!form.hasAttribute('data-ordo-bound')) return false;
        return form.id !== 'cancel-form' || reasonSettled;
    }

    function failHeld() {
        clearTimeout(holdTimer);
        if (!held) return;
        showMessage(held, 'waiting', false);
        showMessage(held, 'error', true);
        held = null;
    }

    function releaseHeld() {
        if (!held || !formReady(held)) return;
        const form = held;
        held = null;
        clearTimeout(holdTimer);
        showMessage(form, 'waiting', false);
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }

    document.addEventListener('submit', (event) => {
        const form = event.target;
        if (!form || !GUARDED[form.id] || formReady(form)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (failedForms[form.id]) {
            showMessage(form, 'error', true);
            return;
        }
        held = form;
        showMessage(form, 'waiting', true);
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            report('FormsNotReady', 'submit held ' + HOLD_TIMEOUT + ' ms on ' + form.id);
            failHeld();
        }, HOLD_TIMEOUT);
    }, true);

    // Rejoue le clic retenu dès que son formulaire est branché.
    if (typeof MutationObserver === 'function') {
        const watcher = new MutationObserver(releaseHeld);
        Object.keys(GUARDED).forEach((id) => {
            const form = document.getElementById(id);
            if (form) watcher.observe(form, { attributes: true, attributeFilter: ['data-ordo-bound'] });
        });
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.crossOrigin = 'anonymous';
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function init() {
        console.log(PREFIX, 'Loading scripts...');

        // Set countdown storage key (preserve existing key for this page)
        window.COUNTDOWN_CONFIG = { storageKey: 'countdownDateTime' };

        // Fired before the awaits below, never awaited inline: a rejection here
        // must not skip the rest, and the grid must not wait on the queue.
        const reasonModal = loadScript(`${BASE}/${FIRST}`).catch((err) => {
            console.error(PREFIX, 'Load error:', err);
        }).then(() => {
            // Loaded or not, the cancel form no longer waits on it.
            reasonSettled = true;
            releaseHeld();
        });
        loadScript(`${BASE}/${OFFER_SCRIPT}`).catch((err) => {
            console.error(PREFIX, 'Load error:', err);
            revealOffer();
        });

        // Each file on its own: a failing one is skipped, the next still loads,
        // so a broken countdown no longer leaves the forms without their scripts.
        let failed = 0;
        for (const file of ['shared/memberstack-utils.js', 'shared/error-reporter.js'].concat(scripts)) {
            try {
                await loadScript(`${BASE}/${file}`);
            } catch (err) {
                failed += 1;
                console.error(PREFIX, 'Load error:', err);
                (FORM_SCRIPTS[file] || []).forEach((id) => { failedForms[id] = true; });
                if (FORM_SCRIPTS[file]) report('FormScriptsFailed', file + ' did not load');
                if (held && failedForms[held.id]) failHeld();
            }
        }
        releaseHeld();
        await reasonModal;
        console.log(PREFIX, failed ? 'Scripts loaded with ' + failed + ' error(s)' : 'All scripts loaded');
    }

    // Wait for DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
