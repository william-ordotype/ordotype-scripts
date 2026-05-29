window.$crisp = [];
window.CRISP_WEBSITE_ID = "7fcb1bdb-58d0-49a9-a269-397bac574b0b";

(function() {
  const d = document;
  const s = d.createElement("script");
  s.src = "https://client.crisp.chat/l.js";
  s.async = 1;
  d.getElementsByTagName("head")[0].appendChild(s);
})();

function getMemberstackData() {
  // On /membership/connexion-2fa, _ms-mem isn't populated yet (auth not
  // complete), but ms_member_id is set in localStorage just before the 2FA
  // challenge renders. Read it first; fall back to _ms-mem for the email.
  let userId = null;
  let email = null;

  try {
    userId = localStorage.getItem("ms_member_id") || null;
  } catch (e) {}

  try {
    const msMemberData = localStorage.getItem("_ms-mem");
    if (msMemberData) {
      const memberData = JSON.parse(msMemberData);
      if (!userId) userId = memberData.id || null;
      email = memberData.auth?.email || null;
    }
  } catch (e) {
    console.error("[Crisp] Failed to parse Memberstack data", e);
  }

  return { userId, email };
}

function pushCrispData() {
  const { userId, email } = getMemberstackData();
  const pageUrl = window.location.href;

  if (userId) {
    window.$crisp.push(["set", "session:data", ["ms_member_id", userId]]);
  }
  window.$crisp.push(["set", "session:data", ["page_url", pageUrl]]);

  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    window.$crisp.push(["set", "user:email", [email]]);
  }
}

// Push on chat opened (most reliable)
window.$crisp.push(["on", "chat:opened", pushCrispData]);

// Also push on message sent (backup)
window.$crisp.push(["on", "message:sent", pushCrispData]);

// Custom button handler
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("openCrispChatBot");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    pushCrispData();
    window.$crisp.push(["do", "chat:open"]);

    const { userId } = getMemberstackData();
    fetch("https://hook.eu1.make.com/2y5953s121fply94qfperoccxm11bbhd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    }).catch(err => console.error("[Chat] Webhook error:", err));
  });
});
