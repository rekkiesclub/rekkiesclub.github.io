# REKKIES CLUB

The personal club app for **The Rekkies** — a static site (GitHub Pages, no build
step, vanilla HTML/CSS/JS) built as a copy of the Rekkies Discord server: same
ranks, rooms as real chat channels, gated exactly like the Discord roles run
through [upgrade.chat/rekkies](https://upgrade.chat/rekkies).

Live at: https://rekkiesclub.github.io — **GitHub Pages is enabled and the
site is up.** The app is fully deployed; the only step left to make chat and
membership functional is running `supabase/schema.sql` once (see below).

Theme: [Fredoka](https://fonts.google.com/specimen/Fredoka) font, 5-color
palette only — `#000000` `#ffffff` `#00f7ff` `#fa00ff` `#00ff49`.

## What it does

- **Ranks** — the same 5 paid ranks as the live Discord club, in the same
  order, at the same prices:

  | Rank    | Price/mo | Discord role | Channels unlocked |
  |---------|---------:|--------------|-----------------|
  | Soldier | $25      | SOLDIERS     | Musical Instruments, Music Mixing, Music Production, Photography, Videography, Photo+Video Editing |
  | Captain | $100     | CAPTAINS     | + Artificial Intelligence, Creative Content, Systems |
  | Colonel | $500     | COLONELS     | + Product, Sales, Marketing |
  | General | $1000    | GENERALS     | + 10% off all Rekkies products/courses/services |
  | Elite   | $2500    | ELITES       | + private ELITES channel, 24/7 direct line to the team |

  Each rank keeps every channel from the ranks below it, exactly like the
  Discord role setup (`assign_at_billing_period` roles stack in upgrade.chat
  too).

- **Club Rooms** — a real Discord-style layout: a channel sidebar (grouped by
  rank, locked channels shown greyed out with 🔒) and a chat pane with live
  messages, backed by Supabase Realtime. Only channels at or below the
  signed-in user's rank can be opened, read, or posted in — enforced by
  Postgres row-level security, not just hidden in the UI. Every channel is
  always *visible* in the sidebar to every signed-in user, paid or not —
  only entering/chatting is gated.

- **Main Room** — free for anyone with an account, no payment required.
  Logging in (or reopening the app with a still-active session) drops the
  user straight into it. Users who haven't joined a paid rank see every
  other channel locked but can chat here immediately.

- **Join Discord** CTA — sends members into the actual Discord server too.

## Supabase

Project: `ejhhjzamdittnbfvxsfx` (https://ejhhjzamdittnbfvxsfx.supabase.co).

- **Auth** — email + password, stored by Supabase (not in this codebase).
  Sign up and log in both live in the Club Rooms section's auth bar. The
  session is persisted, so returning users stay logged in and land straight
  in the Main Room.
  - **Email confirmation is currently ON** for this project (verified via the
    Auth settings API: `mailer_autoconfirm: false`). That means a new account
    must click the emailed confirmation link before it can log in — the app
    detects this and tells the user to check their inbox. If you'd rather
    sign-up log people in instantly with no email step, turn **off**
    **Authentication → Providers → Email → Confirm email** in the Supabase
    dashboard. It's a project setting the publishable key can't change, so it
    has to be done from the dashboard.
- **`memberships` table** — one row per user: `user_id`, `tier_id`, `rank`.
  Row-level security means a signed-in user can only read/write their own
  row.
- **`channels` table** — 14 rooms/channels (13 paid + the free Main Room at
  `required_rank = 0`), each with a `required_rank`. Publicly readable (just
  names/tiers, nothing sensitive) so the sidebar can show locked channels to
  everyone.
- **`messages` table** — the chat. RLS allows reading/inserting into a
  channel only if the caller's effective rank — `memberships.rank`, or `0`
  if they've never joined a paid tier — is `>= channels.required_rank`.
  That `0` default is what makes the Main Room free without needing a
  membership row to exist. Enforced server-side, so this can't be bypassed
  by editing the page. Realtime is enabled on this table so open channels
  update live.
- **Setup required once**: run `supabase/schema.sql` in the Supabase
  dashboard's SQL Editor (Project → SQL Editor → paste → Run). The
  publishable key used by this static site can't run DDL, so this one step
  has to be done from the dashboard (or with a direct Postgres connection).
  Until it's run, sign-up will work but joining a rank or opening a channel
  will fail with a "relation does not exist" error.
- **Key handling**: only the *publishable* key lives in `app.js` — that's by
  design, it's meant to be public and is what row-level security is for. The
  **secret** key must never be added to this repo or any file served by
  GitHub Pages; there's currently no server-side component here that would
  have a legitimate use for it. If a future feature needs it (e.g. a
  Supabase Edge Function, a payment webhook), store it as a secret in that
  service, not in this codebase.

## Pending config (do these before it's "live" for real money)

Marked clearly at the top of `app.js`:

1. **`DISCORD_INVITE_LINK`** — currently empty. Paste in a real (ideally
   non-expiring) invite link for the Rekkies Discord server.
2. **`PAYMENT_LINKS`** — one entry per rank, all currently empty. Each rank's
   "Join" button runs in **demo mode** (writes a membership row with no real
   charge) until you either:
   - paste a Stripe or PayPal **Payment Link** per rank into `PAYMENT_LINKS`
     in `app.js`, or
   - keep using upgrade.chat itself for checkout/role-assignment and point
     the buttons there instead — upgrade.chat already handles the
     PayPal/Stripe billing and auto-assigns the matching Discord role, which
     this static site can't do on its own (no bot).
3. **`supabase/schema.sql`** — see the Supabase section above.
4. **Confirm email** setting — see the Auth note above.

Membership in this app does **not** talk to Discord or a payment processor —
joining a rank here doesn't assign the matching Discord role. For real
automatic role assignment on payment, upgrade.chat (or a custom Discord bot +
payment webhook) is still required; this app is a full standalone copy of the
club — its own accounts, its own chat — that sits alongside it.

## Structure

- `index.html` — page structure
- `style.css` — Fredoka font, black/white/cyan/magenta/green theme
- `app.js` — rank + channel data, Supabase-backed auth/membership/chat, rendering
- `supabase/schema.sql` — `memberships`, `channels`, `messages` tables + RLS + realtime
- `assets/rekkies-logo.png` — the official Rekkies crown logo, used as
  favicon, header icon, hero logo, and footer icon

## Local preview

No build step — just open `index.html` in a browser, or serve the folder
with any static file server.
