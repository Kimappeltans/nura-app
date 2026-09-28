import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { award as rollAward, type RewardReason, type Award } from './reward';
import { guessLabel, type LabelId } from './labels';
import { guessActivity, activityById, type ActivityId } from './activities';
import { habitViews, todayToggle, HABIT_ON, HABIT_PAUSED, HABIT_LET_GO, LOG_TAKEN_BACK, type HabitView } from './habits';

/**
 * Local-first. Nothing leaves the device.
 *
 * Deliberate constraints from the spec:
 *  - `parent_id` is capped at ONE level of micro-steps. Unlimited nesting is how
 *    a task app becomes a second job.
 *  - There is NO overdue column and no overdue state. Not rendering one is
 *    different from being unable to represent one; this is the latter.
 *  - Nothing in here can decrease. Light accumulates, wins accumulate, and the
 *    only thing that ever goes down is how long a task has been waiting.
 */

export type TaskState = 'inbox' | 'today' | 'doing' | 'done' | 'dropped';

export interface Task {
  id: string;
  title: string;
  first_action: string | null;
  est_minutes: number | null;
  due_at: number | null;
  state: TaskState;
  parent_id: string | null;
  created_at: number;
  completed_at: number | null;
  energy: 'low' | 'med' | 'high' | null;
  freq_target: number | null;
  freq_period: 'week' | 'month' | null;
  /** set by "not now" — the task steps out of the running until this passes */
  snoozed_until: number | null;
  /** 'daily' | 'weekdays' | 'weekly' | 'monthly' — null for a one-off */
  repeat_rule: RepeatRule | null;
  /** one of the eight fixed labels, or null */
  label: LabelId | null;
  /** 1 when due_at carries a meaningful time of day, 0 when it's a date only */
  has_time: number | null;
  /** 0 none · 1 low · 2 medium · 3 high */
  priority: number | null;
  /** a catalogue activity, or `custom:<name>` — gives the task a scene and a label */
  activity: ActivityId | null;
  /** for weekly repeats: which days, as "1,3,5" with 1 = Monday */
  repeat_days: string | null;
  /** how many times "not now" has been pressed. Internal only — see addColumns(). */
  snooze_count: number | null;
  /** sync's watermark — see src/sync.ts. Stamped by every mutator below. */
  updated_at: number | null;
}

export type EventKind =
  | 'captured' | 'started' | 'paused' | 'completed'
  | 'skipped' | 'snoozed' | 'nudge_sent' | 'nudge_acted'
  | 'reward'
  // the measure events (SCOPE.md) — what the 14-day review reads
  | 'shown' | 'swapped' | 'session_start' | 'session_end' | 'resumed' | 'acted'
  | 'onboarding';

// Memoize the in-flight *promise*, not just the resolved db — refresh() fans
// out ~9 concurrent calls that each call getDb(), and on web (OPFS access
// handles are exclusive-lock) a second open before the first resolves throws
// NoModificationAllowedError. Caching the promise makes every caller await
// the same single open instead of racing to start their own.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_dbPromise) return _dbPromise;
  const opening = openDb();
  _dbPromise = opening;
  // a failed open is not kept: the next call (Try again, app/_layout.tsx) opens afresh
  opening.catch(() => { if (_dbPromise === opening) _dbPromise = null; });
  return opening;
}

// Web only. The browser keeps nura.db in one OPFS file that only one tab can
// hold open, so a second tab's open threw NoModificationAllowedError and the
// app died on the error overlay. Each tab now holds a lock for its whole life;
// a second tab waits on it, says Nura is open elsewhere, and carries on the
// moment the first tab closes. Native has one app instance, so it skips this.
let _elsewhere = false;
const _elsewhereListeners = new Set<(elsewhere: boolean) => void>();

export function onOpenElsewhere(fn: (elsewhere: boolean) => void) {
  _elsewhereListeners.add(fn);
  fn(_elsewhere);
  return () => { _elsewhereListeners.delete(fn); };
}

function setElsewhere(v: boolean) {
  _elsewhere = v;
  _elsewhereListeners.forEach(fn => fn(v));
}

// "Use it here": the waiting tab asks the one holding the database to step
// aside. That tab reloads, which lets go of the lock (and the file), so the
// asker, first in the queue, takes it; the reloaded tab then waits in turn,
// with its own Use it here.
const tabs = Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nura.tabs') : null;
let holding = false;
tabs?.addEventListener('message', e => {
  if ((e as MessageEvent).data === 'take-over' && holding) window.location.reload();
});

/** Web: take Nura over from the other tab that has it open. */
export function takeOverTab() {
  tabs?.postMessage('take-over');
}

function claimTab(): Promise<void> {
  const locks = Platform.OS === 'web' ? (globalThis.navigator as any)?.locks : undefined;
  if (!locks) return Promise.resolve();
  const hold = () => new Promise<void>(() => {}); // released only when the tab goes
  return new Promise(resolve => {
    locks.request('nura.db', { ifAvailable: true }, (lock: unknown) => {
      if (lock) { holding = true; resolve(); return hold(); }
      setElsewhere(true);
      locks.request('nura.db', () => { holding = true; setElsewhere(false); resolve(); return hold(); });
      return undefined;
    });
  });
}

async function openDb() {
  await claimTab();
  const db = await SQLite.openDatabaseAsync('nura.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS breadcrumb (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      note    TEXT,
      context TEXT,
      at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crumb_task ON breadcrumb(task_id);

    CREATE TABLE IF NOT EXISTS task (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      first_action  TEXT,
      est_minutes   INTEGER,
      due_at        INTEGER,
      state         TEXT NOT NULL DEFAULT 'inbox',
      parent_id     TEXT REFERENCES task(id),
      created_at    INTEGER NOT NULL,
      completed_at  INTEGER,
      energy        TEXT,
      freq_target   INTEGER,
      freq_period   TEXT
    );

    -- append-only. every stat derives from here, which also means you can answer
    -- "is this app actually working?" with real data after a month.
    CREATE TABLE IF NOT EXISTS event (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      kind    TEXT NOT NULL,
      at      INTEGER NOT NULL,
      meta    TEXT
    );

    -- nudge was never read or written: reminders are scheduled with the OS and
    -- tracked in app_state (nudge.*) and the event log (nudge_sent,
    -- nudge_acted). Cut in SCOPE.md, and dropped here rather than left behind
    -- on devices that already created it.
    DROP TABLE IF EXISTS nudge;

    CREATE TABLE IF NOT EXISTS app_state (k TEXT PRIMARY KEY, v TEXT);

    -- Cue-based habits — deliberately NOT the task table. A task is a
    -- one-off with a deadline; a habit is a cue ("after coffee") plus a
    -- tiny action, repeated indefinitely, with no due date and no streak
    -- to break. See src/habits.ts.
    CREATE TABLE IF NOT EXISTS habit (
      id         TEXT PRIMARY KEY,
      cue        TEXT NOT NULL,
      action     TEXT NOT NULL,
      minimum    TEXT,
      created_at INTEGER NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1
    );
    -- one row per day the habit happened. Never deleted: a tick taken back
    -- the same day is marked did_minimum = -1, so the undo syncs too.
    CREATE TABLE IF NOT EXISTS habit_log (
      id          TEXT PRIMARY KEY,
      habit_id    TEXT NOT NULL REFERENCES habit(id),
      at          INTEGER NOT NULL,
      did_minimum INTEGER NOT NULL DEFAULT 0
    );

    -- Projects — a goal too big to be one task, and the path Nu keeps for it
    -- (src/projects.ts). Deliberately NOT micro-steps under parent_id: that
    -- stays one level deep. A project's steps live here; only the CURRENT
    -- move is ever a task, linked by project_step.task_id, so Nu, Ra and the
    -- timer treat it like any other task. Local only for now — not synced.
    CREATE TABLE IF NOT EXISTS project (
      id           TEXT PRIMARY KEY,
      goal         TEXT NOT NULL,
      title        TEXT NOT NULL,
      done_means   TEXT,
      assumptions  TEXT,
      notes        TEXT,
      state        TEXT NOT NULL DEFAULT 'active',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS project_step (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL REFERENCES project(id),
      position     INTEGER NOT NULL,
      title        TEXT NOT NULL,
      first_action TEXT,
      why          TEXT,
      est_minutes  INTEGER,
      state        TEXT NOT NULL DEFAULT 'todo',
      edited       INTEGER NOT NULL DEFAULT 0,
      task_id      TEXT REFERENCES task(id),
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      completed_at INTEGER
    );
    -- what happened to a project, append-only: the replanner reads the last
    -- few of these instead of the whole conversation
    CREATE TABLE IF NOT EXISTS project_event (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      step_id    TEXT,
      kind       TEXT NOT NULL,
      note       TEXT,
      at         INTEGER NOT NULL
    );
    -- THE ADAPTIVE PLANNER (src/next.ts). What Nura learned about how you
    -- work, one row per pattern ("estimate_ratio" for "writing" is 1.55,
    -- from 14 tasks): derived from the event log, which stays on the device;
    -- the patterns themselves sync, so the learning follows the account.
    CREATE TABLE IF NOT EXISTS behavior_pattern (
      id           TEXT PRIMARY KEY,
      kind         TEXT NOT NULL,
      scope        TEXT NOT NULL,
      value        REAL NOT NULL,
      confidence   REAL NOT NULL,
      sample_count INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    -- each decision the planner put in front of you, and what you did with
    -- it: accepted, not_now, something_else, edited (ignored is read off an
    -- old row with no response)
    CREATE TABLE IF NOT EXISTS decision_feedback (
      decision_id   TEXT PRIMARY KEY,
      task_id       TEXT,
      decision_type TEXT NOT NULL,
      reason        TEXT,
      score         REAL,
      shown_at      INTEGER NOT NULL,
      response      TEXT,
      acted_at      INTEGER,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_decision_task ON decision_feedback(task_id);
    -- the day, as the planner sees it: what you kept, what's flexible, what
    -- you agreed to leave for later, against what you really finish
    CREATE TABLE IF NOT EXISTS daily_plan (
      day               TEXT PRIMARY KEY,
      committed_ids     TEXT,
      flexible_ids      TEXT,
      deferred_ids      TEXT,
      planned_minutes   INTEGER,
      capacity_minutes  INTEGER,
      actual_minutes    INTEGER,
      reason            TEXT,
      state             TEXT NOT NULL DEFAULT 'open',
      recalculated_at   INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_step_project ON project_step(project_id);
    CREATE INDEX IF NOT EXISTS idx_step_task    ON project_step(task_id);
    CREATE INDEX IF NOT EXISTS idx_pevent_proj  ON project_event(project_id);

    CREATE INDEX IF NOT EXISTS idx_task_state   ON task(state);
    CREATE INDEX IF NOT EXISTS idx_task_due     ON task(due_at);
    CREATE INDEX IF NOT EXISTS idx_event_at     ON event(at);
    CREATE INDEX IF NOT EXISTS idx_event_kind   ON event(kind);
    CREATE INDEX IF NOT EXISTS idx_habit_log_habit ON habit_log(habit_id);
  `);
  await addColumns(db);
  return db;
}

/** ALTER TABLE isn't naturally idempotent like CREATE TABLE IF NOT EXISTS, so
 *  this checks first — but still runs inside openDb()'s single atomic promise:
 *  nothing gets a `db` handle before the schema is fully in place. */
async function addColumns(db: SQLite.SQLiteDatabase) {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(task)`);
  const have = new Set(cols.map(c => c.name));
  if (!have.has('retro'))         await db.execAsync(`ALTER TABLE task ADD COLUMN retro INTEGER DEFAULT 0`);
  if (!have.has('snoozed_until')) await db.execAsync(`ALTER TABLE task ADD COLUMN snoozed_until INTEGER`);
  if (!have.has('repeat_rule'))   await db.execAsync(`ALTER TABLE task ADD COLUMN repeat_rule TEXT`);
  if (!have.has('label'))         await db.execAsync(`ALTER TABLE task ADD COLUMN label TEXT`);
  if (!have.has('has_time'))      await db.execAsync(`ALTER TABLE task ADD COLUMN has_time INTEGER DEFAULT 0`);
  if (!have.has('priority'))      await db.execAsync(`ALTER TABLE task ADD COLUMN priority INTEGER DEFAULT 0`);
  if (!have.has('activity'))      await db.execAsync(`ALTER TABLE task ADD COLUMN activity TEXT`);
  if (!have.has('repeat_days'))   await db.execAsync(`ALTER TABLE task ADD COLUMN repeat_days TEXT`);
  // Counts "not now"s on a task — never shown as a number anywhere, never a
  // reason a task looks different in a list. The planner (src/next.ts) lets
  // it lower a task a little and offers to make it smaller; the slipping
  // check-in reads it too. See notNow() below.
  if (!have.has('snooze_count'))  await db.execAsync(`ALTER TABLE task ADD COLUMN snooze_count INTEGER DEFAULT 0`);
  // Sync's watermark column (see src/sync.ts) — every mutator that writes to
  // task/habit/habit_log stamps this. Backfilled rather than left NULL:
  // SQLite's `NULL > x` is never true, so an un-backfilled row would be
  // silently invisible to every `WHERE updated_at > ?` sync query forever.
  if (!have.has('updated_at')) {
    await db.execAsync(`ALTER TABLE task ADD COLUMN updated_at INTEGER`);
    await db.execAsync(`UPDATE task SET updated_at = COALESCE(completed_at, created_at) WHERE updated_at IS NULL`);
  }

  const habitCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(habit)`);
  const haveHabit = new Set(habitCols.map(c => c.name));
  if (!haveHabit.has('updated_at')) {
    await db.execAsync(`ALTER TABLE habit ADD COLUMN updated_at INTEGER`);
    await db.execAsync(`UPDATE habit SET updated_at = created_at WHERE updated_at IS NULL`);
  }

  // a project's path as a living plan (target architecture): what a step
  // waits on, whether it's optional, why it's blocked, how long it really
  // took, how sure Nu is of it, who made it, and why it last changed
  const stepCols = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(project_step)`)).map(c => c.name));
  if (!stepCols.has('depends_on'))     await db.execAsync(`ALTER TABLE project_step ADD COLUMN depends_on TEXT`);
  if (!stepCols.has('optional'))       await db.execAsync(`ALTER TABLE project_step ADD COLUMN optional INTEGER DEFAULT 0`);
  if (!stepCols.has('blocked_reason')) await db.execAsync(`ALTER TABLE project_step ADD COLUMN blocked_reason TEXT`);
  if (!stepCols.has('actual_minutes')) await db.execAsync(`ALTER TABLE project_step ADD COLUMN actual_minutes INTEGER`);
  if (!stepCols.has('confidence'))     await db.execAsync(`ALTER TABLE project_step ADD COLUMN confidence REAL`);
  if (!stepCols.has('origin'))         await db.execAsync(`ALTER TABLE project_step ADD COLUMN origin TEXT`);
  if (!stepCols.has('change_reason'))  await db.execAsync(`ALTER TABLE project_step ADD COLUMN change_reason TEXT`);

  const logCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(habit_log)`);
  const haveLog = new Set(logCols.map(c => c.name));
  if (!haveLog.has('updated_at')) {
    await db.execAsync(`ALTER TABLE habit_log ADD COLUMN updated_at INTEGER`);
    await db.execAsync(`UPDATE habit_log SET updated_at = at WHERE updated_at IS NULL`);
  }
}

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export async function logEvent(kind: EventKind, taskId?: string, meta?: unknown) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO event (task_id, kind, at, meta) VALUES (?, ?, ?, ?)',
    taskId ?? null, kind, Date.now(), meta ? JSON.stringify(meta) : null,
  );
  // what you did with a decision the planner showed you: the same events,
  // so no screen has to remember to report back
  if (!taskId) return;
  const m = meta as { dropped?: boolean } | undefined;
  const response: DecisionResponse | null =
    kind === 'session_start' || kind === 'completed' ? 'accepted'
    : kind === 'skipped' && !m?.dropped ? 'not_now'
    : kind === 'swapped' ? 'something_else'
    : null;
  if (response) await respondToDecision(taskId, response).catch(() => {});
}

/* ---------------- the planner's memory (src/next.ts) ---------------- */

export interface PatternRow {
  id: string;
  kind: string;
  scope: string;
  value: number;
  confidence: number;
  sample_count: number;
  updated_at: number;
}

export async function getPatterns(): Promise<PatternRow[]> {
  const db = await getDb();
  return db.getAllAsync<PatternRow>('SELECT * FROM behavior_pattern');
}

/** What the profile says now, one row per pattern; unchanged rows keep their stamp (so sync skips them). */
export async function savePatterns(rows: Omit<PatternRow, 'id' | 'updated_at'>[], now = Date.now()) {
  const db = await getDb();
  const have = new Map((await getPatterns()).map(r => [r.id, r]));
  for (const r of rows) {
    const id = `${r.kind}:${r.scope}`;
    const old = have.get(id);
    if (old && old.value === r.value && old.confidence === r.confidence && old.sample_count === r.sample_count) continue;
    await db.runAsync(
      `INSERT INTO behavior_pattern (id, kind, scope, value, confidence, sample_count, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET value = excluded.value, confidence = excluded.confidence,
         sample_count = excluded.sample_count, updated_at = excluded.updated_at`,
      id, r.kind, r.scope, r.value, r.confidence, r.sample_count, now);
  }
}

export type DecisionType = 'next_action' | 'option' | 'intervention';
export type DecisionResponse = 'accepted' | 'ignored' | 'not_now' | 'something_else' | 'edited';

/** A decision put in front of you. Once per task, type and day: seeing the same card again isn't news. */
export async function recordDecision(d: { taskId: string; type: DecisionType; reason: string | null; score: number }, now = Date.now()) {
  const db = await getDb();
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const seen = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM decision_feedback WHERE task_id = ? AND decision_type = ? AND shown_at >= ? AND response IS NULL',
    d.taskId, d.type, day.getTime());
  if (seen?.n) return;
  await db.runAsync(
    `INSERT INTO decision_feedback (decision_id, task_id, decision_type, reason, score, shown_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    uid(), d.taskId, d.type, d.reason, d.score, now, now);
}

/** What you did with the last open decision about a task (of one type, when given), within a day of it being shown. */
export async function respondToDecision(taskId: string, response: DecisionResponse, now = Date.now(), type?: DecisionType) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ decision_id: string }>(
    `SELECT decision_id FROM decision_feedback WHERE task_id = ? AND response IS NULL AND shown_at >= ?
       ${type ? 'AND decision_type = ?' : ''}
     ORDER BY shown_at DESC LIMIT 1`, ...(type ? [taskId, now - 86_400_000, type] : [taskId, now - 86_400_000]));
  if (!row) return;
  await db.runAsync('UPDATE decision_feedback SET response = ?, acted_at = ?, updated_at = ? WHERE decision_id = ?',
    response, now, now, row.decision_id);
}

export interface DayPlanRow {
  day: string;
  committed_ids: string | null;
  flexible_ids: string | null;
  deferred_ids: string | null;
  planned_minutes: number | null;
  capacity_minutes: number | null;
  actual_minutes: number | null;
  reason: string | null;
  /** open: nothing asked · proposed · accepted · declined · undone */
  state: 'open' | 'proposed' | 'accepted' | 'declined' | 'undone';
  recalculated_at: number;
  updated_at: number;
}

/** A calendar day as the day plan keys it: 2026-09-27, local. */
export const planDay = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA');

export async function getDayPlan(day = planDay()): Promise<DayPlanRow | null> {
  const db = await getDb();
  return db.getFirstAsync<DayPlanRow>('SELECT * FROM daily_plan WHERE day = ?', day);
}

export async function saveDayPlan(row: Omit<DayPlanRow, 'updated_at'>, now = Date.now()) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO daily_plan (day, committed_ids, flexible_ids, deferred_ids, planned_minutes, capacity_minutes, actual_minutes, reason, state, recalculated_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET committed_ids = excluded.committed_ids, flexible_ids = excluded.flexible_ids,
       deferred_ids = excluded.deferred_ids, planned_minutes = excluded.planned_minutes, capacity_minutes = excluded.capacity_minutes,
       actual_minutes = excluded.actual_minutes, reason = excluded.reason, state = excluded.state,
       recalculated_at = excluded.recalculated_at, updated_at = excluded.updated_at`,
    row.day, row.committed_ids, row.flexible_ids, row.deferred_ids, row.planned_minutes, row.capacity_minutes,
    row.actual_minutes, row.reason, row.state, row.recalculated_at, now);
}

/** Minutes really done today: the timer's, plus 15 for each thing ticked off without it. */
export async function minutesDoneToday(now = Date.now()): Promise<number> {
  const db = await getDb();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const timed = await db.getFirstAsync<{ m: number | null }>(
    `SELECT SUM(CAST(json_extract(meta, '$.minutes') AS INTEGER)) AS m FROM event WHERE kind = 'session_end' AND at >= ?`, start.getTime());
  const loose = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM event e WHERE e.kind = 'completed' AND e.at >= ?
       AND NOT EXISTS (SELECT 1 FROM event s WHERE s.kind = 'session_end' AND s.task_id = e.task_id AND s.at >= ?)`,
    start.getTime(), start.getTime());
  return (timed?.m ?? 0) + (loose?.n ?? 0) * 15;
}

/** How often each task was put off when the planner offered it, since a time. */
export async function putOffsSince(since: number): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ task_id: string; n: number }>(
    `SELECT task_id, COUNT(*) AS n FROM decision_feedback
      WHERE response IN ('not_now','something_else') AND decision_type IN ('next_action','option')
        AND shown_at >= ? AND task_id IS NOT NULL GROUP BY task_id`, since);
  return new Map(rows.map(r => [r.task_id, r.n]));
}

/* ================================================================== *
 *  Light — the reward ledger. Append-only, so the total is a SUM and
 *  is structurally incapable of going down.
 * ================================================================== */

/**
 * Roll an award and write it. Returns the award so the UI can celebrate with
 * the exact number it just banked — the reward has to be *shown*, immediately,
 * or it isn't reinforcement, it's bookkeeping.
 */
export async function grantLight(reason: RewardReason, taskId?: string): Promise<Award> {
  const a = rollAward(reason);
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO event (task_id, kind, at, meta) VALUES (?, ?, ?, ?)',
    taskId ?? null, 'reward', Date.now(),
    JSON.stringify({ n: a.total, base: a.base, bonus: a.bonus.n, reason }),
  );
  return a;
}

/** Monotonic, for all time. */
export async function totalLight(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number | null }>(
    `SELECT SUM(json_extract(meta,'$.n')) AS n FROM event WHERE kind = 'reward'`);
  return r?.n ?? 0;
}

/** Today's, for the sun. A new day starts at zero — which is a sunrise, not a
 *  reset, because nothing was taken away to get there. */
export async function todayLight(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number | null }>(
    `SELECT SUM(json_extract(meta,'$.n')) AS n FROM event
      WHERE kind = 'reward'
        AND date(at/1000,'unixepoch','localtime') = date('now','localtime')`);
  return r?.n ?? 0;
}

/** Capture is the cheapest possible write: a title and nothing else. */
export interface CaptureOpts {
  label?: LabelId | null;
  est_minutes?: number | null;
  due_at?: number | null;
  has_time?: boolean;
  repeat_rule?: RepeatRule | null;
  priority?: number | null;
  activity?: ActivityId | null;
  repeat_days?: string | null;
}

/**
 * Capture. Everything past the title is optional and always has been — a title
 * alone is still one field and one return key, which is the floor this app
 * cannot raise. The composer simply makes the other fields VISIBLE at the
 * moment you have the context to fill them, instead of hiding them behind a
 * second trip into a detail sheet you'll never take.
 */
export async function capture(title: string, opts: CaptureOpts = {}) {
  const db = await getDb();
  const id = uid();
  // guesses, never decisions — both show as chips you can change in one tap
  const activity = opts.activity !== undefined ? opts.activity : guessActivity(title);
  const act = activityById(activity);
  // the activity's own label wins over the keyword guess — see compose.tsx
  const label = opts.label !== undefined ? opts.label : (act?.label ?? guessLabel(title));
  // NO invented duration. How long a thing takes is a fact about you, not
  // about the activity, and a wrong estimate silently changes what the energy
  // filter hands you.
  const minutes = opts.est_minutes ?? null;
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO task (id, title, state, created_at, label, est_minutes, due_at, has_time, repeat_rule, priority, activity, repeat_days, updated_at)
     VALUES (?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, title.trim(), now, label,
    minutes, opts.due_at ?? null, opts.has_time ? 1 : 0,
    opts.repeat_rule ?? null, opts.priority ?? 0, activity, opts.repeat_days ?? null, now,
  );
  await logEvent('captured', id);
  await markActed('capture');
  await grantLight('capture', id);
  return id;
}

/* ------------------------------------------------------------------ *
 *  Repeats.
 *
 *  A completed recurring task is never "un-completed" and re-dated — that
 *  would erase the fact that you did it. Instead the finished row stays done
 *  forever (so wins, light and the six-month grid all stay truthful) and a
 *  FRESH row is inserted for the next occurrence. History is append-only here
 *  exactly as it is in the event log.
 * ------------------------------------------------------------------ */

export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly';

export const REPEAT_LABEL: Record<RepeatRule, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Every week',
  monthly: 'Every month',
};

/** "1,3,5" with 1 = Monday … 7 = Sunday. */
export function parseDays(csv?: string | null): number[] {
  return (csv ?? '').split(',').map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 7);
}
/** JS getDay() is Sun=0; the app speaks Mon=1..Sun=7. */
const isoDay = (d: Date) => (d.getDay() + 6) % 7 + 1;

/**
 * The next time this rule fires strictly after `from`, keeping time-of-day.
 * A weekly rule with specific days walks forward to the next chosen weekday —
 * "every Tuesday and Thursday" has to mean Tuesday and Thursday, not "seven
 * days after whenever I last got round to it".
 */
export function nextOccurrence(rule: RepeatRule, from: number, days?: string | null): number {
  const d = new Date(from);
  const chosen = parseDays(days);
  switch (rule) {
    case 'daily':
      d.setDate(d.getDate() + 1); break;
    case 'weekdays':
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      break;
    case 'weekly':
      if (chosen.length) {
        for (let i = 1; i <= 14; i++) {
          d.setDate(d.getDate() + 1);
          if (chosen.includes(isoDay(d))) break;
        }
      } else {
        d.setDate(d.getDate() + 7);
      }
      break;
    case 'monthly': {
      // clamp: the 31st of a 30-day month lands on the 30th, not the 1st
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      break;
    }
  }
  return d.getTime();
}

/**
 * Insert the next instance of a recurring task. Anchors off the original due
 * date when there is one, so a weekly task stays on its weekday even if you
 * finish it three days late — anchoring off "now" is how recurring tasks
 * silently drift across the week in most apps.
 */
async function spawnNext(t: Task) {
  if (!t.repeat_rule || t.parent_id) return;
  const db = await getDb();
  const anchor = t.due_at ?? Date.now();
  let next = nextOccurrence(t.repeat_rule, anchor, t.repeat_days);
  // if it was finished very late, roll forward to the first future occurrence
  let guard = 0;
  while (next < Date.now() && guard++ < 400) next = nextOccurrence(t.repeat_rule, next, t.repeat_days);
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO task (id, title, first_action, est_minutes, due_at, state, created_at, repeat_rule, label, has_time, priority, activity, repeat_days, updated_at)
     VALUES (?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid(), t.title, t.first_action, t.est_minutes, next, now,
    t.repeat_rule, t.label, t.has_time, t.priority, t.activity, t.repeat_days, now);
}

// `reason` lets a caller override what the completion pays out as — used by
// completeStep() below, so finishing a 5-minute micro-step banks the smaller
// 'step' reward ("Chipped.") instead of silently defaulting to the full
// task-completion reward it was getting before.
//
// Finishing only counts once. A double tap on Done, a tick from a list while
// the timer's Done lands, a notification action: the second call finds the
// task already done (or dropped), changes nothing and returns null, so it
// pays no light, logs nothing and spawns no second repeat. The state change
// and the next repeat are one transaction. Calls queue behind each other,
// because the transaction is a plain BEGIN on the one connection (the web
// has no exclusive transactions): a second BEGIN while one is open would
// fail, and its ROLLBACK would undo the first.
let finishing: Promise<unknown> = Promise.resolve();

export function complete(id: string, partial = false, reason?: RewardReason): Promise<Award | null> {
  const run = finishing.then(() => completeOnce(id, partial, reason));
  finishing = run.catch(() => {});
  return run;
}

async function completeOnce(id: string, partial: boolean, reason?: RewardReason): Promise<Award | null> {
  const db = await getDb();
  const before = await getTask(id);
  const now = Date.now();
  let changed = 0;
  await db.withTransactionAsync(async () => {
    const r = await db.runAsync(
      `UPDATE task SET state = 'done', completed_at = ?, updated_at = ?
        WHERE id = ? AND state NOT IN ('done','dropped')`,
      now, now, id,
    );
    changed = r.changes;
    if (changed && before?.repeat_rule) await spawnNext(before);
  });
  if (!changed) return null;
  // Time spent counts. Stopping early still logs a win, and still pays — this
  // is the single most important behaviour in the app.
  await logEvent('completed', id, { partial });
  await markActed('complete');
  return grantLight(reason ?? (partial ? 'partial' : 'complete'), id);
}

/**
 * Stopping a focus session early ends the SESSION, not the task. The time
 * still counts — it pays the same partial light it always did — but the task
 * stays open, back on today's plan, and the breadcrumb the timer drops is
 * what Ra shows next time ("Where you were"). Previously Stop called
 * complete(), so five minutes into a two-hour job the whole job was marked
 * done.
 */
export async function endSession(id: string) {
  const t = await getTask(id);
  if (t && t.state === 'doing') await updateTask(id, { state: 'today' });
  await markActed('session');
  return grantLight('partial', id);
}

/**
 * "Not now" is a scheduling fact, not a failure — the task doesn't get a
 * lower priority, a red flag, or a worse position in any list for having
 * been snoozed. `snooze_count` is the one exception, and it's a narrow one:
 * it's never displayed, never read by pickNow()'s ordering, and does
 * nothing on its own. Its only reader is `checkInDue()` below, which uses it
 * to notice a task that's been quietly slipping and offer a real check-in
 * instead of letting it slip forever.
 *
 * Without the snooze itself, a task whose due date has passed wins
 * pickNow() forever: the first clause matches anything with
 * `due_at <= now + 2h`, "not now" put it straight back to 'inbox', and Ra
 * handed you the identical task on the next frame. Snoozing is what makes
 * the button mean anything.
 */
export async function notNow(id: string, minutes = 180) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE task SET state = ?, snoozed_until = ?, snooze_count = COALESCE(snooze_count, 0) + 1, updated_at = ? WHERE id = ?',
    'inbox', Date.now() + minutes * 60_000, Date.now(), id);
  await logEvent('skipped', id, { minutes });
  await markActed('snooze');
}

/** Has this task slipped enough times that a plain "not now" has stopped
 *  being the honest answer? Fires once per crossing, via the same
 *  once-and-only-once flag pattern as Ra's skip.est/skip.first — a task
 *  that's been checked in on and snoozed again doesn't get re-asked until
 *  it slips a further THRESHOLD times past that. */
const CHECK_IN_THRESHOLD = 4;
export async function checkInDue(task: Task): Promise<boolean> {
  const n = task.snooze_count ?? 0;
  if (n < CHECK_IN_THRESHOLD || n % CHECK_IN_THRESHOLD !== 0) return false;
  const seenAt = await getFlag(`checkin.${task.id}`);
  return seenAt !== String(n);
}
export async function markCheckInSeen(task: Task) {
  await setFlag(`checkin.${task.id}`, String(task.snooze_count ?? 0));
}

export type Energy = 'low' | 'steady' | 'focused';

export async function setEnergy(e: Energy) {
  await setFlag('energy', e);
  await logEvent('nudge_acted', undefined, { energy: e });
  await markActed('energy');
  // A new energy level is a new question, so a pick the engine made for the
  // old one is let go. A task you chose yourself stays.
  const pin = await readPin();
  if (pin && pin.rule !== 'chosen') await writePin(null);
}

export async function getEnergy(): Promise<Energy> {
  return ((await getFlag('energy')) as Energy) ?? 'steady';
}

/** What counts as "doable right now" at each energy level. */
// Exported so the UI layer can explain a pick (see priority.ts's whyNow)
// without re-querying the DB — the two must stay in step with each other,
// which is the whole reason this lives in one place rather than two.
export const CEILING: Record<Energy, number> = { low: 10, steady: 30, focused: 999 };

/** Everything that is genuinely in the running: not done, not dropped, not a
 *  sub-step being counted twice, and not snoozed out. */
const LIVE = `state NOT IN ('done','dropped')
              AND (snoozed_until IS NULL OR snoozed_until <= ?)`;

/**
 * Which rule put a task in front of you. The engine returns it with the task,
 * so "Why this one" on screen is the rule that actually fired — it used to be
 * re-derived in priority.ts, a second copy of these tiers that could drift.
 * 'chosen' is the one rule the engine didn't apply: you picked it yourself.
 */
export type PickRule = 'chosen' | 'due' | 'started' | 'today' | 'priority' | 'upcoming' | 'fits' | 'smallest';
export interface Pick { task: Task; rule: PickRule }

/* ---------------- the one thing, held ---------------- */

/**
 * Whatever Ra shows stays shown until something real changes: you finish it,
 * drop it, snooze it, swap it with "Something else", change your energy (for
 * a pick the engine made), or the day ends. Before this, the pick was
 * recomputed on every refresh — answering an estimate, coming back from a
 * modal, reopening the app — so the task you had just declined, or the one
 * you had just chosen in Nu, could quietly be replaced by another.
 *
 * Stored as flags, not in memory, so it survives the app being closed.
 */
export interface Pin { id: string; rule: PickRule; day: string }
const dayKey = () => new Date().toDateString();

export async function readPin(): Promise<Pin | null> {
  try { return JSON.parse((await getFlag('ra.pin')) ?? 'null'); } catch { return null; }
}
async function writePin(p: { id: string; rule: PickRule } | null) {
  await setFlag('ra.pin', p ? JSON.stringify({ ...p, day: dayKey() }) : 'null');
}
export async function passedToday(): Promise<string[]> {
  try {
    const v = JSON.parse((await getFlag('ra.passed')) ?? 'null');
    return v && v.day === dayKey() ? v.ids : [];
  } catch { return []; }
}
async function writePassed(ids: string[]) {
  await setFlag('ra.passed', JSON.stringify({ day: dayKey(), ids }));
}

const isLive = (t: Task | null): t is Task =>
  !!t && t.state !== 'done' && t.state !== 'dropped' && !(t.snoozed_until && t.snoozed_until > Date.now());

/* The one thing now, and the options when there's none, are the planner's
 * (src/next.ts, src/nextActions.ts): one set of rules, not one here and
 * another there. What lives here is the state it reads: the task you chose
 * (the pin) and what you passed on today. */

/** You chose this one. It stays until it's done, dropped or snoozed. */
export async function chooseTask(id: string) {
  await writePin({ id, rule: 'chosen' });
  await markActed('choose');
}

/** A project's move was replaced by a new one (smaller, or around a
 *  blocker). If you had chosen the old one, you've chosen its replacement —
 *  Ra shouldn't fall back to the top of Today because the task row changed. */
export async function handOverPin(fromId: string, toId: string) {
  const pin = await readPin();
  if (pin && pin.id === fromId && pin.rule === 'chosen') await writePin({ id: toId, rule: 'chosen' });
}

/** "Something else instead": not this one, not today. The planner then
 *  offers the next on your Today list, or nothing (and Ra offers options). */
export async function passOn(id: string): Promise<void> {
  const pin = await readPin();
  await writePassed([...(await passedToday()).filter(x => x !== id), id]);
  await writePin(null);
  await logEvent('swapped', id, { rule: pin?.id === id ? pin.rule : null });
  await markActed('swap');
}

/** Every task carrying a date in a window — what the calendar screen draws. */
export async function tasksBetween(fromMs: number, toMs: number) {
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task
      WHERE due_at IS NOT NULL AND due_at >= ? AND due_at < ?
        AND state != 'dropped' AND parent_id IS NULL
      ORDER BY due_at ASC`, fromMs, toMs);
}

/** Everything Nu is holding that isn't on Today. All of it: Nu's promise is
 *  everything you're carrying, so the oldest are never cut off (SCOPE fix 10). */
export async function inbox() {
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task WHERE state = 'inbox' AND parent_id IS NULL
      ORDER BY created_at DESC`);
}

export async function wins(limit = 100) {
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task WHERE state = 'done' ORDER BY completed_at DESC LIMIT ?`, limit);
}

/** Monotonic. Never resets, never goes down. This is the streak replacement. */
export async function totalWins() {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM event WHERE kind = 'completed'`);
  return r?.n ?? 0;
}

/**
 * Momentum: an exponential moving average, not a chain.
 *   m = 0.75 * m_yesterday + 0.25 * done_today
 * A bad day dents it; two good days restore it. There is no zero and no cliff,
 * so there is nothing to "break".
 */
export async function momentum(days = 30) {
  const db = await getDb();
  const since = Date.now() - days * 86400_000;
  const rows = await db.getAllAsync<{ day: string; n: number }>(
    `SELECT date(at/1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS n
       FROM event WHERE kind = 'completed' AND at >= ?
      GROUP BY day ORDER BY day ASC`, since);

  const byDay = new Map(rows.map(r => [r.day, r.n]));
  let m = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toLocaleDateString('en-CA');
    m = 0.75 * m + 0.25 * (byDay.get(d) ?? 0);
  }
  return Math.min(1, m / 3); // 3 completions/day reads as "full"
}

/** Daily completion counts for the pixel grid. Gaps are data, not failure. */
export async function dailyCounts(days = 182) {
  const db = await getDb();
  const since = Date.now() - days * 86400_000;
  const rows = await db.getAllAsync<{ day: string; n: number }>(
    `SELECT date(at/1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS n
       FROM event WHERE kind = 'completed' AND at >= ?
      GROUP BY day`, since);
  const byDay = new Map(rows.map(r => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
    return { day: d.toLocaleDateString('en-CA'), n: byDay.get(d.toLocaleDateString('en-CA')) ?? 0 };
  });
}

/* ------------------------------------------------------------------ *
 *  Editing — the missing half. Capture writes a title; this writes
 *  everything the NOW engine actually reads.
 * ------------------------------------------------------------------ */

export interface TaskPatch {
  title?: string;
  first_action?: string | null;
  est_minutes?: number | null;
  due_at?: number | null;
  energy?: 'low' | 'med' | 'high' | null;
  state?: TaskState;
  snoozed_until?: number | null;
  repeat_rule?: RepeatRule | null;
  label?: LabelId | null;
  has_time?: number | null;
  priority?: number | null;
  activity?: ActivityId | null;
  repeat_days?: string | null;
}

const FIELDS: (keyof TaskPatch)[] =
  ['title', 'first_action', 'est_minutes', 'due_at', 'energy', 'state', 'snoozed_until', 'repeat_rule', 'label', 'has_time', 'priority', 'activity', 'repeat_days'];

export async function updateTask(id: string, patch: TaskPatch) {
  const keys = FIELDS.filter(k => patch[k] !== undefined);
  if (!keys.length) return;
  const db = await getDb();
  // updated_at is stamped unconditionally, not folded into FIELDS/TaskPatch —
  // it's not a thing you ever set (see src/sync.ts's watermark), it's a fact
  // about every patch: something changed, so the "when did this last change"
  // clock always ticks, regardless of which fields moved.
  await db.runAsync(
    `UPDATE task SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...keys.map(k => patch[k] as SQLite.SQLiteBindValue), Date.now(), id,
  );
  // every edit is you, here — it resets the reminder ladder like any other act
  await markActed('edit');
}

export async function getTask(id: string) {
  const db = await getDb();
  return db.getFirstAsync<Task>('SELECT * FROM task WHERE id = ?', id);
}

/**
 * Deliberately not DELETE — dropped tasks stay in the event log.
 *
 * Cascades to any micro-steps. Without this, a step left in `state: 'today'`
 * outlives its dropped parent, stays eligible in pickNow()'s tier-3 clause,
 * and — because completeStep() unconditionally completes the parent once its
 * last live step is gone — finishing that orphaned step would silently flip
 * the already-dropped parent back to 'done' and pay out a reward for it.
 */
export async function dropTask(id: string) {
  const db = await getDb();
  await updateTask(id, { state: 'dropped' });
  // Bypasses updateTask() (it's a WHERE parent_id = ?, not a single row by
  // id), so it needs its own updated_at stamp — sync has no other way to
  // know these child steps changed.
  await db.runAsync(
    `UPDATE task SET state = 'dropped', updated_at = ? WHERE parent_id = ? AND state NOT IN ('done','dropped')`,
    Date.now(), id);
  await logEvent('skipped', id, { dropped: true });
}

/** Today's plan. Three is the number; more is a list, and a list is a decision. */
export async function todayList() {
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task WHERE state IN ('today','doing')
       ORDER BY COALESCE(due_at, 9e15) ASC, created_at ASC`);
}

export async function pickForToday(id: string, on: boolean) {
  await updateTask(id, { state: on ? 'today' : 'inbox' });
  await logEvent('nudge_acted', id, { today: on });
}

/**
 * Micro-steps. ONE level only — `parent_id` never nests further, because
 * unlimited nesting is how a task app becomes a second job.
 *
 * The parent is marked done once every step is, so the big scary thing
 * disappears by attrition rather than by an act of will.
 */
export async function addSteps(parentId: string, titles: string[]) {
  const db = await getDb();
  const parent = await getTask(parentId);
  if (!parent || parent.parent_id) return;   // refuse to nest twice
  for (const t of titles.map(x => x.trim()).filter(Boolean)) {
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO task (id, title, state, created_at, parent_id, est_minutes, updated_at)
       VALUES (?, ?, 'today', ?, ?, 5, ?)`,
      uid(), t, now, parentId, now,
    );
  }
  await logEvent('captured', parentId, { steps: titles.length });
}

export async function steps(parentId: string) {
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task WHERE parent_id = ? AND state != 'dropped' ORDER BY created_at ASC`,
    parentId);
}

/**
 * Complete a step; if it was the last one, the parent completes itself.
 * Returns the award for the step, or for the parent if finishing the step
 * finished the whole thing — the bigger moment is the one worth celebrating.
 */
export async function completeStep(stepId: string): Promise<Award | null> {
  const db = await getDb();
  const stepAward = await complete(stepId, false, 'step');
  const st = await getTask(stepId);
  if (!st?.parent_id) return stepAward;
  const left = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM task WHERE parent_id = ? AND state NOT IN ('done','dropped')`,
    st.parent_id);
  if ((left?.n ?? 0) === 0) return (await complete(st.parent_id)) ?? stepAward;
  return stepAward;
}

/* ================================================================== *
 *  v2 — modes, breadcrumbs, retro-capture, the softening ladder
 * ================================================================== */

export type Mode = 'nu' | 'ra';

/**
 * Nu and Ra are mutually exclusive. This isn't a view preference — in Ra the
 * app genuinely has no way to render a second task, and in Nu nothing is
 * startable. The switch is the only navigation the app has.
 */
export async function getMode(): Promise<Mode> {
  return ((await getFlag('mode')) as Mode) ?? 'nu';
}

export async function setMode(m: Mode) {
  await setFlag('mode', m);
}

/* ---------------- flags ---------------- */

export async function getFlag(k: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ v: string }>(`SELECT v FROM app_state WHERE k=?`, k);
  return r?.v ?? null;
}
export async function setFlag(k: string, v: string) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_state (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, v);
}

/** Shown once, on the very first launch — never again after that. */
export async function hasOnboarded(): Promise<boolean> {
  return (await getFlag('onboarded')) === '1';
}
/**
 * Put someone back at the start. Onboarding is a one-time gate — which is
 * right, nobody wants the tour twice — but with no way to replay it there was
 * literally no route back to the intro once you'd tapped through, and no way
 * to see what you'd skipped. That's what "Start from the beginning" does (the
 * menu on Nu, and Settings — src/intro.ts).
 */
export async function resetOnboarding() {
  await setFlag('onboarded', '0');
  await setFlag('cal_asked', '');
  await setFlag('notif_asked', '');
}

export async function completeOnboarding() {
  await setFlag('onboarded', '1');
  await markActed('onboarding');     // the ladder starts from "you just did something"
}

/** Replay the opening and onboarding without clearing app storage.
 *  Reachable from "Start from the beginning" (src/intro.ts). */

/* ---------------- who you are ---------------- */

export interface Profile {
  name: string;
  /** the short line about you under your name (Profile → About me) */
  tagline: string;
  /** optional, free text */
  pronouns: string;
  /** your picture: '', a pose, initials or a photo (see src/avatar.ts) */
  avatar: string;
}

/**
 * Stored locally, like everything else. A name is the cheapest personalisation
 * there is and it changes how the app reads — "Keep going, Kim" is a different
 * sentence from "Keep going". No account needed for it, and none is asked for.
 */
export async function getProfile(): Promise<Profile> {
  const [name, tagline, pronouns, avatar] = await Promise.all(
    ['profile.name', 'profile.tagline', 'profile.pronouns', 'profile.avatar'].map(getFlag));
  return { name: name ?? '', tagline: tagline ?? '', pronouns: pronouns ?? '', avatar: avatar ?? '' };
}
export async function setProfile(p: Partial<Profile>) {
  if (p.name !== undefined) await setFlag('profile.name', p.name);
  if (p.tagline !== undefined) await setFlag('profile.tagline', p.tagline);
  if (p.pronouns !== undefined) await setFlag('profile.pronouns', p.pronouns);
  if (p.avatar !== undefined) await setFlag('profile.avatar', p.avatar);
}

/** Free-text search across everything still live. */
export async function search(q: string, limit = 40) {
  const term = q.trim();
  if (!term) return [];
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task
      WHERE state NOT IN ('dropped') AND parent_id IS NULL
        AND (title LIKE ? OR first_action LIKE ?)
      ORDER BY (state = 'done') ASC, COALESCE(due_at, 9e15) ASC, created_at DESC
      LIMIT ?`, `%${term}%`, `%${term}%`, limit);
}

/* ---------------- habits — cue, tiny action, no streak ---------------- */

export interface Habit {
  id: string;
  cue: string;
  action: string;
  minimum: string | null;
  created_at: number;
  /** 1 on, 0 paused, -1 let go (src/habits.ts) */
  active: number;
  updated_at: number | null;
}

/** did_minimum: 0 done, 1 the bad-day version, -1 taken back the same day (src/habits.ts) */
export interface HabitLog { id: string; habit_id: string; at: number; did_minimum: number; updated_at: number | null }

export async function createHabit(cue: string, action: string, minimum?: string): Promise<Habit> {
  const db = await getDb();
  const now = Date.now();
  const h: Habit = {
    id: uid(), cue: cue.trim(), action: action.trim(), minimum: minimum?.trim() || null,
    created_at: now, active: 1, updated_at: now,
  };
  await db.runAsync(
    'INSERT INTO habit (id, cue, action, minimum, created_at, active, updated_at) VALUES (?,?,?,?,?,?,?)',
    h.id, h.cue, h.action, h.minimum, h.created_at, h.active, h.updated_at);
  return h;
}

/** Every habit still yours, on and paused (not the ones let go). */
export async function listHabits(): Promise<Habit[]> {
  const db = await getDb();
  return db.getAllAsync<Habit>('SELECT * FROM habit WHERE active >= 0 ORDER BY created_at ASC');
}

export async function getHabit(id: string): Promise<Habit | null> {
  const db = await getDb();
  return db.getFirstAsync<Habit>('SELECT * FROM habit WHERE id = ? AND active >= 0', id);
}

/** Your Tasks' habit rows: each habit with how many days it happened and
 *  whether today's done (src/habits.ts). */
export async function habitRows(now = Date.now()): Promise<HabitView[]> {
  const db = await getDb();
  const [habits, logs] = await Promise.all([
    listHabits(),
    db.getAllAsync<Omit<HabitLog, 'id' | 'updated_at'>>(
      'SELECT habit_id, at, did_minimum FROM habit_log WHERE did_minimum != ?', LOG_TAKEN_BACK),
  ]);
  return habitViews(habits, logs, now);
}

export async function updateHabit(id: string, cue: string, action: string, minimum?: string) {
  const db = await getDb();
  await db.runAsync('UPDATE habit SET cue = ?, action = ?, minimum = ?, updated_at = ? WHERE id = ?',
    cue.trim(), action.trim(), minimum?.trim() || null, Date.now(), id);
  await markActed('habit');
}

/** Not a delete: a habit that isn't working gets paused, not marked as a
 *  failure. Its log stays, so turning it back on doesn't lose the history. */
export async function pauseHabit(id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE habit SET active = ?, updated_at = ? WHERE id = ?', HABIT_PAUSED, Date.now(), id);
}

export async function resumeHabit(id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE habit SET active = ?, updated_at = ? WHERE id = ?', HABIT_ON, Date.now(), id);
  await markActed('habit');
}

/** Let it go: off the list on every device. Marked, not deleted, since sync
 *  carries rows and never a delete (HABIT_LET_GO in src/habits.ts). */
export async function letGoHabit(id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE habit SET active = ?, updated_at = ? WHERE id = ?', HABIT_LET_GO, Date.now(), id);
}

export async function logHabit(habitId: string, didMinimum = false) {
  const db = await getDb();
  const at = Date.now();
  await db.runAsync(
    'INSERT INTO habit_log (id, habit_id, at, did_minimum, updated_at) VALUES (?,?,?,?,?)',
    uid(), habitId, at, didMinimum ? 1 : 0, at);
  await markActed('habit');
}

/** Tick today on or off (src/habits.ts todayToggle). True when it's done now. */
export async function toggleHabitToday(habitId: string): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const start = new Date(now).setHours(0, 0, 0, 0);
  const today = await db.getAllAsync<HabitLog>(
    'SELECT * FROM habit_log WHERE habit_id = ? AND at >= ? ORDER BY at ASC', habitId, start);
  const step = todayToggle(today, now);
  if (step.kind === 'add') return logHabit(habitId).then(() => true);
  for (const id of step.ids) {
    await db.runAsync('UPDATE habit_log SET did_minimum = ?, updated_at = ? WHERE id = ?', step.to, now, id);
  }
  await markActed('habit');
  return step.done;
}

/** Every log for a habit in the last `days` — the raw material for
 *  src/habits.ts's completion-rate math. Kept here as plain data; the
 *  judgment-free framing of what to DO with it lives in habits.ts, not
 *  the persistence layer. */
export async function habitLogs(habitId: string, days = 30): Promise<HabitLog[]> {
  const db = await getDb();
  const since = Date.now() - days * 86400_000;
  return db.getAllAsync<HabitLog>(
    'SELECT * FROM habit_log WHERE habit_id = ? AND at >= ? ORDER BY at ASC', habitId, since);
}

/**
 * Which activity scenes you've earned — every activity you have actually
 * FINISHED at least once. Derived from the task table rather than stored, so
 * it can never drift out of step with your real history.
 */
export async function unlockedActivities(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ activity: string }>(
    `SELECT DISTINCT activity FROM task
      WHERE state = 'done' AND activity IS NOT NULL AND activity != ''`);
  return rows.map(r => r.activity);
}

/** Light earned per day, for the profile bars. */
export async function lightByDay(days = 7) {
  const db = await getDb();
  const since = Date.now() - days * 86400_000;
  const rows = await db.getAllAsync<{ day: string; n: number }>(
    `SELECT date(at/1000,'unixepoch','localtime') AS day, SUM(json_extract(meta,'$.n')) AS n
       FROM event WHERE kind = 'reward' AND at >= ? GROUP BY day`, since);
  const by = new Map(rows.map(r => [r.day, r.n ?? 0]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
    return { date: d, day: d.toLocaleDateString('en-CA'), n: by.get(d.toLocaleDateString('en-CA')) ?? 0 };
  });
}

/* ---------------- migrations ---------------- */

/**
 * Schema setup lives entirely inside openDb(), so every getDb() caller —
 * including the AppState listener, which fires independently of _layout's
 * startup sequence — is guaranteed the finished schema. Kept as a no-op-safe
 * wrapper only because _layout.tsx still calls it explicitly on startup.
 */
export async function migrate() {
  await getDb();
}

/* ---------------- breadcrumbs ---------------- */

export interface Crumb { id: number; task_id: string; note: string | null; context: string | null; at: number }

/**
 * Where you were when you got interrupted. Written on the way out, because by
 * the time you come back the context is gone — that's the whole problem.
 */
export async function dropCrumb(taskId: string, note?: string) {
  const db = await getDb();
  const sub = await steps(taskId);
  const done = sub.filter(s => s.state === 'done').length;
  const context = sub.length ? `${done} of ${sub.length} steps done` : null;
  await db.runAsync(
    `INSERT INTO breadcrumb (task_id, note, context, at) VALUES (?,?,?,?)`,
    taskId, note?.trim() || null, context, Date.now());
  await logEvent('paused', taskId);
}

export async function latestCrumb(): Promise<{ crumb: Crumb; task: Task } | null> {
  const db = await getDb();
  const c = await db.getFirstAsync<Crumb>(
    `SELECT b.* FROM breadcrumb b
       JOIN task t ON t.id = b.task_id
      WHERE t.state NOT IN ('done','dropped')
      ORDER BY b.at DESC LIMIT 1`);
  if (!c) return null;
  const t = await getTask(c.task_id);
  return t ? { crumb: c, task: t } : null;
}

export async function clearCrumbs(taskId: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM breadcrumb WHERE task_id = ?`, taskId);
}

/* ---------------- retro-capture ---------------- */

/**
 * "What did you actually do since lunch?"
 * An ADHD day usually contains real work that never got logged, which is exactly
 * why the day feels empty. Backdating it fixes the record instead of arguing
 * with the feeling — and it pays out, because work you forgot to log was still
 * work.
 */
export async function retroCapture(lines: string[], whenMs = Date.now() - 3 * 3600_000) {
  const db = await getDb();
  let n = 0, banked = 0;
  for (const raw of lines.map(l => l.trim()).filter(Boolean)) {
    const id = uid();
    // the same guesses a capture makes, so what you did is counted by kind
    // too (which labels get done), not only by when (src/learn/signals.ts)
    const activity = guessActivity(raw);
    const label = activityById(activity)?.label ?? guessLabel(raw);
    await db.runAsync(
      `INSERT INTO task (id,title,state,created_at,completed_at,retro,label,activity,updated_at)
       VALUES (?,?,'done',?,?,1,?,?,?)`, id, raw, whenMs, whenMs, label, activity, whenMs);
    await db.runAsync(
      `INSERT INTO event (task_id,kind,at,meta) VALUES (?,'completed',?,?)`,
      id, whenMs, JSON.stringify({ retro: true }));
    banked += (await grantLight('retro', id)).total;
    n++;
  }
  if (n) await markActed('retro');
  return { count: n, light: banked };
}

/* ---------------- the softening ladder ---------------- */

/**
 * Every reminder app escalates when ignored. This one de-escalates.
 *
 *   0-1  the chosen task, normal voice
 *   2    swap to the shortest task there is
 *   3    drop to <=2 min, and the voice changes from prompt to offer
 *   4+   stop; one re-entry next morning with no reference to today
 *
 * Any action at all resets it, and the count is never displayed — the user
 * should notice only that the app got gentler, and preferably not consciously.
 *
 * The old implementation counted deliveries with addNotificationReceivedListener,
 * which only fires while the app is in the FOREGROUND — i.e. it counted a nudge
 * as ignored only in the one case where you had definitely not ignored it. So
 * the ladder never moved. This version derives the level instead: how many
 * anchor slots have gone past since the last time you did anything at all. It
 * needs no delivery callback, no background task, and it's correct even if the
 * app hasn't been opened in a week.
 */

/** Where the three daily anchors sit until Settings moves them. The ladder
 *  maths and the scheduler both read anchorSlots() below, so they cannot
 *  drift apart. */
export const ANCHOR_SLOTS = [
  { id: 'anchor.morning',  hour: 9,  minute: 0 },
  { id: 'anchor.midday',   hour: 13, minute: 30 },
  { id: 'anchor.shutdown', hour: 20, minute: 0 },
] as const;

type AnchorSlot = { id: string; hour: number; minute: number };

/** Settings → Notifications. Morning and evening are a time (minutes after
 *  midnight) or null when turned off; midday and the two minutes before an
 *  event are on or off. */
export interface Nudges { morning: number | null; midday: boolean; evening: number | null; events: boolean }
export const MORNING_TIMES = [7 * 60, 8 * 60, 9 * 60, 10 * 60];
export const EVENING_TIMES = [18 * 60, 19 * 60, 20 * 60, 21 * 60, 22 * 60];

export async function getNudges(): Promise<Nudges> {
  const [m, mid, e, ev] = await Promise.all(
    ['nudge.morning', 'nudge.midday', 'nudge.evening', 'nudge.events'].map(k => getFlag(k)));
  const time = (v: string | null, fallback: number) => v === 'off' ? null : Number(v) > 0 ? Number(v) : fallback;
  return { morning: time(m, 9 * 60), midday: mid !== 'off', evening: time(e, 20 * 60), events: ev !== 'off' };
}
export async function setNudges(n: Partial<Nudges>) {
  const time = (v: number | null) => (v == null ? 'off' : String(v));
  if ('morning' in n) await setFlag('nudge.morning', time(n.morning ?? null));
  if ('midday' in n) await setFlag('nudge.midday', n.midday ? '' : 'off');
  if ('evening' in n) await setFlag('nudge.evening', time(n.evening ?? null));
  if ('events' in n) await setFlag('nudge.events', n.events ? '' : 'off');
}

/** The anchors that are on, at the times chosen in Settings, earliest first.
 *  The scheduler writes these and the ladder counts only these: an anchor you
 *  turned off can't be one you ignored. */
export async function anchorSlots(): Promise<AnchorSlot[]> {
  const n = await getNudges();
  const at = (id: string, min: number) => ({ id, hour: Math.floor(min / 60), minute: min % 60 });
  return [
    n.morning != null ? at('anchor.morning', n.morning) : null,
    n.midday ? ANCHOR_SLOTS[1] : null,
    n.evening != null ? at('anchor.shutdown', n.evening) : null,
  ].filter((s): s is AnchorSlot => !!s).sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

/** Count anchor firings strictly inside (from, to]. */
export function anchorsBetween(from: number, to: number, slots: readonly AnchorSlot[] = ANCHOR_SLOTS): number {
  if (!(to > from) || !slots.length) return 0;
  let n = 0;
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  // 400 days of slack is far more than the ladder can ever need; it also stops
  // a bad clock or a restored backup from spinning here forever.
  for (let i = 0; i < 400; i++) {
    for (const s of slots) {
      const d = new Date(day);
      d.setDate(d.getDate() + i);
      d.setHours(s.hour, s.minute, 0, 0);
      const t = d.getTime();
      if (t > from && t <= to) n++;
      if (t > to) return n;
    }
  }
  return n;
}

/** The last time the user did literally anything. Everything resets this —
 *  capture, edits, energy, choosing, swapping, sessions, habits, completing,
 *  snoozing, answering a reminder. Each call is also logged, so the 14-day
 *  review can see which reminders were followed by action. */
export async function markActed(source?: string) {
  await setFlag('last_acted_at', String(Date.now()));
  await logEvent('acted', undefined, source ? { source } : undefined);
}

export async function lastActed(): Promise<number> {
  const v = await getFlag('last_acted_at');
  return v ? parseInt(v, 10) : Date.now();
}

export type Softness = { level: number; silent: boolean; offer: boolean; ceiling: number };

export function softness(streak: number): Softness {
  if (streak >= 4) return { level: 4, silent: true,  offer: true,  ceiling: 2 };
  if (streak === 3) return { level: 3, silent: false, offer: true,  ceiling: 2 };
  if (streak === 2) return { level: 2, silent: false, offer: false, ceiling: 10 };
  return { level: streak, silent: false, offer: false, ceiling: 999 };
}

/** How soft the app should be at some future moment, assuming you do nothing
 *  between now and then. The scheduler uses this to write the whole week's
 *  nudges at their correct, progressively gentler volume in one pass. */
export async function softnessAt(atMs: number, slots?: readonly AnchorSlot[]): Promise<Softness> {
  return softness(anchorsBetween(await lastActed(), atMs, slots ?? await anchorSlots()));
}

/** Smallest thing available — what the ladder reaches for as it softens. */
export async function smallestTask(ceiling = 999) {
  const db = await getDb();
  const now = Date.now();
  return db.getFirstAsync<Task>(
    `SELECT * FROM task WHERE state NOT IN ('done','dropped') AND parent_id IS NULL
       AND (snoozed_until IS NULL OR snoozed_until <= ?)
       AND COALESCE(est_minutes, 15) <= ?
     ORDER BY COALESCE(est_minutes, 999) ASC, created_at ASC LIMIT 1`, now, ceiling);
}

/* ================================================================== *
 *  Measure — what the 14-day review reads (SCOPE.md). Local only; the
 *  event table is never synced.
 * ================================================================== */

/**
 * What the guide on Home reads (src/guide.ts): the tasks and the newest,
 * the earliest finished thing (a done task, or a `completed` event), the
 * first and latest session, the newest project, and the latest Not now or
 * Something else (a `skipped` that was a delete doesn't count).
 */
export async function guideFacts() {
  const db = await getDb();
  const r = await db.getFirstAsync<{
    tasks: number; lastTask: number | null; doneTask: number | null; done: number | null;
    first: number | null; last: number | null; project: number | null; change: number | null;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM task WHERE parent_id IS NULL) AS tasks,
       (SELECT MAX(created_at) FROM task WHERE parent_id IS NULL) AS lastTask,
       (SELECT MIN(completed_at) FROM task WHERE state = 'done' AND completed_at IS NOT NULL) AS doneTask,
       (SELECT MIN(at) FROM event WHERE kind = 'completed') AS done,
       (SELECT MIN(at) FROM event WHERE kind = 'session_start') AS first,
       (SELECT MAX(at) FROM event WHERE kind = 'session_start') AS last,
       (SELECT MAX(created_at) FROM project) AS project,
       (SELECT MAX(at) FROM event WHERE kind IN ('swapped','snoozed')
          OR (kind = 'skipped' AND COALESCE(meta, '') NOT LIKE '%"dropped":true%')) AS change`);
  const firsts = [r?.doneTask, r?.done].filter((x): x is number => x != null);
  return {
    tasks: r?.tasks ?? 0,
    lastTask: r?.lastTask ?? null,
    firstDone: firsts.length ? Math.min(...firsts) : null,
    firstSession: r?.first ?? null,
    lastSession: r?.last ?? null,
    lastProject: r?.project ?? null,
    lastChange: r?.change ?? null,
  };
}

/**
 * The one number that says whether Nura works: of the tasks Ra showed you,
 * how many you started — a focus session, or marking it done — within a day
 * of being shown. Counted once per task per day, so a task shown on three
 * refreshes of one morning is one showing, not three.
 */
export async function startRate(days = 14) {
  const db = await getDb();
  const since = Date.now() - days * 86_400_000;
  const shown = await db.getAllAsync<{ task_id: string; at: number }>(
    `SELECT task_id, MIN(at) AS at FROM event
      WHERE kind = 'shown' AND at >= ? AND task_id IS NOT NULL
      GROUP BY task_id, date(at/1000,'unixepoch','localtime')`, since);
  let started = 0;
  for (const s of shown) {
    const hit = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM event
        WHERE task_id = ? AND kind IN ('session_start','completed') AND at >= ? AND at <= ?`,
      s.task_id, s.at, s.at + 86_400_000);
    if ((hit?.n ?? 0) > 0) started++;
  }
  return { shown: shown.length, started, rate: shown.length ? started / shown.length : null };
}

/**
 * How far estimates are from reality, from focus sessions that ended with
 * the task done and had an estimate at the moment they started. 1.0 means
 * spot on; 2.0 means things take twice as long as guessed. Median, so one
 * forgotten timer doesn't swamp it.
 */
export async function estimateAccuracy(days = 14) {
  const db = await getDb();
  const since = Date.now() - days * 86_400_000;
  const rows = await db.getAllAsync<{ meta: string }>(
    `SELECT meta FROM event WHERE kind = 'session_end' AND at >= ?`, since);
  const ratios = rows
    .map(r => { try { return JSON.parse(r.meta); } catch { return null; } })
    .filter(m => m && m.done && m.est > 0 && m.minutes > 0)
    .map(m => m.minutes / m.est)
    .sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  return { sessions: ratios.length, median };
}

/** Everything the review needs, as one JSON document: the event log, the
 *  tasks it refers to, and the two numbers above. Nothing is sent anywhere —
 *  the caller hands it to the share sheet or a download. */
export async function exportLog(): Promise<string> {
  const db = await getDb();
  const [events, tasks, start, estimate] = await Promise.all([
    db.getAllAsync(`SELECT task_id, kind, at, meta FROM event ORDER BY at ASC`),
    db.getAllAsync(`SELECT id, title, state, est_minutes, due_at, created_at, completed_at,
                           label, activity, priority, repeat_rule, parent_id FROM task`),
    startRate(), estimateAccuracy(),
  ]);
  return JSON.stringify({ exportedAt: new Date().toISOString(), startRate: start, estimateAccuracy: estimate, events, tasks }, null, 1);
}

/* ---------------- onboarding answers ---------------- */

/** What usually gets in the way — asked once, in onboarding. Each answer
 *  changes something real (see SCOPE.md → Onboarding), so it's stored, not
 *  just logged. */
export type Blocker = 'starting' | 'choosing' | 'remembering' | 'returning';

export async function getBlockers(): Promise<Blocker[]> {
  try { return JSON.parse((await getFlag('onb.blockers')) ?? '[]'); } catch { return []; }
}
export async function setBlockers(b: Blocker[]) {
  await setFlag('onb.blockers', JSON.stringify(b));
}

/* ---------------- this device, cleared (src/account.ts) ---------------- */

/**
 * Everything a person put on this device, gone: every table, and every
 * app_state key except the ones in `keep` (the device's own, like its id and
 * appearance; a key ending in '.' keeps everything under it). Run on log out,
 * and before a different account takes over the device.
 */
export async function wipeLocalData(keep: readonly string[]) {
  const db = await getDb();
  const tables = (await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'app_state'`,
  )).map(r => r.name);
  // rows that point at other rows go first, in case foreign keys are enforced
  const children = ['project_step', 'project_event', 'habit_log', 'breadcrumb', 'event'];
  const order = [...children.filter(n => tables.includes(n)), ...tables.filter(n => !children.includes(n))];
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const kept = keep.map(k => (k.endsWith('.') ? `k LIKE ${quote(`${k}%`)}` : `k = ${quote(k)}`));
  await db.execAsync([
    ...order.map(n => `DELETE FROM "${n.replace(/"/g, '""')}";`),
    `DELETE FROM app_state${kept.length ? ` WHERE NOT (${kept.join(' OR ')})` : ''};`,
  ].join('\n'));
}
