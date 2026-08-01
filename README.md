# REKKIES CLUB

The **free live community** for **The Rekkies** — a standalone static site
(GitHub Pages, no build step, vanilla HTML/CSS/JS). The app opens straight into
the live **Main Room**; every room is a real live chat channel. There are no
ranks to buy and no payments — sign in with your email + password and chat.

Live at: https://rekkiesclub.github.io — **GitHub Pages is enabled and the
site is up.** Fully functional as deployed: land in the Main Room, chat as a
guest, or sign up / log in to join every room with your own profile — no
database setup required (see Supabase section). Persistent chat history is an
optional upgrade.

Theme: [Fredoka](https://fonts.google.com/specimen/Fredoka) font, 5-color
palette only — `#000000` `#ffffff` `#00f7ff` `#fa00ff` `#00ff49`.

## What it does

- **Main Room** — the live home **everyone lands in** on open, signed in or
  not. A first-time visitor can read and chat right away as a guest (a stable
  per-browser `guest-xxxx` handle), no account needed.

- **Rooms** — a sidebar/chat layout: a room sidebar grouped by topic
  (Community, Creative, Tech & Content, Business, Inner Circle) and a chat pane
  with live messages over Supabase Realtime. Every room is **free**. The Main
  Room is open to everyone; the rest just need a signed-in profile so your
  messages carry your name (rooms you can't yet chat in show greyed out with
  🔒 until you sign in).

- **Profiles** — your profile is your account: email + password, saved by the
  app and carried across devices. Signing in swaps the guest handle for your
  own.

## Supabase — works out of the box, no database setup

Project: `ejhhjzamdittnbfvxsfx` (https://ejhhjzamdittnbfvxsfx.supabase.co).

The app is **fully functional with only the publishable key** — no tables to
create, no SQL to run. It uses two Supabase capabilities that need no schema:

- **Auth** — email + password, stored by Supabase (not in this codebase).
  Sign up and log in both live in the Rooms section's auth bar. The session is
  persisted, so returning users stay logged in and land straight in the Main
  Room.
  - **Email confirmation is currently ON** for this project (verified via the
    Auth settings API: `mailer_autoconfirm: false`). A new account must click
    the emailed confirmation link before it can log in — the app detects this
    and tells the user to check their inbox. To let sign-up log people in
    instantly with no email step, turn **off** **Authentication → Providers →
    Email → Confirm email** in the Supabase dashboard.
- **Room chat** — live messages over **Supabase Realtime Broadcast**, one
  channel per room. No table required; everyone in a room sees messages in
  real time.

### Optional upgrade: persistent chat history (`supabase/schema.sql`)

Broadcast chat is live-only — messages aren't saved, so a room starts empty on
reload. If you want **persistent history**, run `supabase/schema.sql` once in
the dashboard's SQL Editor
(https://supabase.com/dashboard/project/ejhhjzamdittnbfvxsfx/sql/new). It adds
a `messages` table. The app then automatically loads history when a room opens
and saves each message — no code change needed. Until then it just runs
live-only; nothing breaks. (The publishable key can't run DDL, which is why
this is a dashboard step and not something the app does itself.)

### Key handling

Only the **publishable** key lives in `app.js` — by design; it's meant to be
public. The **secret / service-role** keys must never be added to this repo or
any file served by GitHub Pages: this is a static site, so anything in its code
is visible to every visitor, and the service role bypasses all security.

## Structure

- `index.html` — page structure
- `style.css` — Fredoka font, black/white/cyan/magenta/green theme
- `app.js` — room data, Supabase auth (profiles), Realtime Broadcast chat,
  rendering
- `supabase/schema.sql` — OPTIONAL; `messages` table for persistent history
- `assets/rekkies-logo.png` — the official Rekkies crown logo, used as
  favicon, header icon, and footer icon

## Local preview

No build step — just open `index.html` in a browser, or serve the folder
with any static file server.
