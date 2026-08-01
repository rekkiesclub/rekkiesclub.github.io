# REKKIES CLUB

The members platform for **The Rekkies** — a standalone static site (GitHub
Pages, no build step, vanilla HTML/CSS/JS). Its ranks and rooms are sourced
from the [upgrade.chat/rekkies](https://upgrade.chat/rekkies) store, rebuilt
here as real live chat channels gated by rank. **This app stands on its own —
the Rekkies Discord runs separately and is not wired into it;** upgrade.chat is
used only as the source of which ranks and rooms exist.

Live at: https://rekkiesclub.github.io — **GitHub Pages is enabled and the
site is up.** The app is fully functional as deployed: sign up, log in, land in
the free Main Room, and chat live — no database setup required (see Supabase
section). Persistent chat history is an optional upgrade.

Theme: [Fredoka](https://fonts.google.com/specimen/Fredoka) font, 5-color
palette only — `#000000` `#ffffff` `#00f7ff` `#fa00ff` `#00ff49`.

## What it does

- **Ranks** — the same 5 paid ranks as the upgrade.chat/rekkies store, in the
  same order, at the same prices:

  | Rank    | Price/mo | Rank badge | Channels unlocked |
  |---------|---------:|------------|-----------------|
  | Soldier | $25      | SOLDIERS   | Musical Instruments, Music Mixing, Music Production, Photography, Videography, Photo+Video Editing |
  | Captain | $100     | CAPTAINS   | + Artificial Intelligence, Creative Content, Systems |
  | Colonel | $500     | COLONELS   | + Product, Sales, Marketing |
  | General | $1000    | GENERALS   | + 10% off all Rekkies products/courses/services |
  | Elite   | $2500    | ELITES     | + private ELITES channel, 24/7 direct line to the team |

  Each rank keeps every channel from the ranks below it — higher ranks stack on
  the lower ones, matching how the tiers are described on upgrade.chat.

- **Club Rooms** — a sidebar/chat layout: a room sidebar (grouped by
  rank, locked rooms shown greyed out with 🔒) and a chat pane with live
  messages over Supabase Realtime. Every room is always *visible* in the
  sidebar to every signed-in user, paid or not — only entering/chatting is
  gated to your rank. (In the default schema-free setup the gate is enforced
  in-app; running the optional `messages` table adds server-side enforcement
  on top — see the Supabase section.)

- **Main Room** — free for anyone with an account, no payment required.
  Logging in (or reopening the app with a still-active session) drops the
  user straight into it. Users who haven't joined a paid rank see every
  other channel locked but can chat here immediately.

## Supabase — works out of the box, no database setup

Project: `ejhhjzamdittnbfvxsfx` (https://ejhhjzamdittnbfvxsfx.supabase.co).

The app is **fully functional with only the publishable key** — no tables to
create, no SQL to run. It uses three Supabase capabilities that need no schema:

- **Auth** — email + password, stored by Supabase (not in this codebase).
  Sign up and log in both live in the Club Rooms section's auth bar. The
  session is persisted, so returning users stay logged in and land straight
  in the Main Room.
  - **Email confirmation is currently ON** for this project (verified via the
    Auth settings API: `mailer_autoconfirm: false`). A new account must click
    the emailed confirmation link before it can log in — the app detects this
    and tells the user to check their inbox. To let sign-up log people in
    instantly with no email step, turn **off** **Authentication → Providers →
    Email → Confirm email** in the Supabase dashboard.
- **Membership** — the user's rank is stored on their own Auth record
  (`user_metadata.rank` / `tier_id`), so it needs no table and follows the
  account across devices. A user with no rank is a free member (rank 0 → Main
  Room only). The reader prefers `app_metadata` over `user_metadata`, so when
  real payments are added later a webhook can set `app_metadata` server-side
  (which users can't self-edit) and it will automatically take precedence.
- **Room chat** — live messages over **Supabase Realtime Broadcast**, one
  channel per room. No table required; everyone in a room sees messages in
  real time.

### Optional upgrade: persistent chat history (`supabase/schema.sql`)

Broadcast chat is live-only — messages aren't saved, so a room starts empty on
reload. If you want **persistent history**, run `supabase/schema.sql` once in
the dashboard's SQL Editor
(https://supabase.com/dashboard/project/ejhhjzamdittnbfvxsfx/sql/new). It adds
a `messages` table (plus `memberships`/`channels` for a future server-enforced
gating model). The app then automatically loads history when a room opens and
saves each message — no code change needed. Until then it just runs live-only;
nothing breaks. (The publishable key can't run DDL, which is why this is a
dashboard step and not something the app does itself.)

### Key handling

Only the **publishable** key lives in `app.js` — by design; it's meant to be
public. The **secret / service-role** keys must never be added to this repo or
any file served by GitHub Pages: this is a static site, so anything in its code
is visible to every visitor, and the service role bypasses all security. No
server-side component here needs it. If a future feature does (e.g. a payment
webhook), store it as a secret in that service, not in this codebase.

## Optional config (the app already works without all of these)

Marked at the top of `app.js`:

1. **`PAYMENT_LINKS`** — one entry per rank, all currently empty. Each rank's
   "Join" button runs in **demo mode** (grants the rank on the account with no
   real charge) until you paste a Stripe or PayPal **Payment Link** per rank
   into `PAYMENT_LINKS` in `app.js`.
2. **`supabase/schema.sql`** — optional, for persistent chat history (above).
3. **Confirm email** setting — see the Auth note above.

This app is a **self-contained platform** — its own accounts, its own live
chat rooms. It does not talk to Discord or to a payment processor; joining a
rank here grants access inside this app only. The Rekkies Discord runs
separately and is not connected to this app. When you're ready to charge for
ranks, add real `PAYMENT_LINKS` (and, if you want membership set server-side on
payment, a webhook that writes `app_metadata.rank`).

## Structure

- `index.html` — page structure
- `style.css` — Fredoka font, black/white/cyan/magenta/green theme
- `app.js` — rank + room data, Supabase auth, metadata-based membership,
  Realtime Broadcast chat, rendering
- `supabase/schema.sql` — OPTIONAL; `messages`/`memberships`/`channels` tables
  for persistent history + future server-side gating
- `assets/rekkies-logo.png` — the official Rekkies crown logo, used as
  favicon, header icon, hero logo, and footer icon

## Local preview

No build step — just open `index.html` in a browser, or serve the folder
with any static file server.
