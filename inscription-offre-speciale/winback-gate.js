/**
 * Ordotype Inscription Offre Speciale - Winback Gate
 *
 * Page « 6 mois offerts » réservée aux personnes désabonnées depuis moins de
 * 31 jours. Chargé par loader.js à la place de countdown.js et de
 * shared/stripe-checkout.js quand window.WINBACK_GATE vaut true, c'est-à-dire
 * quand le champ CMS « Réservé aux désabonnés ? » est coché.
 *
 * Le coupon n'est PAS dans la page : le champ CMS Code_promo_ID reste vide et
 * c'est create-checkout-session qui applique l'offre après avoir revérifié
 * l'éligibilité côté serveur. Ce script ne fait donc que de l'affichage :
 * même contourné, il ne donne aucune réduction.
 *
 * Identification : la session Memberstack, et rien d'autre. Le lien du mail
 * winback est une URL nue. On a d'abord conçu l'inverse, avec l'identifiant
 * membre dans l'URL pour éviter la connexion, mais un lien d'e-mail qui mène à
 * une page de paiement sans que le médecin ait vu qu'il était sur son compte
 * ressemble à du phishing. Pour cette audience, la lisibilité vaut mieux que les
 * points de conversion gagnés en sautant la connexion.
 *
 * Un identifiant dans l'URL n'aurait de toute façon rien prouvé : le droit à
 * l'offre se juge sur la fiche Stripe du client, pas sur un paramètre que
 * n'importe qui peut écrire.
 *
 * Retour après connexion : /membership/login-redirect-rempla?redirect=… écrit la
 * cible dans localStorage.locat, Memberstack renvoie sur
 * /membership/successful-login après la connexion ET après la 2FA, et cette page
 * relit locat pour ramener ici. Chaîne existante, rien à construire.
 *
 * Aucun élément à ajouter dans Webflow : l'écran « offre expirée » est construit
 * ici, comme la modale de offre-annulation/cancel-reason-modal.js.
 *
 * Required DOM elements (déjà présents sur le gabarit d'offre) :
 * - #not-connected-animation      - CTA montré par MS aux déconnectés, masqué ici
 * - #signup-rempla-from-decouverte - bouton Memberstack natif, masqué ici
 * - #signup-rempla-stripe-customer - bouton de l'offre
 *
 * Les deux premiers sont masqués parce qu'ils ouvrent des parcours que le serveur
 * ne contrôle pas : la page gatée ne doit exposer qu'un seul bouton vivant.
 *
 * ES2019 max (parc Chrome 78 / Safari 13, cf. eslint.config.js) : pas de `gap`
 * flexbox dans le CSS non plus, il n'arrive que dans Safari 14.1.
 */
(function() {
    'use strict';

    var PREFIX = '[WinbackGate]';
    var BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main';
    var FN_BASE = 'https://checkout.ordotype.fr/.netlify/functions';
    var OFFER_ID = 'winback-6m';
    var CHECKING_LABEL = 'Vérification…';
    var REDIRECT_LABEL = 'Patientez…';
    var OFFERS_URL = '/nos-offres';
    var DEFAULT_WINDOW_DAYS = 31;

    // Page de connexion générique du site : elle prend un ?redirect=, le pose dans
    // `locat` et ramène ici après connexion. Elle revérifie aussi la session via le
    // SDK Memberstack, donc elle rattrape le cas où le cache _ms-mem est vide alors
    // qu'une session existe. Son nom dit « rempla », son comportement est générique.
    var LOGIN_REDIRECT_URL = '/membership/login-redirect-rempla';

    // Où atterrit le médecin après avoir payé. Il est connecté à ce moment-là,
    // donc pas de détour : la page de bienvenue directement.
    var AFTER_PAYMENT_URL = '/membership/prise-en-main';

    // Au-delà, on considère que l'appel ne répondra pas. Sans cette borne, une
    // requête qui pend (réseau mobile qui décroche, portail captif) laisse le
    // bouton grisé « Vérification… » pour toujours : ni .then ni .catch ne partent.
    var ELIGIBILITY_TIMEOUT_MS = 8000;

    var BTN_NOT_CONNECTED_ID = 'not-connected-animation';
    var BTN_MS_ID = 'signup-rempla-from-decouverte';
    var BTN_STRIPE_ID = 'signup-rempla-stripe-customer';

    var CSS = [
        '.ordo-expired{display:flex;align-items:center;justify-content:center;',
        'min-height:60vh;padding:80px 24px;background:var(--neutral-100,#f7f7fb);}',
        '.ordo-expired-card{width:100%;max-width:560px;padding:48px 40px;text-align:center;',
        'background:#fff;border:1px solid var(--gris300,#ecedef);border-radius:16px;',
        'box-shadow:0 1px 2px rgba(12,14,22,.04),0 12px 32px rgba(12,14,22,.06);}',
        '.ordo-expired-badge{display:inline-flex;align-items:center;justify-content:center;',
        'width:56px;height:56px;margin-bottom:24px;border-radius:50%;',
        'background:var(--primary-50,#f0f3ff);color:var(--primary-500,#3454f6);}',
        '.ordo-expired-title{margin:0 0 12px;font-size:28px;line-height:1.25;font-weight:600;',
        'color:var(--base-900,#0c0e16);}',
        '.ordo-expired-text{margin:0 auto 8px;max-width:44ch;font-size:16px;line-height:1.6;',
        'color:var(--neutral-500,#47505c);}',
        '.ordo-expired-actions{display:flex;flex-direction:column;align-items:center;margin-top:32px;}',
        '.ordo-expired-actions>*+*{margin-top:16px;}',
        // Le CTA principal porte les classes .button.is-gradient du site. On ne
        // retouche que sa taille pour l'échelle de la carte, jamais ses couleurs :
        // les redéfinir ferait diverger la page du design system à la prochaine
        // refonte.
        '.ordo-expired-actions .button{padding:.75rem 1.5rem;}',
        '.ordo-expired-link{font-size:15px;color:var(--neutral-500,#47505c);text-decoration:underline;}',
        '.ordo-expired-link:hover{color:var(--primary-500,#3454f6);}',
        '@media (max-width:479px){.ordo-expired{padding:48px 16px;}',
        '.ordo-expired-card{padding:36px 24px;}.ordo-expired-title{font-size:24px;}}'
    ].join('');

    function report(name, err) {
        try {
            if (window.OrdoErrorReporter) {
                window.OrdoErrorReporter.report(name, err);
                return;
            }
            var e = err instanceof Error ? err : new Error(String(err));
            window.dispatchEvent(new ErrorEvent('error', { message: e.message, error: e }));
        } catch (ignored) {
            // never throw from the reporting path
        }
    }

    // Deepest single-child descendant holding only text (même heuristique que loader.js)
    function labelElement(btn) {
        var node = btn;
        while (node && node.children && node.children.length === 1) node = node.children[0];
        return (node && node.children && node.children.length === 0) ? node : null;
    }

    function setLabel(btn, text) {
        var el = labelElement(btn);
        if (el) el.textContent = text;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.appendChild(document.createTextNode(text));
        return node;
    }

    function clockIcon() {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '28');
        svg.setAttribute('height', '28');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('aria-hidden', 'true');

        var circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '9');

        var hands = document.createElementNS(NS, 'path');
        hands.setAttribute('d', 'M12 7v5l3 2');

        svg.appendChild(circle);
        svg.appendChild(hands);
        return svg;
    }

    function injectStyle() {
        if (document.getElementById('ordo-expired-css')) return;
        var style = document.createElement('style');
        style.id = 'ordo-expired-css';
        style.appendChild(document.createTextNode(CSS));
        (document.head || document.documentElement).appendChild(style);
    }

    function card(title, paragraphs, actions) {
        var wrap = el('div', 'ordo-expired');
        var box = el('div', 'ordo-expired-card');

        var badge = el('div', 'ordo-expired-badge');
        badge.appendChild(clockIcon());
        box.appendChild(badge);

        box.appendChild(el('h1', 'ordo-expired-title', title));
        paragraphs.forEach(function(text) {
            box.appendChild(el('p', 'ordo-expired-text', text));
        });

        var row = el('div', 'ordo-expired-actions');
        actions.forEach(function(a) {
            if (!a.primary) {
                var link = el('a', 'ordo-expired-link', a.label);
                link.href = a.href;
                row.appendChild(link);
                return;
            }
            // Le CTA principal réutilise le composant bouton du site plutôt que
            // d'en réimiter les couleurs : même dégradé, même rayon, et il suivra
            // tout seul une future refonte du design system.
            var btn = el('a', 'button is-gradient w-inline-block');
            btn.href = a.href;
            var content = el('div', 'button-content outer');
            content.appendChild(el('div', null, a.label));
            btn.appendChild(content);
            row.appendChild(btn);
        });
        box.appendChild(row);

        wrap.appendChild(box);
        return wrap;
    }

    function expiredScreen(windowDays) {
        return card(
            'Cette offre n’est plus disponible',
            [
                'Les 6 mois offerts étaient réservés aux médecins ayant résilié leur '
                    + 'abonnement, pendant les ' + windowDays + ' jours suivant la fin de leur '
                    + 'accès. Ce délai est passé, ou cette offre a déjà été utilisée sur votre compte.',
                'Vous pouvez reprendre votre abonnement à tout moment, sans engagement.'
            ],
            [
                { label: 'Voir les offres Ordotype', href: OFFERS_URL, primary: true },
                { label: 'Retour à l’accueil', href: '/' }
            ]
        );
    }

    function loginUrl() {
        return LOGIN_REDIRECT_URL + '?redirect='
            + encodeURIComponent(window.location.pathname + window.location.search);
    }

    // Tant qu'on ne sait pas qui est là, on ne sait rien : annoncer une offre
    // expirée serait faux une fois sur deux. On explique pourquoi on demande la
    // connexion, et le gate rejouera tout seul au retour.
    function loginScreen() {
        return card(
            'Connectez-vous pour récupérer votre offre',
            [
                'Ces 6 mois offerts sont réservés à votre compte Ordotype. '
                    + 'Connectez-vous pour que nous puissions vérifier votre éligibilité.',
                'Vous reviendrez sur cette page automatiquement après la connexion.'
            ],
            [
                { label: 'Se connecter', href: loginUrl(), primary: true },
                { label: 'Voir les offres Ordotype', href: OFFERS_URL }
            ]
        );
    }

    // Vide le contenu de la page, en gardant la barre de navigation et le footer :
    // ils encadrent .main-wrapper, seul bloc de contenu du gabarit.
    //
    // On VIDE .main-wrapper au lieu de le remplacer : il porte lui-même le
    // padding-top de 4.5rem qui compense la navbar `position: fixed`. Le
    // remplacer collait l'écran sous la barre de navigation.
    function showScreen(screen, logLine) {
        injectStyle();

        var connected = document.getElementById('page-wrapper-connected');
        var notConnected = document.getElementById('page-wrapper-not-connected');
        var main = connected ? connected.querySelector('.main-wrapper') : null;

        if (main) {
            while (main.firstChild) main.removeChild(main.firstChild);
            main.appendChild(screen);
        } else {
            // Gabarit modifié : on masque les wrappers qu'on trouve et on insère
            // l'écran EN TÊTE de body. En l'ajoutant à la fin il passerait sous une
            // page d'offre restée visible, ce qui vendrait l'offre à un non éligible.
            if (connected) connected.style.display = 'none';
            if (notConnected) notConnected.style.display = 'none';
            document.body.insertBefore(screen, document.body.firstChild);
            window.scrollTo(0, 0);
            console.log(PREFIX, logLine, '(fallback: wrappers introuvables)');
            return;
        }

        if (notConnected) notConnected.style.display = 'none';
        window.scrollTo(0, 0);
        console.log(PREFIX, logLine);
    }

    // L'identité vient UNIQUEMENT de la session Memberstack. Un identifiant passé
    // dans l'URL serait une affirmation, pas une preuve, et n'apporterait rien :
    // le droit à l'offre se juge sur la fiche Stripe du client, pas sur l'URL.
    // On préfère le client Stripe quand le cache l'a, ça évite au serveur un appel
    // à l'API Memberstack pour traduire mem_ en cus_.
    function identity() {
        var ms = window.OrdoMemberstack || {};
        if (ms.stripeCustomerId) return { stripeCustomerId: ms.stripeCustomerId, source: 'session' };
        if (ms.memberId) return { memberId: ms.memberId, source: 'session' };
        return { source: 'none' };
    }

    function loadScript(url) {
        return new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.crossOrigin = 'anonymous';
            script.async = false;
            script.src = url;
            script.onload = resolve;
            script.onerror = function() { reject(new Error('Failed to load: ' + url)); };
            document.head.appendChild(script);
        });
    }

    // countdown.js lit cette clé si elle existe. On l'écrase à chaque visite avec
    // la date renvoyée par le serveur : la deadline est propre au membre, une
    // valeur laissée par une visite précédente ne doit jamais gagner.
    //
    // Le retour compte : sans cette clé, countdown.js retombe sur les attributs du
    // gabarit, qui sont VIDES, calcule une date limite égale à maintenant, se croit
    // expiré et supprime les [ms-code-countdown="hide-on-end"] — c'est-à-dire le
    // bloc qui contient le bouton. On ne charge donc le compteur que si la vraie
    // date limite est bien en place.
    function seedCountdown(deadline) {
        var slug = (window.COUNTDOWN_CONFIG || {}).slug || '';
        if (!slug || !deadline) return false;
        try {
            var key = 'modifiedCountdownDateTimeISO-' + slug;
            localStorage.setItem(key, deadline);
            return localStorage.getItem(key) === deadline;
        } catch (e) {
            console.warn(PREFIX, 'localStorage unavailable:', e.message);
            return false;
        }
    }

    function bindCheckout(btn, who, windowDays) {
        var config = window.STRIPE_CHECKOUT_CONFIG || {};
        var redirecting = false;

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            if (redirecting) return;
            redirecting = true;
            setLabel(btn, REDIRECT_LABEL);
            btn.disabled = true;

            var payload = {
                offer: OFFER_ID,
                memberId: who.memberId || null,
                stripeCustomerId: who.stripeCustomerId || null,
                priceId: config.priceId,
                payment_method_types: config.paymentMethods,
                // Le gabarit renvoie tout le monde vers /membership/mes-informations.
                // Pour un médecin qui revient, la page de bienvenue est plus juste
                // qu'un formulaire de profil, et elle n'a pas besoin d'être connue
                // du CMS : on la fixe ici, sans toucher aux autres offres.
                successUrl: window.location.origin + AFTER_PAYMENT_URL,
                cancelUrl: config.cancelUrl
            };

            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'stripe_signup_click', option: OFFER_ID });

            fetch(FN_BASE + '/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function(resp) {
                if (resp.status === 403) {
                    // L'éligibilité a changé entre l'affichage et le clic.
                    showScreen(expiredScreen(windowDays), 'Offer no longer available');
                    return null;
                }
                return resp.json();
            }).then(function(data) {
                if (!data) return;
                if (!data.url) throw new Error('Invalid checkout session response');
                window.location.href = data.url;
            }).catch(function(err) {
                redirecting = false;
                btn.disabled = false;
                setLabel(btn, 'Réessayer');
                console.error(PREFIX, 'Checkout failed:', err);
                report('WinbackCheckoutFailed', err);
            });
        });
    }

    function init() {
        var stripeBtn = document.getElementById(BTN_STRIPE_ID);

        // Les deux autres CTA du bloc ouvrent des parcours que le serveur ne
        // contrôle pas : le checkout Memberstack natif pour les membres connectés,
        // et le basculement vers le formulaire d'inscription pour les déconnectés.
        // Ce dernier est justement celui que Memberstack montre à la cible du
        // winback : le laisser visible mettrait un « En profiter » mort en tête.
        [BTN_NOT_CONNECTED_ID, BTN_MS_ID].forEach(function(id) {
            var btn = document.getElementById(id);
            if (btn) btn.style.display = 'none';
        });

        if (!stripeBtn) {
            console.warn(PREFIX, 'Checkout button not found');
            report('WinbackButtonMissing', new Error('#' + BTN_STRIPE_ID + ' not found'));
            return;
        }

        // Visible mais inerte pendant la vérification : rien ne peut partir avant
        // le verdict, et la page ne clignote pas.
        var labelNode = labelElement(stripeBtn);
        var initialLabel = labelNode ? labelNode.textContent : '';
        stripeBtn.classList.remove('hidden');
        stripeBtn.style.display = 'flex';
        stripeBtn.style.pointerEvents = 'none';
        stripeBtn.style.opacity = '0.6';
        setLabel(stripeBtn, CHECKING_LABEL);

        var activated = false;
        function activate(who, windowDays) {
            // Un seul câblage possible : deux appels poseraient deux écouteurs de
            // clic, chacun avec son propre verrou anti-double-clic, donc deux
            // sessions Stripe et deux conversions comptées pour un seul clic.
            if (activated) return;
            activated = true;
            setLabel(stripeBtn, initialLabel);
            stripeBtn.style.pointerEvents = '';
            stripeBtn.style.opacity = '';
            bindCheckout(stripeBtn, who, windowDays);
        }

        var who = identity();
        console.log(PREFIX, 'Identity source:', who.source);

        // Pas de session : on ne redirige pas d'autorité depuis un lien d'e-mail,
        // on explique pourquoi on demande la connexion. Un écran, un clic.
        if (who.source === 'none') {
            showScreen(loginScreen(), 'Not logged in');
            return;
        }

        var query = who.stripeCustomerId ? 'c=' + encodeURIComponent(who.stripeCustomerId)
                                         : 'm=' + encodeURIComponent(who.memberId);

        var timeout = new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error('eligibility timeout')); }, ELIGIBILITY_TIMEOUT_MS);
        });

        var call = fetch(FN_BASE + '/winback-eligibility?' + query, { method: 'GET' })
            .then(function(resp) { return resp.json(); });

        Promise.race([call, timeout])
            .then(function(data) {
                var windowDays = (data && data.windowDays) || DEFAULT_WINDOW_DAYS;

                if (data && data.error) {
                    // Panne de l'endpoint : on n'éjecte pas un désabonné légitime.
                    // Le bouton reste actif, create-checkout-session tranchera.
                    console.warn(PREFIX, 'Eligibility check unavailable, deferring to checkout');
                    report('WinbackEligibilityUnavailable', new Error('eligibility endpoint returned error'));
                    activate(who, windowDays);
                    return;
                }

                if (!data || !data.eligible) {
                    console.log(PREFIX, 'Not eligible');
                    showScreen(expiredScreen(windowDays), 'Not eligible');
                    return;
                }

                console.log(PREFIX, 'Eligible,', data.daysLeft, 'day(s) left');
                activate(who, windowDays);

                // Le compteur est un bonus : s'il ne peut pas recevoir la vraie date
                // limite, on vend l'offre sans lui plutôt que de le laisser conclure
                // « expirée » et supprimer le bouton qu'on vient d'activer.
                if (!seedCountdown(data.deadline)) {
                    console.warn(PREFIX, 'Countdown skipped, deadline could not be stored');
                    return;
                }

                // Le chargement du compteur est volontairement HORS de la chaîne
                // rattrapée par le .catch ci-dessous : un échec CDN ne doit pas être
                // pris pour une panne d'éligibilité ni rejouer activate().
                loadScript(BASE + '/inscription-offre-speciale/countdown.js')
                    .catch(function(err) {
                        console.warn(PREFIX, 'Countdown script failed to load:', err.message);
                    });
            })
            .catch(function(err) {
                // Réseau injoignable ou trop lent : même raisonnement, on laisse le
                // bouton vivre. Le verrou côté serveur, lui, ne bouge pas.
                console.error(PREFIX, 'Eligibility call failed:', err);
                report('WinbackEligibilityFailed', err);
                activate(who, DEFAULT_WINDOW_DAYS);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
