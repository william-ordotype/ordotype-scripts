// Invitation d'un confrère depuis la page 2FA : envoie l'adresse saisie puis affiche la confirmation.
(function () {
  var SESSION_KEY = "_ms-2fa-session";
  var EMAIL_KEY = "ms_email";
  var EMAIL_PATTERN = /^[^\s@*]+@[^\s@*]+\.[^\s@*]+$/;
  var HIDDEN_CLASS = "hidden";
  var TIMEOUT_MS = 10000;
  var pending = false;

  // Mesure dans le dataLayer et signalement des échecs au suivi d'erreurs de la page.
  function track(event, failureReason) {
    try {
      var payload = { event: event };
      if (failureReason) payload.failure_reason = failureReason;
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
      var memberId = session && session.data && session.data.memberId;
      var email = String(sessionStorage.getItem(EMAIL_KEY) || "").trim();
      if (memberId && EMAIL_PATTERN.test(email)) {
        return { memberId: memberId, email: email };
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

  function showFail(form, visible) {
    var block = form.closest(".w-form") || form.parentNode;
    var fail = block && block.querySelector(".w-form-fail");
    if (fail) fail.style.display = visible ? "block" : "none";
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
    }, function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    });
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
    // Sans parrain ou sans adresse d'envoi, c'est une panne, pas une erreur de saisie.
    var blocked = !referrer ? "no_referrer" : endpoint.indexOf("https://") !== 0 ? "no_endpoint" : "";
    if (blocked) {
      showFail(form, true);
      track("referral_invite_failed", blocked);
      report(blocked);
      return;
    }

    pending = true;
    setBusy(form, true);
    postInvitation(endpoint, {
      invitee_email: invitee,
      referrer_member_id: referrer.memberId,
      referrer_email: referrer.email,
    }).then(function () {
      pending = false;
      setBusy(form, false);
      form.reset();
      showConfirmation(invitee);
      track("referral_invite_sent");
    }, function (error) {
      pending = false;
      setBusy(form, false);
      showFail(form, true);
      var reason = failureReason(error);
      track("referral_invite_failed", reason);
      report(reason);
    });
  }, true);

  document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest && event.target.closest("#go-back-link");
    if (!link) return;
    event.preventDefault();
    setVisible(document.getElementById("referral-confirmation"), false);
    setVisible(document.getElementById("referral-invitation"), true);
    var input = document.querySelector('#referral-invitation input[type="email"]');
    if (input) input.focus();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyPreview);
  else applyPreview();
})();
