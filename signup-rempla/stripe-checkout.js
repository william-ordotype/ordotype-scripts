/**
 * Stripe Checkout for Rempla 6 Months
 * - Detects Stripe customer from Memberstack
 * - Creates checkout session with SEPA payment
 * - Sends abandon-cart webhook on click
 * - Pushes GTM event before redirect
 */
async function initRemplaCheckout() {
    const PREFIX = '[RemplaCheckout]';
    console.log(PREFIX, 'Script started');

    const signupBtnNoStripe = document.getElementById('signup-rempla-from-decouverte');
    const signupBtnStripe = document.getElementById('signup-rempla-stripe-customer');

    console.log(PREFIX, 'Button elements found:', {
        signupBtnNoStripe: !!signupBtnNoStripe,
        signupBtnStripe: !!signupBtnStripe
    });

    // Memberstack data
    const rawMemData = localStorage.getItem('_ms-mem');
    console.log(PREFIX, 'Raw _ms-mem from localStorage:', rawMemData);

    const memData = JSON.parse(rawMemData || '{}');
    console.log(PREFIX, 'Parsed memData:', memData);
    console.log(PREFIX, 'memData keys:', Object.keys(memData));

    const stripeCustomerId = memData.stripeCustomerId;
    const memberstackUserId = memData.id || memData.userId;
    const memberstackEmail = memData.auth?.email || memData.email;

    console.log(PREFIX, 'Extracted values:', {
        stripeCustomerId,
        memberstackUserId,
        memberstackEmail
    });

    if (!stripeCustomerId) {
        console.warn(PREFIX, 'No Stripe customer – showing non-Stripe flow');
        if (signupBtnStripe) signupBtnStripe.style.display = 'none';
        if (signupBtnNoStripe) signupBtnNoStripe.style.display = 'flex';
        return;
    }

    console.log(PREFIX, 'Stripe customer detected:', stripeCustomerId);
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

    console.log(PREFIX, 'Using priceId:', priceId);
    console.log(PREFIX, 'Using couponId:', couponId);
    console.log(PREFIX, 'Using successUrl:', successUrl);
    console.log(PREFIX, 'Using cancelUrl:', cancelUrl);

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
        console.log(PREFIX, 'Fetching checkout session with payload:', payload);

        console.log(PREFIX, 'Sending fetch to:', fnUrl);
        const resp = await fetch(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log(PREFIX, 'Fetch response status:', resp.status, resp.statusText);
        console.log(PREFIX, 'Fetch response ok:', resp.ok);

        const data = await resp.json();
        console.log(PREFIX, 'Response from create-checkout-session:', data);
        console.log(PREFIX, 'Response keys:', Object.keys(data));

        if (!data.sessionId || !data.url) {
            console.error(PREFIX, 'Invalid response - missing sessionId or url:', data);
            console.error(PREFIX, 'sessionId:', data.sessionId);
            console.error(PREFIX, 'url:', data.url);
            alert('Une erreur est survenue lors du chargement de la page.');
            return;
        }
        sessionId = data.sessionId;
        checkoutUrl = data.url;
        console.log(PREFIX, 'Checkout session created successfully:', { sessionId, checkoutUrl });

    } catch (err) {
        console.error(PREFIX, 'Network/error during session fetch:', err);
        console.error(PREFIX, 'Error name:', err.name);
        console.error(PREFIX, 'Error message:', err.message);
        console.error(PREFIX, 'Error stack:', err.stack);
        alert('Erreur réseau lors du chargement de la page.');
        return;
    }

    console.log(PREFIX, 'Ready - click listener will be attached to button');

    // Helper to send abandon-cart payload
    function notifyAbandonCart(payload) {
        console.log(PREFIX, 'Sending abandon-cart payload:', payload);
        fetch('https://hook.eu1.make.com/jjwdfcdpudi0gv30z4838ckwruk77ffo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify(payload)
        }).catch(err => {
            console.warn(PREFIX, 'Abandon webhook failed:', err);
        });
    }

    signupBtnStripe.addEventListener('click', e => {
        e.preventDefault();
        console.log(PREFIX, 'Stripe button clicked');

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
        console.log(PREFIX, 'GTM event pushed (rempla)', {
            event: 'stripe_signup_click',
            sessionId
        });

        // Redirect to Stripe Checkout
        console.log(PREFIX, 'Redirecting to:', checkoutUrl);
        window.location.href = checkoutUrl;
    });
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRemplaCheckout);
} else {
    initRemplaCheckout();
}
