-- Co-op tables used by server/store.mjs (supabaseStore). Run once in the Supabase SQL editor.
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
  primary key (room_code, n)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_answers enable row level security;
