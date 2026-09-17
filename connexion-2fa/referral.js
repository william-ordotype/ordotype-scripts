// Invitation d'un confrère depuis la page 2FA : envoie l'adresse saisie puis affiche la confirmation.
(function () {
  var SESSION_KEY = "_ms-2fa-session";
  var TIMEOUT_MS = 10000;
  var pending = false;
  var shownDisplay = "";

  function getReferrer() {
    try {
      var session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      var data = session && session.data;
      if (data && data.memberId && data.email) {
        return { memberId: data.memberId, email: data.email };
      }
    } catch (e) {}
    return null;
  }

  function setVisible(el, visible) {
    if (el) el.style.display = visible ? shownDisplay || "block" : "none";
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
    var invitation = document.getElementById("referral-invitation");
    var confirmation = document.getElementById("referral-confirmation");
    if (invitation) {
      var display = window.getComputedStyle(invitation).display;
      if (display && display !== "none") shownDisplay = display;
    }
    if (confirmation) {
      var slots = confirmation.querySelectorAll("[data-referral-email]");
      for (var i = 0; i < slots.length; i++) slots[i].textContent = invitee;
    }
    setVisible(invitation, false);
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
    var endpoint = form.getAttribute("action") || "";
    var referrer = getReferrer();
    showFail(form, false);

    if (!invitee || !referrer || endpoint.indexOf("https://") !== 0) {
      showFail(form, true);
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
    }, function () {
      pending = false;
      setBusy(form, false);
      showFail(form, true);
    });
  }, true);

  document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest && event.target.closest('#referral-confirmation a[href="#"]');
    if (!link) return;
    event.preventDefault();
    setVisible(document.getElementById("referral-confirmation"), false);
    setVisible(document.getElementById("referral-invitation"), true);
    var input = document.querySelector('#referral-invitation input[type="email"]');
    if (input) input.focus();
  });
})();
