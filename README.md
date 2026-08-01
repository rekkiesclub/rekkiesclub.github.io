# REKKIES CLUB

The personal club app for **The Rekkies** — a static site (GitHub Pages, no build
step, vanilla HTML/CSS/JS) that mirrors the same rank/room setup the Rekkies
Discord server runs through [upgrade.chat/rekkies](https://upgrade.chat/rekkies).

Live at: https://rekkiesclub.github.io

## What it does

- **Ranks** — the same 5 paid ranks as the live Discord club, in the same
  order, at the same prices:

  | Rank    | Price/mo | Discord role | Rooms unlocked |
  |---------|---------:|--------------|-----------------|
  | Soldier | $25      | SOLDIERS     | Musical Instruments, Music Mixing, Music Production, Photography, Videography, Photo+Video Editing |
  | Captain | $100     | CAPTAINS     | + Artificial Intelligence, Creative Content, Systems |
  | Colonel | $500     | COLONELS     | + Product, Sales, Marketing |
  | General | $1000    | GENERALS     | + 10% off all Rekkies products/courses/services |
  | Elite   | $2500    | ELITES       | + private ELITES room, 24/7 direct line to the team |

  Each rank keeps every room from the ranks below it, exactly like the Discord
  role setup (`assign_at_billing_period` roles stack in upgrade.chat too).

- **Club Rooms** — a room grid that unlocks based on the visitor's rank
  (stored in `localStorage`, client-side only — see below).

- **Join Discord** CTA — sends members into the actual Discord server once
  they've picked a rank.

## Pending config (do these before it's "live" for real money)

Both are marked clearly at the top of `app.js`:

1. **`DISCORD_INVITE_LINK`** — currently empty. Paste in a real (ideally
   non-expiring) invite link for the Rekkies Discord server.
2. **`PAYMENT_LINKS`** — one entry per rank, all currently empty. Each rank's
   "Join" button runs in **demo mode** (just flips a local flag, no money
   changes hands) until you either:
   - paste a Stripe or PayPal **Payment Link** per rank into `PAYMENT_LINKS`
     in `app.js`, or
   - keep using upgrade.chat itself for checkout/role-assignment and point
     the buttons there instead — upgrade.chat already handles the
     PayPal/Stripe billing and auto-assigns the matching Discord role, which
     this static site can't do on its own (no backend/bot).

Membership state in this app is a local demo only — it does **not** talk to
Discord, upgrade.chat, or any payment processor. For real automatic role
assignment on payment, upgrade.chat (or a custom Discord bot + payment
webhook) is still required; this app is the branded front door / rank
showcase that sits alongside it.

## Structure

- `index.html` — page structure
- `style.css` — dark theme, gold accent, per-rank badge colors
- `app.js` — rank data, membership state, rendering, checkout demo
- `assets/logo.png`, `assets/icon.png` — Rekkies branding, pulled from the
  live upgrade.chat store

## Local preview

No build step — just open `index.html` in a browser, or serve the folder
with any static file server.
