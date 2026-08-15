-- Run this in the Supabase SQL editor for the new project.
-- Mirrors the MySQL `games` / `game_data` tables from the Hostinger backend.

create table if not exists games (
  id bigint generated always as identity primary key,
  game_date date not null,
  content jsonb not null,
  source text
);
create index if not exists idx_games_game_date on games (game_date);

create table if not exists game_data (
  id bigint generated always as identity primary key,
  user_key text not null,
  game_date date not null,
  state jsonb not null,
  started_at timestamptz,
  last_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_key, game_date)
);
create index if not exists idx_game_data_game_date on game_data (game_date);
create index if not exists idx_game_data_last_saved on game_data (last_saved_at);

-- RLS stays on with no public policies: only the service-role key (used
-- server-side in the Vercel functions) can read/write these tables.
alter table games enable row level security;
alter table game_data enable row level security;
