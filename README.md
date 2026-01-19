# Ordotype Account Scripts

Modular scripts for the account page. Each file handles one feature.

## Files

| File | Purpose |
|------|---------|
| `loader.js` | Loads all scripts in correct order |
| `core.js` | Parses Memberstack data, exposes `window.OrdoAccount` |
| `subscriptions.js` | Shows canceled/active status for each plan |
| `status-selectors.js` | Shows/hides form fields based on user status |
| `delete-account.js` | Account deletion flow |
| `billing-portal.js` | Stripe billing portal access |
| `phone-input.js` | International phone formatting |

## Setup

### 1. Create GitHub repo

Create a new repo (e.g., `ordotype-scripts`) and upload the `account` folder.

### 2. Update loader.js

Change the `BASE` URL to match your repo:

```javascript
const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account';
```

### 3. Add to Webflow

Replace all your current `<script>` tags with one line in the page's custom code (before `</body>`):

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account/loader.js"></script>
```

### 4. Keep Crisp separate

Your Crisp loader is already external, keep it as-is:

```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/crisp@main/crisp-loader.js"></script>
```

## Cache Busting

jsDelivr caches files. To force an update after pushing changes:

**Option A:** Use a version tag
```html
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@v1.0.1/account/loader.js"></script>
```

**Option B:** Purge cache manually
```
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/account/loader.js
```

## Debugging

Each script logs to console with a prefix:
- `[OrdoAccount]` - Core/loader
- `[Subscriptions]` - Subscription status
- `[StatusSelectors]` - Form field visibility
- `[DeleteAccount]` - Account deletion
- `[BillingPortal]` - Stripe portal
- `[PhoneInput]` - Phone formatting

Open browser DevTools → Console to see what's happening.

## Adding a New Plan

Edit `subscriptions.js` and add to the `plans` array:

```javascript
{
  id: "pln_your-new-plan-id",
  prefix: "sub-newplan"  // Matches your Webflow element IDs
}
```

Then add elements in Webflow with IDs:
- `sub-newplan-already-not-canceled-btn`
- `sub-newplan-already-not-canceled-tag`
- `sub-newplan-already-canceled-btn`
- `sub-newplan-already-canceled-tag`
