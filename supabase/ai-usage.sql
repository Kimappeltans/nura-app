-- Nura — daily limits for the AI functions (supabase/functions/nura-plan,
-- nura-coach).
--
-- Paste into the Supabase SQL Editor and run once (running it again is
-- harmless). The functions call nura_ai_hit() with the service role; nobody
-- else can read or call it. This is required: the limits fail closed, so
-- without it every call is refused (503, and the log says "usage limits
-- unavailable, refusing").
--
-- One row per key per day: 'u:<user id>', 'ip:<hash>' and 'global' for
-- planning, 'read:u:<user id>', 'read-ip:<hash>' and 'read:global' for
-- reads. The hash is an HMAC of the address (NURA_IP_SALT), never the
-- address itself. Only counts, never content — the goals people send are
-- not stored anywhere on the server.

create table if not exists public.ai_usage (
  key  text    not null,
  day  date    not null default current_date,
  n    integer not null default 0,
  primary key (key, day)
);

-- row level security on and no policies: only the service role gets in
alter table public.ai_usage enable row level security;

-- and no grants: nobody but the service role reads or writes it
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.nura_ai_hit(k text) returns integer
language sql security definer set search_path = '' as $$
  insert into public.ai_usage as u (key, day, n) values (k, current_date, 1)
  on conflict (key, day) do update set n = u.n + 1
  returning n;
$$;

revoke execute on function public.nura_ai_hit(text) from public, anon, authenticated;

-- counts older than 30 days are deleted by the functions themselves
-- (forgetOldCounts in nura-plan and nura-coach)
