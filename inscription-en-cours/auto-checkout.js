/**
 * Auto Checkout for Inscription En Cours
 * Creates Stripe checkout session and redirects immediately
 * Falls back to showing button if session creation fails
 *
 * Reads config from window.CMS_CHECKOUT_CONFIG (set by Webflow)
 * Falls back to localStorage values if CMS values are empty
 * Without a CMS priceId, payment methods come from localStorage first
 *
 * Usage in Webflow:
 * <script>
 * window.CMS_CHECKOUT_CONFIG = {
 *     priceId: "{{wf priceid}}",
 *     couponId: "{{wf couponid}}",
 *     successUrl: "{{wf successurl}}",
 *     cancelUrl: "{{wf cancelurl}}",
 *     paymentMethods: "{{wf payment-method-types}}".split(','),
 *     option: "{{wf option}}"
 * };
 * </script>
 * <script defer src=".../inscription-en-cours/auto-checkout.js"></script>
 */
(async function() {
    const PREFIX = '[AutoCheckout]';
    console.log(PREFIX, 'Initializing...');

    // GA4: the checkout session could not be created, so the user never reaches
    // Stripe. Pairs with stripe_signup_click, which only fires once a session
    // exists — without this event a broken checkout leaves no trace in analytics.
    function checkoutFailureReason(err) {
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
    }

    // The single source of `option` for this file. stripe_signup_click and
    // checkout_failed must report the same value or the failure rate per offer
    // divides one dimension value by another.
    function resolveOption() {
        const cfg = window.CMS_CHECKOUT_CONFIG || {};
        try {
            return cfg.option || localStorage.getItem('signup-option') || 'inscription-en-cours';
        } catch (e) {
            return cfg.option || 'inscription-en-cours';
        }
    }

    // Ce script est chargé directement par Webflow, sans passer par un loader :
    // shared/error-reporter.js n'est donc pas garanti présent. On délègue quand
    // il est là, sinon repli minimal.
    function reportSideEffect(err) {
        try {
            if (window.OrdoErrorReporter && window.OrdoErrorReporter.reportSideEffect) {
                window.OrdoErrorReporter.reportSideEffect('AutoCheckout', err);
                return;
            }
            var e = err instanceof Error ? err : new Error(String(err));
            window.dispatchEvent(new ErrorEvent('error', { message: e.message, error: e }));
        } catch (ignored) {}
    }

    function track(payload) {
        try {
            if (window.OrdoErrorReporter && window.OrdoErrorReporter.track) {
                window.OrdoErrorReporter.track(payload);
                return;
            }
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(payload);
        } catch (err) {
            reportSideEffect(err);
        }
    }

    // Repli quand shared/memberstack-utils.js n'est pas sur la page. Reproduit
    // la MÊME normalisation que lui : toute divergence ici ferait partir le
    // webhook abandon-cart sans identifiant ni e-mail.
    function readMemberstackFallback() {
        var ms = window.OrdoMemberstack;
        if (ms && ms.stripeCustomerId) return ms;
        try {
            var raw = localStorage.getItem('_ms-mem');
            var parsed = raw ? JSON.parse(raw) : {};
            return {
                stripeCustomerId: parsed.stripeCustomerId || null,
                memberId: parsed.id || parsed.userId || null,
                email: (parsed.auth && parsed.auth.email) || parsed.email || null
            };
        } catch (e) {
            return ms || {};
        }
    }

    // Same signature in every emitter, so the block can be copied between files
    // without silently changing what lands in `failure_reason`.
    function trackCheckoutFailure(reason, option) {
        track({
            event: 'checkout_failed',
            checkout_source: 'inscription-en-cours',
            failure_reason: reason,
            option: option || resolveOption()
        });
    }

    // Wait for DOM if needed
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // Le bouton de repli est masqué AVANT toute attente : sinon il reste
    // cliquable sans gestionnaire pendant que l'on attend Memberstack, et un
    // clic ne fait rien.
    const btn = document.getElementById('checkoutStripe');
    if (btn) btn.style.display = 'none';

    // On arrive ici quelques secondes après la création du compte : le SDK
    // Memberstack peut n'avoir pas encore écrit `stripeCustomerId` dans
    // `_ms-mem`. Sans attente, le script abandonnait et l'inscription ne
    // démarrait jamais. L'attente vit dans shared/memberstack-utils.js, qui
    // relit le stockage et applique la normalisation (`userId` en repli d'`id`,
    // `email` à plat en repli d'`auth.email`) — normalisation qu'une relecture
    // maison perdrait, et avec elle l'identité dans le webhook abandon-cart.
    const MS_WAIT_TIMEOUT_MS = 2000;
    let ms;
    if (window.OrdoMemberstack && window.OrdoMemberstack.waitFor) {
        ms = await window.OrdoMemberstack.waitFor('stripeCustomerId', MS_WAIT_TIMEOUT_MS);
    } else {
        // Repli : ce script peut être chargé sans memberstack-utils.js.
        ms = readMemberstackFallback();
    }

    const stripeCustomerId = ms.stripeCustomerId;

    if (!stripeCustomerId) {
        // Après l'attente, l'absence est un vrai échec et non une course :
        // `no_customer_id` redevient un chiffre exploitable.
        console.error(PREFIX, 'No Stripe customer ID after ' + MS_WAIT_TIMEOUT_MS + 'ms');
        reportSideEffect(new Error('No Stripe customer ID after ' + MS_WAIT_TIMEOUT_MS + 'ms'));
        trackCheckoutFailure('no_customer_id');
        return;
    }

    console.log(PREFIX, 'Stripe customer found');

    const customerEmail = ms.email;
    const userId = ms.memberId;

    // Get config from CMS or localStorage fallback
    const config = window.CMS_CHECKOUT_CONFIG || {};

    // Helper to replace ${window.location.origin} placeholder with actual origin
    const resolveUrl = (url) => {
        if (!url) return url;
        return url.replace(/\$\{window\.location\.origin\}/g, window.location.origin);
    };

    const priceId = config.priceId || localStorage.getItem('signup-price-id') || '';
    const couponId = config.couponId || localStorage.getItem('signup-coupon-id') || '';
    const successUrl = resolveUrl(config.successUrl) || localStorage.getItem('signup-success-url') || `${window.location.origin}/membership/mes-informations`;
    const cancelUrl = resolveUrl(config.cancelUrl) || localStorage.getItem('signup-cancel-url') || window.location.href;
    const parsePaymentMethods = (value) => (Array.isArray(value) ? value : String(value || '').split(','))
        .map((v) => String(v).trim())
        .filter(Boolean);
    const cmsPaymentMethods = parsePaymentMethods(config.paymentMethods);
    const storedPaymentMethods = parsePaymentMethods(localStorage.getItem('signup-payment-methods'));
    const paymentMethods = (!config.priceId && storedPaymentMethods.length) ? storedPaymentMethods
        : cmsPaymentMethods.length ? cmsPaymentMethods
        : storedPaymentMethods.length ? storedPaymentMethods
        : ['card', 'sepa_debit'];
    const option = resolveOption();

    console.log(PREFIX, 'Config:', { priceId, hasCoupon: !!couponId, option, paymentMethods });

    const fnUrl = 'https://checkout.ordotype.fr/.netlify/functions/create-checkout-session';

    let sessionId, checkoutUrl;
    try {
        // Reuse in-flight fetch from the footer inline kicker if present, else fire one now.
        let resp;
        if (window.__checkoutSessionPromise) {
            console.log(PREFIX, 'Using pre-flight session');
            resp = await window.__checkoutSessionPromise;
        } else {
            resp = await fetch(fnUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stripeCustomerId,
                    priceId,
                    couponId,
                    successUrl,
                    cancelUrl,
                    payment_method_types: paymentMethods
                })
            });
        }

        if (!resp.ok) {
            const text = await resp.text().catch(() => '(no body)');
            console.error(PREFIX, `Session API error (${resp.status}):`, text);
            throw new Error(`Session API error: ${resp.status}`);
        }

        const data = await resp.json();

        if (!data.sessionId || !data.url) {
            console.error(PREFIX, 'Invalid response:', data);
            throw new Error('Invalid session payload');
        }

        sessionId = data.sessionId;
        checkoutUrl = data.url;
        // Use server-resolved values (includes env var fallback)
        var resolvedPriceId = data.priceId || priceId;
        var resolvedCouponId = data.couponId || couponId;
        console.log(PREFIX, 'Checkout session ready');

    } catch (err) {
        console.error(PREFIX, 'Error creating session:', err);
        if (window.OrdoErrorReporter) OrdoErrorReporter.report('AutoCheckout', err);
        // Restore the fallback button first: the user must never wait on a tag
        // callback, and dataLayer.push runs GTM's callbacks synchronously.
        if (btn) btn.style.display = 'flex';
        trackCheckoutFailure(checkoutFailureReason(err));
        return;
    }

    // Helper to send abandon-cart webhook via proxy
    function notifyAbandonCart() {
        const payload = {
            type: 'abandon-cart',
            timestamp: new Date().toISOString(),
            checkoutSessionId: sessionId,
            url: checkoutUrl,
            stripeCustomerId,
            memberstackUserId: userId,
            Email: customerEmail,
            priceId: resolvedPriceId,
            couponId: resolvedCouponId,
            option,
            successUrl,
            cancelUrl,
            originPage: window.location.href,
            paymentMethods
        };

        var url = 'https://pricing.ordotype.fr/.netlify/functions/notify-webhook';
        var data = JSON.stringify(payload);
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }));
        } else {
            fetch(url, { method: 'POST', keepalive: true, body: data }).catch(() => {});
        }
    }

    // If the cancelUrl points at a comeback page (/inscription-non-terminee/<slug>),
    // stash the Stripe session URL under the SAME key the comeback page reads
    // (ordo-pending-checkout-<slug>) so it re-opens THIS session instead of
    // creating a fresh one. The key is the comeback slug, not `option` — the CMS
    // `option` here is just 'praticien'/'rempla', while the comeback page uses the
    // full slug (e.g. praticien-sepa). Deriving it from cancelUrl keeps them in sync.
    function stashCheckoutSessionForComeback() {
        try {
            var m = /\/inscription-non-terminee\/([^/?#]+)/.exec(cancelUrl || '');
            if (!m) return; // cancelUrl isn't a comeback page — nothing to stash
            localStorage.setItem('ordo-pending-checkout-' + m[1], JSON.stringify({
                url: checkoutUrl,
                sessionId: sessionId,
                timestamp: Date.now()
            }));
        } catch (e) {
            // localStorage unavailable (private mode / quota) — non-fatal
            console.warn(PREFIX, 'Could not stash checkout session:', e);
        }
    }

    // Webhook et stash d'abord, mesure ensuite : la mesure est la moins
    // critique des trois, elle passe donc en dernier. Le push reste malgré tout
    // avant la navigation, sinon sendBeacon n'aurait pas le temps de partir.
    // Le tout est accessoire : la redirection part du finally, donc aucun de
    // ces trois appels ne peut retenir l'utilisateur sur la page.
    try {
        notifyAbandonCart();
        stashCheckoutSessionForComeback();
        track({
            event: 'stripe_signup_click',
            option,
            priceId: resolvedPriceId,
            coupon: resolvedCouponId,
            checkoutSessionId: sessionId
        });
    } catch (err) {
        reportSideEffect(err);
    } finally {
        window.location.href = checkoutUrl;
    }

    // Show button after delay as fallback if redirect doesn't work
    setTimeout(() => {
        if (btn) btn.style.display = 'flex';
    }, 500);

    // Add click handler for fallback button
    if (btn) {
        btn.addEventListener('click', e => {
            e.preventDefault();
            notifyAbandonCart();
            stashCheckoutSessionForComeback();
            window.location.href = checkoutUrl;
        });
    }
})();
