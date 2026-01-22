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
  const msMemberData = localStorage.getItem("_ms-mem");
  if (!msMemberData) return { userId: null, email: null };

  try {
    const memberData = JSON.parse(msMemberData);
    return {
      userId: memberData.id,
      email: memberData.auth?.email
    };
  } catch (e) {
    console.error("Failed to parse Memberstack data", e);
    return { userId: null, email: null };
  }
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
