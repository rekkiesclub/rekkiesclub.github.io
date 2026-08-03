/* ============================================================
   REKKIES CLUB — app.js  (the REKKIES CLUB platform)
   Vanilla JS, no build step, served straight to the browser.

   A PRIVATE members community for real-life Rekkies ONLY. There is no
   sign-up and no guest access: accounts are created manually by the club,
   and the whole app sits behind a members-only login gate. Log in with the
   email + password the club gave you, land in the live Main Room, and chat
   in real time in any room.

   Layout: logged out, the page is just the gate (login card). Logged in,
   rooms live in a "Rooms" dropdown menu at the top right; your profile
   lives in a profile dropdown next to it; the page itself is the live chat.

   Runs on Supabase with only the publishable key:
   • Profiles ... Supabase Auth (email + password, club-created). Your
                  display name lives on your own Auth record
                  (user_metadata), so it follows your account, no table.
   • Live chat .. Supabase Realtime Broadcast — messages between everyone in
                  a room, instantly.
   • Who's here . Supabase Realtime Presence — a live count of who's in the
                  room right now.
   • Saved chat . the `messages` table (supabase/schema.sql) keeps history
                  permanently: it loads when a room opens and every member
                  message is stored until its author deletes it.

   Only the PUBLISHABLE key belongs in this file — it's public by design.
   The secret / service-role key must NEVER be added here or committed.
   ============================================================ */

const SUPABASE_URL = "https://ejhhjzamdittnbfvxsfx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_a8_nkU_F0ZmfX-4TjKl96g_qHJPUgmJ";
// The client is named `sb`, NOT `supabase`: the Supabase UMD script already
// registers a global `supabase` (the library), and re-declaring that name
// throws a page-breaking SyntaxError that blanks the whole app. Keep it `sb`.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Photos + videos are uploaded to a public Supabase Storage bucket; the
// message row just stores the public URL + whether it's an image or a video.
const MEDIA_BUCKET = "chat-media";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB — matches the bucket limit.
// Columns fetched for every message (now including the media fields).
const MSG_COLS = "id, channel_id, user_id, author_name, content, media_url, media_type, created_at";

// ---- rooms ----
// The Main Room is the live home every member lands in after logging in.
// Every room is members-only — the whole app is behind the gate.
const MAIN_CHANNEL = { id: "main", name: "Main Room 🏠" };

const ROOM_GROUPS = [
  {
    key: "community",
    label: "CLUB",
    rooms: [MAIN_CHANNEL],
  },
  {
    key: "creative",
    label: "CREATIVE",
    rooms: [
      { id: "musical-instruments", name: "Musical Instruments 🎹" },
      { id: "music-mixing", name: "Music Mixing 🎧" },
      { id: "music-production", name: "Music Production 🖥️" },
      { id: "photography", name: "Photography 📸" },
      { id: "videography", name: "Videography 🎥" },
      { id: "photo-video-editing", name: "Photo+Video Editing 📸📹" },
    ],
  },
  {
    key: "tech",
    label: "SYSTEM DESIGN",
    rooms: [
      { id: "artificial-intelligence", name: "Artificial Intelligence 🤖" },
      { id: "creative-content", name: "Creative Content 🖋️" },
      { id: "systems", name: "Systems 🌐" },
    ],
  },
  {
    key: "business",
    label: "BUSINESS",
    rooms: [
      { id: "product", name: "Product 🏅" },
      { id: "sales", name: "Sales 🔥" },
      { id: "marketing", name: "Marketing 📢" },
    ],
  },
  {
    key: "inner",
    label: "REKKIES",
    rooms: [{ id: "inner-circle", name: "👑 REKKIES 👑" }],
  },
];

const CHANNELS = ROOM_GROUPS.flatMap((g) =>
  g.rooms.map((room) => ({ ...room, groupKey: g.key, groupLabel: g.label }))
);

function channelById(id) {
  return CHANNELS.find((c) => c.id === id) || null;
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch (e) {
    return "";
  }
}
// A local-only id for a live message that couldn't be saved to the DB (the
// table briefly unreachable) — it still broadcasts to the room.
function clientId() {
  return "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

// ---- identity ----
// The display name shown in chat / presence for the logged-in member.
function displayName() {
  if (state.session) {
    const meta = state.session.user.user_metadata || {};
    return meta.display_name || String(state.session.user.email || "").split("@")[0] || "member";
  }
  return "member";
}
// Can the current user delete this message? Only signed-in members, and only
// their own saved messages (a numeric DB id + a matching user_id).
function canDelete(m) {
  return !!(state.session && m && m.user_id && m.user_id === state.session.user.id);
}

// Remember the last email so it's prefilled next time. The Supabase session is
// persisted by the client, so a logged-in member stays logged in across
// reloads and the browser's own password manager saves the password.
function rememberedEmail() {
  try { return localStorage.getItem("rekkies_last_email") || ""; } catch (e) { return ""; }
}
function rememberEmail(email) {
  try { localStorage.setItem("rekkies_last_email", email); } catch (e) {}
}

// ---- state ----
let state = {
  session: null,
  loading: true,
  activeChannelId: null,
  messages: [],
  rt: null,          // active realtime channel
  rtReady: false,
  onlineCount: 0,
  uploading: false,  // a photo/video is currently uploading
};

async function refreshSession() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  state.loading = false;

  // No session → back behind the gate: tear down any live room completely.
  if (!state.session && state.activeChannelId) {
    teardownRealtime();
    state.activeChannelId = null;
    state.messages = [];
  }

  render();

  // A logged-in member opens straight into the live Main Room. Only when
  // nothing is active, so a later token refresh doesn't yank someone out of
  // a room they deliberately opened.
  if (state.session && !state.activeChannelId) {
    await selectChannel("main");
  } else if (state.session && state.rt && state.rtReady) {
    // Re-track presence under the (possibly new) name after an auth change.
    state.rt.track({ name: displayName() });
  }
}

// There is deliberately NO signUp() — accounts for real-life Rekkies are
// created manually by the club (Supabase dashboard → Authentication → Users).

async function signIn(email, password) {
  rememberEmail(email);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) alert("Couldn't sign in: " + error.message);
}

async function signOut() {
  await sb.auth.signOut();
}

async function editName() {
  if (!state.session) return;
  const current = displayName();
  const name = prompt("Your display name (shown in chat):", current);
  if (name == null) return;
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed || trimmed === current) return;
  const { error } = await sb.auth.updateUser({ data: { display_name: trimmed } });
  if (error) {
    alert("Couldn't save your name: " + error.message);
    return;
  }
  render();
  if (state.rt && state.rtReady) state.rt.track({ name: trimmed });
}

// MEMBERS ONLY: every room needs a logged-in session — the app has no guest
// access at all. (The rank-named groups are just topic labels.)
function isChannelUnlocked(channel) {
  return !!channel && !!state.session;
}

// ---- realtime chat + presence ----
// Tear down the current room's realtime channel. Deliberately SYNCHRONOUS and
// fire-and-forget: awaiting untrack() on a channel that is still mid-subscribe
// can stall for seconds, which used to make the FIRST room switch after page
// load look broken ("can't change rooms"). removeChannel already cleans up.
function teardownRealtime() {
  if (state.rt) {
    try { state.rt.untrack(); } catch (e) {}
    try { sb.removeChannel(state.rt); } catch (e) {}
    state.rt = null;
  }
  state.rtReady = false;
  state.onlineCount = 0;
}

async function selectChannel(channelId) {
  const channel = channelById(channelId);
  if (!channel || !isChannelUnlocked(channel)) return;

  // Switch INSTANTLY — set the active room and repaint before any async work,
  // so the UI never looks stuck no matter what the old channel is doing.
  teardownRealtime();
  state.activeChannelId = channelId;
  state.messages = [];
  renderRoomsMenu();
  renderChatHeader();
  renderMessages();
  renderPresence();

  // Saved history load — works when the `messages` table exists (schema.sql).
  // If it doesn't, this quietly fails and the room is simply live-only.
  try {
    const { data, error } = await sb
      .from("messages")
      .select(MSG_COLS)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (!error && data && state.activeChannelId === channelId) {
      state.messages = data;
    }
  } catch (e) {
    /* no table — live-only room */
  }
  renderMessages();

  // Live messages (Broadcast) + who's-online (Presence) on one channel.
  const myKey = state.session.user.id;
  const rt = sb.channel(`room:${channelId}`, {
    config: { broadcast: { self: false }, presence: { key: myKey } },
  });
  rt.on("broadcast", { event: "msg" }, ({ payload }) => {
    if (state.activeChannelId === channelId) {
      // Guard against a duplicate if we somehow already have this id.
      if (!state.messages.some((m) => String(m.id) === String(payload.id))) {
        state.messages.push(payload);
        renderMessages();
      }
    }
  });
  rt.on("broadcast", { event: "del" }, ({ payload }) => {
    if (state.activeChannelId === channelId) {
      state.messages = state.messages.filter((m) => String(m.id) !== String(payload.id));
      renderMessages();
    }
  });
  // Count unique people in the room. Listen to sync AND the join/leave diffs:
  // the client that subscribed first doesn't always get a `sync` when a later
  // member joins, but it does get a `join` diff — so recount on all three.
  const recount = () => {
    state.onlineCount = Object.keys(rt.presenceState()).length;
    renderPresence();
  };
  rt.on("presence", { event: "sync" }, recount);
  rt.on("presence", { event: "join" }, recount);
  rt.on("presence", { event: "leave" }, recount);
  rt.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      // If the user already switched away before this finished subscribing,
      // drop this orphaned channel instead of marking it ready.
      if (state.activeChannelId !== channelId) { try { sb.removeChannel(rt); } catch (e) {} return; }
      state.rtReady = true;
      await rt.track({ name: displayName() });
    }
  });
  state.rt = rt;
}

// Persist one message (text and/or media), echo it locally, and broadcast it
// live to the room. Shared by both text sends and media uploads.
async function persistAndBroadcast({ content = "", media_url = null, media_type = null }) {
  const channel = channelById(state.activeChannelId);
  if (!channel || !isChannelUnlocked(channel)) return;

  let msg = {
    id: null,
    channel_id: channel.id,
    user_id: state.session.user.id,
    author_name: displayName(),
    content,
    media_url,
    media_type,
    created_at: new Date().toISOString(),
  };

  // SAVE to the DB first so history persists and every client shares the same
  // message id (needed so deletes match everywhere). If the table is briefly
  // unreachable, fall back to a live-only client id.
  try {
    const { data, error } = await sb
      .from("messages")
      .insert({
        channel_id: channel.id,
        user_id: state.session.user.id,
        author_name: msg.author_name,
        content,
        media_url,
        media_type,
      })
      .select(MSG_COLS)
      .single();
    if (!error && data) msg = data;
    else msg.id = clientId();
  } catch (e) {
    msg.id = clientId();
  }

  // Local echo (broadcast is self:false), then push live to the room.
  if (state.activeChannelId === channel.id) {
    state.messages.push(msg);
    renderMessages();
  }
  if (state.rt && state.rtReady) {
    state.rt.send({ type: "broadcast", event: "msg", payload: msg });
  }
}

async function sendMessage(content) {
  const text = content.trim();
  const channel = channelById(state.activeChannelId);
  if (!channel || !isChannelUnlocked(channel) || !text) return;
  await persistAndBroadcast({ content: text });
}

// Upload a chosen photo/video to Storage, then post it as a message.
async function sendMediaFile(file) {
  const channel = channelById(state.activeChannelId);
  if (!file || !channel || !isChannelUnlocked(channel) || !state.session) return;
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) { alert("Please choose a photo or a video."); return; }
  if (file.size > MAX_MEDIA_BYTES) { alert("That file is too big — 50 MB max."); return; }

  setMediaUploading(true);
  try {
    const safe = (file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "upload";
    const path = `${channel.id}/${state.session.user.id}/${Date.now()}-${safe}`;
    const { error: upErr } = await sb.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) { alert("Upload failed: " + upErr.message); return; }
    const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    await persistAndBroadcast({ media_url: pub.publicUrl, media_type: isImage ? "image" : "video" });
  } catch (e) {
    alert("Upload failed. Please try again.");
  } finally {
    setMediaUploading(false);
  }
}

// Toggle the + button between its normal state and an in-progress "…".
function setMediaUploading(on) {
  state.uploading = on;
  const btn = document.getElementById("mediaBtn");
  if (btn) { btn.textContent = on ? "…" : "+"; btn.disabled = on; }
  if (!on) renderMessages(); // restore the correct enabled/disabled state
}

async function deleteMessage(id) {
  const idx = state.messages.findIndex((m) => String(m.id) === String(id));
  if (idx === -1) return;
  const m = state.messages[idx];
  if (!canDelete(m)) return;
  if (!confirm("Delete this message for everyone?")) return;

  // Remove locally first for a snappy feel.
  state.messages.splice(idx, 1);
  renderMessages();

  // Remove the saved row (numeric ids are persisted DB rows).
  if (/^\d+$/.test(String(m.id))) {
    try { await sb.from("messages").delete().eq("id", m.id); } catch (e) {}
  }
  // If it carried a photo/video, delete that file from Storage too.
  if (m.media_url) {
    try {
      const marker = "/object/public/" + MEDIA_BUCKET + "/";
      const i = m.media_url.indexOf(marker);
      if (i >= 0) await sb.storage.from(MEDIA_BUCKET).remove([decodeURIComponent(m.media_url.slice(i + marker.length))]);
    } catch (e) {}
  }
  // Tell everyone else viewing the room to drop it too.
  if (state.rt && state.rtReady) {
    state.rt.send({ type: "broadcast", event: "del", payload: { id: m.id } });
  }
}

// ---- menus (rooms + profile dropdowns in the header) ----
// On phones the panels render as a centered modal (see style.css); the body
// `menu-open` class drives the dimmed backdrop behind them.
function syncBackdrop() {
  // The Rooms panel never dims the screen — only the profile panel does.
  const anyOpen = [...document.querySelectorAll(".menu-panel:not(.rooms-panel)")].some((p) => !p.hidden);
  document.body.classList.toggle("menu-open", anyOpen);
}
function closeMenus() {
  document.querySelectorAll(".menu-panel").forEach((p) => (p.hidden = true));
  document.querySelectorAll(".menu-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
  document.body.classList.remove("menu-open");
}
function toggleMenu(trigger, panel) {
  const willOpen = panel.hidden;
  closeMenus();
  panel.hidden = !willOpen;
  trigger.setAttribute("aria-expanded", String(willOpen));
  syncBackdrop();
}

// ---- rendering ----
function renderProfile() {
  const bar = document.getElementById("profileBar");
  if (state.loading) {
    bar.innerHTML = `<span class="auth-loading">Loading…</span>`;
    return;
  }
  if (state.session) {
    const name = displayName();
    const email = state.session.user.email || "";
    const initial = (name.trim()[0] || "R").toUpperCase();
    const since = formatDate(state.session.user.created_at);
    bar.innerHTML = `
      <div class="menu" id="profileMenu">
        <button class="menu-trigger profile-trigger" id="profileTrigger" aria-haspopup="true" aria-expanded="false">
          <span class="avatar-mini">${escapeHtml(initial)}</span>
          <span class="who-name">${escapeHtml(name)}</span>
          <span class="caret">▾</span>
        </button>
        <div class="menu-panel profile-panel" id="profilePanel" hidden>
          <div class="profile-head">
            <div class="avatar">${escapeHtml(initial)}</div>
            <div class="profile-id">
              <div class="profile-name">${escapeHtml(name)}</div>
              <div class="profile-email">${escapeHtml(email)}</div>
            </div>
          </div>
          ${since ? `<div class="profile-meta">Member since ${escapeHtml(since)}</div>` : ""}
          <div class="profile-actions">
            <button class="btn btn-outline btn-small" id="editNameBtn">Edit name</button>
            <button class="btn btn-ghost btn-small" id="signOutBtn">Sign out</button>
          </div>
        </div>
      </div>`;
    const trigger = document.getElementById("profileTrigger");
    const panel = document.getElementById("profilePanel");
    trigger.addEventListener("click", () => toggleMenu(trigger, panel));
    document.getElementById("editNameBtn").addEventListener("click", () => { closeMenus(); editName(); });
    document.getElementById("signOutBtn").addEventListener("click", () => { closeMenus(); signOut(); });
  } else {
    // Logged out, the gate (in the page body) owns the login form — the
    // header just states what this place is.
    bar.innerHTML = `<span class="members-only-tag">Members only</span>`;
  }
}

// Show the gate to visitors and the club to members; the Rooms menu only
// exists for members.
function renderGate() {
  const gate = document.getElementById("gate");
  const club = document.getElementById("club");
  const roomsMenu = document.getElementById("roomsMenu");
  const isMember = !!state.session;
  if (gate) gate.hidden = state.loading || isMember;
  if (club) club.hidden = state.loading || !isMember;
  if (roomsMenu) roomsMenu.hidden = !isMember;
}

function renderRoomsMenu() {
  const panel = document.getElementById("roomsPanel");
  if (!panel) return;
  panel.innerHTML = ROOM_GROUPS
    .map((g) => {
      const items = g.rooms
        .map((room) => {
          const channel = channelById(room.id);
          const unlocked = isChannelUnlocked(channel);
          const active = state.activeChannelId === channel.id;
          return `
            <li class="channel-item ${unlocked ? "" : "locked"} ${active ? "active" : ""}" data-channel="${channel.id}" title="${escapeHtml(channel.name)}">
              ${unlocked ? "#" : "🔒"} ${escapeHtml(channel.name)}
            </li>`;
        })
        .join("");
      return `<div class="channel-group"><div class="channel-group-label group-${g.key}">${g.label}</div><ul>${items}</ul></div>`;
    })
    .join("");

  panel.querySelectorAll(".channel-item:not(.locked)").forEach((el) => {
    el.addEventListener("click", () => {
      selectChannel(el.dataset.channel);
      closeMenus();
    });
  });
}

function renderChatHeader() {
  const channel = channelById(state.activeChannelId);
  document.getElementById("chatTitle").textContent = channel ? "# " + channel.name : "Pick a room";
}

function renderPresence() {
  const el = document.getElementById("presence");
  if (!state.activeChannelId || !state.rtReady) {
    el.textContent = "";
    el.classList.add("empty");
    return;
  }
  const n = Math.max(state.onlineCount, 1);
  el.textContent = n === 1 ? "1 here" : n + " here";
  el.classList.remove("empty");
}

// ---- full-quality photo lightbox ----
function openLightbox(src) {
  const lb = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  if (!lb || !img) return;
  img.src = src;
  lb.hidden = false;
  lb.setAttribute("aria-hidden", "false");
}
function closeLightbox() {
  const lb = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  if (!lb) return;
  lb.hidden = true;
  lb.setAttribute("aria-hidden", "true");
  if (img) img.src = "";
}

// Photo/video markup for a message that carries media. Shows the media ONLY —
// no storage filename/URL is exposed (the image no longer links out to its raw
// Supabase URL); tapping a photo opens it full-quality in the lightbox instead.
function renderMedia(m) {
  if (!m.media_url) return "";
  const url = escapeHtml(m.media_url);
  if (m.media_type === "video") {
    return `<video class="chat-media" src="${url}" controls playsinline preload="metadata" draggable="false"></video>`;
  }
  return `<img class="chat-media" src="${url}" alt="" loading="lazy" draggable="false" />`;
}

function renderMessages() {
  const box = document.getElementById("chatMessages");
  const channel = channelById(state.activeChannelId);
  const input = document.getElementById("chatInput");
  const sendBtn = document.querySelector("#chatForm button[type=submit]");
  const mediaBtn = document.getElementById("mediaBtn");

  if (!channel) {
    box.innerHTML = `<p class="chat-placeholder">No room selected yet.</p>`;
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (mediaBtn) mediaBtn.disabled = true;
    return;
  }

  const unlocked = isChannelUnlocked(channel);
  input.disabled = !unlocked;
  if (sendBtn) sendBtn.disabled = !unlocked;
  if (mediaBtn) mediaBtn.disabled = !unlocked || state.uploading;
  input.placeholder = "Message the room…";

  const me = displayName();
  box.innerHTML = state.messages.length
    ? state.messages
        .map((m) => {
          const cls = m.author_name === me ? "me" : "";
          const del = canDelete(m)
            ? `<button class="msg-del" data-id="${escapeHtml(String(m.id))}" title="Delete message" aria-label="Delete message">×</button>`
            : "";
          const text = m.content ? `<span class="chat-text">${escapeHtml(m.content)}</span>` : "";
          // Photos and videos show CLEAN — just the media (and any caption). No
          // author name, no timestamp, no storage filename. Text-only messages
          // keep their author + time as before.
          const isMedia = !!m.media_url;
          const author = isMedia ? "" : `<span class="chat-author ${cls}">${escapeHtml(m.author_name || "member")}</span>`;
          const time = isMedia ? "" : `<span class="chat-time">${escapeHtml(formatTime(m.created_at))}</span>`;
          return `
        <div class="chat-message${isMedia ? " media-only" : ""}">
          ${author}
          ${time}
          ${text}
          ${renderMedia(m)}
          ${del}
        </div>`;
        })
        .join("")
    : `<p class="chat-placeholder">No messages yet — say hi 👋</p>`;

  box.querySelectorAll(".msg-del").forEach((el) => {
    el.addEventListener("click", () => deleteMessage(el.dataset.id));
  });
  // Tap a photo to view it full-quality in the lightbox (no URL is opened).
  box.querySelectorAll("img.chat-media").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src));
  });
  box.scrollTop = box.scrollHeight;
}

function render() {
  renderGate();
  renderProfile();
  renderRoomsMenu();
  renderChatHeader();
  renderMessages();
  renderPresence();
}

document.addEventListener("DOMContentLoaded", () => {
  render();
  refreshSession();
  sb.auth.onAuthStateChange(() => refreshSession());

  // The members-only gate: login only, no sign-up path anywhere.
  const gateForm = document.getElementById("gateForm");
  const gateEmail = document.getElementById("gateEmail");
  gateEmail.value = rememberedEmail();
  gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    signIn(gateEmail.value.trim(), document.getElementById("gatePassword").value);
  });

  // Rooms dropdown trigger (the panel content is (re)rendered by renderRoomsMenu).
  const roomsTrigger = document.getElementById("roomsTrigger");
  const roomsPanel = document.getElementById("roomsPanel");
  if (roomsTrigger && roomsPanel) {
    roomsTrigger.addEventListener("click", () => toggleMenu(roomsTrigger, roomsPanel));
  }
  // Tapping/clicking anywhere outside an open menu closes it. Listen for both
  // click AND touchstart: on iOS Safari a document-level `click` doesn't fire
  // reliably for taps on non-interactive areas, so touch needs its own hook.
  const closeIfOutside = (e) => {
    if (!e.target.closest(".menu")) closeMenus();
  };
  document.addEventListener("click", closeIfOutside);
  document.addEventListener("touchstart", closeIfOutside, { passive: true });
  // Esc closes menus too (and the photo lightbox).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeMenus(); closeLightbox(); }
  });

  // Tapping the photo lightbox anywhere closes it.
  const lightbox = document.getElementById("lightbox");
  if (lightbox) lightbox.addEventListener("click", closeLightbox);

  document.getElementById("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    sendMessage(input.value);
    input.value = "";
  });

  // The "+" button opens the file picker; picking a photo/video uploads + posts it.
  const mediaBtn = document.getElementById("mediaBtn");
  const mediaInput = document.getElementById("mediaInput");
  if (mediaBtn && mediaInput) {
    mediaBtn.addEventListener("click", () => { if (!mediaBtn.disabled) mediaInput.click(); });
    mediaInput.addEventListener("change", () => {
      const file = mediaInput.files && mediaInput.files[0];
      mediaInput.value = ""; // allow re-picking the same file later
      if (file) sendMediaFile(file);
    });
  }
});
