# Ordotype Scripts

Modular scripts for Ordotype pages. Each folder contains scripts for a specific page.

## Structure

```
ordotype-scripts/
├── account/          # Account page scripts
│   ├── loader.js
│   ├── styles.js
│   ├── core.js
│   ├── subscriptions.js
│   ├── status-selectors.js
│   ├── delete-account.js
│   ├── billing-portal.js
│   └── phone-input.js
├── homepage/         # Homepage scripts
│   ├── loader.js
│   ├── core.js
│   ├── countdown.js
│   ├── member-redirects.js
│   └── cgu-modal.js
├── pathology/        # Pathology page scripts
│   ├── loader.js
│   ├── core.js
│   ├── countdown.js
│   ├── member-redirects.js
│   ├── clipboard.js
│   ├── date-french.js
│   ├── sources-list.js
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
├── moyen-de-paiement/  # Payment method setup page (SEPA)
│   ├── loader.js
│   └── ab-test.js
├── moyen-de-paiement-cb/  # Payment method setup page (Card + SEPA) - B variant
│   └── loader.js
├── moyen-de-paiement-ajoute/  # Payment method success page
│   └── success.js
├── inscription-en-cours/  # Auto-checkout for in-progress signups
│   ├── auto-checkout.js
│   └── redirect-guard.js
├── inscription/             # Inscription signup pages
│   ├── loader.js
│   ├── background-handler.js
│   └── date-french.js
├── inscription-offre-speciale/  # Special offer signup pages
│   ├── loader.js
│   ├── not-connected-handler.js
│   └── countdown.js
├── probleme-de-paiement/  # Payment problem page (past-due accounts, SEPA only)
│   ├── access-guard.js
│   └── loader.js
├── probleme-de-paiement-cb/  # Payment problem page (Card + SEPA variant)
│   └── loader.js
├── annulation-abonnement/  # Subscription cancellation page (uses shared/redeem-cancel-forms.js)
├── offre-annulation/     # Cancellation retention offer page (50% discount)
│   ├── loader.js
│   └── countdown.js
├── desabonnement-module/  # Module unsubscription page (uses shared/redeem-cancel-forms.js)
├── fin-internat/        # End of internship page (subscription upgrade)
│   ├── loader.js
│   ├── ab-test.js
│   ├── geo-redirect.js
│   ├── styles.js
│   └── core.js
├── fin-internat-v2/     # End of internship V2 (B variant, Card + SEPA)
│   ├── loader.js
│   ├── geo-redirect.js
│   ├── styles.js
│   └── core.js
├── connexion-2fa/      # 2FA login page scripts
│   └── crisp.js
└── shared/             # Shared scripts used across pages
    ├── memberstack-utils.js  # Memberstack data parser (exposes window.OrdoMemberstack)
    ├── error-reporter.js     # Frontend error reporter (exposes window.OrdoErrorReporter)
    ├── crisp-loader.js       # Crisp chat integration with Memberstack data
    ├── cookie-consent.js
    ├── stripe-checkout.js
    ├── stripe-setup-session.js
    ├── redeem-cancel-forms.js
    ├── opacity-reveal.js
    ├── global-styles.css
    ├── global-utils.js
    └── external-backups/   # Backups of dndevs/ordotype-front-utils scripts
        ├── accordion.js
        ├── cmsselect.js
        ├── cookiesManager.js
        ├── hideElementOnClick.js
        ├── showElementAfterDelay.js
        ├── showElementOnClick.js
        ├── tabs.js
        ├── toast.js
        ├── toggleElementsOnClick.js
        └── toggleSwitch.js
```

---

## Account Page

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `styles.js` | Hides empty Memberstack `data-ms-content` divs via CSS `:empty` |
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
| `countdown.js` | Countdown timers based on member's date-de-switch |
| `member-redirects.js` | Member state checks, banner display, and redirections |
| `cgu-modal.js` | CGU acceptance modal with 90-day expiration |

### Usage in Webflow

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js"></script>
```

### Dependencies

- jQuery (required for countdown and member-redirects)

### External Scripts (keep separate)

```html
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.16/dist/accordion.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.16/src/toggleSwitch.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.23/src/cookiesManager.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@v0.0.18/dist/showElementAfterDelay.js" type="module"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@0.0.24/dist/hideElementOnClick.js" type="module"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/cookie-consent.js"></script>
```

### Console Prefixes

- `[OrdoHomepage]` - Loader
- `[Countdown]` - Countdown timers
- `[MemberRedirects]` - Member state and redirections
- `[CGUModal]` - CGU acceptance modal

---

## Pathology Page

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts with retry logic (3 attempts, 1s delay) and fallback reveal |
| `core.js` | Stores URL, handles page unload behavior |
| `countdown.js` | Countdown timers based on member's date-de-switch |
| `member-redirects.js` | Member state checks, banner display, and redirections |
| `clipboard.js` | Copy prescription with ClipboardJS |
| `date-french.js` | Translates English dates to French |
| `sources-list.js` | "Sources et recommandations" with show more |
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
#update-clock,
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

### Loader Resilience

The pathology loader includes retry logic and fallback mechanisms:

- **Retry logic**: Failed scripts are retried 3 times with 1 second delay between attempts
- **Cache busting**: Retries use `?retry=N` query param to bypass cached failures
- **Fallback reveal**: If all retries fail, content is revealed anyway (prevents stuck pages)

Console messages for retry/fallback:
- `[OrdoPathology] Retry 1/3 for: <url>` - Script failed, retrying
- `[OrdoPathology] Fallback reveal triggered` - All retries failed, content revealed via fallback

### Console Prefixes

- `[OrdoPathology]` - Loader
- `[Countdown]` - Countdown timers
- `[MemberRedirects]` - Member state and redirections
- `[Clipboard]` - Copy functionality
- `[DateFrench]` - Date translation
- `[SourcesList]` - Sources section
- `[OpacityReveal]` - Element reveal (from shared)
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
| `stripe-checkout.js` | Stripe checkout session handling (with currency mismatch redirect support, fallback buttons on error) |
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
| `stripe-checkout.js` | Stripe checkout with card + SEPA (fallback buttons on error) |
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
| `copy-handler.js` | Copy as rich text (multiple methods). Strips `<a>` links and replaces with bold black text to avoid invisible URLs in medical software |
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

### memberstack-utils.js

Parses Memberstack data from `localStorage` (`_ms-mem` key) and exposes it as `window.OrdoMemberstack`. This is the foundation script — most other scripts depend on it.

**Loaded by all loaders as the first script in the chain.**

```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/memberstack-utils.js"></script>
```

**Exposes `window.OrdoMemberstack` with:**
- `member` — raw member object
- `stripeCustomerId` — Stripe customer ID
- `memberId` — Memberstack member ID
- `email` — member email
- `planConnections` — array of plan connections
- `customFields` — member custom fields
- `hasPlan(planId)` — returns `true` if member has the given plan
- `getPlan(planId)` — returns the plan connection object or `null`
- `isActive(planId)` — returns `true` if the plan is active
- `safeDate(fieldName)` — returns a `Date` from a custom field, or `null` (never `Invalid Date`)
- `daysSince(date)` / `daysUntil(date)` — returns a number or `null`
- `FRENCH_TERRITORIES` — array of French territory codes
- `ALLOWED_INTERN_PLAN_IDS` — array of intern plan IDs
- `SPECIALIZATION_DURATIONS` — map of specialization durations
- `getRequiredSemester(specialization)` — returns required semester number
- `isFrenchTerritory(country)` — returns `true` if country is a French territory

### Console Prefix

- `[OrdoMemberstack]` - Memberstack utils

---

### error-reporter.js

Sends frontend error reports to Discord via the Netlify webhook proxy. Exposes `window.OrdoErrorReporter`.

**Loaded by loaders that include checkout or setup scripts.**

```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/error-reporter.js"></script>
```

**Usage:**
```javascript
if (window.OrdoErrorReporter) {
  OrdoErrorReporter.report('StripeCheckout', error);
}
```

Reports are sent to `ordotype-stripe-double-checkout.netlify.app/.netlify/functions/notify-webhook` with type `frontend-error`, and forwarded to Discord as a red embed with page URL and member ID.

**Dual reporting:** Also reports to Sentry via `__SENTRY__` internal API as a fallback. This ensures errors are captured even when `*.netlify.app` is blocked by ad blockers (Sentry uses `sessions.ordotype.fr`, a first-party domain).

### Console Prefix

- `[OrdoErrorReporter]` - Error reporter

---

### crisp-loader.js

Loads Crisp chat widget and pushes Memberstack data (member ID, email, page URL) to Crisp session.

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/crisp-loader.js"></script>
```

Prefers `window.OrdoMemberstack` when available, falls back to inline `localStorage` parsing for pages where it's loaded standalone.

---

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

Webhook calls (abandon-cart tracking) are proxied through `ordotype-stripe-double-checkout.netlify.app/.netlify/functions/notify-webhook` to keep Make.com URLs server-side only.

**Fallback on error:** If the checkout session fetch fails (network error, ad blocker), the Stripe button is hidden and the non-Stripe fallback button is shown so users can still proceed via Memberstack.

### Console Prefix

- `[StripeCheckout]` - Shared checkout script

---

### stripe-setup-session.js

Shared Stripe setup session script for adding payment methods. Configure via `window.STRIPE_SETUP_CONFIG`:

```javascript
window.STRIPE_SETUP_CONFIG = {
  // Button IDs (optional, these are the defaults)
  btnNoStripeId: 'setupBtnNoStripeId',
  btnStripeId: 'setupBtnStripeId',

  // Setup config
  successUrl: '/membership/moyen-de-paiement-ajoute',
  cancelUrl: window.location.href,  // optional, defaults to current page
  paymentMethods: ['sepa_debit'],   // or ['card'] or ['card', 'sepa_debit']
  option: 'setup'                   // for webhook tracking
};
```

Webhook calls (setup-tracking) are proxied through `ordotype-stripe-setup-session.netlify.app/.netlify/functions/notify-webhook` to keep Make.com URLs server-side only.

**Fallback on error:** If the setup session prefetch fails, the Stripe button is hidden and the non-Stripe fallback button is shown so users can still proceed via Memberstack.

### Console Prefix

- `[StripeSetup]` - Shared setup session script

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

### cookie-consent.js

Custom cookie consent manager that replaces Finsweet Cookie Consent. Works with existing Webflow banner HTML using `fs-cc` attributes.

```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/cookie-consent.js"></script>
```

**Features:**
- Drop-in replacement for Finsweet Cookie Consent
- Uses existing `fs-cc` attributes in Webflow HTML
- Saves consent to `fs-cc` cookie (same format as Finsweet)
- GTM Consent Mode v2 integration via `gtag('consent', 'update', ...)`
- Microsoft Clarity consent support
- Granular consent: marketing, analytics, personalization

**Required HTML attributes (already in Webflow):**
- `[fs-cc="banner"]` - Banner container
- `[fs-cc="preferences"]` - Preferences panel
- `[fs-cc="manager"]` - Manager button (cookie icon)
- `[fs-cc="allow"]` - Accept button
- `[fs-cc="deny"]` - Refuse button
- `[fs-cc="submit"]` - Confirm preferences button
- `[fs-cc="open-preferences"]` - Open preferences link
- `[fs-cc="close"]` - Close button
- `[fs-cc-checkbox="marketing"]` - Marketing checkbox
- `[fs-cc-checkbox="analytics"]` - Analytics checkbox
- `[fs-cc-checkbox="personalization"]` - Personalization checkbox

### Console Prefix

- `[CookieConsent]` - Cookie consent manager

---

### opacity-reveal.js

Shared script to reveal elements by setting opacity to 1 on page load.

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/opacity-reveal.js"></script>
```

**Required CSS (add to Webflow header):**
```html
<style>
#js-clock {
    opacity: 0;
    transition: opacity 450ms;
}
</style>
```

**Configuration (optional):**
```javascript
window.OPACITY_REVEAL_CONFIG = {
    selectors: ['#js-clock', '.other-element']  // default: ['#js-clock']
};
```

### Console Prefix

- `[OpacityReveal]` - Opacity reveal

---

### external-backups/

Backup copies of scripts from `dndevs/ordotype-front-utils` and Finsweet, rewritten in vanilla JS (no jQuery dependency). Load in the footer with `defer`.

| Script | Description | Attribute |
|--------|-------------|-----------|
| accordion.js | Accordion expand/collapse | `[x-ordo-utils="accordion"]` |
| cmsselect.js | Populate `<select>` from CMS list items (replaces @finsweet/attributes-cmsselect) | `[fs-list-element="list"]`, `[fs-list-element="select-value"]`, `[fs-list-element="select"]` |
| cookiesManager.js | Cookie banner animations (deprecated - use cookie-consent.js) | `[x-ordo-utils="cookieManagerButton"]` |
| hideElementOnClick.js | Hide element on click | `[x-ordo-utils="hideElementOnClick"]` |
| showElementAfterDelay.js | Show element after delay | `[x-ordo-utils="showElementAfterDelay"]` |
| showElementOnClick.js | Show element on click | `[x-ordo-utils="showElementOnClick"]` |
| tabs.js | Animated tab background | `[x-ordo-utils="tabs"]` |
| toast.js | Toast notifications | `[x-ordo-utils*="show-toast"]` |
| toggleElementsOnClick.js | Toggle show/hide elements | `[x-ordo-utils="toggleElementsOnClick"]` |
| toggleSwitch.js | Toggle switch component | `[x-ordo-utils="toggleSwitch"]` |

**Usage (footer, ES modules):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/tabs.js" type="module"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/toast.js" type="module"></script>
```

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
| `loader.js` | Loads shared/stripe-setup-session.js with SEPA config, stores URL |
| `ab-test.js` | A/B test redirect (10% to /membership/ajouter-un-moyen-de-paiement-cb) |

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
- `[StripeSetup]` - Setup session handling (from shared script)

---

## Moyen de Paiement CB Page (`/membership/ajouter-un-moyen-de-paiement-cb`)

Payment method setup page offering Card + SEPA payment methods. This is the B variant of the A/B test.

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads shared/stripe-setup-session.js with Card + SEPA config, stores URL |

### Usage in Webflow

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement-cb/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `setupBtnNoStripeId` - Shown for non-Stripe users
- `setupBtnStripeId` - Shown for existing Stripe customers

### Console Prefixes

- `[OrdoMoyenPaiementCB]` - Loader
- `[StripeSetup]` - Setup session handling (from shared script)

---

## Moyen de Paiement Ajoute Page (`/membership/moyen-de-paiement-ajoute`)

Success page after payment method is added. Creates billing portal session and redirects user.

### Files

| File | Purpose |
|------|---------|
| `success.js` | Handles success page, creates billing portal session, sends tracking webhook |

### Usage in Webflow

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement-ajoute/success.js"></script>
```

### Required DOM Elements

```html
<span id="countdown">2</span> <span id="label">secondes</span>
```

### Features

- Sets `justPaidTs` in localStorage for 2-minute grace period
- Creates Stripe billing portal session
- Sends tracking webhook to Make with setup session details
- Countdown redirect to billing portal (or homepage on error)

### Console Prefixes

- `[PaymentSuccess]` - Success page handling

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

## Inscription Page (`/inscription/[item-slug]`)

Signup pages with CMS-driven configuration and French date conversion.

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts, stores CMS config in localStorage |
| `background-handler.js` | Adds background class for non-logged users |
| `date-french.js` | Converts English dates to French format |

### Usage in Webflow

```html
<script>
window.INSCRIPTION_CONFIG = {
    comment: "{{wf {&quot;path&quot;:&quot;commentaire&quot;,&quot;type&quot;:&quot;PlainText&quot;\} }}",
    typeDeCompte: "{{wf {&quot;path&quot;:&quot;type-de-compte&quot;,&quot;type&quot;:&quot;PlainText&quot;\} }}",
    partnershipCity: "{{wf {&quot;path&quot;:&quot;partnership-city&quot;,&quot;type&quot;:&quot;PlainText&quot;\} }}",
    dureeOffre: "{{wf {&quot;path&quot;:&quot;duree-de-l-offre-en-mois&quot;,&quot;type&quot;:&quot;Option&quot;\} }}"
};
</script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Features

- Stores CMS config in localStorage for signup flow
- Adds `background-avif` class for non-logged users
- Converts CMS dates from English to French format ("Valable jusqu'au DD mois YYYY")

### Console Prefixes

- `[OrdoInscription]` - Loader
- `[BackgroundHandler]` - Background class handler
- `[DateFrench]` - Date conversion

---

## Inscription Offre Speciale Page (`/inscription-offre-speciale/[item-slug]`)

Special offer signup pages with CMS-driven pricing, coupons, and countdown timers.

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order (includes shared/opacity-reveal.js) |
| `not-connected-handler.js` | Handles connected/not-connected view toggle |
| `countdown.js` | Countdown timer with localStorage persistence |

### Usage in Webflow

**Header (critical CSS - keep inline to prevent FOUC):**
```html
<style>
#js-clock {
    opacity: 0;
    transition: opacity 450ms;
}
</style>
```

**Footer:**

```html
<script>
// Countdown config
window.COUNTDOWN_CONFIG = {
    slug: "{{wf slug}}",
    expiresAutomatically: {{wf offre-qui-expire-automatiquement}}
};

// Checkout config from CMS fields
window.CMS_CHECKOUT_CONFIG = {
    priceId: "{{wf stripepriceid}}",
    couponId: "{{wf code-promo}}",
    successUrl: window.location.origin + "/membership/mes-informations",
    cancelUrl: window.location.origin + "/inscription-offre-speciale/{{wf slug}}",
    paymentMethods: "{{wf payment-method-types}}".split(','),
    option: 'offre-speciale'
};

// Store in localStorage for new user redirect flow
localStorage.setItem('locat', location.href);
localStorage.setItem('signup-type-de-compte', "{{wf type-de-compte}}");
localStorage.setItem('signup-comment', "{{wf commentaire}}");
localStorage.setItem('signup-partnership-city', "{{wf partnership-city}}");
localStorage.setItem('signup-price-id', "{{wf stripepriceid}}");
localStorage.setItem('signup-coupon-id', "{{wf code-promo}}");
localStorage.setItem('signup-cancel-url', window.location.origin + "/inscription-offre-speciale/{{wf slug}}");
localStorage.setItem('signup-success-url', window.location.origin + "/membership/mes-informations");
localStorage.setItem('signup-payment-methods', "{{wf payment-method-types}}");
</script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/inscription-offre-speciale/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Required DOM Elements

**Not Connected Handler:**
- `#not-connected-animation` - Button to trigger view switch
- `#page-wrapper-connected` - Container for connected users
- `#page-wrapper-not-connected` - Container for non-connected users

**Opacity Reveal:**
- `#js-clock` - Countdown clock container (revealed on page load)

**Countdown Timer:**
- `[ms-code-time-day]` - Days display (initial value as attribute)
- `[ms-code-time-hour]` - Hours display (initial value as attribute)
- `[ms-code-time-minute]` - Minutes display (initial value as attribute)
- `[ms-code-time-second]` - Seconds display (initial value as attribute)
- `[ms-code-countdown="hide-on-end"]` - Elements to remove when timer ends (optional)
- `[ms-code-countdown="display-on-end"]` - Elements to show when timer ends (optional)

### Button Requirements

The page needs two buttons with specific IDs:
- `signup-rempla-from-decouverte` - Shown for non-Stripe users
- `signup-rempla-stripe-customer` - Shown for existing Stripe customers

### Console Prefixes

- `[OrdoOffreSpeciale]` - Loader
- `[NotConnectedHandler]` - View toggle
- `[OpacityReveal]` - Clock reveal (from shared)
- `[Countdown]` - Countdown timer
- `[StripeCheckout]` - Checkout (from shared)

---

## Probleme de Paiement Page (`/membership/probleme-de-paiement`)

Payment problem page for users with past-due subscriptions. Allows them to add a new payment method.

### Files

| File | Purpose |
|------|---------|
| `access-guard.js` | Redirects non-members and users without payment issues |
| `loader.js` | Loads shared/stripe-setup-session.js with SEPA config |

### Usage in Webflow

**Header (must run early for access control):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement/access-guard.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Access Control Logic

The `access-guard.js` script:
1. Redirects non-logged users to homepage
2. Checks if any plan has `REQUIRES_PAYMENT` status
3. Checks if user has SEPA temporary plan (`pln_sepa-temporary-lj4w0oky`)
4. If no payment issue OR has SEPA temporary plan:
   - Adds past-due plan (`pln_brique-past-due-os1c808ai`)
   - Redirects to homepage

### Button Requirements

The page needs two buttons with specific IDs:
- `setupBtnNoStripeId` - Shown for non-Stripe users
- `setupBtnStripeId` - Shown for existing Stripe customers

### Console Prefixes

- `[AccessGuard]` - Access control
- `[OrdoProblemePaiement]` - Loader
- `[StripeSetup]` - Setup session handling (from shared script)

---

## Probleme de Paiement CB Page (`/membership/probleme-de-paiement-cb`)

Payment problem page variant offering Card + SEPA payment methods. This is the CB (Card) variant.

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads shared/stripe-setup-session.js with Card + SEPA config |

### Usage in Webflow

**Header (uses same access-guard as SEPA variant):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement/access-guard.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement-cb/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `setupBtnNoStripeId` - Shown for non-Stripe users
- `setupBtnStripeId` - Shown for existing Stripe customers

### Console Prefixes

- `[AccessGuard]` - Access control (from probleme-de-paiement)
- `[OrdoProblemePaiementCB]` - Loader
- `[StripeSetup]` - Setup session handling (from shared script)

---

## Cancellation Pages (Shared Script)

These pages all use the shared `redeem-cancel-forms.js` script:
- `/membership/annulation-abonnement` - Main subscription cancellation
- `/membership/offre-annulation` - Retention offer with countdown
- `/membership/desabonnement-module-ordotype` - Module unsubscription (Soins palliatifs)
- `/membership/desabonnement-module-rhumato` - Module unsubscription (Rhumatologie)

### Shared Script

| File | Purpose |
|------|---------|
| `shared/redeem-cancel-forms.js` | Handles redeem and cancel form submissions with Stripe Customer ID injection |

### Usage in Webflow

**For annulation-abonnement and desabonnement-module (no countdown):**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/redeem-cancel-forms.js"></script>
```

**For offre-annulation (with countdown):**

Header (critical CSS - keep inline to prevent FOUC):
```html
<style>
#js-clock {
    opacity: 0;
    transition: opacity 450ms;
}
</style>
```

Footer:
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/offre-annulation/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js" crossorigin="anonymous"></script>
```

### Required DOM Elements

**Redeem Form (optional - for retention offers):**
```html
<form id="redeem-form" action="YOUR_MAKE_WEBHOOK_URL" method="POST">
    <input type="hidden" id="stripeCustomerId" name="stripeCustomerId" value="">
    <input class="button is-gradient" type="submit" value="Profiter de l'offre">
</form>

<div id="waiting-message-redeem" style="display: none;">Patientez...</div>
<div id="success-message-redeem" style="display: none;">Merci ! Votre offre a été appliquée.</div>
<div id="error-message-redeem" style="display: none;">Une erreur est survenue. Veuillez réessayer ou contacter le support à <a href="mailto:contact@ordotype.fr">contact@ordotype.fr</a>.</div>
```

**Cancel Form (optional):**
```html
<form id="cancel-form" action="YOUR_MAKE_WEBHOOK_URL" method="POST">
    <input type="hidden" id="stripeCustomerIdCancel" name="stripeCustomerId" value="">
    <input class="button red" type="submit" value="Résilier">
</form>

<div id="waiting-message-cancel" style="display: none;">Patientez...</div>
<div id="success-message-cancel" style="display: none;">Votre abonnement a été résilié. Vous allez être redirigé...</div>
<div id="error-message-cancel" style="display: none;">Une erreur est survenue. Veuillez réessayer ou contacter le support à <a href="mailto:contact@ordotype.fr">contact@ordotype.fr</a>.</div>
```

**Opacity Reveal (offre-annulation only):**
- `#js-clock` - Countdown clock container (revealed on page load)

**Countdown (offre-annulation only):**
```html
<div ms-code-time-hour="0">00</div>
<div ms-code-time-minute="15">00</div>
<div ms-code-time-second="0">00</div>
<div ms-code-time-millisecond="0">00</div>

<!-- Optional: elements to hide/show when countdown ends -->
<div ms-code-countdown="hide-on-end">This will be removed when timer ends</div>
<div ms-code-countdown="show-on-end" style="display: none;">This will show when timer ends</div>
```

### Console Prefixes

- `[OrdoOffreAnnulation]` - Loader (offre-annulation only)
- `[OpacityReveal]` - Clock reveal (from shared)
- `[Countdown]` - Countdown timer (offre-annulation only)
- `[RedeemCancelForms]` - Form handling (from shared)

---

## Fin Internat Page (`/membership/fin-internat`)

Subscription upgrade page for interns finishing their internship. Offers a discounted subscription to continue access.

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads core.js + shared/stripe-checkout.js, sets config (SEPA only) |
| `ab-test.js` | A/B test redirect (10% to /membership/fin-internat-v2) |
| `geo-redirect.js` | Geographic redirection |
| `styles.js` | Custom CSS for heading font weight |
| `core.js` | Stores URL, sets grace period to prevent redirect loops |

### Usage in Webflow

**Header (for redirects and styles - must run early):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/geo-redirect.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/ab-test.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/styles.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `signup-rempla-from-decouverte` - Shown for non-Stripe users
- `signup-rempla-stripe-customer` - Shown for existing Stripe customers

### Configuration

The loader sets up `window.STRIPE_CHECKOUT_CONFIG`:
- `priceId`: `price_1REohrKEPftl7d7iemVKnl9Y`
- `couponId`: `IJqN4FxB`
- `paymentMethods`: `['sepa_debit']`
- `option`: `fin-internat`

### Console Prefixes

- `[OrdoFinInternat]` - Loader
- `[ABTestFinInternat]` - A/B test
- `[FinInternatCore]` - Core
- `[StripeCheckout]` - Checkout (from shared script)

---

## Fin Internat V2 Page (`/membership/fin-internat-v2`)

This is the B variant of the A/B test. Main differences from V1:
- No A/B test script (this IS the B variant)
- Payment methods include both `card` and `sepa_debit`
- Different geo-redirect ID

### Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads core.js + shared/stripe-checkout.js, sets config (Card + SEPA) |
| `geo-redirect.js` | Geographic redirection (different ID than V1) |
| `styles.js` | Custom CSS for heading font weight |
| `core.js` | Stores URL, sets grace period to prevent redirect loops |

### Usage in Webflow

**Header (for redirects and styles - must run early):**
```html
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/geo-redirect.js"></script>
<script src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/styles.js"></script>
```

**Footer:**
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/loader.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

### Button Requirements

The page needs two buttons with specific IDs:
- `signup-rempla-from-decouverte` - Shown for non-Stripe users
- `signup-rempla-stripe-customer` - Shown for existing Stripe customers

### Configuration

The loader sets up `window.STRIPE_CHECKOUT_CONFIG`:
- `priceId`: `price_1REohrKEPftl7d7iemVKnl9Y`
- `couponId`: `IJqN4FxB`
- `paymentMethods`: `['sepa_debit', 'card']`
- `option`: `fin-internat-v2`

### Console Prefixes

- `[OrdoFinInternatV2]` - Loader
- `[FinInternatV2Core]` - Core
- `[StripeCheckout]` - Checkout (from shared script)

---

## Connexion 2FA Page (`/membership/connexion-2fa`)

Crisp chat integration with Memberstack data and custom button handler.

### Files

| File | Purpose |
|------|---------|
| `crisp.js` | Loads Crisp, extracts Memberstack data, handles chat button |

### Usage in Webflow

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/connexion-2fa/crisp.js"></script>
```

### Features

- Reads Memberstack data from `localStorage` (`_ms-mem` key)
- Pushes member ID and email to Crisp session
- Custom button handler for `#openCrispChatBot` element
- Sends webhook to Make when chat is opened via button

### Console Prefixes

- `[Crisp]` - Crisp integration

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

**Important:** jsDelivr has two cache layers:
1. **Edge cache** — cleared by the purge API (instant)
2. **Branch resolution cache** (`@main` → commit hash) — cached up to 12 hours, NOT clearable via purge

After purging, if changes still don't appear, use a commit-specific URL to bypass the branch cache: `@<commit-hash>` instead of `@main`.

```
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/memberstack-utils.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/error-reporter.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/crisp-loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account/styles.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/countdown.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/homepage/member-redirects.js
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
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/countdown.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/pathology/member-redirects.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/global-styles.css
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/global-utils.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/cookie-consent.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/ordonnances/styles.css
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/conseils-patients/styles.css
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement/ab-test.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/stripe-setup-session.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement-cb/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement/access-guard.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/probleme-de-paiement-cb/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/offre-annulation/countdown.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/redeem-cancel-forms.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/moyen-de-paiement-ajoute/success.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/ab-test.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/geo-redirect.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/styles.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat/core.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/geo-redirect.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/styles.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/fin-internat-v2/core.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/accordion.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/cookiesManager.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/hideElementOnClick.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/showElementAfterDelay.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/tabs.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/toast.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/toggleElementsOnClick.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/external-backups/toggleSwitch.js
```
