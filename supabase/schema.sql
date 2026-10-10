-- Co-op tables used by server/store.mjs (supabaseStore). Run in the Supabase SQL editor. Safe to run again.
-- The server reads and writes these tables with the service-role key, which bypasses RLS.
-- RLS is enabled with no policies, so the public anon key cannot read or write any of them.

create table if not exists public.rooms (
  code text primary key,
  status text not null check (status in ('lobby', 'playing', 'over', 'error')),
  players integer not null check (players between 1 and 5),
  colors jsonb not null,
  seats jsonb not null,
  opts jsonb not null default '{}'::jsonb,
  setup jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  id uuid primary key,
  room_code text not null references public.rooms (code) on delete cascade,
  token_hash text not null,
  name text not null default '',
  seat text,
  host boolean not null default false,
  -- Join order. When the host leaves, the next member by this value takes over, so it must grow with each insert.
  joined_at bigint generated always as identity
);

-- One member per seat (backstop for the seat check in server/rooms.mjs).
create unique index if not exists room_members_seat_key
  on public.room_members (room_code, seat)
  where seat is not null;

create index if not exists room_members_room_idx
  on public.room_members (room_code, joined_at);

create table if not exists public.room_answers (
  room_code text not null references public.rooms (code) on delete cascade,
  n integer not null,
  a jsonb,
  h boolean not null default false,
  t text not null default '',
  created_at timestamptz not null default now(),
  primary key (room_code, n)
);

-- Databases created before pruning existed lack this column.
alter table public.room_answers add column if not exists created_at timestamptz not null default now();

create index if not exists room_answers_room_time_idx
  on public.room_answers (room_code, created_at);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_answers enable row level security;

-- Pruning. A room is deleted when it was created more than 7 days ago and has had no answer in the last 7 days.
-- Its members and answers go with it (on delete cascade). The function is not for browsers: revoke EXECUTE from the
-- roles that PostgREST exposes, so only the database itself (pg_cron below) can run it.
create or replace function public.prune_idle_rooms(keep interval default interval '7 days')
returns integer
language sql
set search_path = public
as $$
  with gone as (
    delete from public.rooms r
    where r.created_at < now() - keep
      and not exists (
        select 1 from public.room_answers a
        where a.room_code = r.code and a.created_at > now() - keep
      )
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.prune_idle_rooms(interval) from public, anon, authenticated;

-- Runs hourly at minute 17. Needs the pg_cron extension (Supabase ships it).
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  perform cron.unschedule('deep-regret-prune-rooms');
exception when others then
  null; -- the job does not exist yet
end $$;

select cron.schedule('deep-regret-prune-rooms', '17 * * * *', 'select public.prune_idle_rooms()');
