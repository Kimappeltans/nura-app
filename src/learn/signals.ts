import { getDb, getFlag, setFlag } from '../db';
import type { BehaviorProfile, RateBucket } from './types';

/**
 * CAPTURE — how you work, read off what the app already writes down.
 *
 * Nothing new is logged for this. The event table (sessions, completions,
 * snoozes), the task table and the project log already hold the answers;
 * this only counts them. The arithmetic lives in profileFrom(), which takes
 * plain rows, so it can be tested without a database — buildProfile() is
 * just the three queries that feed it.
 *
 * Numbers only. No titles, no notes, nothing you typed — see profileSummary(),
 * the one thing here that may leave the phone.
 */

const DAY = 86_400_000;
/** how far back the patterns look — long enough to see a habit, short enough to notice it change */
export const WINDOW_DAYS = 42;
/** below this many days, anything that looks like a pattern is a guess */
export const MIN_DAYS = 5;
/** a completion this soon after a session start belongs to that session */
const SESSION_LINK_MS = 6 * 3600_000;

export interface EventRow { task_id: string | null; kind: string; at: number; meta: string | null }
export interface TaskRow {
  id: string;
  label: string | null;
  created_at: number;
  completed_at: number | null;
  parent_id: string | null;
}
export interface ProjectEventRow { kind: string; at: number }

export interface ProfileInput {
  /** the event log over the window, any order */
  events: EventRow[];
  /** top-level tasks created or finished in the window, plus everything still open */
  tasks: TaskRow[];
  projectEvents: ProjectEventRow[];
  /** the last event of any kind before today began — for the gap */
  lastBeforeToday: number | null;
}

/* ---------------- small pure helpers ---------------- */

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** local calendar date, so "a day" is the person's day, not UTC's */
export function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** whole calendar days between two moments (Math.round absorbs a DST hour) */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((startOfDay(toMs) - startOfDay(fromMs)) / DAY);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseMeta(m: string | null): any {
  if (!m) return null;
  try { return JSON.parse(m); } catch { return null; }
}

/** a rate with a gentle prior, so one lucky attempt doesn't top the chart */
export const smoothedRate = (b: RateBucket) => (b.completed + 1) / (b.started + 2);

/* ---------------- the arithmetic ---------------- */

export function profileFrom(input: ProfileInput, now = Date.now()): BehaviorProfile {
  const since = now - WINDOW_DAYS * DAY;
  const events = input.events
    .filter(e => e.at >= since && e.at <= now)
    .sort((a, b) => a.at - b.at);

  const days = new Set(events.map(e => dayKeyOf(e.at))).size;
  const enough = days >= MIN_DAYS;

  // Attempts: every focus session is one, and so is a task ticked off with no
  // session behind it. A session "got done" if it ended with the task done.
  const attempts: { at: number; done: boolean }[] = [];
  const openStart = new Map<string, number>();   // task → index into attempts
  const lastStart = new Map<string, number>();   // task → when its last session began
  const sessionMin: number[] = [];
  let ended = 0, early = 0;
  const perTask = new Map<string, { est: number | null; minutes: number; done: boolean }>();
  const putOffs = new Map<string, number>();

  for (const e of events) {
    const id = e.task_id;
    if (!id) continue;
    const m = parseMeta(e.meta);
    if (e.kind === 'session_start') {
      openStart.set(id, attempts.length);
      lastStart.set(id, e.at);
      attempts.push({ at: e.at, done: false });
      const est = typeof m?.est === 'number' && m.est > 0 ? m.est : null;
      const t = perTask.get(id) ?? { est: null, minutes: 0, done: false };
      if (t.est == null) t.est = est;   // the guess as it stood the first time
      perTask.set(id, t);
    } else if (e.kind === 'session_end') {
      const i = openStart.get(id);
      if (i != null && m?.done) attempts[i].done = true;
      openStart.delete(id);
      const minutes = typeof m?.minutes === 'number' ? m.minutes : null;
      if (minutes != null && minutes > 0) {
        sessionMin.push(minutes);
        ended++;
        // Stop pressed before the clock ran out, and the task still open
        const planned = typeof m?.planned === 'number' ? m.planned : 0;
        if (!m?.done && planned > 0 && minutes < planned * 0.9) early++;
        const t = perTask.get(id) ?? { est: typeof m?.est === 'number' && m.est > 0 ? m.est : null, minutes: 0, done: false };
        t.minutes += minutes;
        if (m?.done) t.done = true;
        perTask.set(id, t);
      }
    } else if (e.kind === 'completed') {
      const s = lastStart.get(id);
      if (s == null || e.at - s > SESSION_LINK_MS) attempts.push({ at: e.at, done: true });
    } else if ((e.kind === 'skipped' && !m?.dropped) || e.kind === 'swapped') {
      putOffs.set(id, (putOffs.get(id) ?? 0) + 1);
    }
  }

  const byHour: RateBucket[] = Array.from({ length: 24 }, (_, key) => ({ key, started: 0, completed: 0 }));
  const byWeekday: RateBucket[] = Array.from({ length: 7 }, (_, key) => ({ key, started: 0, completed: 0 }));
  for (const a of attempts) {
    const d = new Date(a.at);
    const h = byHour[d.getHours()], w = byWeekday[d.getDay()];
    h.started++; w.started++;
    if (a.done) { h.completed++; w.completed++; }
  }

  const bestHours = !enough ? [] : byHour
    .filter(b => b.started >= 2 && b.completed >= 2)
    .sort((a, b) => smoothedRate(b) - smoothedRate(a) || b.completed - a.completed)
    .slice(0, 3)
    .map(b => b.key);

  // actual ÷ guessed, per task that got finished on the timer — all its
  // sessions added up, since a two-sitting job is still one job
  const ratios = [...perTask.values()]
    .filter(t => t.done && t.est && t.minutes > 0)
    .map(t => t.minutes / (t.est as number))
    .filter(r => r >= 0.1 && r <= 10);   // a forgotten timer isn't an estimate
  const estimateRatio = enough && ratios.length ? round2(median(ratios) as number) : null;

  const typical = median(sessionMin);

  // the same, per label: which kinds of task run long for you
  const labelOf = new Map(input.tasks.map(t => [t.id, t.label]));
  const perLabel = new Map<string, number[]>();
  for (const [id, t] of perTask) {
    const label = labelOf.get(id);
    if (!label || !t.done || !t.est || t.minutes <= 0) continue;
    const r = t.minutes / t.est;
    if (r < 0.1 || r > 10) continue;
    perLabel.set(label, [...(perLabel.get(label) ?? []), r]);
  }
  const estimateByLabel = !enough ? [] : [...perLabel.entries()]
    .filter(([, rs]) => rs.length >= 3)
    .map(([label, rs]) => ({ label, ratio: round2(median(rs) as number), n: rs.length }));

  // what a day really holds: minutes on the timer, plus 15 for each thing
  // ticked off without one, on the days in the last 14 where something got done
  const recent = startOfDay(now) - 13 * DAY;
  const perDay = new Map<string, number>();
  const timed = new Set<string>();
  for (const e of events) {
    if (e.at < recent || !e.task_id) continue;
    const m = parseMeta(e.meta);
    if (e.kind === 'session_end' && typeof m?.minutes === 'number' && m.minutes > 0) {
      perDay.set(dayKeyOf(e.at), (perDay.get(dayKeyOf(e.at)) ?? 0) + m.minutes);
      timed.add(`${e.task_id}:${dayKeyOf(e.at)}`);
    }
  }
  for (const e of events) {
    if (e.at < recent || e.kind !== 'completed' || !e.task_id) continue;
    if (timed.has(`${e.task_id}:${dayKeyOf(e.at)}`)) continue;
    perDay.set(dayKeyOf(e.at), (perDay.get(dayKeyOf(e.at)) ?? 0) + 15);
  }
  const dayMinutes = [...perDay.values()];
  const capacityMin = dayMinutes.length >= MIN_DAYS ? Math.round(median(dayMinutes) as number) : null;

  // put off, per task, by label — only labels with a few tasks behind them
  const byLabel = new Map<string, { n: number; off: number }>();
  for (const t of input.tasks) {
    if (t.parent_id || !t.label) continue;
    const g = byLabel.get(t.label) ?? { n: 0, off: 0 };
    g.n++; g.off += putOffs.get(t.id) ?? 0;
    byLabel.set(t.label, g);
  }
  const putOffByLabel = !enough ? [] : [...byLabel.entries()]
    .filter(([, g]) => g.n >= 3)
    .map(([label, g]) => ({ label, rate: round2(g.off / g.n), n: g.n }))
    .sort((a, b) => b.rate - a.rate);

  // how a project's move usually ends: done, or replanned as too big / blocked
  const pe = input.projectEvents.filter(p => p.at >= since);
  const tooBig = pe.filter(p => p.kind === 'too_big').length;
  const blocked = pe.filter(p => p.kind === 'blocked').length;
  const stepOutcomes = tooBig + blocked + pe.filter(p => p.kind === 'done').length;
  const projOk = enough && stepOutcomes >= 3;

  const top = input.tasks.filter(t => !t.parent_id);
  const completedDays14 = new Set(
    events.filter(e => e.kind === 'completed' && e.at >= startOfDay(now) - 13 * DAY).map(e => dayKeyOf(e.at)));

  return {
    at: now,
    days,
    byHour,
    byWeekday,
    bestHours,
    estimateRatio,
    estimateN: ratios.length,
    typicalSessionMin: enough && typical != null ? Math.round(typical) : null,
    earlyStopRate: enough && ended >= 3 ? round2(early / ended) : null,
    putOffByLabel,
    tooBigRate: projOk ? round2(tooBig / stepOutcomes) : null,
    blockedRate: projOk ? round2(blocked / stepOutcomes) : null,
    captured7: top.filter(t => t.created_at >= now - 7 * DAY && t.created_at <= now).length,
    completed7: top.filter(t => t.completed_at != null && t.completed_at >= now - 7 * DAY && t.completed_at <= now).length,
    activeDays14: completedDays14.size,
    gapDays: input.lastBeforeToday != null && input.lastBeforeToday < startOfDay(now)
      ? daysBetween(input.lastBeforeToday, now) : 0,
    estimateByLabel,
    capacityMin,
    capacityDays: dayMinutes.length,
  };
}

/* ---------------- plain words, for the model ---------------- */

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export const partOf = (h: number): DayPart =>
  h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';

/** how many completions fell in each part of the day */
export function completionsByPart(p: BehaviorProfile): Record<DayPart, number> {
  const r: Record<DayPart, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const b of p.byHour) r[partOf(b.key)] += b.completed;
  return r;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The profile as a few factual lines — what a model gets instead of your
 * data. Counts, rates, hours and the eight fixed label names; never a title,
 * a note or anything typed. Kept under ~600 characters.
 */
export function profileSummary(p: BehaviorProfile): string {
  const out: string[] = [`History: ${p.days} active day${p.days === 1 ? '' : 's'} in the last ${WINDOW_DAYS}.`];
  if (p.days < MIN_DAYS) out.push('Too little history for patterns yet.');

  const total = p.byHour.reduce((s, b) => s + b.completed, 0);
  if (p.bestHours.length) out.push(`Finishes most reliably around ${p.bestHours.map(h => `${h}:00`).join(', ')}.`);
  if (p.days >= MIN_DAYS && total >= 5) {
    const parts = completionsByPart(p);
    const [part, k] = (Object.entries(parts) as [DayPart, number][]).sort((a, b) => b[1] - a[1])[0];
    out.push(`${k} of ${total} completions in the ${part}.`);
    const wd = p.byWeekday.filter(b => b.started >= 2).sort((a, b) => smoothedRate(b) - smoothedRate(a))[0];
    if (wd) out.push(`Best weekday: ${WEEKDAY[wd.key]}.`);
  }
  if (p.estimateRatio != null) out.push(`Tasks take ${p.estimateRatio}x the estimate (median of ${p.estimateN ?? '?'}).`);
  if (p.typicalSessionMin != null) out.push(`Focus sessions ~${p.typicalSessionMin} min.`);
  if (p.earlyStopRate != null) out.push(`${pct(p.earlyStopRate)} of sessions stopped early.`);
  const off = p.putOffByLabel.filter(l => l.rate > 0).slice(0, 2);
  if (off.length) out.push(`Put off most: ${off.map(l => `${l.label} (${l.rate}/task, ${l.n} tasks)`).join(', ')}.`);
  if (p.tooBigRate != null) out.push(`Project steps: ${pct(p.tooBigRate)} replanned as too big, ${pct(p.blockedRate ?? 0)} blocked.`);
  out.push(`Last 7 days: ${p.captured7} captured, ${p.completed7} done. Something done on ${p.activeDays14} of the last 14 days.`);
  if (p.gapDays >= 3) out.push(`Back after ${p.gapDays} days away.`);

  let s = out.join(' ');
  if (s.length > 600) s = s.slice(0, 597).replace(/\s+\S*$/, '') + '...';
  return s;
}

/* ---------------- the database side ---------------- */

/** Three queries over the window, then the arithmetic above. */
export async function buildProfile(now = Date.now()): Promise<BehaviorProfile> {
  const db = await getDb();
  const since = now - WINDOW_DAYS * DAY;
  const [events, tasks, projectEvents, last] = await Promise.all([
    db.getAllAsync<EventRow>(
      `SELECT task_id, kind, at, meta FROM event
        WHERE at >= ? AND kind IN ('session_start','session_end','completed','skipped','swapped','captured','acted')
        ORDER BY at ASC`, since),
    db.getAllAsync<TaskRow>(
      `SELECT id, label, created_at, completed_at, parent_id FROM task
        WHERE parent_id IS NULL
          AND (created_at >= ? OR completed_at >= ? OR state NOT IN ('done','dropped'))`, since, since),
    db.getAllAsync<ProjectEventRow>(
      `SELECT kind, at FROM project_event WHERE at >= ? AND kind IN ('too_big','blocked','done')`, since),
    db.getFirstAsync<{ at: number | null }>(`SELECT MAX(at) AS at FROM event WHERE at < ?`, startOfDay(now)),
  ]);
  return profileFrom({ events, tasks, projectEvents, lastBeforeToday: last?.at ?? null }, now);
}

const CACHE_KEY = 'learn.profile';
let _building: Promise<BehaviorProfile> | null = null;

/**
 * The profile, from the cache when it's fresh. Recomputed after `maxAgeMs`
 * or on a new day (the gap and "today" move at midnight). Concurrent callers
 * share one computation.
 */
export async function getProfile(maxAgeMs = 3 * 3600_000): Promise<BehaviorProfile> {
  const now = Date.now();
  try {
    const cached = JSON.parse((await getFlag(CACHE_KEY)) ?? 'null') as BehaviorProfile | null;
    if (cached && typeof cached.at === 'number' && now - cached.at < maxAgeMs && dayKeyOf(cached.at) === dayKeyOf(now)) {
      return cached;
    }
  } catch { /* a bad cache is only a cache — rebuild */ }
  if (_building) return _building;
  _building = (async () => {
    try {
      const p = await buildProfile(now);
      await setFlag(CACHE_KEY, JSON.stringify(p));
      return p;
    } finally {
      _building = null;
    }
  })();
  return _building;
}
