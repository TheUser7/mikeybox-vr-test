// SITE STATUS banner and closed screen for every Mikeybox site (owner 2026-10-26: "It needs to be really clear to everyone that
// the service is out of commission for the time being, but my moderators need to be able to still access the site, but the
// site should still have a header on every page reminding that the service is offline. Please make this reusable and
// configurable"). Reads the shared status (site_status.mjs, GET /api/site-status) and:
//   notice -> a banner at the top of every page;
//   closed -> the banner, and for everyone but a signed-in Discord moderator the full announcement over the page.
// The servers enforce "closed" on their own; this file only tells people. The same file ships on workshop/fabshop.mikeybox.ai
// (site/site_status.js, the canonical copy), prime/fab.mikeybox.ai (goop_editor/site_status.js) and www.mikeybox.ai
// (mikeybox_landing_web/site_status.js); the deploy tests keep the copies identical.
// Optional attributes on the <script> tag: data-status-url, data-account-origin (the Workshop that knows who is signed in).
(function () {
  "use strict";
  var script = document.currentScript;
  var host = location.hostname;
  // Each site's Workshop (sign-in and moderator status) and where its status is served.
  var accountOrigin = (script && script.getAttribute("data-account-origin")) ||
    (/^fab(shop)?\./.test(host) ? "https://fabshop.mikeybox.ai"
      : /(^|\.)mikeybox\.ai$/.test(host) && !/^workshop\./.test(host) ? "https://workshop.mikeybox.ai" : location.origin);
  var statusUrl = (script && script.getAttribute("data-status-url")) ||
    (/^(www\.)?mikeybox\.ai$/.test(host) ? accountOrigin + "/api/site-status" : "/api/site-status");
  var sameAccountSite = accountOrigin === location.origin;
  var api = window.MikeyboxSiteStatus = { status: null, moderator: false, user: null, refresh: refresh };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function getJson(url, withCredentials) {
    return fetch(url, { credentials: withCredentials ? "include" : "omit", cache: "no-store" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (body) { return body && body.data ? body.data : null; });
  }

  var CSS = [
    ":root{--mbx-status-height:0px}",
    ".mbx-status-bar{position:sticky;top:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:10px;",
    "flex-wrap:nowrap;padding:7px 14px;background:linear-gradient(90deg,#3b1d24,#4a2a1f 50%,#3b1d24);color:#ffe9d6;",
    "border-bottom:1px solid #b9785a;font:600 13px/1.4 Inter,'Segoe UI',Arial,sans-serif;text-align:center;box-shadow:0 2px 12px #0006}",
    ".mbx-status-text{flex:0 1 auto;min-width:0;max-width:900px}.mbx-status-bar>button,.mbx-status-mod{flex:none}",
    ".mbx-status-bar.notice{background:linear-gradient(90deg,#2e2a12,#3d3614 50%,#2e2a12);border-color:#b3a052;color:#fff6cf}",
    ".mbx-status-dot{width:8px;height:8px;border-radius:50%;background:#ff8a6b;box-shadow:0 0 0 3px #ff8a6b33;flex:0 0 auto}",
    ".mbx-status-bar.notice .mbx-status-dot{background:#ffd75e;box-shadow:0 0 0 3px #ffd75e33}",
    ".mbx-status-bar button{border:1px solid #d89a7c;background:transparent;color:inherit;border-radius:5px;padding:3px 10px;font:inherit;",
    "font-size:12px;cursor:pointer}.mbx-status-bar button:hover{background:#ffffff14}",
    ".mbx-status-mod{padding:2px 7px;border:1px solid #c9a56a;border-radius:3px;background:#493f29;color:#ffe3ae;font-size:10px;",
    "letter-spacing:.06em;text-transform:uppercase}",
    ".mbx-closed{position:fixed;inset:0;z-index:2147483600;overflow-y:auto;background:#070b14;color:#efe7dc;",
    "font:16px/1.65 Inter,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;background:#080d17}",
    ".mbx-closed-inner{max-width:880px;margin:0 auto;padding:0 18px 64px}",
    ".mbx-closed-scene{display:block;width:100%;height:clamp(200px,min(50vh,62vw),520px)}",
    ".mbx-closed-card{position:relative;margin:-36px auto 0;max-width:720px;padding:34px clamp(20px,5vw,48px) 30px;",
    "background:linear-gradient(180deg,#121a2bf2,#0d1320f7);border:1px solid #3a4560;border-radius:16px;box-shadow:0 30px 80px #000a}",
    ".mbx-closed-kicker{margin:0 0 10px;color:#ff9f86;font-size:12px;font-weight:800;letter-spacing:.24em;text-transform:uppercase}",
    ".mbx-closed h1{margin:0 0 20px;font:400 clamp(30px,5.4vw,46px)/1.12 Georgia,'Times New Roman',serif;color:#fff6ea;letter-spacing:-.01em}",
    ".mbx-closed p{margin:0 0 16px;color:#d9d2c8}.mbx-closed p.mbx-closed-lede{color:#f3ece2;font-size:17px}",
    ".mbx-closed-song{margin:6px 0 0;color:#b9b2c9;font-style:italic;font-size:15px}.mbx-closed-song a{color:#e7c9ff;text-decoration:underline;text-underline-offset:3px}",
    ".mbx-closed-actions{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0 8px}",
    ".mbx-closed-actions a{display:inline-flex;align-items:center;min-height:44px;padding:10px 18px;border-radius:8px;background:#b6ee71;",
    "color:#132114;font-weight:800;text-decoration:none}.mbx-closed-actions a:hover{background:#cefa92}",
    ".mbx-closed-mod{margin-top:22px;padding-top:16px;border-top:1px solid #2d3650;color:#9aa6bd;font-size:13px}",
    ".mbx-closed-mod a,.mbx-closed-mod button.mbx-link{color:#9fd8de;font:inherit;font-weight:700;background:none;border:0;padding:0;",
    "cursor:pointer;text-decoration:underline}.mbx-closed-mod form{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
    ".mbx-closed-mod input{min-width:0;width:12em;padding:8px 10px;border-radius:6px;border:1px solid #3d4a66;background:#0b111d;color:#efe7dc;font:inherit}",
    ".mbx-closed-mod form button{padding:8px 14px;border-radius:6px;border:1px solid #5e7a9a;background:#16213a;color:#e7eefb;font:inherit;cursor:pointer}",
    ".mbx-closed-note{margin-top:8px;color:#ffb4a3}",
    ".mbx-twinkle{animation:mbx-twinkle 4s ease-in-out infinite}@keyframes mbx-twinkle{0%,100%{opacity:.25}50%{opacity:1}}",
    ".mbx-glow{animation:mbx-glow 7s ease-in-out infinite}@keyframes mbx-glow{0%,100%{opacity:.18}45%{opacity:.34}60%{opacity:.12}}",
    ".mbx-balloon{animation:mbx-drift 26s ease-in infinite}@keyframes mbx-drift{0%{transform:translate(0,0);opacity:0}6%{opacity:1}",
    "80%{opacity:.9}100%{transform:translate(170px,-330px);opacity:0}}",
    ".mbx-sign{transform-origin:330px 248px;animation:mbx-swing 6s ease-in-out infinite}@keyframes mbx-swing{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}",
    ".mbx-mote{animation:mbx-mote 12s linear infinite}@keyframes mbx-mote{0%{transform:translate(0,0);opacity:0}20%{opacity:.8}100%{transform:translate(30px,-60px);opacity:0}}",
    "@media(max-width:640px){.mbx-status-bar{flex-wrap:wrap;gap:6px 10px;font-size:12px}.mbx-status-text{flex:1 1 100%}}",
    // Owner 2026-10-31: no notice banner on phones (portrait, or landscape with little height). Wrapped to three lines it took
    // too much of the screen and covered the Goop Editor's "Close properties" button. A closed site still shows its banner.
    "@media(max-width:760px),(pointer:coarse) and (max-height:520px){.mbx-status-bar.notice{display:none}}",
    "@media(prefers-reduced-motion:reduce){.mbx-twinkle,.mbx-glow,.mbx-balloon,.mbx-sign,.mbx-mote{animation:none}.mbx-balloon{transform:translate(120px,-150px)}}"
  ].join("");

  // A quiet night at the workshop: the lamp nearly out, a CLOSED sign on the door, an unfinished build on the bench and
  // one balloon drifting away from it.
  function sceneSvg() {
    var stars = "";
    var points = [[60, 40], [140, 90], [210, 30], [300, 70], [380, 24], [470, 58], [540, 30], [610, 84], [700, 42], [760, 96],
      [90, 130], [250, 120], [430, 112], [520, 140], [680, 150], [30, 180], [345, 160], [585, 190], [735, 200], [170, 175],
      [-340, 60], [-260, 140], [-180, 40], [-90, 110], [-30, 200], [-310, 210], [840, 50], [910, 130], [990, 70], [1060, 160],
      [1130, 40], [880, 210], [1170, 190], [-150, 230]];
    for (var i = 0; i < points.length; i++) {
      stars += '<circle class="mbx-twinkle" cx="' + points[i][0] + '" cy="' + points[i][1] + '" r="' + (i % 3 === 0 ? 1.8 : 1.1) +
        '" fill="#fff8e7" style="animation-delay:' + ((i * 0.37) % 4).toFixed(2) + 's"/>';
    }
    var motes = "";
    for (var j = 0; j < 7; j++) {
      motes += '<circle class="mbx-mote" cx="' + (250 + j * 48) + '" cy="' + (300 + (j % 3) * 14) + '" r="1.4" fill="#ffd9a0" style="animation-delay:' +
        (j * 1.7).toFixed(1) + 's"/>';
    }
    return '<svg class="mbx-closed-scene" viewBox="-400 0 1600 420" preserveAspectRatio="xMidYMax slice" role="img" aria-label="A quiet workshop at night. The lamp over the door ' +
      'is almost out, a sign on the door says closed, an unfinished invention sits on the bench, and a single balloon drifts away ' +
      'into the stars.">' +
      '<defs><linearGradient id="mbxSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b14"/><stop offset=".55" stop-color="#1a2140"/>' +
      '<stop offset=".82" stop-color="#3d2f4d"/><stop offset="1" stop-color="#5a3c44"/></linearGradient>' +
      '<radialGradient id="mbxMoon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6dc" stop-opacity=".55"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mbxLamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf7a"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient></defs>' +
      '<rect x="-400" width="1600" height="420" fill="url(#mbxSky)"/>' + stars +
      '<circle cx="660" cy="86" r="70" fill="url(#mbxMoon)"/><circle cx="660" cy="86" r="26" fill="#f6ead0"/><circle cx="671" cy="79" r="23" fill="#0e1428"/>' +
      '<path d="M-400 326 C-250 306 -120 334 0 330 C120 300 220 318 330 310 C460 300 560 292 660 306 C720 314 770 322 800 318 C930 310 1060 336 1200 322 L1200 420 L-400 420 Z" fill="#0c1220"/>' +
      '<path d="M-400 350 C-200 340 -100 356 0 352 C160 338 320 350 470 344 C600 338 700 348 800 342 C960 336 1080 352 1200 346 L1200 420 L-400 420 Z" fill="#080d17"/>' +
      // the workshop
      '<g><path d="M210 330 L210 210 L330 150 L450 210 L450 330 Z" fill="#141c2c" stroke="#232f47" stroke-width="2"/>' +
      '<path d="M196 214 L330 144 L464 214" fill="none" stroke="#2c3956" stroke-width="7" stroke-linecap="round"/>' +
      '<rect x="370" y="236" width="50" height="40" rx="3" fill="#0b101b" stroke="#2a3550" stroke-width="2"/>' +
      '<path d="M395 236 L395 276 M370 256 L420 256" stroke="#2a3550" stroke-width="2"/>' +
      '<rect x="296" y="242" width="68" height="88" rx="4" fill="#0d1320" stroke="#2a3550" stroke-width="2"/>' +
      '<circle cx="352" cy="290" r="3" fill="#56617a"/>' +
      '<circle class="mbx-glow" cx="330" cy="222" r="44" fill="url(#mbxLamp)"/>' +
      '<path d="M330 204 L330 214" stroke="#3a4560" stroke-width="2"/><circle cx="330" cy="219" r="5" fill="#6b5a3e"/>' +
      // the CLOSED sign
      '<g class="mbx-sign"><path d="M314 248 L330 236 L346 248" fill="none" stroke="#8a7350" stroke-width="1.5"/>' +
      '<rect x="301" y="248" width="58" height="22" rx="3" fill="#c9a36b" stroke="#7a5f3b"/>' +
      '<text x="330" y="263.5" text-anchor="middle" font-family="Georgia,serif" font-size="11" font-weight="700" fill="#3a2a18" letter-spacing="1.5">CLOSED</text></g></g>' +
      // the bench and the unfinished build
      '<g><rect x="478" y="300" width="128" height="8" rx="2" fill="#2a2620"/><rect x="486" y="308" width="6" height="26" fill="#221f1a"/>' +
      '<rect x="592" y="308" width="6" height="26" fill="#221f1a"/>' +
      '<rect x="500" y="276" width="24" height="24" rx="3" fill="#b6ee71" fill-opacity=".35" stroke="#b6ee71" stroke-opacity=".5"/>' +
      '<rect x="526" y="282" width="18" height="18" rx="3" fill="#7bc9d1" fill-opacity=".3" stroke="#7bc9d1" stroke-opacity=".5"/>' +
      '<rect x="508" y="254" width="16" height="22" rx="3" fill="#b6ee71" fill-opacity=".25" stroke="#b6ee71" stroke-opacity=".4"/>' +
      '<circle cx="566" cy="290" r="10" fill="none" stroke="#c9a36b" stroke-opacity=".55" stroke-width="3"/>' +
      '<circle cx="566" cy="290" r="3" fill="#c9a36b" fill-opacity=".55"/>' +
      '<path d="M516 254 C520 238 512 226 520 214" fill="none" stroke="#d8d0c0" stroke-opacity=".45" stroke-width="1" stroke-dasharray="2 3"/></g>' +
      // one balloon drifting away
      '<g class="mbx-balloon"><path d="M520 214 C516 200 526 192 520 178" fill="none" stroke="#e8e0d0" stroke-width="1"/>' +
      '<ellipse cx="520" cy="160" rx="15" ry="19" fill="#ff8a6b"/><path d="M516 178 L524 178 L520 172 Z" fill="#e4735a"/>' +
      '<ellipse cx="514" cy="152" rx="4" ry="6" fill="#ffd2c4" fill-opacity=".55"/></g>' + motes +
      '</svg>';
  }

  function paragraphs(text) {
    var fragment = document.createDocumentFragment();
    var parts = String(text || "").split(/\n\s*\n/);
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i].trim()) continue;
      var p = el("p", i === 0 ? "mbx-closed-lede" : "");
      var lines = parts[i].split("\n");
      for (var k = 0; k < lines.length; k++) {
        if (k) p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(lines[k]));
      }
      fragment.appendChild(p);
    }
    return fragment;
  }

  function trackHeight(bar) {
    var set = function () { document.documentElement.style.setProperty("--mbx-status-height", (bar.offsetHeight || 0) + "px"); };
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(bar);
    else window.addEventListener("resize", set);
  }

  function renderBar(status) {
    var old = document.getElementById("mbx-status-bar");
    if (old) old.remove();
    if (!status || status.mode === "open" || !status.banner) {
      document.documentElement.style.setProperty("--mbx-status-height", "0px");
      return;
    }
    var bar = el("div", "mbx-status-bar" + (status.mode === "notice" ? " notice" : ""));
    bar.id = "mbx-status-bar";
    bar.setAttribute("role", "status");
    bar.appendChild(el("span", "mbx-status-dot"));
    bar.appendChild(el("span", "mbx-status-text", status.banner));
    if (status.mode === "closed" && api.moderator) bar.appendChild(el("span", "mbx-status-mod", "Moderator view"));
    if (status.mode === "closed" && status.title) {
      var more = el("button", "", "Read the announcement");
      more.type = "button";
      more.addEventListener("click", function () { renderClosed(status, true); });
      bar.appendChild(more);
    }
    document.body.insertBefore(bar, document.body.firstChild);
    trackHeight(bar);
  }

  function signInUrl(verifyModerator) {
    var back = sameAccountSite ? location.pathname + location.search : "/";
    return accountOrigin + "/auth/discord?" + (verifyModerator ? "moderator=1&" : "") + "returnTo=" + encodeURIComponent(back);
  }

  function renderClosed(status, dismissible) {
    var old = document.getElementById("mbx-closed");
    if (old) old.remove();
    var overlay = el("div", "mbx-closed");
    overlay.id = "mbx-closed";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "mbx-closed-title");
    var scene = el("div");
    scene.innerHTML = sceneSvg();
    overlay.appendChild(scene.firstChild);
    var inner = el("div", "mbx-closed-inner");
    var card = el("div", "mbx-closed-card");
    card.appendChild(el("p", "mbx-closed-kicker", status.kicker || "Service offline"));
    var title = el("h1", "", status.title);
    title.id = "mbx-closed-title";
    card.appendChild(title);
    card.appendChild(paragraphs(status.message));
    // Owner 2026-10-26: a small optional song line (a link to the official video; nothing plays on the page).
    if (status.song && /^https:\/\//.test(status.song.url)) {
      var song = el("p", "mbx-closed-song", "\u266A ");
      var songLink = el("a", "", status.song.label || "A song for tonight");
      songLink.href = status.song.url;
      songLink.target = "_blank";
      songLink.rel = "noopener noreferrer";
      song.appendChild(songLink);
      card.appendChild(song);
    }
    var actions = el("div", "mbx-closed-actions");
    if (status.link && /^https:\/\//.test(status.link.url)) {
      var link = el("a", "", status.link.label || "Learn more");
      link.href = status.link.url;
      link.rel = "noopener";
      actions.appendChild(link);
    }
    card.appendChild(actions);
    var mod = el("div", "mbx-closed-mod");
    if (dismissible) {
      var close = el("button", "mbx-link", "Back to the site");
      close.type = "button";
      close.addEventListener("click", function () { overlay.remove(); document.documentElement.style.overflow = ""; });
      mod.appendChild(close);
    } else if (api.user) {
      // A moderator's verified role lasts a day; a signed-in moderator past it verifies again with one sign-in.
      mod.appendChild(document.createTextNode("Signed in as " + (api.user.displayName || "your Discord account") +
        ". The site is open only to the Discord moderators right now. Moderator? "));
      var verify = el("a", "", "Verify your Discord moderator role");
      verify.href = signInUrl(true);
      mod.appendChild(verify);
      mod.appendChild(document.createTextNode(sameAccountSite ? "." : " (then come back here)."));
    } else {
      mod.appendChild(document.createTextNode("Discord moderator? "));
      var signIn = el("a", "", "Sign in with Discord");
      signIn.href = signInUrl(false);
      mod.appendChild(signIn);
      mod.appendChild(document.createTextNode((sameAccountSite ? "" : " (then come back here)") +
        ", or enter a sign-in code from #website-login:"));
      {
        var form = el("form");
        var input = el("input");
        input.inputMode = "numeric";
        input.autocomplete = "one-time-code";
        input.placeholder = "8-digit code";
        input.setAttribute("aria-label", "Sign-in code from Discord");
        var go = el("button", "", "Use code");
        go.type = "submit";
        var note = el("p", "mbx-closed-note");
        form.appendChild(input);
        form.appendChild(go);
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          note.textContent = "";
          fetch(accountOrigin + "/auth/discord/code", { method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: input.value.replace(/[\s-]/g, "") }) })
            .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
            .then(function (result) {
              if (!result.ok) throw new Error((result.body && result.body.error && result.body.error.message) || "That code did not work.");
              return refresh();
            })
            .then(function () { if (!api.moderator && document.getElementById("mbx-closed")) note.textContent = "Signed in, but this Discord account is not a moderator."; })
            .catch(function (error) { note.textContent = error.message; });
        });
        mod.appendChild(form);
        mod.appendChild(note);
      }
    }
    card.appendChild(mod);
    inner.appendChild(card);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    if (dismissible) overlay.addEventListener("keydown", function (event) { if (event.key === "Escape") { overlay.remove(); document.documentElement.style.overflow = ""; } });
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }

  function refresh() {
    return getJson(statusUrl, false).then(function (status) {
      api.status = status;
      if (!status || status.mode !== "closed") return null;
      return getJson(accountOrigin + "/api/me", true).catch(function () { return null; });
    }).then(function (me) {
      var status = api.status;
      api.user = me && me.user ? me.user : null;
      api.moderator = !!(api.user && api.user.isModerator);
      renderBar(status);
      var overlay = document.getElementById("mbx-closed");
      if (status && status.mode === "closed" && !api.moderator) {
        if (!overlay) renderClosed(status, false);
      } else if (overlay) {
        overlay.remove();
        document.documentElement.style.overflow = "";
      }
    }).catch(function () { /* no status: say nothing; the servers still enforce it */ });
  }

  function start() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    refresh();
    setInterval(refresh, 120000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
