-- REKKIES CLUB — schema (OPTIONAL)
--
-- The app works WITHOUT this file: accounts use Supabase Auth, membership is
-- stored on each user's Auth record (user_metadata), and room chat runs over
-- Supabase Realtime Broadcast — none of which need a database table.
--
-- Run this once in the Supabase SQL Editor (Project: ejhhjzamdittnbfvxsfx)
-- ONLY if you want to upgrade chat from live-only to PERSISTENT: with the
-- `messages` table below, chat history is loaded when a room opens and every
-- message is saved. The `memberships`/`channels` tables are here too for a
-- future server-enforced (RLS) gating model once real payments are added.
-- The publishable key can't run DDL, so this must be done from the dashboard.

-- ---- memberships: one row per user, which paid rank they hold ----
-- A user with NO row here is still a valid free member (rank 0) — see the
-- messages RLS below, which treats a missing row as rank 0 rather than
-- requiring one to exist.
create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier_id text not null check (tier_id in ('soldier','captain','colonel','general','elite')),
  rank int not null check (rank between 1 and 5),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

create policy "select own membership"
  on public.memberships for select
  using (auth.uid() = user_id);

create policy "insert own membership"
  on public.memberships for insert
  with check (auth.uid() = user_id);

create policy "update own membership"
  on public.memberships for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own membership"
  on public.memberships for delete
  using (auth.uid() = user_id);

-- ---- channels: the club's rooms, one per Discord channel, gated by rank ----
-- required_rank 0 = the free Main Room, open to any signed-in user with no
-- payment at all. required_rank 1-5 = gated by the matching paid rank.
create table if not exists public.channels (
  id text primary key,
  tier_id text not null,
  required_rank int not null check (required_rank between 0 and 5),
  name text not null,
  position int not null default 0
);

alter table public.channels enable row level security;

create policy "channels are readable by everyone"
  on public.channels for select
  using (true);

insert into public.channels (id, tier_id, required_rank, name, position) values
  ('main',                  'main',    0, 'Main Room 🏠',               0),
  ('musical-instruments',   'soldier', 1, 'Musical Instruments 🎹',     1),
  ('music-mixing',          'soldier', 1, 'Music Mixing 🎧',            2),
  ('music-production',      'soldier', 1, 'Music Production 🖥️',       3),
  ('photography',           'soldier', 1, 'Photography 📸',             4),
  ('videography',           'soldier', 1, 'Videography 🎥',             5),
  ('photo-video-editing',   'soldier', 1, 'Photo+Video Editing 📸📹',   6),
  ('artificial-intelligence','captain',2, 'Artificial Intelligence 🤖', 7),
  ('creative-content',      'captain', 2, 'Creative Content 🖋️',       8),
  ('systems',               'captain', 2, 'Systems 🌐',                 9),
  ('product',               'colonel', 3, 'Product 🏅',                10),
  ('sales',                 'colonel', 3, 'Sales 🔥',                  11),
  ('marketing',             'colonel', 3, 'Marketing 📢',              12),
  ('elites-private',        'elite',   5, '👑 ELITES — Private Room 👑',13)
on conflict (id) do nothing;

-- ---- messages: the chat inside each channel ----
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel_id text not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_email text not null,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at);

alter table public.messages enable row level security;

-- A user's effective rank is their memberships.rank, or 0 (free) if they
-- have never joined a paid tier — that 0 is what unlocks the Main Room.
create policy "select messages in unlocked channels"
  on public.messages for select
  using (
    coalesce((select m.rank from public.memberships m where m.user_id = auth.uid()), 0)
      >= (select c.required_rank from public.channels c where c.id = messages.channel_id)
  );

create policy "insert messages in unlocked channels"
  on public.messages for insert
  with check (
    auth.uid() = user_id
    and coalesce((select m.rank from public.memberships m where m.user_id = auth.uid()), 0)
      >= (select c.required_rank from public.channels c where c.id = messages.channel_id)
  );

-- live message updates for everyone currently viewing a channel
alter publication supabase_realtime add table public.messages;
