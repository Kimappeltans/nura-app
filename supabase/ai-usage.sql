-- Nura — daily limits for the planner (supabase/functions/nura-plan).
--
-- Paste into the Supabase SQL Editor and run once. The function calls
-- nura_ai_hit() with the service role; nobody else can read or call it.
-- Without this, the function still works, just with no daily limits (it
-- logs "usage limits are off").
--
-- One row per key per day: 'd:<device id>' or a signed-in user's id, and
-- 'ip:<address>'. Only counts, never content — the goals people send are
-- not stored anywhere on the server.

create table if not exists public.ai_usage (
  key  text    not null,
  day  date    not null default current_date,
  n    integer not null default 0,
  primary key (key, day)
);

-- row level security on and no policies: only the service role gets in
alter table public.ai_usage enable row level security;

create or replace function public.nura_ai_hit(k text) returns integer
language sql security definer set search_path = public as $$
  insert into ai_usage (key, day, n) values (k, current_date, 1)
  on conflict (key, day) do update set n = ai_usage.n + 1
  returning n;
$$;

revoke execute on function public.nura_ai_hit(text) from public, anon, authenticated;

-- old counts are no use to anyone; clear them now and then:
-- delete from public.ai_usage where day < current_date - 7;
