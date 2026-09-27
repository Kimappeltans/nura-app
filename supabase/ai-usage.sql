-- Nura — daily limits for the AI functions (supabase/functions/nura-plan,
-- nura-coach).
--
-- Paste into the Supabase SQL Editor and run once (running it again is
-- harmless). The functions call nura_ai_hit() with the service role; nobody
-- else can read or call it. This is required: the limits fail closed, so
-- without it every call is refused (503, and the log says "usage limits
-- unavailable, refusing").
--
-- One row per key per day: 'u:<user id>' and 'ip:<address>' for planning,
-- 'read:u:<user id>' and 'read-ip:<address>' for reads. Only counts, never
-- content — the goals people send are not stored anywhere on the server.

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
