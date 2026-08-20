-- Run this in the Supabase SQL editor to add the pending/approved queue
-- used by the admin review UI. Defaults to 'approved' so every existing
-- row (the seeded game, and anything added manually) keeps working with
-- no extra migration step.

alter table games add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists idx_games_status on games (status);
