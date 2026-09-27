-- Nura: hardening after the September security review (27 September 2026).
--
-- For a project that already ran schema.sql and ai-usage.sql. Paste the whole
-- file into the Supabase SQL Editor and run it once. It is one transaction:
-- if any statement fails, nothing changes. Running it again is harmless.
-- (A new project doesn't need it: schema.sql and ai-usage.sql already end
-- in the same state.)
--
-- What it does:
--   1. Caps the length of every text column (checked on every new write; old
--      rows are checked too, and any that don't fit are named in the result).
--   2. Caps how many rows one account can hold: 20000 tasks, 500 habits,
--      50000 habit logs.
--   3. Makes each row's key (user_id, id) instead of id alone, and makes a
--      micro-step's parent and a log's habit belong to the same account.
--      The app's upserts don't name a conflict column, so they follow the
--      primary key and keep working before and after this.
--   4. Policies only for signed-in people, with auth.uid() read once per
--      statement instead of once per row.
--   5. Takes away what anon and signed-in people never need: everything for
--      anon, all of ai_usage for signed-in people, and truncate, references
--      and trigger on the synced tables.
--   6. nura_ai_hit() with an empty search_path.
--
-- The last statement lists the constraints this adds. Every row should say
-- convalidated = true. A false one still holds for every new write; it means
-- some existing rows break it: the query at the very bottom finds them.

begin;

/* ---------------- 1. text lengths ---------------- */

do $$
declare c record;
begin
  for c in select * from (values
    ('task', 'task_id_len',            'char_length(id) <= 100'),
    ('task', 'task_title_len',         'char_length(title) <= 500'),
    ('task', 'task_first_action_len',  'char_length(first_action) <= 1000'),
    ('task', 'task_state_len',         'char_length(state) <= 100'),
    ('task', 'task_parent_id_len',     'char_length(parent_id) <= 100'),
    ('task', 'task_energy_len',        'char_length(energy) <= 100'),
    ('task', 'task_freq_period_len',   'char_length(freq_period) <= 100'),
    ('task', 'task_repeat_rule_len',   'char_length(repeat_rule) <= 100'),
    ('task', 'task_label_len',         'char_length(label) <= 100'),
    ('task', 'task_activity_len',      'char_length(activity) <= 100'),
    ('task', 'task_repeat_days_len',   'char_length(repeat_days) <= 100'),
    ('habit', 'habit_id_len',          'char_length(id) <= 100'),
    ('habit', 'habit_cue_len',         'char_length(cue) <= 300'),
    ('habit', 'habit_action_len',      'char_length(action) <= 300'),
    ('habit', 'habit_minimum_len',     'char_length(minimum) <= 300'),
    ('habit_log', 'habit_log_id_len',       'char_length(id) <= 100'),
    ('habit_log', 'habit_log_habit_id_len', 'char_length(habit_id) <= 100')
  ) as v(tbl, name, expr) loop
    if not exists (select 1 from pg_constraint
                   where conname = c.name and conrelid = format('public.%I', c.tbl)::regclass) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;

/* ---------------- 2. rows per account ---------------- */

-- After each insert statement (a sync push is one per table), counts the
-- rows of every account that statement added to. Rows an upsert only
-- updated aren't in new_rows, so editing never trips it.
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

/* ---------------- 3. keys per account ---------------- */

do $$
declare r record;
begin
  -- the old foreign keys onto task(id) and habit(id): task.parent_id and
  -- habit_log.habit_id, by whatever name Postgres gave them
  for r in select conrelid::regclass as tbl, conname from pg_constraint
           where contype = 'f'
             and confrelid in ('public.task'::regclass, 'public.habit'::regclass)
             and conname not in ('task_parent_fk', 'habit_log_habit_fk') loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
  -- primary keys on id alone
  for r in select conrelid::regclass as tbl, conname from pg_constraint
           where contype = 'p'
             and conrelid in ('public.task'::regclass, 'public.habit'::regclass, 'public.habit_log'::regclass)
             and cardinality(conkey) = 1 loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;

  if not exists (select 1 from pg_constraint where contype = 'p' and conrelid = 'public.task'::regclass) then
    alter table public.task add constraint task_pkey primary key (user_id, id);
  end if;
  if not exists (select 1 from pg_constraint where contype = 'p' and conrelid = 'public.habit'::regclass) then
    alter table public.habit add constraint habit_pkey primary key (user_id, id);
  end if;
  if not exists (select 1 from pg_constraint where contype = 'p' and conrelid = 'public.habit_log'::regclass) then
    alter table public.habit_log add constraint habit_log_pkey primary key (user_id, id);
  end if;

  -- deferrable: one sync push can carry a micro-step before its parent
  if not exists (select 1 from pg_constraint where conname = 'task_parent_fk') then
    alter table public.task add constraint task_parent_fk
      foreign key (user_id, parent_id) references public.task (user_id, id)
      on delete cascade deferrable initially deferred not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'habit_log_habit_fk') then
    alter table public.habit_log add constraint habit_log_habit_fk
      foreign key (user_id, habit_id) references public.habit (user_id, id)
      on delete cascade not valid;
  end if;
end $$;

/* ---------------- checking the rows already there ---------------- */

-- A constraint that old rows break stays "not valid": still checked on every
-- new write, and named in the result at the end.
do $$
declare c record;
begin
  for c in select conrelid::regclass as tbl, conname from pg_constraint
           where conrelid in ('public.task'::regclass, 'public.habit'::regclass, 'public.habit_log'::regclass)
             and not convalidated loop
    begin
      execute format('alter table %s validate constraint %I', c.tbl, c.conname);
    exception when check_violation or foreign_key_violation then
      raise warning '% on % does not hold for some existing rows: %', c.conname, c.tbl, sqlerrm;
    end;
  end loop;
end $$;

/* ---------------- 4. policies ---------------- */

drop policy if exists "task owner select" on public.task;
drop policy if exists "task owner insert" on public.task;
drop policy if exists "task owner update" on public.task;
drop policy if exists "task owner delete" on public.task;
create policy "task owner select" on public.task for select to authenticated using ((select auth.uid()) = user_id);
create policy "task owner insert" on public.task for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "task owner update" on public.task for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "task owner delete" on public.task for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "habit owner select" on public.habit;
drop policy if exists "habit owner insert" on public.habit;
drop policy if exists "habit owner update" on public.habit;
drop policy if exists "habit owner delete" on public.habit;
create policy "habit owner select" on public.habit for select to authenticated using ((select auth.uid()) = user_id);
create policy "habit owner insert" on public.habit for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habit owner update" on public.habit for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit owner delete" on public.habit for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "habit_log owner select" on public.habit_log;
drop policy if exists "habit_log owner insert" on public.habit_log;
drop policy if exists "habit_log owner update" on public.habit_log;
drop policy if exists "habit_log owner delete" on public.habit_log;
create policy "habit_log owner select" on public.habit_log for select to authenticated using ((select auth.uid()) = user_id);
create policy "habit_log owner insert" on public.habit_log for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habit_log owner update" on public.habit_log for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit_log owner delete" on public.habit_log for delete to authenticated using ((select auth.uid()) = user_id);

/* ---------------- 5. privileges ---------------- */

revoke all on public.task, public.habit, public.habit_log, public.ai_usage from anon;
revoke all on public.ai_usage from authenticated;
revoke truncate, references, trigger on public.task, public.habit, public.habit_log from authenticated;

/* ---------------- 6. the AI counter ---------------- */

create or replace function public.nura_ai_hit(k text) returns integer
language sql security definer set search_path = '' as $$
  insert into public.ai_usage as u (key, day, n) values (k, current_date, 1)
  on conflict (key, day) do update set n = u.n + 1
  returning n;
$$;
revoke execute on function public.nura_ai_hit(text) from public, anon, authenticated;

-- the API picks up the new primary keys now, not on its next reload
notify pgrst, 'reload schema';

commit;

select conrelid::regclass as "table", conname as "constraint", convalidated
from pg_constraint
where conrelid in ('public.task'::regclass, 'public.habit'::regclass, 'public.habit_log'::regclass)
  and contype in ('c', 'f', 'p') and conname not like '%user_id_fkey'
order by convalidated, 1, 2;

-- If a row above says false, this finds the rows that break it (change the
-- table and the check to the one named):
--   select user_id, id, char_length(title) from public.task where char_length(title) > 500;
-- and for task_parent_fk (a micro-step whose parent is in another account, or gone):
--   select c.user_id, c.id, c.parent_id from public.task c
--   where c.parent_id is not null
--     and not exists (select 1 from public.task p where p.user_id = c.user_id and p.id = c.parent_id);
-- and for habit_log_habit_fk (a log whose habit is in another account):
--   select l.user_id, l.id, l.habit_id from public.habit_log l
--   where not exists (select 1 from public.habit h where h.user_id = l.user_id and h.id = l.habit_id);
