// Invitation d'un confrère depuis la page 2FA : envoie l'adresse saisie puis affiche la confirmation.
// Variante « bloqué » : si le code n'est pas validé après data-referral-stuck-after secondes, ou dès
// un clic sur un renvoi du code, le bloc prend les textes posés dans le Designer
// (data-referral-stuck-text, -placeholder, -value) et une barre y mène s'il est hors de l'écran.
// Le jeton de pré-connexion de la session 2FA part avec l'invitation : le serveur en déduit le parrain.
// Après la confirmation, la page demande pendant 30 s si l'adresse a été refusée par son serveur (ticket
// rendu par le relais, fonction parrainage-statut) ; si oui, le formulaire revient avec un message.
(function () {
  var SESSION_KEY = "_ms-2fa-session";
  var EMAIL_KEY = "ms_email";
  var EMAIL_PATTERN = /^[^\s@*]+@[^\s@*]+\.[^\s@*]+$/;
  var HIDDEN_CLASS = "hidden";
  var TIMEOUT_MS = 10000;
  var RESEND_SELECTOR = "#resend-otp-by-email, #send-otp-by-sms";
  var BAR_CLASS = "referral-stuck-bar";
  // Délais depuis la confirmation : le refus du serveur de l'invité arrive en quelques secondes.
  var WATCH_DELAYS_MS = [5000, 10000, 18000, 30000];
  var BOUNCED_TEXT = "L’adresse {email} n’a pas pu recevoir l’invitation. Vérifiez-la, puis renvoyez.";
  var BOUNCED_BAR = "Invitation non remise : vérifiez l’adresse";
  var bounced = {};
  var watching = null;
  var pending = false;
  var sent = false;
  var variant = "default";

  // Mesure dans le dataLayer et signalement des échecs au suivi d'erreurs de la page.
  function track(event, params) {
    try {
      var payload = { event: event };
      for (var key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key) && params[key]) payload[key] = params[key];
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (e) {}
  }

  function report(reason) {
    try {
      var error = new Error("Referral invite failed: " + reason);
      window.dispatchEvent(new ErrorEvent("error", { message: error.message, error: error }));
    } catch (e) {}
  }

  function failureReason(error) {
    var status = /^HTTP (\d{3})$/.exec((error && error.message) || "");
    if (status) return "http_" + status[1];
    if (error && error.name === "AbortError") return "timeout";
    return "network";
  }

  function getReferrer() {
    try {
      var session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      var data = session && session.data;
      var memberId = data && data.memberId;
      var email = String(sessionStorage.getItem(EMAIL_KEY) || "").trim();
      var token = data && typeof data.preAuthToken === "string" ? data.preAuthToken : "";
      if (memberId && EMAIL_PATTERN.test(email)) {
        return { memberId: memberId, email: email, preAuthToken: token };
      }
    } catch (e) {}
    return null;
  }

  function setVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.classList.remove(HIDDEN_CLASS);
      el.style.display = el.getAttribute("data-referral-display") || "";
    } else {
      if (el.style.display !== "none") el.setAttribute("data-referral-display", el.style.display);
      el.classList.add(HIDDEN_CLASS);
      el.style.display = "none";
    }
  }

  function previewAllowed(invitation, referrer) {
    var list = invitation.getAttribute("data-referral-preview");
    if (!list || !referrer) return false;
    var email = String(referrer.email).trim().toLowerCase();
    return list.split(",").some(function (entry) {
      var rule = entry.trim().toLowerCase();
      if (!rule) return false;
      if (rule.charAt(0) === "@") return email.length > rule.length && email.slice(-rule.length) === rule;
      return email === rule;
    });
  }

  function applyPreview() {
    var invitation = document.getElementById("referral-invitation");
    if (invitation && previewAllowed(invitation, getReferrer())) setVisible(invitation, true);
  }

  // Le code validé, la page part : rien ne doit plus changer sous les yeux du membre.
  function codeValidated() {
    var layer = window.dataLayer || [];
    for (var i = 0; i < layer.length; i++) {
      if (layer[i] && layer[i].event === "2fa_otp_success") return true;
    }
    return false;
  }

  // Un membre déjà occupé à inviter garde les textes qu'il est en train de lire.
  function inviting(invitation) {
    var input = invitation.querySelector('input[type="email"]');
    return sent || pending || (input && (input.value !== "" || document.activeElement === input));
  }

  function useStuckTexts(root) {
    if (!root) return;
    var i;
    var texts = root.querySelectorAll("[data-referral-stuck-text]");
    for (i = 0; i < texts.length; i++) texts[i].textContent = texts[i].getAttribute("data-referral-stuck-text");
    var fields = root.querySelectorAll("[data-referral-stuck-placeholder]");
    for (i = 0; i < fields.length; i++) fields[i].setAttribute("placeholder", fields[i].getAttribute("data-referral-stuck-placeholder"));
    var buttons = root.querySelectorAll("[data-referral-stuck-value]");
    for (i = 0; i < buttons.length; i++) buttons[i].value = buttons[i].getAttribute("data-referral-stuck-value");
    root.setAttribute("data-referral-state", "stuck");
  }

  function inView(el) {
    var rect = el.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight * 0.75;
  }

  function removeBar() {
    var bars = document.querySelectorAll("." + BAR_CLASS);
    for (var i = 0; i < bars.length; i++) bars[i].parentNode.removeChild(bars[i]);
  }

  function showBar(invitation, text) {
    if (!text || inView(invitation)) return;
    removeBar();
    var bar = document.createElement("a");
    bar.className = BAR_CLASS;
    bar.href = "#referral-invitation";
    bar.textContent = text;
    bar.addEventListener("click", function (event) {
      event.preventDefault();
      removeBar();
      if (invitation.scrollIntoView) invitation.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.body.appendChild(bar);
    if (typeof IntersectionObserver === "function") {
      var observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            removeBar();
            observer.disconnect();
            return;
          }
        }
      }, { threshold: 0.5 });
      observer.observe(invitation);
    }
  }

  function enterStuck(trigger) {
    if (variant === "stuck") return;
    var invitation = document.getElementById("referral-invitation");
    // Sans textes posés dans le Designer, la variante n'existe pas.
    if (!invitation || !invitation.querySelector("[data-referral-stuck-text]")) return;
    if (getComputedStyle(invitation).display === "none") return;
    if (codeValidated() || inviting(invitation)) return;
    variant = "stuck";
    useStuckTexts(invitation);
    useStuckTexts(document.getElementById("referral-confirmation"));
    showBar(invitation, invitation.getAttribute("data-referral-stuck-bar"));
    track("referral_stuck_shown", { option: trigger });
  }

  function startStuckTimer() {
    var invitation = document.getElementById("referral-invitation");
    var seconds = invitation ? parseFloat(invitation.getAttribute("data-referral-stuck-after")) : NaN;
    if (seconds > 0) setTimeout(function () { enterStuck("timer"); }, seconds * 1000);
  }

  // text : message propre à un cas (adresse refusée) ; sans, le texte posé dans le Designer.
  function showFail(form, visible, text) {
    var block = form.closest(".w-form") || form.parentNode;
    var fail = block && block.querySelector(".w-form-fail");
    if (!fail) return;
    var slot = fail.firstElementChild || fail;
    if (!fail.hasAttribute("data-referral-fail-text")) fail.setAttribute("data-referral-fail-text", slot.textContent);
    slot.textContent = text || fail.getAttribute("data-referral-fail-text");
    fail.style.display = visible ? "block" : "none";
  }

  function bouncedText(form, invitee) {
    var block = form.closest(".w-form") || form.parentNode;
    var fail = block && block.querySelector(".w-form-fail");
    var text = (fail && fail.getAttribute("data-referral-bounced-text")) || BOUNCED_TEXT;
    return text.replace("{email}", invitee);
  }

  function setBusy(form, busy) {
    var button = form.querySelector('[type="submit"]');
    if (!button) return;
    if (busy) {
      button.setAttribute("data-referral-label", button.value);
      if (button.getAttribute("data-wait")) button.value = button.getAttribute("data-wait");
      button.disabled = true;
    } else {
      if (button.hasAttribute("data-referral-label")) button.value = button.getAttribute("data-referral-label");
      button.disabled = false;
    }
  }

  function postInvitation(endpoint, payload) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    }).then(function (response) {
      if (timer) clearTimeout(timer);
      if (!response.ok) throw new Error("HTTP " + response.status);
      // Le corps (ticket de suivi) est un plus : illisible, l'invitation reste envoyée.
      if (typeof response.json !== "function") return {};
      return response.json().then(function (body) { return body || {}; }, function () { return {}; });
    }, function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    });
  }

  function statusEndpoint(form, endpoint) {
    var url = form.getAttribute("data-referral-status-endpoint") || endpoint.replace(/\/parrainage-invitation$/, "/parrainage-statut");
    return url !== endpoint && url.indexOf("https://") === 0 ? url : "";
  }

  // Le serveur de l'invité a refusé l'adresse : le formulaire revient, avec l'adresse à corriger.
  function showBounced(form, invitee) {
    watching = null;
    bounced[invitee.toLowerCase()] = true;
    var invitation = document.getElementById("referral-invitation");
    setVisible(document.getElementById("referral-confirmation"), false);
    setVisible(invitation, true);
    var input = form.querySelector('input[type="email"]');
    if (input && input.value === "") input.value = invitee;
    showFail(form, true, bouncedText(form, invitee));
    // Bloc hors de l'écran (mobile, sous la boîte du code) : la barre y mène.
    if (invitation) showBar(invitation, invitation.getAttribute("data-referral-bounced-bar") || BOUNCED_BAR);
    track("referral_invite_failed", { failure_reason: "bounced", option: variant });
  }

  // Une demande à la fois ; toute réponse autre qu'« en attente » arrête le suivi (une panne est
  // signalée côté serveur, la page se tait). Le code validé, la page part : on arrête aussi.
  function watchBounce(form, endpoint, invitee, ticket) {
    var url = statusEndpoint(form, endpoint);
    if (!ticket || !url) return;
    var watch = {};
    var started = Date.now();
    var step = 0;
    watching = watch;
    function next() {
      if (step >= WATCH_DELAYS_MS.length) return;
      setTimeout(poll, Math.max(0, WATCH_DELAYS_MS[step++] - (Date.now() - started)));
    }
    function poll() {
      if (watching !== watch || codeValidated()) return;
      fetch(url, {
        method: "POST",
        // text/plain : pas de préflight CORS, une seule invocation par demande.
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ ticket: ticket, invitee_email: invitee }),
      }).then(function (response) {
        return response.ok ? response.json() : null;
      }).then(function (body) {
        if (watching !== watch || !body) return;
        if (body.status === "bounced") showBounced(form, invitee);
        else if (body.status === "pending") next();
      }, function () {});
    }
    next();
  }

  function showConfirmation(invitee) {
    var confirmation = document.getElementById("referral-confirmation");
    if (confirmation) {
      var slots = confirmation.querySelectorAll("[data-referral-email]");
      for (var i = 0; i < slots.length; i++) slots[i].textContent = invitee;
    }
    setVisible(document.getElementById("referral-invitation"), false);
    setVisible(confirmation, true);
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.closest || !form.closest("#referral-invitation")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending) return;

    var input = form.querySelector('input[type="email"]');
    var invitee = input ? input.value.trim() : "";
    var endpoint = form.getAttribute("data-referral-endpoint") || form.getAttribute("action") || "";
    var referrer = getReferrer();
    showFail(form, false);

    if (!invitee) {
      showFail(form, true);
      return;
    }
    // Déjà refusée pendant cette visite : un nouvel envoi ne partirait pas (Make n'invite qu'une fois).
    if (bounced[invitee.toLowerCase()]) {
      showFail(form, true, bouncedText(form, invitee));
      track("referral_invite_failed", { failure_reason: "bounced_again", option: variant });
      return;
    }
    // Sans parrain ou sans adresse d'envoi, c'est une panne, pas une erreur de saisie.
    var blocked = !referrer ? "no_referrer" : endpoint.indexOf("https://") !== 0 ? "no_endpoint" : "";
    if (blocked) {
      showFail(form, true);
      track("referral_invite_failed", { failure_reason: blocked, option: variant });
      report(blocked);
      return;
    }

    pending = true;
    setBusy(form, true);
    postInvitation(endpoint, {
      invitee_email: invitee,
      referrer_member_id: referrer.memberId,
      referrer_email: referrer.email,
      pre_auth_token: referrer.preAuthToken,
      variant: variant,
    }).then(function (body) {
      pending = false;
      sent = true;
      setBusy(form, false);
      form.reset();
      removeBar();
      showConfirmation(invitee);
      track("referral_invite_sent", { option: variant });
      watchBounce(form, endpoint, invitee, body && typeof body.ticket === "string" ? body.ticket : "");
    }, function (error) {
      pending = false;
      setBusy(form, false);
      showFail(form, true);
      var reason = failureReason(error);
      track("referral_invite_failed", { failure_reason: reason, option: variant });
      report(reason);
    });
  }, true);

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var resend = target.closest(RESEND_SELECTOR);
    if (resend) {
      enterStuck(resend.id === "send-otp-by-sms" ? "resend_sms" : "resend_email");
      return;
    }
    var link = target.closest("#go-back-link");
    if (!link) return;
    event.preventDefault();
    setVisible(document.getElementById("referral-confirmation"), false);
    setVisible(document.getElementById("referral-invitation"), true);
    var input = document.querySelector('#referral-invitation input[type="email"]');
    if (input) input.focus();
  });

  function init() {
    applyPreview();
    startStuckTimer();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
