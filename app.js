/* ============================================================
   REKKIES CLUB — app.js
   Vanilla JS, no build step. A copy of the Rekkies Discord server:
   same 5 ranks, same prices, rooms as real chat channels, gated by
   rank exactly like the Discord roles.

   Accounts, membership, and chat are all backed by Supabase (Auth +
   Postgres + Realtime). Only the PUBLISHABLE key belongs here — this
   file is served as-is to every visitor's browser, so anything in it
   is public. The secret key must never be added to this file or
   committed to this repo; row-level security on the tables is what
   actually protects the data, not key secrecy.

   ---- PENDING CONFIG ----
   1. DISCORD_INVITE_LINK — real invite code for the Rekkies server.
   2. PAYMENT_LINKS[id]   — a Stripe or PayPal Payment Link per
      rank. Leave a link blank and that rank's "Join" button runs
      in demo mode (writes a membership row with no real charge).
   3. supabase/schema.sql must be run once in the Supabase SQL
      Editor before sign-up/membership/chat will work (see README).
   4. By default Supabase requires clicking an email confirmation
      link before a new password account can sign in. Turn that off
      in the dashboard (Authentication → Providers → Email → Confirm
      email) if you want sign-up to log a user in immediately.
   ============================================================ */

const DISCORD_INVITE_LINK = ""; // e.g. "https://discord.gg/xxxxxxx"

const PAYMENT_LINKS = {
  soldier: "",
  captain: "",
  colonel: "",
  general: "",
  elite: "",
};

const SUPABASE_URL = "https://ejhhjzamdittnbfvxsfx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_a8_nkU_F0ZmfX-4TjKl96g_qHJPUgmJ";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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

// ---- state ----
let state = {
  session: null,
  membership: null, // { tier_id, rank }
  loading: true,
  activeChannelId: null,
  messages: [],
  realtimeChannel: null,
};

async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  if (state.session) {
    const { data: row } = await supabase
      .from("memberships")
      .select("tier_id, rank")
      .eq("user_id", state.session.user.id)
      .maybeSingle();
    state.membership = row || null;
  } else {
    state.membership = null;
    state.activeChannelId = null;
    state.messages = [];
    unsubscribeRealtime();
  }
  state.loading = false;
  render();

  // Land straight in the free Main Room on login or on reopening the app
  // with a still-valid session — but only once per session, not on every
  // refresh (so it doesn't yank the user away from a channel they picked).
  if (state.session && !state.activeChannelId) {
    await selectChannel("main");
  }
}

async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) alert("Couldn't sign up: " + error.message);
  else alert("Account created. If email confirmation is on, check your inbox — otherwise you're signed in.");
}

async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert("Couldn't sign in: " + error.message);
}

async function signOut() {
  await supabase.auth.signOut();
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
      `Simulate becoming a ${tier.role} member on your account?`
  );
  if (!ok) return;

  const { error } = await supabase.from("memberships").upsert({
    user_id: state.session.user.id,
    tier_id: tier.id,
    rank: tier.rank,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    alert("Couldn't save membership: " + error.message);
    return;
  }
  state.membership = { tier_id: tier.id, rank: tier.rank };
  render();
}

async function leaveTier() {
  if (!state.session) return;
  const { error } = await supabase.from("memberships").delete().eq("user_id", state.session.user.id);
  if (error) {
    alert("Couldn't update membership: " + error.message);
    return;
  }
  state.membership = null;
  state.activeChannelId = null;
  unsubscribeRealtime();
  render();
}

function currentRank() {
  return state.membership ? state.membership.rank : 0;
}

function isChannelUnlocked(channel) {
  return !!state.session && currentRank() >= channel.requiredRank;
}

// ---- chat ----
function unsubscribeRealtime() {
  if (state.realtimeChannel) {
    supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
}

async function selectChannel(channelId) {
  const channel = channelById(channelId);
  if (!channel || !state.session || !isChannelUnlocked(channel)) return;

  unsubscribeRealtime();
  state.activeChannelId = channelId;
  state.messages = [];
  renderChannelList();
  renderChatHeader();
  renderMessages();

  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, author_email, content, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!error) state.messages = data || [];
  renderMessages();

  state.realtimeChannel = supabase
    .channel(`messages-${channelId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
      (payload) => {
        state.messages.push(payload.new);
        renderMessages();
      }
    )
    .subscribe();
}

async function sendMessage(content) {
  const channel = channelById(state.activeChannelId);
  if (!channel || !state.session || !isChannelUnlocked(channel) || !content.trim()) return;
  const { error } = await supabase.from("messages").insert({
    channel_id: channel.id,
    user_id: state.session.user.id,
    author_email: state.session.user.email,
    content: content.trim(),
  });
  if (error) alert("Couldn't send message: " + error.message);
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
        <input type="email" id="authEmail" placeholder="you@email.com" required />
        <input type="password" id="authPassword" placeholder="password" required minlength="6" />
        <button type="submit" class="btn btn-primary btn-small">Log in</button>
        <button type="button" id="signUpBtn" class="btn btn-outline btn-small">Sign up</button>
      </form>
      <span class="auth-hint">New here? Enter an email + password, then hit Sign up.</span>`;
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
    const isCurrent = state.membership && state.membership.tier_id === t.id;
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

  input.disabled = false;
  sendBtn.disabled = false;

  box.innerHTML = state.messages.length
    ? state.messages
        .map(
          (m) => `
        <div class="chat-message">
          <span class="chat-author">${escapeHtml(m.author_email)}</span>
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
    banner.innerHTML = `Sign in above — the Main Room is free the moment you have an account.`;
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

function renderDiscordCta() {
  const btn = document.getElementById("discordJoinBtn");
  btn.addEventListener("click", (e) => {
    if (!DISCORD_INVITE_LINK) {
      e.preventDefault();
      alert("Discord invite link isn't configured yet — add DISCORD_INVITE_LINK in app.js.");
      return;
    }
    btn.href = DISCORD_INVITE_LINK;
  });
  if (DISCORD_INVITE_LINK) btn.href = DISCORD_INVITE_LINK;
}

function render() {
  renderAuthBar();
  renderRanks();
  renderRooms();
}

document.addEventListener("DOMContentLoaded", () => {
  render();
  renderDiscordCta();
  refreshSession();
  supabase.auth.onAuthStateChange(() => refreshSession());

  document.getElementById("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    sendMessage(input.value);
    input.value = "";
  });
});
