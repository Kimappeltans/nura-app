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
--
-- Every row's key is (user_id, id), and a micro-step's parent and a log's
-- habit must be in the same account. Text columns have a length cap and an
-- account has a row cap (nura_row_cap, below). A project made before these
-- runs migrations/2026-09-27-hardening.sql to get the same.

create table if not exists public.task (
  id            text not null constraint task_id_len check (char_length(id) <= 100),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null constraint task_title_len check (char_length(title) <= 500),
  first_action  text constraint task_first_action_len check (char_length(first_action) <= 1000),
  est_minutes   integer,
  due_at        bigint,
  state         text not null default 'inbox' constraint task_state_len check (char_length(state) <= 100),
  parent_id     text constraint task_parent_id_len check (char_length(parent_id) <= 100),
  created_at    bigint not null,
  completed_at  bigint,
  energy        text constraint task_energy_len check (char_length(energy) <= 100),
  freq_target   integer,
  freq_period   text constraint task_freq_period_len check (char_length(freq_period) <= 100),
  snoozed_until bigint,
  repeat_rule   text constraint task_repeat_rule_len check (char_length(repeat_rule) <= 100),
  label         text constraint task_label_len check (char_length(label) <= 100),
  has_time      integer,
  priority      integer,
  activity      text constraint task_activity_len check (char_length(activity) <= 100),
  repeat_days   text constraint task_repeat_days_len check (char_length(repeat_days) <= 100),
  snooze_count  integer,
  retro         integer,
  updated_at    bigint not null,
  constraint task_pkey primary key (user_id, id),
  -- deferrable: a single sync batch can upsert a micro-step alongside its
  -- own parent row in the same request; without this, Postgres checks the
  -- FK per-row and can reject a child that lands before its parent.
  constraint task_parent_fk foreign key (user_id, parent_id) references public.task (user_id, id)
    on delete cascade deferrable initially deferred
);
create index if not exists task_user_updated_idx on public.task(user_id, updated_at);

create table if not exists public.habit (
  id         text not null constraint habit_id_len check (char_length(id) <= 100),
  user_id    uuid not null references auth.users(id) on delete cascade,
  cue        text not null constraint habit_cue_len check (char_length(cue) <= 300),
  action     text not null constraint habit_action_len check (char_length(action) <= 300),
  minimum    text constraint habit_minimum_len check (char_length(minimum) <= 300),
  created_at bigint not null,
  active     integer not null default 1,
  updated_at bigint not null,
  constraint habit_pkey primary key (user_id, id)
);
create index if not exists habit_user_updated_idx on public.habit(user_id, updated_at);

create table if not exists public.habit_log (
  id          text not null constraint habit_log_id_len check (char_length(id) <= 100),
  user_id     uuid not null references auth.users(id) on delete cascade,
  habit_id    text not null constraint habit_log_habit_id_len check (char_length(habit_id) <= 100),
  at          bigint not null,
  did_minimum integer not null default 0,
  updated_at  bigint not null,
  constraint habit_log_pkey primary key (user_id, id),
  constraint habit_log_habit_fk foreign key (user_id, habit_id) references public.habit (user_id, id)
    on delete cascade
);
create index if not exists habit_log_user_updated_idx on public.habit_log(user_id, updated_at);

-- At most 20000 tasks, 500 habits and 50000 habit logs per account. After
-- each insert statement (a sync push is one per table), counts the rows of
-- every account that statement added to. Rows an upsert only updated aren't
-- in new_rows, so editing never trips it.
create or replace function public.nura_row_cap() returns trigger
language plpgsql set search_path = '' as $$
declare
  cap integer;
  over uuid;
begin
  cap := tg_argv[0]::integer;
  if tg_table_name = 'task' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.task t where t.user_id = n.user_id) > cap limit 1;
  elsif tg_table_name = 'habit' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.habit h where h.user_id = n.user_id) > cap limit 1;
  elsif tg_table_name = 'habit_log' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.habit_log l where l.user_id = n.user_id) > cap limit 1;
  end if;
  if over is not null then
    raise exception 'too many % rows for one account (at most %)', tg_table_name, cap
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists nura_row_cap on public.task;
create trigger nura_row_cap after insert on public.task
  referencing new table as new_rows for each statement execute function public.nura_row_cap('20000');
drop trigger if exists nura_row_cap on public.habit;
create trigger nura_row_cap after insert on public.habit
  referencing new table as new_rows for each statement execute function public.nura_row_cap('500');
drop trigger if exists nura_row_cap on public.habit_log;
create trigger nura_row_cap after insert on public.habit_log
  referencing new table as new_rows for each statement execute function public.nura_row_cap('50000');

alter table public.task      enable row level security;
alter table public.habit     enable row level security;
alter table public.habit_log enable row level security;

-- signed-in people only; (select auth.uid()) is read once per statement, not per row
create policy "task owner select" on public.task for select to authenticated using ((select auth.uid()) = user_id);
create policy "task owner insert" on public.task for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "task owner update" on public.task for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "task owner delete" on public.task for delete to authenticated using ((select auth.uid()) = user_id);

create policy "habit owner select" on public.habit for select to authenticated using ((select auth.uid()) = user_id);
create policy "habit owner insert" on public.habit for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habit owner update" on public.habit for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit owner delete" on public.habit for delete to authenticated using ((select auth.uid()) = user_id);

create policy "habit_log owner select" on public.habit_log for select to authenticated using ((select auth.uid()) = user_id);
create policy "habit_log owner insert" on public.habit_log for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habit_log owner update" on public.habit_log for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit_log owner delete" on public.habit_log for delete to authenticated using ((select auth.uid()) = user_id);

-- anon never touches these; signed-in people only read and write rows
revoke all on public.task, public.habit, public.habit_log from anon;
revoke truncate, references, trigger on public.task, public.habit, public.habit_log from authenticated;
