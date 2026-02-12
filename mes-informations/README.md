# Mes Informations Scripts

Consolidated scripts for the 6 `/membership/mes-informations*` Webflow pages. All pages share one `loader.js` entry point and use a per-page `window.MES_INFOS_CONFIG` object to toggle features.

## Pages

| Page | Key features |
|------|-------------|
| `mes-informations` | Full form: RPPS, statut selectors, sync 5 fields |
| `mes-informations-praticien` | Forces statut=Medecin, justPaidTs |
| `mes-informations-praticien-sepa` | Same as praticien + Stripe checkout redirect |
| `mes-informations-internes` | Forces statut=Interne, different RPPS text |
| `mes-informations-internes-assos` | Partnership city from sessionStorage/cookie, no RPPS |
| `mes-informations-module` | Statut selectors, sync 3 fields |

## Files

| File | Description |
|------|-------------|
| `loader.js` | Entry point — loads shared utils, Crisp, intl-tel-input, then all scripts |
| `core.js` | Reads `MES_INFOS_CONFIG`, exposes `window.OrdoMesInfos`, sets `locat` |
| `styles.js` | Injects `.iti` CSS width fixes |
| `rpps.js` | RPPS checkbox — text configurable via `rppsText`, null to disable |
| `memberstack-sync.js` | Syncs localStorage fields to Memberstack + optional forced statut |
| `statut-selectors.js` | Shows/hides semestre, mode-exercice, specialite based on statut |
| `required-if-visible.js` | Sets `required` on visible `[ms-code="required-if-visible"]` inputs |
| `phone-input.js` | intl-tel-input initialization on `[ms-code-phone-number]` inputs |
| `checkout.js` | Stripe checkout form handler — sends `payment_method_types` to Netlify (praticien-sepa only) |
| `partnership-city.js` | Partnership city from sessionStorage/cookie (internes-assos only) |

## Webflow setup

### Header (keep inline)

```html
<!-- Finsweet: CMS Select or Attributes v2 depending on page -->
<script async src="https://cdn.jsdelivr.net/npm/@finsweet/attributes-cmsselect@1/cmsselect.js"></script>

<!-- Geotargetly callback (if used on this page) -->
<script>
function geotargetly_loaded(){
  var el = document.getElementById('user_country');
  if (el) el.value = geotargetly_country_name();
}
</script>

<!-- Page config (see below for per-page values) -->
<script>
window.MES_INFOS_CONFIG = { /* ... */ };
</script>
```

### Footer (keep inline)

```html
<!-- Loader (single script replaces all previous inline scripts) -->
<script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/loader.js"></script>

<!-- Geotargetly tracking (page-specific ID, keep inline) -->
<script>
(function(g,e,o,t,a,r,ge,tl,y){
t=g.getElementsByTagName(e)[0];y=g.createElement(e);y.async=true;
y.src='https://g792337341.co/gl?id=YOUR_ID&refurl='+g.referrer+'&winurl='+encodeURIComponent(window.location);
t.parentNode.insertBefore(y,t);
})(document,'script');
</script>
```

## Config reference

```js
window.MES_INFOS_CONFIG = {
  rppsText: 'Pas de RPPS',       // string = checkbox text, null = disable RPPS
  forceStatut: null,              // 'Medecin' | 'Interne' | null
  syncFields: [],                 // [{ key: 'localStorage-key', msField: 'memberstack-field' }]
  setJustPaidTs: false,           // set justPaidTs in localStorage for 60s
  showStatutSelectors: false,     // show semestre/mode-exercice/specialite visibility logic
  showRequiredIfVisible: true,    // conditional required attr on visible inputs
  enableCheckout: false,          // load checkout.js (Stripe redirect)
  checkoutPaymentMethods: ['sepa_debit'], // payment methods for Stripe checkout
  enablePartnershipCity: false    // load partnership-city.js (sessionStorage/cookie sync)
};
```

## Per-page configs

### mes-informations (default)
```js
window.MES_INFOS_CONFIG = {
  rppsText: 'Pas de RPPS',
  syncFields: [
    { key: 'signup-comment', msField: 'comment' },
    { key: 'signup-type-de-compte', msField: 'type-de-compte' },
    { key: 'userId', msField: 'airtablerecordid' },
    { key: 'signup-partnership-city', msField: 'partnership-city' },
    { key: 'signup-duree-offre', msField: 'duree-de-loffre' }
  ],
  showStatutSelectors: true,
  showRequiredIfVisible: true
};
```

### mes-informations-praticien
```js
window.MES_INFOS_CONFIG = {
  rppsText: 'Pas de RPPS',
  forceStatut: 'Medecin',
  syncFields: [{ key: 'userId', msField: 'airtablerecordid' }],
  setJustPaidTs: true,
  showRequiredIfVisible: true
};
```

### mes-informations-praticien-sepa
```js
window.MES_INFOS_CONFIG = {
  rppsText: 'Pas de RPPS',
  forceStatut: 'Medecin',
  syncFields: [{ key: 'userId', msField: 'airtablerecordid' }],
  setJustPaidTs: true,
  showRequiredIfVisible: true,
  enableCheckout: true
};
```

### mes-informations-internes
```js
window.MES_INFOS_CONFIG = {
  rppsText: 'RPPS absent ou obtention en attente',
  forceStatut: 'Interne',
  syncFields: [
    { key: 'signup-comment', msField: 'comment' },
    { key: 'signup-type-de-compte', msField: 'type-de-compte' },
    { key: 'signup-partnership-city', msField: 'partnership-city' },
    { key: 'userId', msField: 'airtablerecordid' }
  ]
};
```

### mes-informations-internes-assos
```js
window.MES_INFOS_CONFIG = {
  rppsText: null,
  syncFields: [{ key: 'userId', msField: 'airtablerecordid' }],
  enablePartnershipCity: true
};
```

### mes-informations-module
```js
window.MES_INFOS_CONFIG = {
  rppsText: 'Pas de RPPS',
  syncFields: [
    { key: 'signup-comment', msField: 'comment' },
    { key: 'signup-type-de-compte', msField: 'type-de-compte' },
    { key: 'userId', msField: 'airtablerecordid' }
  ],
  showStatutSelectors: true,
  showRequiredIfVisible: true
};
```

## Load order

```
loader.js
  -> shared/memberstack-utils.js
  -> shared/error-reporter.js
  -> shared/crisp-loader.js
  -> intl-tel-input (CSS + JS)
  -> styles.js
  -> core.js          (reads MES_INFOS_CONFIG, exposes OrdoMesInfos)
  -> rpps.js          (reads config.rppsText)
  -> memberstack-sync.js (reads config.syncFields + config.forceStatut)
  -> statut-selectors.js (reads config.showStatutSelectors)
  -> required-if-visible.js (reads config.showRequiredIfVisible)
  -> phone-input.js
  -> checkout.js      (only if config.enableCheckout)
  -> partnership-city.js (only if config.enablePartnershipCity)
```

## Cache busting

After pushing changes, purge jsDelivr cache:

```
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/loader.js
https://purge.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/mes-informations/core.js
...
```

Then hard refresh the Webflow page (Cmd+Shift+R).
