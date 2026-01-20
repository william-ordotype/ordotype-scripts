# Ordotype Scripts

Modular scripts for Ordotype pages. Each folder contains scripts for a specific page.

## Structure

```
ordotype-scripts/
├── account/          # Account page scripts
│   ├── loader.js
│   ├── core.js
│   ├── subscriptions.js
│   ├── status-selectors.js
│   ├── delete-account.js
│   ├── billing-portal.js
│   └── phone-input.js
├── homepage/         # Homepage scripts
│   ├── loader.js
│   ├── core.js
│   └── cgu-modal.js
├── pathology/        # Pathology page scripts
│   ├── loader.js
│   ├── core.js
│   ├── clipboard.js
│   ├── date-french.js
│   ├── sources-list.js
│   ├── opacity-reveal.js
│   ├── tabs-manager.js
│   ├── scroll-anchor.js
│   ├── iframe-handler.js
│   ├── tooltips.js
│   └── styles.css
├── pricing/          # Pricing page scripts (/nos-offres)
│   ├── loader.js
│   ├── core.js
│   ├── ab-test.js
│   ├── geo-redirect.js
│   ├── belgium-redirect.js
│   ├── hash-tabs.js
│   ├── stripe-checkout.js
│   └── tabs-bg.js
├── pricing-v2/       # Pricing V2 page scripts (/nos-offres-v2)
│   ├── loader.js
│   ├── core.js
│   ├── geo-redirect.js
│   ├── belgium-redirect.js
│   ├── stripe-checkout.js
│   └── tabs-bg.js
├── ordonnances/      # Ordonnances (prescriptions) page scripts
│   ├── loader.js
│   ├── opacity-reveal.js
│   ├── urgent-handler.js
│   ├── duplicates-cleaner.js
│   ├── print-handler.js
│   ├── copy-handler.js
│   └── styles.css
├── conseils-patients/  # Patient recommendations page scripts
│   ├── loader.js
│   ├── opacity-reveal.js
│   ├── html-cleaner.js
│   ├── tracking.js
│   ├── print-handler.js
│   ├── copy-handler.js
│   └── styles.css
├── signup-rempla/      # Signup Rempla 6 months page scripts
│   ├── loader.js
│   ├── ab-test.js
│   ├── geo-redirect.js
│   ├── styles.js
│   └── core.js
├── signup-rempla-v2/   # Signup Rempla 6 months V2 (B variant)
│   ├── loader.js
│   ├── geo-redirect.js
│   ├── styles.js
│   └── core.js
├── moyen-de-paiement/  # Payment method setup page
│   ├── loader.js
│   ├── ab-test.js
│   └── setup-session.js
├── inscription-en-cours/  # Auto-checkout for in-progress signups
│   ├── auto-checkout.js
│   └── redirect-guard.js
├── inscription-offre-speciale/  # Special offer signup pages
│   └── loader.js
└── shared/             # Shared scripts used across pages
    ├── stripe-checkout.js
    ├── global-styles.css
    └── global-utils.js
```

---

## Account Page

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `core.js` | Parses Memberstack data, exposes `window.OrdoAccount` |
| `subscriptions.js` | Shows canceled/active status for each plan |
| `status-selectors.js` | Shows/hides form fields based on user status |
| `delete-account.js` | Account deletion flow |
| `billing-portal.js` | Stripe billing portal access |
| `phone-input.js` | International phone formatting |

### Usage in Webflow

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account/loader.js"></script>
```

### Console Prefixes

- `[OrdoAccount]` - Core/loader
- `[Subscriptions]` - Subscription status
- `[StatusSelectors]` - Form field visibility
- `[DeleteAccount]` - Account deletion
- `[BillingPortal]` - Stripe portal
- `[PhoneInput]` - Phone formatting

---

## Homepage

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `core.js` | Stores URL for tracking |
| `cgu-modal.js` | CGU acceptance modal with 90-day expiration |

### Usage in Webflow

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js"></script>
```

### External Scripts (keep separate)

```html
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.16/dist/accordion.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.16/src/toggleSwitch.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.23/src/cookiesManager.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.18/dist/showElementAfterDelay.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@0.0.24/dist/hideElementOnClick.js" type="module"></script>
<script async crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/@finsweet/cookie-consent@1/fs-cc.js" fs-cc-mode="opt-in" fs-cc-endpoint="https://ccl.ordotype.workers.dev/"></script>
```

### Console Prefixes

- `[OrdoHomepage]` - Loader
- `[CGUModal]` - CGU acceptance modal

---

## Pathology Page

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `core.js` | Stores URL, handles page unload behavior |
| `clipboard.js` | Copy prescription with ClipboardJS |
| `date-french.js` | Translates English dates to French |
| `sources-list.js` | "Sources et recommandations" with show more |
| `opacity-reveal.js` | Reveals hidden elements on load |
| `tabs-manager.js` | Tab visibility and auto-selection |
| `scroll-anchor.js` | Smooth scrolling to anchors |
| `iframe-handler.js` | Prescription/recommendation iframe loading |
| `tooltips.js` | IPP and HBPM tooltip popups |
| `styles.css` | Non-critical CSS (tooltips, tables, Quill editor, responsive) |

### Usage in Webflow

**Header (critical CSS - keep inline to prevent FOUC):**
```html
<style>
.template {
    display: none !important;
}

.tableau-recap.hidden-if-not-mobile.opacity-0,
.rc-html.opacity-0,
.redac-and-ref.patho,
.rc_hidden_warning_wrapper,
.rappels-cliniques_row {
    opacity: 0;
    transition: opacity 50ms;
}
</style>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/styles.css">
```

**Footer:**

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/loader.js"></script>
```

### Dependencies

The pathology page requires these external scripts (loaded separately):
- jQuery
- ClipboardJS
- Alpine.js (for toaster notifications)
- Webflow.js

### Console Prefixes

- `[OrdoPathology]` - Loader
- `[Clipboard]` - Copy functionality
- `[DateFrench]` - Date translation
- `[SourcesList]` - Sources section
- `[OpacityReveal]` - Element reveal
- `[TabsManager]` - Tab management
- `[ScrollAnchor]` - Smooth scrolling
- `[IframeHandler]` - Iframe loading
- `[Tooltips]` - Tooltip popups

---

## Pricing Page

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `core.js` | Stores URL for tracking |
| `ab-test.js` | A/B test redirect (10% to /nos-offres-v2) |
| `geo-redirect.js` | Geographic redirection |
| `belgium-redirect.js` | Belgium users redirect to /nos-offres-belgique |
| `hash-tabs.js` | URL hash-based tab selection |
| `stripe-checkout.js` | Stripe checkout session handling |
| `tabs-bg.js` | Animated tab background |

### Usage in Webflow

**Header (for redirects - must run early):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing/ab-test.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing/geo-redirect.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing/belgium-redirect.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing/loader.js"></script>
```

### External Scripts (keep separate)

```html
<script src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@0.0.7/dist/accordion.js" type="module"></script>
```

### Console Prefixes

- `[OrdoPricing]` - Loader
- `[ABTest]` - A/B test
- `[GeoRedirect]` - Geographic redirect
- `[BelgiumRedirect]` - Belgium redirect
- `[HashTabs]` - Hash-based tabs
- `[StripeCheckout]` - Stripe checkout
- `[TabsBg]` - Tab background animation

---

## Pricing V2 Page (`/nos-offres-v2`)

This is the B variant of the A/B test. Main differences from V1:
- No A/B test script (this IS the B variant)
- No hash-tabs (not needed on V2)
- Different geo-redirect ID
- Payment methods include both `card` and `sepa_debit`

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `core.js` | Stores URL for tracking |
| `geo-redirect.js` | Geographic redirection (different ID than V1) |
| `belgium-redirect.js` | Belgium users redirect to /nos-offres-belgique |
| `stripe-checkout.js` | Stripe checkout with card + SEPA |
| `tabs-bg.js` | Animated tab background |

### Usage in Webflow

**Header (for redirects - must run early):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing-v2/geo-redirect.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing-v2/belgium-redirect.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing-v2/loader.js"></script>
<script src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@0.0.7/dist/accordion.js" type="module"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Console Prefixes

- `[OrdoPricingV2]` - Loader
- `[GeoRedirectV2]` - Geographic redirect
- `[BelgiumRedirect]` - Belgium redirect
- `[StripeCheckoutV2]` - Stripe checkout
- `[TabsBg]` - Tab background animation

---

## Ordonnances Page (Prescriptions)

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `opacity-reveal.js` | Reveals hidden elements on load |
| `urgent-handler.js` | Handles urgent prescriptions, stomach-empty/le-matin |
| `duplicates-cleaner.js` | Removes duplicate items, DataLayer tracking |
| `print-handler.js` | Print prescription functionality |
| `copy-handler.js` | Copy as rich text (multiple methods) |
| `styles.css` | Non-critical CSS (tables, print styles, responsive) |

### Usage in Webflow

**Header (critical CSS - keep inline to prevent FOUC):**
```html
<style>
.ordo-for-members, .reco-rich-text, .qr-codes-wrapper {
    opacity: 0;
    transition: opacity 450ms;
}
</style>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances/styles.css">
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances/loader.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/tools@c0f2e0e29c03308b04d4a15911ed47b3d94b9fb2/toast.js" type="module"></script>
```

### Dependencies

- jQuery

### Console Prefixes

- `[OrdoOrdonnances]` - Loader
- `[OpacityReveal]` - Element reveal
- `[UrgentHandler]` - Urgent prescriptions
- `[DuplicatesCleaner]` - Duplicate removal
- `[PrintHandler]` - Print functionality
- `[CopyHandler]` - Copy functionality

---

## Conseils Patients Page (Patient Recommendations)

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `opacity-reveal.js` | Reveals hidden elements on load |
| `html-cleaner.js` | Cleans zero-width characters, removes empty paragraphs |
| `tracking.js` | DataLayer tracking for custom recommendations |
| `print-handler.js` | Print with banner (French + Arabic support) |
| `copy-handler.js` | Copy as rich text with QR code table conversion |
| `styles.css` | Non-critical CSS (tables, print styles, Arabic RTL, responsive) |

### Usage in Webflow

**Header (critical CSS - keep inline to prevent FOUC):**
```html
<style>
.rc-html-fcp, .qr-code-fcp-div-block-wrapper {
    opacity: 0;
    transition: opacity 450ms;
}
</style>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients/styles.css">
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients/loader.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/tools@c0f2e0e29c03308b04d4a15911ed47b3d94b9fb2/toast.js" type="module"></script>
```

### Dependencies

- jQuery

### Console Prefixes

- `[OrdoConseils]` - Loader
- `[OpacityReveal]` - Element reveal
- `[HTMLCleaner]` - HTML cleaning
- `[Tracking]` - DataLayer tracking
- `[PrintHandler]` - Print functionality
- `[CopyHandler]` - Copy functionality

---

## Shared Scripts

### stripe-checkout.js

Shared Stripe checkout script used by signup pages. Configure via `window.STRIPE_CHECKOUT_CONFIG`:

```javascript
window.STRIPE_CHECKOUT_CONFIG = {
  // Button IDs (optional, these are the defaults)
  btnNoStripeId: 'signup-rempla-from-decouverte',
  btnStripeId: 'signup-rempla-stripe-customer',

  // Checkout config
  priceId: 'price_xxx',           // Stripe price ID
  couponId: 'xxx',                // Stripe coupon ID
  successUrl: '/membership/success',
  cancelUrl: window.location.href, // optional, defaults to current page
  paymentMethods: ['card', 'sepa_debit'],  // or just ['sepa_debit']
  option: 'rempla'                // for GTM tracking
};
```

### Console Prefix

- `[StripeCheckout]` - Shared checkout script

---

### global-styles.css

Non-critical CSS styles used across the site.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/global-styles.css">
```

Includes:
- Form styles
- Button styles (reset-button, reset-button-navbar)
- Drawer/modal view positioning
- Autocomplete active state
- Alpine.js cloak
- Decode HTML flex container

---

### global-utils.js

Global utilities loaded on all pages.

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/global-utils.js"></script>
```

Includes:
- **Skeleton loader**: Removes skeleton-loader divs after delay (via `ms-code-skeleton` attribute)
- **Rich text decoder**: Decodes HTML entities in `.w-richtext p` and `.decode-html` elements

### Console Prefix

- `[GlobalUtils]` - Global utilities

---

## Signup Rempla Page (`/membership/signup-rempla-6months`)

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads core.js + shared/stripe-checkout.js, sets config (SEPA only) |
| `ab-test.js` | A/B test redirect (10% to signup-rempla-6months-new-v2) |
| `geo-redirect.js` | Geographic redirection |
| `styles.js` | Custom CSS for font-size inheritance |
| `core.js` | Stores URL, adds background class for non-members |

### Usage in Webflow

**Header (for redirects and styles - must run early):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla/ab-test.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla/geo-redirect.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla/styles.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `signup-rempla-from-decouverte` - Shown for non-Stripe users
- `signup-rempla-stripe-customer` - Shown for existing Stripe customers

### Console Prefixes

- `[OrdoSignupRempla]` - Loader
- `[ABTestRempla]` - A/B test
- `[StripeCheckout]` - Checkout

---

## Signup Rempla V2 Page (`/membership/signup-rempla-6months-new-v2`)

This is the B variant of the A/B test. Main differences from V1:
- No A/B test script (this IS the B variant)
- Payment methods include both `card` and `sepa_debit`

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads core.js + shared/stripe-checkout.js, sets config (Card + SEPA) |
| `geo-redirect.js` | Geographic redirection |
| `styles.js` | Custom CSS for font-size inheritance |
| `core.js` | Stores URL, adds background class for non-members |

### Usage in Webflow

**Header (for redirects and styles - must run early):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla-v2/geo-redirect.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla-v2/styles.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla-v2/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `signup-rempla-from-decouverte` - Shown for non-Stripe users
- `signup-rempla-stripe-customer` - Shown for existing Stripe customers

### Console Prefixes

- `[OrdoSignupRemplaV2]` - Loader
- `[StripeCheckout]` - Checkout

---

## Moyen de Paiement Page (`/membership/moyen-de-paiement`)

Payment method setup page for adding SEPA payment methods.

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads setup-session.js, stores URL for tracking |
| `ab-test.js` | A/B test redirect (10% to /membership/ajouter-un-moyen-de-paiement-cb) |
| `setup-session.js` | Creates Stripe setup session, handles button visibility |

### Usage in Webflow

**Header (for A/B test redirect - must run early):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/ab-test.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `setupBtnNoStripeId` - Shown for non-Stripe users
- `setupBtnStripeId` - Shown for existing Stripe customers

### Console Prefixes

- `[OrdoMoyenPaiement]` - Loader
- `[SetupSession]` - Setup session handling

---

## Inscription En Cours Page (`/inscription-en-cours/[item-slug]`)

Auto-checkout page for users who started signup but didn't complete payment. Creates a Stripe checkout session and redirects immediately.

### Files

| File | Purpose |
|------|---------|
| `auto-checkout.js` | Creates checkout session and auto-redirects to Stripe |
| `redirect-guard.js` | Redirects non-logged users to /nos-offres |

### Usage in Webflow

**Header (must run early to redirect non-logged users):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-en-cours/redirect-guard.js"></script>
```

**Footer:**
```html
<script>
window.CMS_CHECKOUT_CONFIG = {
    priceId: "{{wf priceid}}",
    couponId: "{{wf couponid}}",
    successUrl: "${window.location.origin}/membership/mes-informations-praticien",
    cancelUrl: "${window.location.origin}/nos-offres",
    paymentMethods: "{{wf payment-method-types}}".split(','),
    option: "{{wf option}}"
};
</script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-en-cours/auto-checkout.js"></script>
```

### Features

- Reads config from `window.CMS_CHECKOUT_CONFIG` (set by Webflow CMS)
- Falls back to localStorage values if CMS values are empty
- **Supports `${window.location.origin}` placeholder** in URLs (resolved at runtime)
- Sends abandon-cart webhook before redirect
- Shows fallback button if checkout session creation fails

### Console Prefixes

- `[AutoCheckout]` - Auto-checkout script

---

## Inscription Offre Speciale Page (`/inscription-offre-speciale/[item-slug]`)

Special offer signup pages with CMS-driven pricing and coupons.

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads shared/stripe-checkout.js with CMS config |

### Usage in Webflow

```html
<script>
window.CMS_CHECKOUT_CONFIG = {
    priceId: "{{wf stripepriceid}}",
    couponId: "{{wf code-promo}}",
    successUrl: window.location.origin + "/membership/mes-informations",
    cancelUrl: window.location.href,
    paymentMethods: ['card', 'sepa_debit'],
    option: 'offre-speciale'
};

// Also store in localStorage for new user redirect flow
localStorage.setItem('signup-price-id', "{{wf stripepriceid}}");
localStorage.setItem('signup-coupon-id', "{{wf code-promo}}");
localStorage.setItem('signup-success-url', window.location.origin + "/membership/mes-informations");
localStorage.setItem('signup-cancel-url', window.location.href);
</script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-offre-speciale/loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `signup-rempla-from-decouverte` - Shown for non-Stripe users
- `signup-rempla-stripe-customer` - Shown for existing Stripe customers

### Console Prefixes

- `[OrdoOffreSpeciale]` - Loader
- `[StripeCheckout]` - Checkout

---

## Keep Crisp Separate

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

---

## Cache Busting

jsDelivr caches files. To force an update after pushing changes:

**Option A:** Use a version tag
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@v1.0.0/account/loader.js"></script>
```

**Option B:** Purge cache manually
```
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pricing-v2/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/signup-rempla-v2/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-en-cours/auto-checkout.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-offre-speciale/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/styles.css
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/global-styles.css
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/global-utils.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances/styles.css
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients/styles.css
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/ab-test.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/setup-session.js
```
