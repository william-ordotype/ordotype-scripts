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

    // Wait for DOM if needed
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // Memberstack data (prefer shared utility, fallback to inline parsing)
    var ms = window.OrdoMemberstack;
    if (!ms) {
        try {
            var raw = localStorage.getItem('_ms-mem');
            var parsed = raw ? JSON.parse(raw) : {};
            ms = { stripeCustomerId: parsed.stripeCustomerId, memberId: parsed.id, email: (parsed.auth && parsed.auth.email) || null };
        } catch (e) {
            ms = {};
        }
    }
    const stripeCustomerId = ms.stripeCustomerId;

    if (!stripeCustomerId) {
        console.error(PREFIX, 'No Stripe customer ID found');
        return;
    }

    console.log(PREFIX, 'Stripe customer found');

    const customerEmail = ms.email;
    const userId = ms.memberId;

    // Get button and hide it initially
    const btn = document.getElementById('checkoutStripe');
    if (btn) btn.style.display = 'none';

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
    const option = config.option || localStorage.getItem('signup-option') || 'inscription-en-cours';

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
        // Show fallback button
        if (btn) btn.style.display = 'flex';
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

    // Push GTM event and send abandon cart before redirect.
    // Push goes first so GA4's sendBeacon can flush before navigation.
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        event: 'stripe_signup_click',
        option,
        priceId: resolvedPriceId,
        coupon: resolvedCouponId,
        checkoutSessionId: sessionId
    });
    notifyAbandonCart();
    stashCheckoutSessionForComeback();
    window.location.href = checkoutUrl;

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
