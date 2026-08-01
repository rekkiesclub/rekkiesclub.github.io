-- REKKIES CLUB — membership table
-- Run this once in the Supabase SQL Editor (Project: ejhhjzamdittnbfvxsfx) before
-- membership sign-up will work. The site's publishable key cannot run DDL, so this
-- step has to be done from the dashboard (or with a Postgres connection string).

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
