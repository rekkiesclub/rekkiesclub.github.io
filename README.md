# REKKIES CLUB

The **private** members platform for **The Rekkies** — a standalone static
site (GitHub Pages, no build step, vanilla HTML / CSS / JS). The whole app is
for **real-life Rekkies only**: there is **no sign-up and no guest access**.
Accounts are created manually by the club; a member logs in with the email +
password they were given, lands in the live **Main Room**, and chats in real
time with the community.

Live at: **https://rekkiesclub.github.io**

Theme: [Fredoka](https://fonts.google.com/specimen/Fredoka) font, five-color
palette only — `#000000` `#ffffff` `#00f7ff` `#fa00ff` `#00ff49`.

## What it does

- **Members-only gate** — a visitor sees ONLY a login card ("Members only").
  No sign-up button exists anywhere; rooms and chat stay hidden until a
  club-made account logs in.
- **Opens in the live Main Room** — after login, a member lands straight in
  the Main Room. No landing page, no funnel — the page *is* the chat.
- **Rooms menu** — the topic channels live in a **"Rooms" dropdown at the top
  right**, not in the main view. Open it, pick a room, and the chat switches.
  Every room is open to every logged-in member.
- **Profile section** — a **profile dropdown** in the top right shows your
  avatar initial, display name, email, and join date. Your account is your
  email + password (Supabase Auth); edit your **display name** any time. It
  shows on your messages and follows your account across devices.
- **Permanent chat** — messages are **saved**: open a room and its history
  loads, and everything stays until **you delete it**. Hover your own message
  and hit **×** to remove it for everyone (you can only delete your own).
- **Live presence** — each room shows a real-time **"N here"** count of who's
  currently in it, powered by Supabase Realtime Presence.

## Supabase

Project: `ejhhjzamdittnbfvxsfx` (https://ejhhjzamdittnbfvxsfx.supabase.co).

The app uses the **publishable key only** (public by design) and four Supabase
capabilities:

- **Auth** — email + password, stored by Supabase (not in this codebase). The
  session is persisted, so returning members stay logged in and land straight
  in the Main Room. The display name lives on `user_metadata`.
  - **Accounts are created manually** by the club: dashboard →
    **Authentication → Users → Add user** (tick *Auto Confirm User* so the
    member can log in immediately). The app has no sign-up path.
  - To fully close the back door, also turn **off**
    **Authentication → Sign In / Providers → Allow new users to sign up** in
    the dashboard — otherwise the auth API itself would still accept
    sign-ups even though the app offers none.
- **`messages` table** — permanent chat history. Loaded when a room opens; each
  member message is saved and kept until its author deletes it. Row-level
  security: everyone can read, a member can only insert/delete **their own**
  messages (see `supabase/schema.sql`).
- **Realtime Broadcast** — instant live delivery of new messages and deletes to
  everyone currently viewing a room.
- **Realtime Presence** — the live "who's here" count.

### Database setup (`supabase/schema.sql`)

The `messages` table has already been created on this project. If you ever need
to recreate it (or set up a fresh Supabase project), run `supabase/schema.sql`
once in the dashboard's SQL Editor
(https://supabase.com/dashboard/project/ejhhjzamdittnbfvxsfx/sql/new). It is
idempotent — safe to re-run. The publishable key can't run DDL, which is why
this is a dashboard step.

### Key handling

Only the **publishable** key lives in `app.js` — by design; it's public. The
**secret / service-role** key and any account access token (`sbp_…`) must never
be added to this repo or any file served by GitHub Pages: this is a static
site, so anything in its code is visible to every visitor, and those keys
bypass all security.

## Structure

- `index.html` — page structure (header with Rooms + Profile dropdowns, chat)
- `style.css` — Fredoka font, black / white / cyan / magenta / green theme
- `app.js` — room data, Supabase auth (profiles + display name), persistent
  chat (save / load / delete), Realtime Broadcast + Presence, rendering
- `supabase/schema.sql` — the `messages` table + row-level security policies
- `assets/rekkies-logo.png` — the Rekkies crown logo (favicon, header)

## Local preview

No build step — open `index.html` in a browser, or serve the folder with any
static file server.
