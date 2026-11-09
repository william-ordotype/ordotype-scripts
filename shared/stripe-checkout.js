/**
 * Shared Stripe Checkout Script
 *
 * Requires: shared/memberstack-utils.js, shared/error-reporter.js
 *
 * Configure via window.STRIPE_CHECKOUT_CONFIG before loading:
 *
 * <script>
 * window.STRIPE_CHECKOUT_CONFIG = {
 *   // Button IDs
 *   btnNoStripeId: 'signup-rempla-from-decouverte',
 *   btnStripeId: 'signup-rempla-stripe-customer',
 *
 *   // Checkout config
 *   priceId: 'price_xxx',
 *   couponId: 'xxx',
 *   successUrl: '/membership/success',
 *   cancelUrl: window.location.href,  // optional, defaults to current page
 *   paymentMethods: ['card', 'sepa_debit'],  // or just ['sepa_debit']
 *   option: 'rempla'  // for GTM tracking
 * };
 * </script>
 */
async function initStripeCheckout() {
    const PREFIX = '[StripeCheckout]';
    const config = window.STRIPE_CHECKOUT_CONFIG || {};

    // Un accessoire qui échoue ne doit pas rester muet, sinon la panne efface
    // son propre témoin. Canal d'erreurs du site s'il est chargé, sinon un
    // ErrorEvent que le handler global capte.
    function reportSideEffect(err) {
        try {
            if (window.OrdoErrorReporter) {
                window.OrdoErrorReporter.report('StripeCheckout', err);
                return;
            }
            var e = err instanceof Error ? err : new Error(String(err));
            window.dispatchEvent(new ErrorEvent('error', { message: e.message, error: e }));
        } catch (ignored) {}
    }

    // La mesure ne doit jamais casser la page : tout push passe par ici.
    // Déclaration de fonction (hissée) et non const/arrow, pour rester
    // utilisable au-dessus de sa définition comme dans les autres émetteurs.
    function track(payload) {
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(payload);
        } catch (err) {
            reportSideEffect(err);
        }
    }

    // GA4: the checkout session could not be created, so the user never reaches
    // Stripe. Pairs with stripe_signup_click, which only fires once a session
    // exists — without this event a broken checkout leaves no trace in analytics.
    const checkoutFailureReason = (err) => {
        const msg = (err && err.message) || '';
        const status = /Session API error:?\s*\(?(\d{3})/.exec(msg);
        if (status) return 'api_' + status[1];
        if (/Invalid (session payload|checkout session response)/.test(msg)) return 'invalid_payload';
        // Only a genuine fetch failure. A TypeError raised while reading a
        // property off a malformed response is a server problem, not a
        // connectivity one, and must not be filed as 'network'.
        if (err && err.name === 'TypeError' && /fetch|network|load failed|connection/i.test(msg)) {
            return 'network';
        }
        return 'other';
    };

    // Same signature in every emitter, so the block can be copied between files
    // without silently changing what lands in `failure_reason`. `option`
    // defaults to the same value stripe_signup_click reports, so the failure
    // and the click land on the same GA4 dimension value.
    const trackCheckoutFailure = (reason, option) => {
        track({
            event: 'checkout_failed',
            checkout_source: config.checkoutSource || 'shared',
            failure_reason: reason,
            option: option || config.option || 'default'
        });
    };

    // Helper to replace ${window.location.origin} placeholder with actual origin
    const resolveUrl = (url) => {
        if (!url) return url;
        return url.replace(/\$\{window\.location\.origin\}/g, window.location.origin);
    };

    console.log(PREFIX, 'Initializing...', config.option || 'default');

    // Button IDs with defaults
    const btnNoStripeId = config.btnNoStripeId || 'signup-rempla-from-decouverte';
    const btnStripeId = config.btnStripeId || 'signup-rempla-stripe-customer';

    const signupBtnNoStripe = document.getElementById(btnNoStripeId);
    const signupBtnStripe = document.getElementById(btnStripeId);

    // A loader may have held a click on the fallback button while this script loaded
    function resumeHeldClick(btn) {
        if (!window.ORDO_PENDING_CHECKOUT_CLICK || !btn) return;
        window.ORDO_PENDING_CHECKOUT_CLICK = false;
        console.log(PREFIX, 'Resuming held checkout click');
        btn.click();
    }

    // Deepest single-child descendant: the element that holds the button text
    function labelOf(btn) {
        let node = btn;
        while (node.children && node.children.length === 1) node = node.children[0];
        return node;
    }

    // Le bouton Stripe est visible dès que le client Stripe est connu, mais sa
    // session n'arrive qu'avec la réponse du serveur, une à quelques secondes
    // plus tard. Un clic dans cet intervalle ne faisait rien, sans un mot. Il est
    // désormais gardé : « Patientez… » tout de suite, puis Stripe dès que la
    // session est prête, ou le bouton Memberstack si sa création échoue.
    const WAIT_LABEL = 'Patientez…';
    let sessionId = null;
    let checkoutUrl = null;
    let isRedirecting = false;
    let heldAt = null;      // horodatage d'un clic arrivé avant la session
    let savedLabel = null;

    function now() {
        return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now();
    }
    function showWaiting() {
        const label = labelOf(signupBtnStripe);
        if (savedLabel === null) savedLabel = label.textContent;
        label.textContent = WAIT_LABEL;
    }
    function restoreLabel() {
        if (savedLabel !== null) labelOf(signupBtnStripe).textContent = savedLabel;
        savedLabel = null;
    }
    // Libère le clic gardé et rend son attente en ms, ou null s'il n'y en a pas.
    function takeHeldClick() {
        if (heldAt === null) return null;
        const waitMs = Math.round(now() - heldAt);
        heldAt = null;
        return waitMs;
    }
    // Sans cet événement, un clic arrivé trop tôt ne laisse aucune trace : il
    // compte les clics gardés, leur attente et leur issue. Le corps est construit
    // sous try : sur le chemin du succès, la redirection vers Stripe le suit.
    function trackHeldClick(waitMs, outcome) {
        try {
            track({
                event: 'checkout_click_held',
                checkout_source: config.checkoutSource || 'shared',
                option: config.option || 'default',
                outcome,
                wait_ms: waitMs
            });
        } catch (err) {
            reportSideEffect(err);
        }
    }

    // HTTP 409 from the checkout function: the member already has a subscription
    // to this offer's family, or a payment on it is pending. The Stripe button
    // becomes a link to the account page. The fallback button stays hidden and a
    // held click is dropped: either would start a second subscription.
    const ACCOUNT_URL = '/membership/compte';
    function showCurrentOffer(reason) {
        const pending = reason === 'payment-pending';
        window.ORDO_PENDING_CHECKOUT_CLICK = false;
        detachClick();
        const dropped = takeHeldClick();
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'none';
        signupBtnStripe.setAttribute('href', ACCOUNT_URL);
        labelOf(signupBtnStripe).textContent = pending ? 'Régulariser mon paiement' : 'Mon offre actuelle';
        signupBtnStripe.style.display = 'flex';
        console.log(PREFIX, 'Already subscribed, linking to the account page');
        trackCheckoutFailure(pending ? 'payment_pending' : 'already_subscribed');
        if (dropped !== null) trackHeldClick(dropped, 'current_offer');
    }

    // Memberstack data (from shared utility)
    const ms = window.OrdoMemberstack || {};
    const stripeCustomerId = ms.stripeCustomerId;
    const memberstackUserId = ms.memberId;
    const memberstackEmail = ms.email;

    if (!stripeCustomerId) {
        console.log(PREFIX, 'No Stripe customer – showing non-Stripe flow');
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        resumeHeldClick(signupBtnNoStripe);
        return;
    }

    console.log(PREFIX, 'Stripe customer found');
    if (!signupBtnStripe) {
        console.warn(PREFIX, 'Stripe button not found, skipping checkout session');
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        resumeHeldClick(signupBtnNoStripe);
        return;
    }
    if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'none';
    signupBtnStripe.style.display = 'flex';

    // Configuration with defaults
    const priceId = config.priceId || 'price_1REohrKEPftl7d7iemVKnl9Y';
    const FALLBACK_COUPON_ID = 'IJqN4FxB';
    const couponId = config.couponId || FALLBACK_COUPON_ID;

    // Le repli garde l'offre debout quand le champ coupon de la page est vide : un
    // visiteur à qui la page promet une remise ne doit pas tomber sur le plein
    // tarif. Il ne doit pas pour autant rester discret, car il accorde la remise la
    // plus large du catalogue sur une page dont il ignore la promesse : une offre
    // servie par son repli est une panne qui n'a pas encore coûté de client.
    if (!config.couponId) {
        reportSideEffect(new Error(
            `Coupon absent de la configuration, repli ${FALLBACK_COUPON_ID} servi sur ${window.location.pathname}`
        ));
    }
    const successUrl = resolveUrl(config.successUrl) || `${window.location.origin}/membership/mes-informations-praticien`;
    const cancelUrl = resolveUrl(config.cancelUrl) || window.location.href;
    const paymentMethods = config.paymentMethods || ['sepa_debit'];
    const option = config.option || 'default';

    const fnUrl = 'https://checkout.ordotype.fr/.netlify/functions/create-checkout-session';

    // Retry fetch on network errors (TypeError) — transient mobile failures
    function fetchWithRetry(url, options, retries, delay) {
        return fetch(url, options).catch(function(err) {
            if (retries > 0 && err instanceof TypeError) {
                console.log(PREFIX, 'Network error, retrying... (' + retries + ' left)');
                return new Promise(function(resolve) {
                    setTimeout(resolve, delay || 1000);
                }).then(function() {
                    return fetchWithRetry(url, options, retries - 1, delay);
                });
            }
            throw err;
        });
    }

    // Helper to send abandon-cart payload via proxy
    // Uses sendBeacon to survive page navigation (no CORS preflight with text/plain)
    function notifyAbandonCart(payload) {
        var url = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';
        var data = JSON.stringify({ type: 'abandon-cart', ...payload });
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }));
        } else {
            fetch(url, { method: 'POST', keepalive: true, body: data }).catch(() => {});
        }
    }

    function goToCheckout() {
        isRedirecting = true;
        showWaiting();

        const timestamp = new Date().toISOString();
        const originPage = window.location.href;

        // Build abandon-cart payload
        const abandonPayload = {
            timestamp,
            checkoutSessionId: sessionId,
            url: checkoutUrl,
            stripeCustomerId,
            memberstackUserId,
            memberstackEmail,
            option,
            priceId,
            couponId,
            successUrl,
            cancelUrl,
            originPage,
            paymentMethods
        };

        // Webhook et mesure sont accessoires : ils s'exécutent sous try, la
        // redirection part du finally. Le push reste avant la navigation pour
        // que sendBeacon ait le temps de partir.
        try {
            notifyAbandonCart(abandonPayload);
            track({
                event: 'stripe_signup_click',
                option,
                checkoutSessionId: sessionId
            });
        } catch (err) {
            reportSideEffect(err);
        } finally {
            // Redirect to Stripe Checkout
            window.location.href = checkoutUrl;
        }
    }

    function onStripeClick(e) {
        e.preventDefault();
        // Double-click prevention, y compris pendant l'attente de la session.
        if (isRedirecting || heldAt !== null) return;
        if (checkoutUrl) {
            goToCheckout();
            return;
        }
        heldAt = now();
        showWaiting();
        console.log(PREFIX, 'Click held until the checkout session is ready');
    }
    function detachClick() {
        signupBtnStripe.removeEventListener('click', onStripeClick);
    }
    signupBtnStripe.addEventListener('click', onStripeClick);

    // Retour arrière depuis Stripe : le navigateur peut ressortir la page de son
    // cache telle qu'on l'a quittée, bouton sur « Patientez… » et clic verrouillé.
    // La session reste valable : on rend la main.
    window.addEventListener('pageshow', e => {
        if (!e.persisted || !isRedirecting) return;
        isRedirecting = false;
        restoreLabel();
    });

    // Fetch sessionId + URL
    try {
        const payload = {
            stripeCustomerId,
            cancelUrl,
            successUrl,
            payment_method_types: paymentMethods,
            priceId,
            couponId
        };

        const resp = await fetchWithRetry(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 2, 1000);

        if (resp.status === 409) {
            let refusal = {};
            try { refusal = (await resp.json()) || {}; } catch (ignored) {}
            showCurrentOffer(refusal.error);
            return;
        }

        // fetchWithRetry only retries network errors, so a 4xx/5xx arrives here
        // as a readable Response whose JSON error body parses fine. Without this
        // check an HTTP failure was reported as `invalid_payload`, hiding the
        // status code that says which side broke.
        if (!resp.ok) throw new Error('Session API error: ' + resp.status);

        const data = await resp.json();

        if (!data || !data.sessionId || !data.url) {
            console.error(PREFIX, 'Invalid response');
            if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout', 'Invalid checkout session response');
            // Restore the Memberstack fallback first: the user must never wait
            // on a tag callback, and dataLayer.push runs GTM's callbacks
            // synchronously.
            detachClick();
            restoreLabel();
            const lost = takeHeldClick();
            if (lost !== null) window.ORDO_PENDING_CHECKOUT_CLICK = true;
            if (signupBtnStripe) signupBtnStripe.style.display = 'none';
            if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
            resumeHeldClick(signupBtnNoStripe);
            trackCheckoutFailure('invalid_payload');
            if (lost !== null) trackHeldClick(lost, 'fallback');
            return;
        }
        sessionId = data.sessionId;
        checkoutUrl = data.url;
        console.log(PREFIX, 'Checkout session ready');

    } catch (err) {
        console.error(PREFIX, 'Error creating checkout session:', err);
        if (window.OrdoErrorReporter) OrdoErrorReporter.report('StripeCheckout', err);
        // Restore the Memberstack fallback first: the user must never wait on a
        // tag callback, and dataLayer.push runs GTM's callbacks synchronously.
        detachClick();
        restoreLabel();
        const lost = takeHeldClick();
        // Le clic gardé suit le membre sur le bouton Memberstack.
        if (lost !== null) window.ORDO_PENDING_CHECKOUT_CLICK = true;
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        resumeHeldClick(signupBtnNoStripe);
        trackCheckoutFailure(checkoutFailureReason(err));
        if (lost !== null) trackHeldClick(lost, 'fallback');
        return;
    }

    const waited = takeHeldClick();
    if (waited !== null) {
        trackHeldClick(waited, 'redirect');
        goToCheckout();
    }

    resumeHeldClick(signupBtnStripe);
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStripeCheckout);
} else {
    initStripeCheckout();
}
