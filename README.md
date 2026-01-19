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
└── pathology/        # Pathology page scripts
    ├── loader.js
    ├── core.js
    ├── clipboard.js
    ├── date-french.js
    ├── sources-list.js
    ├── opacity-reveal.js
    ├── tabs-manager.js
    ├── scroll-anchor.js
    ├── iframe-handler.js
    └── tooltips.js
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

### Usage in Webflow

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

## Keep Crisp Separate

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

## Keep hideElementOnClick Separate

```html
<script defer src="https://cdn.jsdelivr.net/gh/dndevs/ordotype-front-utils@0.0.24/dist/hideElementOnClick.js" type="module" crossorigin="anonymous"></script>
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
```
