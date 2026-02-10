# Ordotype Scripts — Code Quality Improvements Plan

## Context

The ordotype-scripts codebase (103 JS files, 18 loaders) is a production frontend serving paying medical SaaS users. A code review identified six areas where targeted improvements would reduce bugs, improve reliability, and make the codebase easier to maintain — without requiring any architectural changes.

---

## Improvement 1: Create `shared/memberstack-utils.js`

**Problem**: Memberstack parsing (`JSON.parse(localStorage.getItem('_ms-mem') || '{}')`) is copy-pasted in 10+ files with no try/catch. Corrupted localStorage crashes entire scripts.

**New file**: `shared/memberstack-utils.js`
- Safe `JSON.parse` with try/catch (returns `{}` on failure)
- Exposes `window.OrdoMemberstack` with: `member`, `stripeCustomerId`, `memberId`, `email`, `planConnections`, `customFields`
- Helper: `hasPlan(planId)`, `getPlan(planId)`, `isActive(planId)`
- Helper: `safeDate(fieldName)` — returns `Date` or `null` (never `Invalid Date`)
- Helper: `daysSince(date)` / `daysUntil(date)` — returns `number` or `NaN`-safe `null`

**Files to update** (replace inline Memberstack parsing with `window.OrdoMemberstack`):
- `shared/stripe-checkout.js` (lines 42-45)
- `shared/stripe-setup-session.js` (line 39)
- `shared/redeem-cancel-forms.js` (uses `$memberstackDom` — keep as-is, different pattern)
- `shared/cookie-consent.js` (lines 7-9)
- `pricing/stripe-checkout.js` (lines 24-27)
- `account/billing-portal.js` (line 9 — already uses `window.OrdoAccount`, keep as-is)
- `account/core.js` (line 31 — refactor to use `OrdoMemberstack` internally, keep `OrdoAccount` API)
- `homepage/member-redirects.js` (lines 47-49)
- `pathology/member-redirects.js` (lines 22-24)
- `moyen-de-paiement-ajoute/success.js` (line 34)

**Loaders to update** (add `shared/memberstack-utils.js` as first script):
- All 18 loaders that load scripts which read Memberstack data
- Pattern: add `await loadScript('https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/memberstack-utils.js');` before other scripts

**Watch out for**:
- `account/core.js` already exposes `window.OrdoAccount` — keep it as a wrapper that reads from `window.OrdoMemberstack` for backward compat
- `shared/cookie-consent.js` is loaded standalone (no loader) — it should gracefully fallback to inline parsing if `OrdoMemberstack` isn't loaded yet
- `shared/redeem-cancel-forms.js` uses `$memberstackDom.getCurrentMember()` (async API call), not localStorage — leave untouched

---

## Improvement 2: Extract shared constants from `member-redirects.js`

**Problem**: `homepage/member-redirects.js` and `pathology/member-redirects.js` share identical copies of `frenchTerritories`, `allowedPlanIds`, `specializationDurations`, and `getRequiredSemester()`.

**Approach**: Add these as properties on `window.OrdoMemberstack` in `shared/memberstack-utils.js`:
- `OrdoMemberstack.FRENCH_TERRITORIES`
- `OrdoMemberstack.ALLOWED_INTERN_PLAN_IDS`
- `OrdoMemberstack.SPECIALIZATION_DURATIONS`
- `OrdoMemberstack.getRequiredSemester(specialization)`
- `OrdoMemberstack.isFrenchTerritory(country)`

**Files to update**:
- `homepage/member-redirects.js` — remove duplicate arrays, reference `OrdoMemberstack.*`
- `pathology/member-redirects.js` — same

---

## Improvement 3: Defensive error handling for dates

**Problem**: `new Date(member.customFields["date-de-switch"])` silently returns `Invalid Date` when the field is missing/malformed. Subsequent math produces `NaN`, causing broken redirect logic.

**Approach**: The `safeDate()` helper in `memberstack-utils.js` handles this. In the consuming files, add guards:

```javascript
// Before (crashes silently)
const switchDate = new Date(member.customFields["date-de-switch"]);
const date_since_switch = (Date.now() - switchDate) / 8.64e7;

// After (safe)
const switchDate = OrdoMemberstack.safeDate('date-de-switch');
const date_since_switch = switchDate ? (Date.now() - switchDate) / 8.64e7 : null;
```

**Files to update**:
- `homepage/member-redirects.js` (lines 61-66 — three date calculations)
- `pathology/member-redirects.js` (lines 80-85 — same three calculations)

Add null-checks before any conditional that uses these date values. If a date is `null`, skip the condition (same as current NaN behavior but explicit).

---

## Improvement 4: Double-click & race condition prevention

**Problem**: Checkout/setup buttons can be clicked multiple times, firing duplicate API requests.

### 4a. `shared/stripe-checkout.js`
- Add `let isRedirecting = false;` flag
- In click handler: early return if `isRedirecting`, set `isRedirecting = true`, change button text to "Patientez..."
- On error: reset flag and button text

### 4b. `shared/stripe-setup-session.js`
- Already has `btnYes.disabled = true` on click (line 112) — good
- Add `let isPrefetching = false;` flag to prevent fallback fetch when prefetch is still in-flight
- In click handler: if `isPrefetching && !checkoutUrl`, wait for prefetch instead of firing second request

### 4c. `pricing/stripe-checkout.js`
- Add `let isRedirecting = false;` flag
- In both button click handlers (lines 121, 140): early return if redirecting, disable button, show "Patientez..."

### 4d. `shared/redeem-cancel-forms.js`
- Already handles this well (shows waiting state, hides form). No changes needed.

---

## Improvement 5: Error reporter via existing Netlify proxy

**Approach**: Reuse the existing `notify-webhook` Netlify functions. They already route by `type` and forward payloads. We'll add a `'frontend-error'` type that posts directly to Discord (like `create-checkout-session` already does for server errors), bypassing Make.com.

### Backend changes (2 files):

**`netlify-stripe-double-checkout/netlify/functions/notify-webhook.js`**:
- Add `'frontend-error'` to the type router
- When `type === 'frontend-error'`, post directly to `process.env.DISCORD_WEBHOOK_URL` with a Discord embed (red color, error details, page URL, member ID)
- Add `DISCORD_WEBHOOK_URL` and `DISCORD_ADMIN_USER_ID` env vars to this Netlify site (same values as in the main `.env`)

**`netlify-stripe-setup-session/netlify/functions/notify-webhook.js`**:
- Same changes (both endpoints can accept frontend errors)

### Frontend changes:

**New file**: `shared/error-reporter.js`
```javascript
window.OrdoErrorReporter = {
  report: function(context, error) {
    var payload = {
      type: 'frontend-error',
      context: context,
      error: String(error),
      page: window.location.href,
      memberId: window.OrdoMemberstack?.memberId || 'unknown',
      timestamp: new Date().toISOString()
    };
    fetch('https://ordotype-stripe-double-checkout.netlify.app/.netlify/functions/notify-webhook', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function() {});
  }
};
```

**Files to add `OrdoErrorReporter.report()` calls**:
- `shared/stripe-checkout.js` — on checkout session creation failure (line 97-100)
- `shared/stripe-setup-session.js` — on prefetch failure and fallback failure
- `pricing/stripe-checkout.js` — on dual session fetch failure (line 102-106)
- `account/billing-portal.js` — on portal session failure

---

## Improvement 6: Remove sensitive console logs

**Files and lines to modify**:

| File | Line | Current log | Action |
|------|------|-------------|--------|
| `shared/stripe-checkout.js` | 54 | `'Stripe customer found:', stripeCustomerId` | Remove customer ID: `'Stripe customer found'` |
| `shared/stripe-setup-session.js` | 56 | `'extracted sessionId from URL:', m[1]` | Remove: just log `'sessionId extracted'` |
| `shared/stripe-setup-session.js` | 65 | `'stripeCustomerId found:', memData.stripeCustomerId` | Remove ID: `'stripeCustomerId found'` |
| `shared/stripe-setup-session.js` | 91 | `'prefetch data:', data` | Remove full response: `'prefetch complete'` |
| `shared/stripe-setup-session.js` | 95-96 | Logs `checkoutUrl` and `sessionId` | Remove: `'Setup session prefetched'` |
| `shared/stripe-setup-session.js` | 129-133 | Logs fallback `checkoutUrl` and `sessionId` | Remove: `'Fallback session ready'` |
| `shared/stripe-setup-session.js` | 150 | `'Sending payload:', payload` | Remove payload: `'Sending tracking webhook'` |
| `shared/stripe-setup-session.js` | 167 | `'Redirecting to Stripe Checkout:', checkoutUrl` | Remove URL: `'Redirecting to Stripe Checkout'` |
| `moyen-de-paiement-ajoute/success.js` | 65 | `'Billing portal session created:', data` | Remove data: `'Billing portal session created'` |
| `moyen-de-paiement-ajoute/success.js` | 102 | `'Sending payload:', payload` | Remove payload: `'Sending tracking webhook'` |

---

## Implementation Order

1. **`shared/memberstack-utils.js`** — create new file (foundation for everything else)
2. **`shared/error-reporter.js`** — create new file (used by subsequent changes)
3. **Update all 10 consuming files** — replace inline Memberstack parsing
4. **Update loaders** — add memberstack-utils.js (and optionally error-reporter.js) to load chains
5. **Double-click prevention** — add to stripe-checkout, stripe-setup-session, pricing/stripe-checkout
6. **Sensitive log cleanup** — quick find-and-replace across 3 files
7. **Extract shared constants** — move arrays from member-redirects to memberstack-utils

## Verification

1. **Local test**: Open each page type in browser, verify console shows `[OrdoMemberstack] loaded` and no errors
2. **Checkout flow**: Test stripe-checkout on signup-rempla — verify session creates, button disables on click, redirects to Stripe
3. **Setup flow**: Test stripe-setup on moyen-de-paiement — verify prefetch works, click doesn't double-fire
4. **Member redirects**: Test homepage and pathology pages with various member states (interne, essai gratuit, past-due)
5. **Error reporter**: Temporarily break a Netlify endpoint URL to verify Discord alert fires
6. **Console check**: Verify no Stripe customer IDs or session URLs appear in console logs
7. **CDN purge**: After pushing to GitHub, purge jsDelivr cache for all modified files
