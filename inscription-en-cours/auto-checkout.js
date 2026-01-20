/**
 * Auto Checkout for Inscription En Cours
 * Creates Stripe checkout session and redirects immediately
 * Falls back to showing button if session creation fails
 *
 * Reads config from window.CMS_CHECKOUT_CONFIG (set by Webflow)
 * Falls back to localStorage values if CMS values are empty
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

    // Memberstack data
    const memData = JSON.parse(localStorage.getItem('_ms-mem') || '{}');
    const stripeCustomerId = memData.stripeCustomerId;

    if (!stripeCustomerId) {
        console.error(PREFIX, 'No Stripe customer ID found');
        return;
    }

    console.log(PREFIX, 'Stripe customer found:', stripeCustomerId);

    const customerEmail = memData.auth?.email;
    const userId = memData.id;

    // Get button and hide it initially
    const btn = document.getElementById('checkoutStripe');
    if (btn) btn.style.display = 'none';

    // Get config from CMS or localStorage fallback
    const config = window.CMS_CHECKOUT_CONFIG || {};

    const priceId = config.priceId || localStorage.getItem('signup-price-id') || '';
    const couponId = config.couponId || localStorage.getItem('signup-coupon-id') || '';
    const successUrl = config.successUrl || localStorage.getItem('signup-success-url') || `${window.location.origin}/membership/mes-informations`;
    const cancelUrl = config.cancelUrl || localStorage.getItem('signup-cancel-url') || window.location.href;
    const paymentMethods = config.paymentMethods || ['card', 'sepa_debit'];
    const option = config.option || 'inscription-en-cours';

    console.log(PREFIX, 'Config:', { priceId, hasCoupon: !!couponId, option });

    const fnUrl = 'https://ordotype-stripe-checkout-sessions.netlify.app/.netlify/functions/create-checkout-session';

    let sessionId, checkoutUrl;
    try {
        const resp = await fetch(fnUrl, {
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
        console.log(PREFIX, 'Checkout session ready');

    } catch (err) {
        console.error(PREFIX, 'Error creating session:', err);
        // Show fallback button
        if (btn) btn.style.display = 'flex';
        return;
    }

    // Helper to send abandon-cart webhook
    function notifyAbandonCart() {
        const payload = {
            timestamp: new Date().toISOString(),
            checkoutSessionId: sessionId,
            url: checkoutUrl,
            stripeCustomerId,
            memberstackUserId: userId,
            Email: customerEmail,
            priceId,
            couponId,
            option,
            successUrl,
            cancelUrl,
            originPage: window.location.href,
            paymentMethods
        };

        if (navigator.sendBeacon) {
            navigator.sendBeacon(
                'https://hook.eu1.make.com/jjwdfcdpudi0gv30z4838ckwruk77ffo',
                JSON.stringify(payload)
            );
        } else {
            fetch('https://hook.eu1.make.com/jjwdfcdpudi0gv30z4838ckwruk77ffo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify(payload)
            }).catch(() => {});
        }
    }

    // Send abandon cart and redirect immediately
    notifyAbandonCart();
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
            window.location.href = checkoutUrl;
        });
    }
})();
