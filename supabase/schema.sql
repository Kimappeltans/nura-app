-- Nura — Supabase schema for auth + sync.
--
-- Paste this into the Supabase dashboard's SQL Editor and run it once, after
-- creating the project (see the plan's Phase B for the rest of the setup:
-- enabling Apple/Google providers, redirect URLs, etc). No migration tool in
-- v1 — this file IS the migration, run by hand.
--
-- Mirrors src/db.ts's task/habit/habit_log tables. Deliberately NOT synced:
-- breadcrumb (device/session-specific — someone else's interruption note on
-- another device is confusing, not helpful), nudge (holds an os_handle into
-- THAT device's own OS notification system), event (an analytics log that
-- already derives from task; each device can replay its own momentum/light
-- from its own local event history once task itself syncs).
--
-- Timestamps are BIGINT epoch-milliseconds, not TIMESTAMPTZ — matching the
-- local SQLite INTEGER columns exactly, so the sync engine (src/sync.ts)
-- never does timezone/precision conversion in either direction.
--
-- updated_at is ALWAYS supplied by the client, never a Postgres DEFAULT
-- now()/trigger. If Postgres stamped its own arrival time, two devices
-- racing to write the same row could resolve in FIFO-received order instead
-- of by which edit actually happened later — quietly breaking last-write-wins.
--
-- No tombstone/soft-delete column anywhere: task.state = 'dropped' and
-- habit.active = 0 are already the app's non-destructive delete mechanisms
-- (dropTask()/pauseHabit() never issue a SQL DELETE locally), and habit_log
-- is already append-only. The DELETE policies below exist only as a manual
-- admin escape hatch — the app itself never calls one.

create table if not exists public.task (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  first_action  text,
  est_minutes   integer,
  due_at        bigint,
  state         text not null default 'inbox',
  -- deferrable: a single sync batch can upsert a micro-step alongside its
  -- own parent row in the same request; without this, Postgres checks the
  -- FK per-row and can reject a child that lands before its parent.
  parent_id     text references public.task(id) deferrable initially deferred,
  created_at    bigint not null,
  completed_at  bigint,
  energy        text,
  freq_target   integer,
  freq_period   text,
  snoozed_until bigint,
  repeat_rule   text,
  label         text,
  has_time      integer,
  priority      integer,
  activity      text,
  repeat_days   text,
  snooze_count  integer,
  retro         integer,
  updated_at    bigint not null
);
create index if not exists task_user_updated_idx on public.task(user_id, updated_at);

create table if not exists public.habit (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  cue        text not null,
  action     text not null,
  minimum    text,
  created_at bigint not null,
  active     integer not null default 1,
  updated_at bigint not null
);
create index if not exists habit_user_updated_idx on public.habit(user_id, updated_at);

create table if not exists public.habit_log (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  habit_id    text not null references public.habit(id) on delete cascade,
  at          bigint not null,
  did_minimum integer not null default 0,
  updated_at  bigint not null
);
create index if not exists habit_log_user_updated_idx on public.habit_log(user_id, updated_at);

alter table public.task      enable row level security;
alter table public.habit     enable row level security;
alter table public.habit_log enable row level security;

create policy "task owner select" on public.task for select using (auth.uid() = user_id);
create policy "task owner insert" on public.task for insert with check (auth.uid() = user_id);
create policy "task owner update" on public.task for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "task owner delete" on public.task for delete using (auth.uid() = user_id);

create policy "habit owner select" on public.habit for select using (auth.uid() = user_id);
create policy "habit owner insert" on public.habit for insert with check (auth.uid() = user_id);
create policy "habit owner update" on public.habit for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit owner delete" on public.habit for delete using (auth.uid() = user_id);

create policy "habit_log owner select" on public.habit_log for select using (auth.uid() = user_id);
create policy "habit_log owner insert" on public.habit_log for insert with check (auth.uid() = user_id);
create policy "habit_log owner update" on public.habit_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_log owner delete" on public.habit_log for delete using (auth.uid() = user_id);
