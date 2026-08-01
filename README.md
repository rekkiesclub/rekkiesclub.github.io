# REKKIES CLUB

The personal club app for **The Rekkies** — a static site (GitHub Pages, no build
step, vanilla HTML/CSS/JS) built as a copy of the Rekkies Discord server: same
ranks, rooms as real chat channels, gated exactly like the Discord roles run
through [upgrade.chat/rekkies](https://upgrade.chat/rekkies).

Live at: https://rekkiesclub.github.io

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
  Postgres row-level security, not just hidden in the UI.

- **Join Discord** CTA — sends members into the actual Discord server too.

## Supabase

Project: `ejhhjzamdittnbfvxsfx` (https://ejhhjzamdittnbfvxsfx.supabase.co).

- **Auth** — email + password, stored by Supabase (not in this codebase).
  Sign up and log in both live in the Club Rooms section's auth bar.
  - By default Supabase requires a user to click an emailed confirmation
    link before their password account can sign in. If you want sign-up to
    log people in immediately with no email step, turn off **Authentication
    → Providers → Email → Confirm email** in the Supabase dashboard — that's
    a project setting, not something the publishable key can change.
- **`memberships` table** — one row per user: `user_id`, `tier_id`, `rank`.
  Row-level security means a signed-in user can only read/write their own
  row.
- **`channels` table** — the 13 rooms/channels, each with a `required_rank`.
  Publicly readable (just names/tiers, nothing sensitive) so the sidebar can
  show locked channels to everyone.
- **`messages` table** — the chat. RLS only allows reading/inserting into a
  channel if the caller's `memberships.rank >= channels.required_rank` —
  enforced server-side, so this can't be bypassed by editing the page.
  Realtime is enabled on this table so open channels update live.
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
- `assets/logo.png`, `assets/icon.png` — Rekkies branding, pulled from the
  live upgrade.chat store

## Local preview

No build step — just open `index.html` in a browser, or serve the folder
with any static file server.
