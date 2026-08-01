/* ============================================================
   REKKIES CLUB — app.js
   Vanilla JS, no build step. A standalone home for the Rekkies
   club: the same 5 ranks and every room sourced from the
   upgrade.chat/rekkies store, rebuilt here as real live chat rooms
   gated by rank. This platform stands on its own — the Rekkies
   Discord runs separately and is not part of this app.

   Backed by Supabase — and it works OUT OF THE BOX with no database
   setup or SQL step:
   • Accounts .... Supabase Auth (email + password).
   • Membership .. stored on the user's own Auth record (user_metadata),
                   so no custom table is needed and it follows the
                   account across devices.
   • Room chat ... Supabase Realtime Broadcast — live messages between
                   everyone in a room, again with no table required.
                   If the optional `messages` table from
                   supabase/schema.sql exists, chat history is also
                   loaded and saved; if not, chat is simply live-only.

   Only the PUBLISHABLE key belongs here — this file is served as-is to
   every visitor's browser, so anything in it is public. The secret key
   must never be added to this file or committed to this repo.

   ---- OPTIONAL CONFIG (the app runs without any of these) ----
   1. PAYMENT_LINKS[id]   — a Stripe or PayPal Payment Link per rank.
      Leave a link blank and that rank's "Join" button runs in demo
      mode (grants the rank on the account with no real charge).
   2. supabase/schema.sql — run it once in the SQL Editor ONLY if you
      want persistent chat history + server-enforced gating. Not
      required for the platform to work.
   3. Email confirmation is ON by default; turn it off in the dashboard
      (Authentication → Providers → Email → Confirm email) if you want
      sign-up to log a user in immediately with no email step.
   ============================================================ */

const PAYMENT_LINKS = {
  soldier: "",
  captain: "",
  colonel: "",
  general: "",
  elite: "",
};

// Owner accounts — these emails always have permanent full access to every
// room (top Elite rank) the moment they sign in, no payment or membership
// needed. Compared case-insensitively.
const OWNER_EMAILS = ["prophetdian@gmail.com"];

const SUPABASE_URL = "https://ejhhjzamdittnbfvxsfx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_a8_nkU_F0ZmfX-4TjKl96g_qHJPUgmJ";
// NOTE: the client is named `sb`, NOT `supabase`. The Supabase UMD script
// registers a global `supabase` (the library); declaring `const supabase`
// here collides with it and throws a page-breaking SyntaxError
// ("Identifier 'supabase' has already been declared"), which aborts this whole
// file and leaves the app blank. Keep this named `sb`.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Rank order matches the live Discord roles (higher rank keeps every
// channel from the ranks below it).
const TIERS = [
  {
    id: "soldier",
    rank: 1,
    name: "REKKIES SOLDIER",
    role: "SOLDIERS",
    price: 25,
    blurb: "👑 Join the Rekkies 👑\nand get access to the foundation channels.",
    ownRooms: [
      { id: "musical-instruments", name: "Musical Instruments 🎹" },
      { id: "music-mixing", name: "Music Mixing 🎧" },
      { id: "music-production", name: "Music Production 🖥️" },
      { id: "photography", name: "Photography 📸" },
      { id: "videography", name: "Videography 🎥" },
      { id: "photo-video-editing", name: "Photo+Video Editing 📸📹" },
    ],
  },
  {
    id: "captain",
    rank: 2,
    name: "REKKIES CAPTAIN",
    role: "CAPTAINS",
    price: 100,
    blurb: "All Soldier channels, plus the Captain channels. We believe the knowledge shared here will immensely improve the success of your work.",
    ownRooms: [
      { id: "artificial-intelligence", name: "Artificial Intelligence 🤖" },
      { id: "creative-content", name: "Creative Content 🖋️" },
      { id: "systems", name: "Systems 🌐" },
    ],
  },
  {
    id: "colonel",
    rank: 3,
    name: "REKKIES COLONEL",
    role: "COLONELS",
    price: 500,
    blurb: "All Soldier and Captain channels, plus the Colonel channels.",
    ownRooms: [
      { id: "product", name: "Product 🏅" },
      { id: "sales", name: "Sales 🔥" },
      { id: "marketing", name: "Marketing 📢" },
    ],
  },
  {
    id: "general",
    rank: 4,
    name: "REKKIES GENERAL",
    role: "GENERALS",
    price: 1000,
    blurb: "All Soldier, Captain and Colonel channels, plus 10% off every Rekkies product, course, and service.",
    ownRooms: [],
  },
  {
    id: "elite",
    rank: 5,
    name: "REKKIES ELITE",
    role: "ELITES",
    price: 2500,
    blurb: "✨ This is it ✨ Everything in General, plus the private ELITES channel — 24/7 direct communication with the professional entrepreneurs, media producers, and musicians behind The Rekkies.",
    ownRooms: [{ id: "elites-private", name: "👑 ELITES — Private Room 👑" }],
  },
];

// The free room — any signed-in user gets this with no payment at all.
// requiredRank 0 means it's unlocked before a membership row even exists.
const MAIN_CHANNEL = { id: "main", name: "Main Room 🏠", requiredRank: 0, groupKey: "main", groupLabel: "EVERYONE" };

const CHANNELS = [
  MAIN_CHANNEL,
  ...TIERS.flatMap((t) =>
    t.ownRooms.map((room) => ({ ...room, requiredRank: t.rank, groupKey: t.id, groupLabel: t.role }))
  ),
];

function tierById(id) {
  return TIERS.find((t) => t.id === id) || null;
}
function channelById(id) {
  return CHANNELS.find((c) => c.id === id) || null;
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
// Discord-style: show the handle (before the @), not everyone's full email.
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
  membership: null, // { tier_id, rank }
  loading: true,
  activeChannelId: null,
  messages: [],
  realtimeChannel: null,
  realtimeReady: false,
};

// Read the user's rank from their Auth record. A paid integration would set
// app_metadata server-side (which users can't edit); demo joins use
// user_metadata. We honor app_metadata first so real payments always win.
function membershipFromUser(user) {
  if (!user) return null;
  const app = user.app_metadata || {};
  const meta = user.user_metadata || {};
  const rank = app.rank != null ? app.rank : meta.rank != null ? meta.rank : 0;
  const tier_id = app.tier_id || meta.tier_id || null;
  return rank > 0 && tier_id ? { tier_id, rank } : null;
}

async function refreshSession() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  state.membership = state.session ? membershipFromUser(state.session.user) : null;
  state.loading = false;

  // If the room they're in is no longer usable — e.g. they just signed out of
  // a paid room — drop them out of it so the Main Room fallback below kicks in.
  const active = channelById(state.activeChannelId);
  if (active && !isChannelUnlocked(active)) {
    unsubscribeRealtime();
    state.activeChannelId = null;
    state.messages = [];
  }

  render();

  // EVERYONE — signed in or not — opens straight into the free Main Room.
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

async function joinTier(tier) {
  if (!state.session) {
    alert("Sign in first (see the Club Rooms section) — membership is tied to your account.");
    document.getElementById("rooms").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const link = PAYMENT_LINKS[tier.id];
  if (link) {
    window.open(link, "_blank", "noopener");
    return;
  }

  const ok = confirm(
    `Demo mode — no payment link is configured yet for ${tier.name} ($${tier.price}/mo).\n\n` +
      `Grant the ${tier.role} rank on your account?`
  );
  if (!ok) return;

  const { data, error } = await sb.auth.updateUser({
    data: { tier_id: tier.id, rank: tier.rank },
  });
  if (error) {
    alert("Couldn't save membership: " + error.message);
    return;
  }
  state.membership = membershipFromUser(data.user) || { tier_id: tier.id, rank: tier.rank };
  render();
}

async function leaveTier() {
  if (!state.session) return;
  const { data, error } = await sb.auth.updateUser({
    data: { tier_id: null, rank: 0 },
  });
  if (error) {
    alert("Couldn't update membership: " + error.message);
    return;
  }
  state.membership = membershipFromUser(data.user);
  render();
  // They may have been sitting in a room that's now locked — drop them back
  // into the free Main Room.
  const active = channelById(state.activeChannelId);
  if (state.session && (!active || !isChannelUnlocked(active))) await selectChannel("main");
}

// Is the signed-in user an owner account with permanent full access?
function isOwner() {
  const email = state.session && state.session.user && state.session.user.email;
  return !!email && OWNER_EMAILS.includes(String(email).toLowerCase());
}

function currentRank() {
  if (isOwner()) return 5; // owner — every room, always
  return state.membership ? state.membership.rank : 0;
}

function isChannelUnlocked(channel) {
  if (!channel) return false;
  // The free Main Room (requiredRank 0) is open to EVERYONE — signed in or not.
  if (channel.requiredRank === 0) return true;
  // Paid rooms still require an account and the matching rank.
  return !!state.session && currentRank() >= channel.requiredRank;
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
    const { data, error } = await supabase
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
    bar.innerHTML = `<span class="auth-loading">Loading your account…</span>`;
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
      <span class="auth-hint">Log in with your email + password — your browser can save it, and you'll stay logged in. New here? Enter both, then hit Sign up.</span>`;
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

function renderRanks() {
  const grid = document.getElementById("rankGrid");
  const rank = currentRank();
  grid.innerHTML = TIERS.map((t) => {
    const isCurrent = isOwner() ? t.id === "elite" : state.membership && state.membership.tier_id === t.id;
    const owned = rank >= t.rank;
    const inheritedRooms = TIERS.filter((o) => o.rank < t.rank).flatMap((o) => o.ownRooms);
    const roomsHtml = [
      ...t.ownRooms.map((r) => `<li>${r.name}</li>`),
      ...inheritedRooms.map((r) => `<li class="inherited">${r.name}</li>`),
    ].join("");
    return `
      <div class="rank-card tier-${t.id}">
        <div class="rank-card-head">
          <span class="rank-name"><span class="rank-badge tier-${t.id}"></span>${t.name}</span>
        </div>
        <div class="rank-price tier-${t.id}-text">$${t.price}<span> / month</span></div>
        <div class="rank-blurb">${t.blurb}</div>
        ${roomsHtml ? `<ul class="rank-rooms tier-${t.id}">${roomsHtml}</ul>` : ""}
        <div class="rank-actions">
          ${
            isCurrent
              ? `<span class="rank-current tier-${t.id}-text">✓ Your current rank</span>`
              : `<button class="btn btn-small btn-primary" data-join="${t.id}">${owned ? "Switch to this rank" : "Join as " + t.role}</button>`
          }
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll("[data-join]").forEach((btn) => {
    btn.addEventListener("click", () => joinTier(tierById(btn.dataset.join)));
  });
}

function renderChannelList() {
  const list = document.getElementById("channelList");
  const groups = [
    { key: "main", label: "EVERYONE", channels: [MAIN_CHANNEL] },
    ...TIERS.filter((t) => t.ownRooms.length > 0).map((t) => ({
      key: t.id,
      label: t.role,
      channels: CHANNELS.filter((c) => c.groupKey === t.id),
    })),
  ];

  list.innerHTML = groups
    .map((g) => {
      const items = g.channels
        .map((channel) => {
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
    : "Join this rank to chat here";

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
  const membership = state.membership ? tierById(state.membership.tier_id) : null;

  if (!state.session) {
    banner.innerHTML = `You're in the free <strong>Main Room</strong> — chat as a guest, or sign in above to unlock the paid rooms.`;
  } else if (isOwner()) {
    banner.innerHTML = `👑 Owner access — every room is unlocked for <strong>${escapeHtml(state.session.user.email)}</strong>.`;
  } else if (membership) {
    banner.innerHTML = `You're in as <strong>${membership.role}</strong> (${membership.name}). <button class="btn btn-ghost btn-small" id="leaveBtn">Leave rank (demo)</button>`;
  } else {
    banner.innerHTML = `You're free in the <strong>Main Room</strong> — join a paid rank above to unlock the rest.`;
  }

  renderChannelList();
  renderChatHeader();
  renderMessages();

  const leaveBtn = document.getElementById("leaveBtn");
  if (leaveBtn) leaveBtn.addEventListener("click", leaveTier);
}

function render() {
  renderAuthBar();
  renderRanks();
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
