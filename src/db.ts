import * as SQLite from 'expo-sqlite';
import { award as rollAward, type RewardReason, type Award } from './reward';
import { guessLabel, type LabelId } from './labels';
import { guessActivity, activityById, type ActivityId } from './activities';

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
}

export type EventKind =
  | 'captured' | 'started' | 'paused' | 'completed'
  | 'skipped' | 'snoozed' | 'nudge_sent' | 'nudge_acted'
  | 'reward';

// Memoize the in-flight *promise*, not just the resolved db — refresh() fans
// out ~9 concurrent calls that each call getDb(), and on web (OPFS access
// handles are exclusive-lock) a second open before the first resolves throws
// NoModificationAllowedError. Caching the promise makes every caller await
// the same single open instead of racing to start their own.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = openDb();
  return _dbPromise;
}

async function openDb() {
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

    CREATE TABLE IF NOT EXISTS nudge (
      id        TEXT PRIMARY KEY,
      task_id   TEXT REFERENCES task(id),
      kind      TEXT NOT NULL,
      fire_at   INTEGER NOT NULL,
      os_handle TEXT,
      state     TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS app_state (k TEXT PRIMARY KEY, v TEXT);

    CREATE INDEX IF NOT EXISTS idx_task_state   ON task(state);
    CREATE INDEX IF NOT EXISTS idx_task_due     ON task(due_at);
    CREATE INDEX IF NOT EXISTS idx_event_at     ON event(at);
    CREATE INDEX IF NOT EXISTS idx_event_kind   ON event(kind);
    CREATE INDEX IF NOT EXISTS idx_nudge_fire   ON nudge(fire_at);
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
}

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export async function logEvent(kind: EventKind, taskId?: string, meta?: unknown) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO event (task_id, kind, at, meta) VALUES (?, ?, ?, ?)',
    taskId ?? null, kind, Date.now(), meta ? JSON.stringify(meta) : null,
  );
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
  await db.runAsync(
    `INSERT INTO task (id, title, state, created_at, label, est_minutes, due_at, has_time, repeat_rule, priority, activity, repeat_days)
     VALUES (?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, title.trim(), Date.now(), label,
    minutes, opts.due_at ?? null, opts.has_time ? 1 : 0,
    opts.repeat_rule ?? null, opts.priority ?? 0, activity, opts.repeat_days ?? null,
  );
  await logEvent('captured', id);
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
  await db.runAsync(
    `INSERT INTO task (id, title, first_action, est_minutes, due_at, state, created_at, repeat_rule, label, has_time, priority, activity, repeat_days)
     VALUES (?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?)`,
    uid(), t.title, t.first_action, t.est_minutes, next, Date.now(),
    t.repeat_rule, t.label, t.has_time, t.priority, t.activity, t.repeat_days);
}

// `reason` lets a caller override what the completion pays out as — used by
// completeStep() below, so finishing a 5-minute micro-step banks the smaller
// 'step' reward ("Chipped.") instead of silently defaulting to the full
// task-completion reward it was getting before.
export async function complete(id: string, partial = false, reason?: RewardReason) {
  const db = await getDb();
  const before = await getTask(id);
  await db.runAsync(
    'UPDATE task SET state = ?, completed_at = ? WHERE id = ?',
    'done', Date.now(), id,
  );
  if (before?.repeat_rule) await spawnNext(before);
  // Time spent counts. Stopping early still logs a win, and still pays — this
  // is the single most important behaviour in the app.
  await logEvent('completed', id, { partial });
  await markActed();
  return grantLight(reason ?? (partial ? 'partial' : 'complete'), id);
}

/**
 * "Not now" is a scheduling fact, not a failure. Nothing increments, nothing is
 * counted against you — but the task does step out of the running for a while.
 *
 * Without that, a task whose due date has passed wins pickNow() forever: the
 * first clause matches anything with `due_at <= now + 2h`, "not now" put it
 * straight back to 'inbox', and Ra handed you the identical task on the next
 * frame. Snoozing is what makes the button mean anything.
 */
export async function notNow(id: string, minutes = 180) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE task SET state = ?, snoozed_until = ? WHERE id = ?',
    'inbox', Date.now() + minutes * 60_000, id);
  await logEvent('skipped', id, { minutes });
  await markActed();
}

export type Energy = 'low' | 'steady' | 'focused';

export async function setEnergy(e: Energy) {
  await setFlag('energy', e);
  await logEvent('nudge_acted', undefined, { energy: e });
}

export async function getEnergy(): Promise<Energy> {
  return ((await getFlag('energy')) as Energy) ?? 'steady';
}

/** What counts as "doable right now" at each energy level. */
const CEILING: Record<Energy, number> = { low: 10, steady: 30, focused: 999 };

/** Everything that is genuinely in the running: not done, not dropped, not a
 *  sub-step being counted twice, and not snoozed out. */
const LIVE = `state NOT IN ('done','dropped')
              AND (snoozed_until IS NULL OR snoozed_until <= ?)`;

/**
 * The NOW engine. Order matters more than the code:
 *   1 time-bound within 2h · 2 already started · 3 picked for today
 *   3.5 due in the next 72h (upcoming deadlines surface before random tasks)
 *   4 inbox: oldest-first for steady/focused (prevents burial of important
 *     long tasks); shortest-first only for low energy (genuinely can't start
 *     something big — this is the one case momentum beats importance)
 *   5 fallback: smallest thing regardless of energy rather than empty screen
 */
export async function pickNow(exclude: string[] = []): Promise<Task | null> {
  const db = await getDb();
  const now = Date.now();
  // "show me something else" passes the ids you've already seen, so Focus can
  // hand you a genuinely different task instead of the same one forever.
  const skip = exclude.length
    ? ` AND id NOT IN (${exclude.map(() => '?').join(',')})` : '';
  const soon = now + 2 * 60 * 60 * 1000;
  const threeDays = now + 72 * 60 * 60 * 1000;
  const energy = await getEnergy();
  const ceiling = CEILING[energy];
  // low: shortest-first so you can actually start; steady/focused: oldest-first
  // so tasks don't get buried indefinitely behind everything quick and easy.
  const inboxSort = energy === 'low'
    ? 'COALESCE(est_minutes, 999) ASC, created_at ASC'
    : 'created_at ASC, COALESCE(est_minutes, 999) ASC';

  const q = async (sql: string, ...args: SQLite.SQLiteBindValue[]) =>
    db.getFirstAsync<Task>(sql.replace('/*SKIP*/', skip), ...args, ...exclude);

  // Priority is a TIEBREAK, not a tier (see priority.ts) — it never earns a
  // clause of its own, it only decides between rows that are already equal
  // on the real sort key. Appended to every ORDER BY below; previously it
  // wasn't referenced anywhere in this function, so the "High" you set on a
  // task did nothing — pickNow() fell through to created_at/est_minutes as
  // if priority didn't exist.
  return (
    // 1. anything genuinely time-bound still wins, whatever your energy —
    //    a deadline doesn't care how you feel
    (await q(
      `SELECT * FROM task WHERE ${LIVE}
         AND due_at IS NOT NULL AND due_at <= ?/*SKIP*/ ORDER BY due_at ASC, priority DESC LIMIT 1`, now, soon)) ??
    // 2. resume what you already started
    (await q(
      `SELECT * FROM task WHERE state = 'doing'
         AND (snoozed_until IS NULL OR snoozed_until <= ?)/*SKIP*/
       ORDER BY created_at ASC, priority DESC LIMIT 1`, now)) ??
    // 3. picked for today, fits energy
    (await q(
      `SELECT * FROM task WHERE state = 'today'
         AND (snoozed_until IS NULL OR snoozed_until <= ?)
         AND COALESCE(est_minutes, 15) <= ?/*SKIP*/ ORDER BY created_at ASC, priority DESC LIMIT 1`, now, ceiling)) ??
    // 3.5 upcoming: not burning yet, but due in the next 72h — surface it now
    (await q(
      `SELECT * FROM task WHERE state = 'inbox'
         AND due_at IS NOT NULL AND due_at > ? AND due_at <= ?
         AND (snoozed_until IS NULL OR snoozed_until <= ?)
         AND COALESCE(est_minutes, 15) <= ?/*SKIP*/
         ORDER BY due_at ASC, priority DESC LIMIT 1`, soon, threeDays, now, ceiling)) ??
    // 4. inbox sorted by energy level — oldest for steady/focused, shortest for low
    (await q(
      `SELECT * FROM task WHERE state = 'inbox'
         AND (snoozed_until IS NULL OR snoozed_until <= ?)
         AND COALESCE(est_minutes, 15) <= ?/*SKIP*/
         ORDER BY ${inboxSort}, priority DESC LIMIT 1`, now, ceiling)) ??
    // 5. still nothing fits — offer the smallest thing rather than an empty screen
    (await q(
      `SELECT * FROM task WHERE state = 'inbox'
         AND (snoozed_until IS NULL OR snoozed_until <= ?)/*SKIP*/
         ORDER BY COALESCE(est_minutes, 999) ASC, created_at ASC, priority DESC LIMIT 1`, now)) ??
    null
  );
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

export async function inbox(limit = 50) {
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task WHERE state = 'inbox' AND parent_id IS NULL
      ORDER BY created_at DESC LIMIT ?`, limit);
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
  await db.runAsync(
    `UPDATE task SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
    ...keys.map(k => patch[k] as SQLite.SQLiteBindValue), id,
  );
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
  await db.runAsync(
    `UPDATE task SET state = 'dropped' WHERE parent_id = ? AND state NOT IN ('done','dropped')`,
    id);
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
    await db.runAsync(
      `INSERT INTO task (id, title, state, created_at, parent_id, est_minutes)
       VALUES (?, ?, 'today', ?, ?, 5)`,
      uid(), t, Date.now(), parentId,
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
export async function completeStep(stepId: string): Promise<Award> {
  const db = await getDb();
  const stepAward = await complete(stepId, false, 'step');
  const st = await getTask(stepId);
  if (!st?.parent_id) return stepAward;
  const left = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM task WHERE parent_id = ? AND state NOT IN ('done','dropped')`,
    st.parent_id);
  if ((left?.n ?? 0) === 0) return complete(st.parent_id);
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
 * to see what you'd skipped. That's what Settings > Show the intro again does.
 */
export async function resetOnboarding() {
  await setFlag('onboarded', '0');
  await setFlag('cal_asked', '');
  await setFlag('notif_asked', '');
}

export async function completeOnboarding() {
  await setFlag('onboarded', '1');
  await markActed();     // the ladder starts from "you just did something"
}

/** Replay Welcome → Auth without clearing app storage. Reachable from
 *  Settings → "Show the intro again". */

/* ---------------- who you are ---------------- */

export interface Profile { name: string; tagline: string }

/**
 * Stored locally, like everything else. A name is the cheapest personalisation
 * there is and it changes how the app reads — "Keep going, Kim" is a different
 * sentence from "Keep going". No account needed for it, and none is asked for.
 */
export async function getProfile(): Promise<Profile> {
  return {
    name: (await getFlag('profile.name')) ?? '',
    tagline: (await getFlag('profile.tagline')) ?? '',
  };
}
export async function setProfile(p: Partial<Profile>) {
  if (p.name !== undefined) await setFlag('profile.name', p.name);
  if (p.tagline !== undefined) await setFlag('profile.tagline', p.tagline);
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
    await db.runAsync(
      `INSERT INTO task (id,title,state,created_at,completed_at,retro)
       VALUES (?,?,'done',?,?,1)`, id, raw, whenMs, whenMs);
    await db.runAsync(
      `INSERT INTO event (task_id,kind,at,meta) VALUES (?,'completed',?,?)`,
      id, whenMs, JSON.stringify({ retro: true }));
    banked += (await grantLight('retro', id)).total;
    n++;
  }
  if (n) await markActed();
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

/** Where the three daily anchors sit. The ladder maths and the scheduler both
 *  read this, so they cannot drift apart. */
export const ANCHOR_SLOTS = [
  { id: 'anchor.morning',  hour: 9,  minute: 0 },
  { id: 'anchor.midday',   hour: 13, minute: 30 },
  { id: 'anchor.shutdown', hour: 20, minute: 0 },
] as const;

/** Count anchor firings strictly inside (from, to]. */
export function anchorsBetween(from: number, to: number): number {
  if (!(to > from)) return 0;
  let n = 0;
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  // 400 days of slack is far more than the ladder can ever need; it also stops
  // a bad clock or a restored backup from spinning here forever.
  for (let i = 0; i < 400; i++) {
    for (const s of ANCHOR_SLOTS) {
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

/** The last time the user did literally anything. Everything resets this. */
export async function markActed() {
  await setFlag('last_acted_at', String(Date.now()));
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
export async function softnessAt(atMs: number): Promise<Softness> {
  return softness(anchorsBetween(await lastActed(), atMs));
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
