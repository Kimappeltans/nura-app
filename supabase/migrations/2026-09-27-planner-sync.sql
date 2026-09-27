-- Nura: the adaptive planner's data follows the account (target architecture,
-- "Where things live"). Projects, their steps, what Nura learned about how you
-- work (behavior_pattern), what you did with its decisions (decision_feedback)
-- and the day plan sync; the raw event log stays on the device.
--
-- Paste into the Supabase SQL Editor and run it once (running it again is
-- harmless). Until it has run, the app syncs tasks and habits as before and
-- quietly skips these tables (src/sync.ts).

create table if not exists public.project (
  id           text not null constraint project_id_len check (char_length(id) <= 100),
  user_id      uuid not null references auth.users(id) on delete cascade,
  goal         text not null constraint project_goal_len check (char_length(goal) <= 2000),
  title        text not null constraint project_title_len check (char_length(title) <= 500),
  done_means   text constraint project_done_means_len check (char_length(done_means) <= 2000),
  assumptions  text constraint project_assumptions_len check (char_length(assumptions) <= 20000),
  notes        text constraint project_notes_len check (char_length(notes) <= 20000),
  state        text not null default 'active' constraint project_state_len check (char_length(state) <= 100),
  created_at   bigint not null,
  updated_at   bigint not null,
  completed_at bigint,
  constraint project_pkey primary key (user_id, id)
);
create index if not exists project_user_updated_idx on public.project(user_id, updated_at);

create table if not exists public.project_step (
  id             text not null constraint project_step_id_len check (char_length(id) <= 100),
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     text not null constraint project_step_project_id_len check (char_length(project_id) <= 100),
  position       integer not null,
  title          text not null constraint project_step_title_len check (char_length(title) <= 500),
  first_action   text constraint project_step_first_action_len check (char_length(first_action) <= 1000),
  why            text constraint project_step_why_len check (char_length(why) <= 1000),
  est_minutes    integer,
  state          text not null default 'todo' constraint project_step_state_len check (char_length(state) <= 100),
  edited         integer not null default 0,
  task_id        text constraint project_step_task_id_len check (char_length(task_id) <= 100),
  created_at     bigint not null,
  updated_at     bigint not null,
  completed_at   bigint,
  depends_on     text constraint project_step_depends_on_len check (char_length(depends_on) <= 5000),
  optional       integer default 0,
  blocked_reason text constraint project_step_blocked_reason_len check (char_length(blocked_reason) <= 1000),
  actual_minutes integer,
  confidence     real,
  origin         text constraint project_step_origin_len check (char_length(origin) <= 100),
  change_reason  text constraint project_step_change_reason_len check (char_length(change_reason) <= 100),
  constraint project_step_pkey primary key (user_id, id)
);
create index if not exists project_step_user_updated_idx on public.project_step(user_id, updated_at);

create table if not exists public.behavior_pattern (
  id           text not null constraint behavior_pattern_id_len check (char_length(id) <= 300),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null constraint behavior_pattern_kind_len check (char_length(kind) <= 100),
  scope        text not null constraint behavior_pattern_scope_len check (char_length(scope) <= 200),
  value        double precision not null,
  confidence   double precision not null,
  sample_count integer not null,
  updated_at   bigint not null,
  constraint behavior_pattern_pkey primary key (user_id, id)
);
create index if not exists behavior_pattern_user_updated_idx on public.behavior_pattern(user_id, updated_at);

create table if not exists public.decision_feedback (
  decision_id   text not null constraint decision_feedback_id_len check (char_length(decision_id) <= 100),
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_id       text constraint decision_feedback_task_id_len check (char_length(task_id) <= 100),
  decision_type text not null constraint decision_feedback_type_len check (char_length(decision_type) <= 100),
  reason        text constraint decision_feedback_reason_len check (char_length(reason) <= 1000),
  score         double precision,
  shown_at      bigint not null,
  response      text constraint decision_feedback_response_len check (char_length(response) <= 100),
  acted_at      bigint,
  updated_at    bigint not null,
  constraint decision_feedback_pkey primary key (user_id, decision_id)
);
create index if not exists decision_feedback_user_updated_idx on public.decision_feedback(user_id, updated_at);

create table if not exists public.daily_plan (
  day              text not null constraint daily_plan_day_len check (char_length(day) <= 20),
  user_id          uuid not null references auth.users(id) on delete cascade,
  committed_ids    text constraint daily_plan_committed_len check (char_length(committed_ids) <= 20000),
  flexible_ids     text constraint daily_plan_flexible_len check (char_length(flexible_ids) <= 20000),
  deferred_ids     text constraint daily_plan_deferred_len check (char_length(deferred_ids) <= 20000),
  planned_minutes  integer,
  capacity_minutes integer,
  actual_minutes   integer,
  reason           text constraint daily_plan_reason_len check (char_length(reason) <= 1000),
  state            text not null default 'open' constraint daily_plan_state_len check (char_length(state) <= 100),
  recalculated_at  bigint not null,
  updated_at       bigint not null,
  constraint daily_plan_pkey primary key (user_id, day)
);
create index if not exists daily_plan_user_updated_idx on public.daily_plan(user_id, updated_at);

-- Row caps per account, the same way as tasks (schema.sql → nura_row_cap):
-- after each insert statement, count the rows of every account it added to.
create or replace function public.nura_plan_row_cap() returns trigger
language plpgsql set search_path = '' as $$
declare
  cap integer;
  over uuid;
begin
  cap := tg_argv[0]::integer;
  if tg_table_name = 'project' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.project x where x.user_id = n.user_id) > cap limit 1;
  elsif tg_table_name = 'project_step' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.project_step x where x.user_id = n.user_id) > cap limit 1;
  elsif tg_table_name = 'behavior_pattern' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.behavior_pattern x where x.user_id = n.user_id) > cap limit 1;
  elsif tg_table_name = 'decision_feedback' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.decision_feedback x where x.user_id = n.user_id) > cap limit 1;
  elsif tg_table_name = 'daily_plan' then
    select n.user_id into over from (select distinct user_id from new_rows) n
    where (select count(*) from public.daily_plan x where x.user_id = n.user_id) > cap limit 1;
  end if;
  if over is not null then
    raise exception 'too many % rows for one account (at most %)', tg_table_name, cap
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists nura_row_cap on public.project;
create trigger nura_row_cap after insert on public.project
  referencing new table as new_rows for each statement execute function public.nura_plan_row_cap('2000');
drop trigger if exists nura_row_cap on public.project_step;
create trigger nura_row_cap after insert on public.project_step
  referencing new table as new_rows for each statement execute function public.nura_plan_row_cap('30000');
drop trigger if exists nura_row_cap on public.behavior_pattern;
create trigger nura_row_cap after insert on public.behavior_pattern
  referencing new table as new_rows for each statement execute function public.nura_plan_row_cap('1000');
drop trigger if exists nura_row_cap on public.decision_feedback;
create trigger nura_row_cap after insert on public.decision_feedback
  referencing new table as new_rows for each statement execute function public.nura_plan_row_cap('100000');
drop trigger if exists nura_row_cap on public.daily_plan;
create trigger nura_row_cap after insert on public.daily_plan
  referencing new table as new_rows for each statement execute function public.nura_plan_row_cap('5000');

alter table public.project           enable row level security;
alter table public.project_step      enable row level security;
alter table public.behavior_pattern  enable row level security;
alter table public.decision_feedback enable row level security;
alter table public.daily_plan        enable row level security;

-- your own rows only, like tasks
do $$
declare t text;
begin
  foreach t in array array['project', 'project_step', 'behavior_pattern', 'decision_feedback', 'daily_plan'] loop
    execute format('drop policy if exists "%1$s owner select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner delete" on public.%1$I', t);
    execute format('create policy "%1$s owner select" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s owner insert" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s owner update" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s owner delete" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

revoke all on public.project, public.project_step, public.behavior_pattern, public.decision_feedback, public.daily_plan from anon;
revoke truncate, references, trigger on public.project, public.project_step, public.behavior_pattern, public.decision_feedback, public.daily_plan from authenticated;
