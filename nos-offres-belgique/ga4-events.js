/**
 * Ordotype — /nos-offres-belgique GA4 events instrumentation
 *
 * Cette page était le seul point d'entrée du tunnel sans aucune mesure : les
 * visiteurs en sortaient dès le clic. Elle n'utilise pas les scripts Stripe du
 * dépôt, mais les boutons Memberstack natifs, donc ni `stripe_signup_click` ni
 * `checkout_failed` ne s'y déclenchent.
 *
 * Deux événements :
 *   - belgique_offers_view  : chargement de la page. Params : member_state
 *                            (member | anonymous), offers_visible (slugs
 *                            séparés par des virgules).
 *   - belgique_offer_click  : clic sur un CTA d'offre. Params : option (slug de
 *                            l'offre), cta_type, price_id.
 *
 * Chaque offre porte DEUX CTA, que Memberstack affiche selon l'état :
 *   - `data-ms-content="!compte-praticien"` + `data-ms-price:add=…`
 *     → visiteur connecté sans le plan : checkout Memberstack natif.
 *       cta_type = 'memberstack_checkout'
 *   - `data-ms-content="!members"` + href vers /inscription-offre-speciale/…
 *     → visiteur déconnecté : page d'inscription. cta_type = 'signup_page'
 *
 * Le slug de l'offre est déduit du lien /inscription-offre-speciale/belgique-…
 * de la même carte, jamais d'une table price_id → slug qui se périmerait à la
 * première offre ajoutée.
 *
 * ⚠️ La page répète `id="signup-prat-from-decouverte"` sur les quatre boutons
 * Memberstack. C'est du HTML invalide et `getElementById` n'en renverrait qu'un
 * seul : on passe donc par une délégation sur `document`, jamais par l'id.
 *
 * Usage dans Webflow (pied de page de /nos-offres-belgique) :
 *   <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/nos-offres-belgique/ga4-events.js"></script>
 *
 * Version: 1.0.0 (2026-09-07)
 */

(function () {
  'use strict';

  if (!window || window.__ordotypeBelgiqueGa4Installed) return;
  window.__ordotypeBelgiqueGa4Installed = true;

  var PREFIX = '[BelgiqueEvents]';
  var OFFER_LINK = 'a[href*="/inscription-offre-speciale/belgique"]';

  // La mesure ne doit jamais casser la page. L'implémentation vit dans
  // shared/error-reporter.js ; cette page ne le charge pas aujourd'hui, d'où
  // le repli.
  function reportSideEffect(err) {
    try {
      if (window.OrdoErrorReporter && window.OrdoErrorReporter.reportSideEffect) {
        window.OrdoErrorReporter.reportSideEffect('BelgiqueEvents', err);
        return;
      }
      var e = err instanceof Error ? err : new Error(String(err));
      window.dispatchEvent(new ErrorEvent('error', { message: 'BelgiqueEvents: ' + e.message, error: e }));
    } catch (ignored) {}
  }

  function track(payload) {
    try {
      if (window.OrdoErrorReporter && window.OrdoErrorReporter.track) {
        window.OrdoErrorReporter.track(payload);
        return;
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (err) {
      reportSideEffect(err);
    }
  }

  // `safely` enveloppe la CONSTRUCTION du payload autant que son envoi :
  // `track()` seul ne protégerait pas l'objet, construit au point d'appel.
  function safely(fn) {
    try {
      fn();
    } catch (err) {
      reportSideEffect(err);
    }
  }

  function slugFromHref(href) {
    var m = /\/inscription-offre-speciale\/(belgique[^/?#]*)/.exec(href || '');
    return m ? m[1] : null;
  }

  function memberState() {
    var ms = window.OrdoMemberstack;
    if (ms && ms.memberId) return 'member';
    try {
      var raw = localStorage.getItem('_ms-mem');
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && (parsed.id || parsed.userId)) ? 'member' : 'anonymous';
    } catch (e) {
      return 'anonymous';
    }
  }

  // Les offres visibles, dans l'ordre du DOM, dédupliquées.
  function offerSlugs() {
    var out = [];
    var links = document.querySelectorAll(OFFER_LINK);
    for (var i = 0; i < links.length; i++) {
      var slug = slugFromHref(links[i].getAttribute('href'));
      if (slug && out.indexOf(slug) === -1) out.push(slug);
    }
    return out;
  }

  // Le slug d'un bouton Memberstack : celui du lien d'inscription de la même
  // carte. On remonte les ancêtres jusqu'à en trouver un.
  function slugNear(el) {
    var node = el;
    for (var depth = 0; node && depth < 6; depth++) {
      var link = node.querySelector ? node.querySelector(OFFER_LINK) : null;
      if (link) {
        var slug = slugFromHref(link.getAttribute('href'));
        if (slug) return slug;
      }
      node = node.parentElement;
    }
    return null;
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    safely(function () {
      var slugs = offerSlugs();
      track({
        event: 'belgique_offers_view',
        member_state: memberState(),
        offers_visible: slugs.join(',')
      });
      console.log(PREFIX, 'view', slugs.length, 'offres');
    });
  });

  // Délégation : Webflow rend les cartes depuis le CMS et Memberstack bascule
  // l'affichage des CTA après coup, donc les écouteurs posés au chargement
  // rateraient une partie des boutons.
  document.addEventListener('click', function (evt) {
    safely(function () {
      var target = evt && evt.target;
      if (!target || !target.closest) return;

      // On remonte au <a> puis on lit l'attribut, sans passer par un sélecteur
      // d'attribut : `a[data-ms-price\:add]` ne matche pas partout (zéro
      // résultat sous jsdom alors que hasAttribute en trouve quatre), et un
      // nom d'attribut à deux-points est bien trop exotique pour qu'on parie
      // dessus dans un moteur de sélecteurs.
      var anchor = target.closest('a');
      if (!anchor) return;

      var priceId = anchor.getAttribute('data-ms-price:add');
      var href = anchor.getAttribute('href') || '';
      var linkSlug = slugFromHref(href);
      if (!priceId && !linkSlug) return;

      var payload = {
        event: 'belgique_offer_click',
        option: priceId ? slugNear(anchor) : linkSlug,
        cta_type: priceId ? 'memberstack_checkout' : 'signup_page',
        member_state: memberState()
      };
      // Clé `priceId` et non `price_id` : c'est celle que lit la variable GTM
      // existante `DLV – Stripe Price ID`, partagée avec les autres émetteurs.
      if (priceId) payload.priceId = priceId;

      track(payload);
      console.log(PREFIX, 'click', payload.cta_type, payload.option);
    });
  });
})();
