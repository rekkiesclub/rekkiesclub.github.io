/* ============================================================
   REKKIES CLUB — app.js
   Vanilla JS, no build step. A standalone, FREE community home for
   the Rekkies club. The app opens straight into the live Main Room;
   every room is a real live chat channel. No payments, no ranks to
   buy — just sign in with your email + password and chat.

   Backed by Supabase — and it works OUT OF THE BOX with no database
   setup or SQL step:
   • Profiles ..... Supabase Auth (email + password). Your profile —
                    your handle in chat — is your account, saved in the
                    app and carried across devices.
   • Room chat .... Supabase Realtime Broadcast — live messages between
                    everyone in a room, with no table required. If the
                    optional `messages` table from supabase/schema.sql
                    exists, chat history is also loaded and saved; if
                    not, chat is simply live-only.

   Only the PUBLISHABLE key belongs here — this file is served as-is to
   every visitor's browser, so anything in it is public. The secret key
   must never be added to this file or committed to this repo.

   ---- OPTIONAL CONFIG (the app runs without any of these) ----
   1. supabase/schema.sql — run it once in the SQL Editor ONLY if you
      want persistent chat history. Not required for the app to work.
   2. Email confirmation is ON by default; turn it off in the dashboard
      (Authentication → Providers → Email → Confirm email) if you want
      sign-up to log a user in immediately with no email step.
   ============================================================ */

const SUPABASE_URL = "https://ejhhjzamdittnbfvxsfx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_a8_nkU_F0ZmfX-4TjKl96g_qHJPUgmJ";
// NOTE: the client is named `sb`, NOT `supabase`. The Supabase UMD script
// registers a global `supabase` (the library); declaring `const supabase`
// here collides with it and throws a page-breaking SyntaxError
// ("Identifier 'supabase' has already been declared"), which aborts this whole
// file and leaves the app blank. Keep this named `sb`.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ---- rooms ----
// The Main Room is the live home everyone lands in — open to ALL visitors,
// signed in or not. Every other room is a free topic channel that just needs
// a signed-in profile so your messages carry your name.
const MAIN_CHANNEL = { id: "main", name: "Main Room 🏠", guestOpen: true };

// Free topic rooms, grouped for the sidebar. No prices, no ranks — signing in
// (free) is all it takes to chat in any of them.
const ROOM_GROUPS = [
  { key: "community", label: "COMMUNITY", rooms: [MAIN_CHANNEL] },
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
    label: "TECH & CONTENT",
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
    label: "INNER CIRCLE",
    rooms: [{ id: "inner-circle", name: "👑 Inner Circle 👑" }],
  },
];

// Flat list of every channel, tagged with its group for rendering.
const CHANNELS = ROOM_GROUPS.flatMap((g) =>
  g.rooms.map((room) => ({ ...room, groupKey: g.key, groupLabel: g.label }))
);

function channelById(id) {
  return CHANNELS.find((c) => c.id === id) || null;
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
// Show the handle (before the @), not everyone's full email.
function authorHandle(email) {
  return String(email || "").split("@")[0] || "member";
}
function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

// A stable per-browser guest identity so ANY visitor can chat in the free
// Main Room without an account. Signed-in users always use their real handle.
function guestId() {
  let g = null;
  try { g = localStorage.getItem("rekkies_guest_id"); } catch (e) {}
  if (!g) {
    g = "guest-" + Math.random().toString(36).slice(2, 6);
    try { localStorage.setItem("rekkies_guest_id", g); } catch (e) {}
  }
  return g;
}
// The author for a message — real email when signed in, else a guest handle
// (rendered as the part before the @, e.g. "guest-4f2a").
function currentAuthorEmail() {
  return state.session ? state.session.user.email : guestId() + "@guest";
}

// Remember the last email used to log in so it's prefilled next time. The
// Supabase session itself is persisted by the client (localStorage), so a
// logged-in user stays logged in across reloads and doesn't re-enter anything;
// the browser's own password manager saves the password via the login form.
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
  realtimeChannel: null,
  realtimeReady: false,
};

async function refreshSession() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  state.loading = false;

  // If the room they're in now needs a sign-in they no longer have (they just
  // signed out of a members-only room), drop them out so the Main Room
  // fallback below kicks in.
  const active = channelById(state.activeChannelId);
  if (active && !isChannelUnlocked(active)) {
    unsubscribeRealtime();
    state.activeChannelId = null;
    state.messages = [];
  }

  render();

  // EVERYONE — signed in or not — opens straight into the live Main Room.
  // Only when nothing is active, so we don't yank someone out of a room they
  // deliberately opened on a later refresh/token event.
  if (!state.activeChannelId) {
    await selectChannel("main");
  }
}

async function signUp(email, password) {
  rememberEmail(email);
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) {
    alert("Couldn't sign up: " + error.message);
    return;
  }
  // If the project has email confirmation ON (the default), signUp returns no
  // session — the user must click the emailed link first. If confirmation is
  // OFF, a session comes back and onAuthStateChange logs them straight in.
  if (data.session) {
    // logged in immediately — the auth listener will land them in the Main Room
  } else {
    alert("Account created! Check your email for a confirmation link, then log in.");
  }
}

async function signIn(email, password) {
  rememberEmail(email);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) alert("Couldn't sign in: " + error.message);
}

async function signOut() {
  await sb.auth.signOut();
}

// A room is open when it's the guest-open Main Room, or when the visitor has a
// signed-in profile. Every room is FREE — there's nothing to buy.
function isChannelUnlocked(channel) {
  if (!channel) return false;
  if (channel.guestOpen) return true;
  return !!state.session;
}

// ---- chat ----
// Live delivery is Supabase Realtime Broadcast (no table needed). If the
// optional `messages` table exists, we also load history on open and save
// each message; if it doesn't, chat just runs live-only and those calls are
// silently ignored.
function unsubscribeRealtime() {
  if (state.realtimeChannel) {
    sb.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
  state.realtimeReady = false;
}

async function selectChannel(channelId) {
  const channel = channelById(channelId);
  if (!channel || !isChannelUnlocked(channel)) return;

  unsubscribeRealtime();
  state.activeChannelId = channelId;
  state.messages = [];
  renderChannelList();
  renderChatHeader();
  renderMessages();

  // Best-effort history load (works only if the messages table has been
  // created via schema.sql; otherwise we quietly start with a live-only room).
  try {
    const { data, error } = await sb
      .from("messages")
      .select("author_email, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (!error && data && state.activeChannelId === channelId) state.messages = data;
  } catch (e) {
    /* table not set up — live-only room */
  }
  renderMessages();

  // Live messages via Broadcast — no database required.
  const rt = sb.channel(`room:${channelId}`, { config: { broadcast: { self: false } } });
  rt.on("broadcast", { event: "msg" }, ({ payload }) => {
    if (state.activeChannelId === channelId) {
      state.messages.push(payload);
      renderMessages();
    }
  }).subscribe((status) => {
    if (status === "SUBSCRIBED") state.realtimeReady = true;
  });
  state.realtimeChannel = rt;
}

async function sendMessage(content) {
  const text = content.trim();
  const channel = channelById(state.activeChannelId);
  if (!channel || !isChannelUnlocked(channel) || !text) return;

  const msg = {
    author_email: currentAuthorEmail(),
    content: text,
    created_at: new Date().toISOString(),
  };

  // Show it locally right away (broadcast is set self:false, so we won't get
  // our own echo back), then push it live to everyone else in the room.
  state.messages.push(msg);
  renderMessages();
  if (state.realtimeChannel && state.realtimeReady) {
    state.realtimeChannel.send({ type: "broadcast", event: "msg", payload: msg });
  }

  // Best-effort persistence — only for signed-in users (the messages table,
  // if present, ties each row to a user_id) and silently ignored if the table
  // isn't set up. Guest messages stay live-only.
  if (state.session) {
    try {
      await sb.from("messages").insert({
        channel_id: channel.id,
        user_id: state.session.user.id,
        author_email: msg.author_email,
        content: msg.content,
      });
    } catch (e) {
      /* no table — message stays live-only */
    }
  }
}

// ---- rendering ----
function renderAuthBar() {
  const bar = document.getElementById("authBar");
  if (state.loading) {
    bar.innerHTML = `<span class="auth-loading">Loading your profile…</span>`;
    return;
  }
  if (state.session) {
    bar.innerHTML = `
      <span class="auth-status">Signed in as <strong>${escapeHtml(state.session.user.email)}</strong></span>
      <button class="btn btn-ghost btn-small" id="signOutBtn">Sign out</button>`;
    document.getElementById("signOutBtn").addEventListener("click", signOut);
  } else {
    bar.innerHTML = `
      <form id="authForm" class="auth-form">
        <input type="email" id="authEmail" name="email" placeholder="you@email.com" autocomplete="username" required value="${escapeHtml(rememberedEmail())}" />
        <input type="password" id="authPassword" name="password" placeholder="password" autocomplete="current-password" required minlength="6" />
        <button type="submit" class="btn btn-primary btn-small">Log in</button>
        <button type="button" id="signUpBtn" class="btn btn-outline btn-small">Sign up</button>
      </form>
      <span class="auth-hint">Log in with your email + password — your browser can save it, and you'll stay logged in. New here? Enter both, then hit Sign up. It's free.</span>`;
    const form = document.getElementById("authForm");
    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      signIn(emailInput.value.trim(), passwordInput.value);
    });
    document.getElementById("signUpBtn").addEventListener("click", () => {
      if (!form.reportValidity()) return;
      signUp(emailInput.value.trim(), passwordInput.value);
    });
  }
}

function renderChannelList() {
  const list = document.getElementById("channelList");
  list.innerHTML = ROOM_GROUPS
    .map((g) => {
      const items = g.rooms
        .map((room) => {
          const channel = channelById(room.id);
          const unlocked = isChannelUnlocked(channel);
          const active = state.activeChannelId === channel.id;
          return `
            <li class="channel-item tier-${g.key} ${unlocked ? "" : "locked"} ${active ? "active" : ""}" data-channel="${channel.id}">
              ${unlocked ? "#" : "🔒"} ${channel.name}
            </li>`;
        })
        .join("");
      return `<div class="channel-group"><div class="channel-group-label tier-${g.key}-text">${g.label}</div><ul>${items}</ul></div>`;
    })
    .join("");

  list.querySelectorAll(".channel-item:not(.locked)").forEach((el) => {
    el.addEventListener("click", () => selectChannel(el.dataset.channel));
  });
}

function renderChatHeader() {
  const header = document.getElementById("chatHeader");
  const channel = channelById(state.activeChannelId);
  header.textContent = channel ? "# " + channel.name : "Pick a channel to start chatting";
}

function renderMessages() {
  const box = document.getElementById("chatMessages");
  const channel = channelById(state.activeChannelId);
  const input = document.getElementById("chatInput");
  const sendBtn = document.querySelector("#chatForm button");

  if (!channel) {
    box.innerHTML = `<p class="chat-placeholder">No channel selected yet.</p>`;
    input.disabled = true;
    sendBtn.disabled = true;
    return;
  }

  const unlocked = isChannelUnlocked(channel);
  input.disabled = !unlocked;
  sendBtn.disabled = !unlocked;
  input.placeholder = unlocked
    ? "Message the channel…"
    : "Sign in to chat in this room";

  box.innerHTML = state.messages.length
    ? state.messages
        .map(
          (m) => `
        <div class="chat-message">
          <span class="chat-author">${escapeHtml(authorHandle(m.author_email))}</span>
          <span class="chat-time">${escapeHtml(formatTime(m.created_at))}</span>
          <span class="chat-text">${escapeHtml(m.content)}</span>
        </div>`
        )
        .join("")
    : `<p class="chat-placeholder">No messages yet — say hi 👋</p>`;
  box.scrollTop = box.scrollHeight;
}

function renderRooms() {
  const banner = document.getElementById("membershipBanner");
  if (state.session) {
    banner.innerHTML = `Signed in as <strong>${escapeHtml(authorHandle(state.session.user.email))}</strong> — every room is open. You're in the live <strong>Main Room</strong>.`;
  } else {
    banner.innerHTML = `Welcome to the live <strong>Main Room</strong> — chat right now as a guest, or sign in above (it's free) to join every room with your own profile.`;
  }

  renderChannelList();
  renderChatHeader();
  renderMessages();
}

function render() {
  renderAuthBar();
  renderRooms();
}

document.addEventListener("DOMContentLoaded", () => {
  render();
  refreshSession();
  sb.auth.onAuthStateChange(() => refreshSession());

  document.getElementById("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    sendMessage(input.value);
    input.value = "";
  });
});
