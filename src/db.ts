import * as SQLite from 'expo-sqlite';

/**
 * Local-first. Nothing leaves the device.
 *
 * Two deliberate constraints from the spec:
 *  - `parent_id` is capped at ONE level of micro-steps. Unlimited nesting is how
 *    a task app becomes a second job.
 *  - There is NO overdue column and no overdue state. Not rendering one is
 *    different from being unable to represent one; this is the latter.
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
}

export type EventKind =
  | 'captured' | 'started' | 'paused' | 'completed'
  | 'skipped' | 'snoozed' | 'nudge_sent' | 'nudge_acted';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('nura.db');
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

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
    CREATE INDEX IF NOT EXISTS idx_nudge_fire   ON nudge(fire_at);
  `);
  return _db;
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

/** Capture is the cheapest possible write: a title and nothing else. */
export async function capture(title: string) {
  const db = await getDb();
  const id = uid();
  await db.runAsync(
    'INSERT INTO task (id, title, state, created_at) VALUES (?, ?, ?, ?)',
    id, title.trim(), 'inbox', Date.now(),
  );
  await logEvent('captured', id);
  return id;
}

export async function complete(id: string, partial = false) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE task SET state = ?, completed_at = ? WHERE id = ?',
    'done', Date.now(), id,
  );
  // Time spent counts. Stopping early still logs a win — this is the single
  // most important line in the app.
  await logEvent('completed', id, { partial });
}

/** "Not now" is a scheduling fact, not a failure. Nothing increments. */
export async function notNow(id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE task SET state = ? WHERE id = ?', 'inbox', id);
  await logEvent('skipped', id);
}

export type Energy = 'low' | 'steady' | 'focused';

export async function setEnergy(e: Energy) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_state (k, v) VALUES ('energy', ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v`, e);
  await logEvent('nudge_acted', undefined, { energy: e });
}

export async function getEnergy(): Promise<Energy> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ v: string }>(
    `SELECT v FROM app_state WHERE k = 'energy'`);
  return (r?.v as Energy) ?? 'steady';
}

/** What counts as "doable right now" at each energy level. */
const CEILING: Record<Energy, number> = { low: 10, steady: 30, focused: 999 };

/**
 * The NOW engine. Order matters more than the code:
 *   1 time-bound within 2h · 2 already started · 3 picked for today
 *   4 shortest thing in the inbox — momentum beats importance when nothing burns
 *   5 nothing at all -> the caller shows a past win instead of an empty screen
 */
export async function pickNow(): Promise<Task | null> {
  const db = await getDb();
  const now = Date.now();
  const soon = now + 2 * 60 * 60 * 1000;
  const ceiling = CEILING[await getEnergy()];

  const q = async (sql: string, ...args: SQLite.SQLiteBindValue[]) =>
    db.getFirstAsync<Task>(sql, ...args);

  return (
    // 1. anything genuinely time-bound still wins, whatever your energy —
    //    a deadline doesn't care how you feel
    (await q(
      `SELECT * FROM task WHERE state != 'done' AND state != 'dropped'
         AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at ASC LIMIT 1`, soon)) ??
    // 2. resume what you already started
    (await q(`SELECT * FROM task WHERE state = 'doing' ORDER BY created_at ASC LIMIT 1`)) ??
    // 3. picked for today, but only what fits the energy you actually have.
    //    "choose by energy, not guilt" — the landing page's promise, in SQL.
    (await q(
      `SELECT * FROM task WHERE state = 'today'
         AND COALESCE(est_minutes, 15) <= ? ORDER BY created_at ASC LIMIT 1`, ceiling)) ??
    // 4. nothing urgent: shortest thing that fits. momentum beats importance.
    (await q(
      `SELECT * FROM task WHERE state = 'inbox'
         AND COALESCE(est_minutes, 15) <= ?
         ORDER BY COALESCE(est_minutes, 999) ASC, created_at ASC LIMIT 1`, ceiling)) ??
    // 5. still nothing that fits — offer the smallest thing there is rather
    //    than an empty accusatory screen
    (await q(
      `SELECT * FROM task WHERE state = 'inbox'
         ORDER BY COALESCE(est_minutes, 999) ASC, created_at ASC LIMIT 1`)) ??
    null
  );
}

export async function inbox(limit = 50) {
  const db = await getDb();
  return db.getAllAsync<Task>(
    `SELECT * FROM task WHERE state = 'inbox' ORDER BY created_at DESC LIMIT ?`, limit);
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
}

const FIELDS: (keyof TaskPatch)[] =
  ['title', 'first_action', 'est_minutes', 'due_at', 'energy', 'state'];

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

/** Deliberately not DELETE — dropped tasks stay in the event log. */
export async function dropTask(id: string) {
  await updateTask(id, { state: 'dropped' });
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

/** Complete a step; if it was the last one, the parent completes itself. */
export async function completeStep(stepId: string) {
  const db = await getDb();
  await complete(stepId);
  const st = await getTask(stepId);
  if (!st?.parent_id) return;
  const left = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM task WHERE parent_id = ? AND state NOT IN ('done','dropped')`,
    st.parent_id);
  if ((left?.n ?? 0) === 0) await complete(st.parent_id);
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
  const db = await getDb();
  const r = await db.getFirstAsync<{ v: string }>(`SELECT v FROM app_state WHERE k='mode'`);
  return (r?.v as Mode) ?? 'nu';
}

export async function setMode(m: Mode) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_state (k,v) VALUES ('mode',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, m);
}

async function kv(k: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ v: string }>(`SELECT v FROM app_state WHERE k=?`, k);
  return r?.v ?? null;
}
async function setKv(k: string, v: string) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_state (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, v);
}

/* ---------------- migrations ---------------- */

export async function migrate() {
  const db = await getDb();
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(task)`);
  if (!cols.some(c => c.name === 'retro')) {
    await db.execAsync(`ALTER TABLE task ADD COLUMN retro INTEGER DEFAULT 0`);
  }
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS breadcrumb (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      note    TEXT,
      context TEXT,
      at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crumb_task ON breadcrumb(task_id);
  `);
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
 * with the feeling.
 */
export async function retroCapture(lines: string[], whenMs = Date.now() - 3 * 3600_000) {
  const db = await getDb();
  let n = 0;
  for (const raw of lines.map(l => l.trim()).filter(Boolean)) {
    const id = uid();
    await db.runAsync(
      `INSERT INTO task (id,title,state,created_at,completed_at,retro)
       VALUES (?,?,'done',?,?,1)`, id, raw, whenMs, whenMs);
    await db.runAsync(
      `INSERT INTO event (task_id,kind,at,meta) VALUES (?,'completed',?,?)`,
      id, whenMs, JSON.stringify({ retro: true }));
    n++;
  }
  return n;
}

/* ---------------- the softening ladder ---------------- */

/**
 * Every reminder app escalates when ignored. This one de-escalates.
 *
 *   0-1  the chosen task, normal voice
 *   2    swap to the shortest task there is
 *   3    drop to <=2 min, and the voice changes from prompt to offer
 *   4+   stop for the day; one re-entry tomorrow with no reference to today
 *
 * Any action at all resets it. The count is never displayed — the user should
 * notice only that the app got gentler, and preferably not consciously.
 */
export async function getStreak(kind: string) {
  return parseInt((await kv(`nudge_streak.${kind}`)) ?? '0', 10) || 0;
}
export async function bumpStreak(kind: string) {
  const n = (await getStreak(kind)) + 1;
  await setKv(`nudge_streak.${kind}`, String(n));
  return n;
}
export async function resetStreaks() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM app_state WHERE k LIKE 'nudge_streak.%'`);
}

export type Softness = { level: number; silent: boolean; offer: boolean; ceiling: number };

export function softness(streak: number): Softness {
  if (streak >= 4) return { level: 4, silent: true,  offer: true,  ceiling: 2 };
  if (streak === 3) return { level: 3, silent: false, offer: true,  ceiling: 2 };
  if (streak === 2) return { level: 2, silent: false, offer: false, ceiling: 10 };
  return { level: streak, silent: false, offer: false, ceiling: 999 };
}

/** Smallest thing available — what the ladder reaches for as it softens. */
export async function smallestTask(ceiling = 999) {
  const db = await getDb();
  return db.getFirstAsync<Task>(
    `SELECT * FROM task WHERE state NOT IN ('done','dropped') AND parent_id IS NULL
       AND COALESCE(est_minutes, 15) <= ?
     ORDER BY COALESCE(est_minutes, 999) ASC, created_at ASC LIMIT 1`, ceiling);
}
