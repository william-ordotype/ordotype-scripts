/**
 * Stripe Checkout for Rempla 6 Months
 * - Detects Stripe customer from Memberstack
 * - Creates checkout session with SEPA payment
 * - Sends abandon-cart webhook on click
 * - Pushes GTM event before redirect
 */
async function initRemplaCheckout() {
    const PREFIX = '[RemplaCheckout]';
    console.log(PREFIX, 'Initializing...');

    const signupBtnNoStripe = document.getElementById('signup-rempla-from-decouverte');
    const signupBtnStripe = document.getElementById('signup-rempla-stripe-customer');

    // Memberstack data
    const memData = JSON.parse(localStorage.getItem('_ms-mem') || '{}');
    const stripeCustomerId = memData.stripeCustomerId;
    const memberstackUserId = memData.id || memData.userId;
    const memberstackEmail = memData.auth?.email || memData.email;

    if (!stripeCustomerId) {
        console.log(PREFIX, 'No Stripe customer – showing non-Stripe flow');
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        return;
    }

    console.log(PREFIX, 'Stripe customer found:', stripeCustomerId);
    if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'none';
    if (signupBtnStripe) signupBtnStripe.style.display = 'flex';

    // Default configuration
    const defaultPriceId = 'price_1REohrKEPftl7d7iemVKnl9Y';
    const defaultCouponId = 'IJqN4FxB';
    const defaultSuccess = `${window.location.origin}/membership/mes-informations-praticien`;

    // Pull dynamic parameters from data-attributes (set these on your button)
    const priceId = signupBtnStripe?.dataset.priceId || defaultPriceId;
    const couponId = signupBtnStripe?.dataset.couponId || defaultCouponId;
    const successUrl = signupBtnStripe?.dataset.successUrl || defaultSuccess;
    const cancelUrl = window.location.href;

    const paymentMethods = ['sepa_debit'];
    const fnUrl = 'https://ordotype-stripe-checkout-sessions.netlify.app/.netlify/functions/create-checkout-session';

    // Fetch sessionId + URL
    let sessionId, checkoutUrl;
    try {
        const payload = {
            stripeCustomerId,
            cancelUrl,
            successUrl,
            payment_method_types: paymentMethods,
            priceId,
            couponId
        };

        const resp = await fetch(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await resp.json();

        if (!data.sessionId || !data.url) {
            console.error(PREFIX, 'Invalid response:', data);
            alert('Une erreur est survenue lors du chargement de la page.');
            return;
        }
        sessionId = data.sessionId;
        checkoutUrl = data.url;
        console.log(PREFIX, 'Checkout session ready');

    } catch (err) {
        console.error(PREFIX, 'Error creating checkout session:', err);
        alert('Erreur réseau lors du chargement de la page.');
        return;
    }

    // Helper to send abandon-cart payload
    function notifyAbandonCart(payload) {
        fetch('https://hook.eu1.make.com/jjwdfcdpudi0gv30z4838ckwruk77ffo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify(payload)
        }).catch(() => {});
    }

    signupBtnStripe.addEventListener('click', e => {
        e.preventDefault();

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
            option: 'rempla',
            priceId,
            couponId,
            successUrl,
            cancelUrl,
            originPage,
            paymentMethods
        };

        notifyAbandonCart(abandonPayload);

        // Push GTM event
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: 'stripe_signup_click',
            option: 'rempla',
            checkoutSessionId: sessionId
        });

        // Redirect to Stripe Checkout
        window.location.href = checkoutUrl;
    });
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRemplaCheckout);
} else {
    initRemplaCheckout();
}
