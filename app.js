/* ============================================================
   REKKIES CLUB — app.js
   Vanilla JS, no build step. Mirrors the live Discord club run
   through upgrade.chat/rekkies: same 5 ranks, same prices, same
   room lists, cumulative access.

   Membership + accounts are backed by Supabase (Auth + Postgres).
   Only the PUBLISHABLE key belongs here — this file is served
   as-is to every visitor's browser, so anything in it is public.
   The secret key must never be added to this file or committed
   to this repo; row-level security on the `memberships` table is
   what actually protects the data, not key secrecy.

   ---- PENDING CONFIG ----
   1. DISCORD_INVITE_LINK — real invite code for the Rekkies server.
   2. PAYMENT_LINKS[id]   — a Stripe or PayPal Payment Link per
      rank. Leave a link blank and that rank's "Join" button runs
      in demo mode (writes a membership row with no real charge).
   3. supabase/schema.sql must be run once in the Supabase SQL
      Editor before sign-up/membership will work (see README).
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
// room from the ranks below it). Colors are the actual Discord role
// colors from the server, except soldier/captain which used near-black
// role colors that are invisible on a dark page — those two get a
// lighter display color instead so the badges are readable.
const TIERS = [
  {
    id: "soldier",
    rank: 1,
    name: "REKKIES SOLDIER",
    role: "SOLDIERS",
    price: 25,
    roleColor: "#000000",
    displayColor: "#c9c9d1",
    blurb: "👑 Join the Rekkies 👑\nand get access to the foundation rooms.",
    ownRooms: [
      "Musical Instruments 🎹",
      "Music Mixing 🎧",
      "Music Production 🖥️",
      "Photography 📸",
      "Videography 🎥",
      "Photo+Video Editing 📸📹",
    ],
  },
  {
    id: "captain",
    rank: 2,
    name: "REKKIES CAPTAIN",
    role: "CAPTAINS",
    price: 100,
    roleColor: "#434343",
    displayColor: "#9a9aa8",
    blurb: "All Soldier rooms, plus the Captain rooms. We believe the knowledge shared here will immensely improve the success of your work.",
    ownRooms: ["Artificial Intelligence 🤖", "Creative Content 🖋️", "Systems 🌐"],
  },
  {
    id: "colonel",
    rank: 3,
    name: "REKKIES COLONEL",
    role: "COLONELS",
    price: 500,
    roleColor: "#00ff49",
    displayColor: "#00ff49",
    blurb: "All Soldier and Captain rooms, plus the Colonel rooms.",
    ownRooms: ["Product 🏅", "Sales 🔥", "Marketing 📢"],
  },
  {
    id: "general",
    rank: 4,
    name: "REKKIES GENERAL",
    role: "GENERALS",
    price: 1000,
    roleColor: "#00f7ff",
    displayColor: "#00f7ff",
    blurb: "All Soldier, Captain and Colonel rooms, plus 10% off every Rekkies product, course, and service.",
    ownRooms: [],
  },
  {
    id: "elite",
    rank: 5,
    name: "REKKIES ELITE",
    role: "ELITES",
    price: 2500,
    roleColor: "#8f00ff",
    displayColor: "#8f00ff",
    blurb: "✨ This is it ✨ Everything in General, plus the private ELITES room — 24/7 direct communication with the professional entrepreneurs, media producers, and musicians behind The Rekkies.",
    ownRooms: ["👑 ELITES — Private Room 👑"],
  },
];

function tierById(id) {
  return TIERS.find((t) => t.id === id) || null;
}

// ---- state ----
// session: Supabase auth session, or null when signed out
// membership: { tier_id, rank } row from `memberships`, or null
let state = { session: null, membership: null, loading: true };

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
  }
  state.loading = false;
  render();
}

async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) alert("Couldn't send sign-in link: " + error.message);
  else alert(`Check ${email} for a sign-in link.`);
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
  render();
}

function currentRank() {
  return state.membership ? state.membership.rank : 0;
}

function renderAuthBar() {
  const bar = document.getElementById("authBar");
  if (state.loading) {
    bar.innerHTML = `<span class="auth-loading">Loading your account…</span>`;
    return;
  }
  if (state.session) {
    bar.innerHTML = `
      <span class="auth-status">Signed in as <strong>${state.session.user.email}</strong></span>
      <button class="btn btn-ghost btn-small" id="signOutBtn">Sign out</button>`;
    document.getElementById("signOutBtn").addEventListener("click", signOut);
  } else {
    bar.innerHTML = `
      <form id="signInForm" class="auth-form">
        <input type="email" id="signInEmail" placeholder="you@email.com" required />
        <button type="submit" class="btn btn-gold btn-small">Sign in / Sign up</button>
      </form>
      <span class="auth-hint">We'll email you a sign-in link — no password.</span>`;
    document.getElementById("signInForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("signInEmail").value.trim();
      if (email) sendMagicLink(email);
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
      ...t.ownRooms.map((r) => `<li>${r}</li>`),
      ...inheritedRooms.map((r) => `<li class="inherited">${r}</li>`),
    ].join("");
    return `
      <div class="rank-card" style="--rank-color:${t.displayColor}">
        <div class="rank-card-head">
          <span class="rank-name"><span class="rank-badge"></span>${t.name}</span>
        </div>
        <div class="rank-price">$${t.price}<span> / month</span></div>
        <div class="rank-blurb">${t.blurb}</div>
        ${roomsHtml ? `<ul class="rank-rooms">${roomsHtml}</ul>` : ""}
        <div class="rank-actions">
          ${
            isCurrent
              ? `<span class="rank-current">✓ Your current rank</span>`
              : `<button class="btn btn-small btn-gold" data-join="${t.id}">${owned ? "Switch to this rank" : "Join as " + t.role}</button>`
          }
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll("[data-join]").forEach((btn) => {
    btn.addEventListener("click", () => joinTier(tierById(btn.dataset.join)));
  });
}

function renderRooms() {
  const banner = document.getElementById("membershipBanner");
  const grid = document.getElementById("roomGrid");
  const membership = state.membership ? tierById(state.membership.tier_id) : null;
  const rank = currentRank();

  if (!state.session) {
    banner.innerHTML = `Sign in above to join a rank and unlock your rooms.`;
  } else if (membership) {
    banner.innerHTML = `You're in as <strong>${membership.role}</strong> (${membership.name}). <button class="btn btn-ghost btn-small" id="leaveBtn">Leave rank (demo)</button>`;
  } else {
    banner.innerHTML = `You haven't joined a rank yet — pick one above to unlock your rooms.`;
  }

  const allRooms = TIERS.flatMap((t) => t.ownRooms.map((room) => ({ room, tier: t })));
  grid.innerHTML = allRooms
    .map(({ room, tier }) => {
      const unlocked = rank >= tier.rank;
      return `
        <div class="room-card ${unlocked ? "" : "locked"}" style="--rank-color:${tier.displayColor}">
          <div class="room-title">${unlocked ? room : "🔒 " + room}</div>
          <div class="room-rank">${tier.role}</div>
        </div>`;
    })
    .join("");

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
});
