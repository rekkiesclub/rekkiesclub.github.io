-- REKKIES CLUB — schema
--
-- This table makes chat PERMANENT: history loads when a room opens, every
-- member message is saved, and a message stays saved until its author deletes
-- it. (Profiles still use Supabase Auth, and live chat + presence still run
-- over Supabase Realtime — those need no table.)
--
-- Run this once in the Supabase SQL Editor (Project: ejhhjzamdittnbfvxsfx).
-- The publishable key can't run DDL, so it's applied from the dashboard (or
-- once via a Management API PAT). Re-running is safe — everything is guarded
-- with "if not exists" / "drop policy if exists".

-- ---- messages: the chat inside each room ----
-- channel_id is just the room's string id from app.js (e.g. 'main',
-- 'introductions', 'music-production'). Rooms are defined in the client, so no
-- separate channels table is needed.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  content text not null default '',
  -- a photo/video shared in the message: the public Storage URL + whether it's
  -- an 'image' or a 'video' (both null for a plain text message)
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);

-- A message must carry SOMETHING: non-empty text, or a media attachment (so a
-- photo/video can be posted with no caption). Text is still capped at 2000.
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check
  check (char_length(coalesce(content, '')) <= 2000
         and (btrim(coalesce(content, '')) <> '' or media_url is not null));

create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at);

alter table public.messages enable row level security;

-- Everyone can read history (the app itself decides which rooms to show).
drop policy if exists "messages are readable by everyone" on public.messages;
create policy "messages are readable by everyone"
  on public.messages for select
  using (true);

-- Any signed-in member can post, but only as themselves.
drop policy if exists "members insert their own messages" on public.messages;
create policy "members insert their own messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

-- Members can delete their OWN messages (nobody else's) — "saved until you
-- delete it".
drop policy if exists "members delete their own messages" on public.messages;
create policy "members delete their own messages"
  on public.messages for delete
  using (auth.uid() = user_id);

-- live message updates for everyone currently viewing a room (guarded so
-- re-running this file never errors on an already-published table)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---- Storage: the `chat-media` bucket for shared photos/videos ----
-- The bucket itself is created in the dashboard (Storage → New bucket:
-- id `chat-media`, Public ON, 50 MB file-size limit) or via the Storage API —
-- it can't be created from SQL. These RLS policies on storage.objects govern
-- it: anyone can read (it's public), any signed-in member can upload, and a
-- member can delete only files they own.
drop policy if exists "chat_media_read" on storage.objects;
create policy "chat_media_read" on storage.objects
  for select using (bucket_id = 'chat-media');

drop policy if exists "chat_media_upload" on storage.objects;
create policy "chat_media_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-media');

drop policy if exists "chat_media_delete" on storage.objects;
create policy "chat_media_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'chat-media' and owner = auth.uid());
