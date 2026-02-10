window.$crisp = [];
window.CRISP_WEBSITE_ID = "7fcb1bdb-58d0-49a9-a269-397bac574b0b";

(function() {
  const d = document;
  const s = d.createElement("script");
  s.src = "https://client.crisp.chat/l.js";
  s.async = 1;
  d.getElementsByTagName("head")[0].appendChild(s);
})();

function pushCrispData() {
  // Prefer shared utility, fallback to inline parsing
  var ms = window.OrdoMemberstack;
  var userId = null;
  var email = null;

  if (ms) {
    userId = ms.memberId;
    email = ms.email;
  } else {
    try {
      var raw = localStorage.getItem("_ms-mem");
      if (raw) {
        var memberData = JSON.parse(raw);
        userId = memberData.id;
        email = memberData.auth && memberData.auth.email;
      }
    } catch (e) {}
  }

  if (userId) {
    window.$crisp.push(["set", "session:data", ["ms_member_id", userId]]);
  }

  const pageUrl = window.location.href;
  window.$crisp.push(["set", "session:data", ["page_url", pageUrl]]);

  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    window.$crisp.push(["set", "user:email", [email]]);
  }
}

window.$crisp.push(["on", "chat:opened", pushCrispData]);
window.$crisp.push(["on", "message:sent", pushCrispData]);
