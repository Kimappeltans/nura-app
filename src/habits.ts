import type { Habit, HabitLog } from './db';

/**
 * Cue-based habits — the layer above recurring tasks.
 *
 * A recurring task fires on the clock ("every day at 7:00") and stays a
 * calendar obligation you either did or didn't. A habit is defined by a
 * CUE ("after I make coffee") and a tiny action, and the whole point is
 * that repeating it in that same real-world moment is what makes it
 * automatic — the app is training wheels here, not the mechanism.
 *
 * Two rules carried straight over from reward.ts's philosophy:
 *  1. NO STREAK. A miss doesn't erase anything that came before it.
 *  2. RECOVERY, not reset. The only question after a missed day is
 *     "did it happen at the next cue", never "how many did you lose".
 *
 * One honest limitation: the app can't detect when a cue actually occurs
 * (it doesn't know when you had your first coffee), so `statsFor` measures
 * the nearest thing it CAN see — whether the habit got logged on a given
 * day — rather than a true cue-linked completion rate. Good enough to
 * notice "this one's sticking" or "this one keeps not happening", not
 * precise enough to grade.
 */

export interface HabitStats {
  loggedDays: number;
  windowDays: number;
  rate: number;              // 0..1, over windowDays
  doneToday: boolean;
  /** a habit a few days old doesn't get judged, it gets encouragement */
  established: boolean;
}

export function statsFor(logs: HabitLog[], createdAt: number, windowDays = 14, now = Date.now()): HabitStats {
  const daysOld = Math.max(1, Math.ceil((now - createdAt) / 86400_000));
  const window = Math.min(windowDays, daysOld);
  const since = now - window * 86400_000;

  const loggedDates = new Set(
    logs.filter(l => l.at >= since && l.did_minimum !== LOG_TAKEN_BACK).map(l => new Date(l.at).toLocaleDateString('en-CA')),
  );
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);

  return {
    loggedDays: loggedDates.size,
    windowDays: window,
    rate: window > 0 ? Math.min(1, loggedDates.size / window) : 0,
    doneToday: logs.some(l => l.at >= startOfToday && l.did_minimum !== LOG_TAKEN_BACK),
    established: daysOld >= 5,
  };
}

/** Plain words for the rate — never a percentage sold as a grade. Used to
 *  decide how much visual weight a habit gets, not to shame it: a
 *  struggling habit is shown MORE plainly, not flagged red. */
export function rateLine(stats: HabitStats): string {
  if (!stats.established) return 'Just getting started.';
  if (stats.rate >= 0.8) return 'Sticking, most days.';
  if (stats.rate >= 0.4) return 'Happening, on and off.';
  return 'Still finding its moment.';
}

/**
 * How loudly this habit should ask. Fades toward quiet as it establishes —
 * the closest this app comes to the "reduce prompts as it becomes
 * automatic" idea, expressed as visual/interaction weight rather than a
 * real push-notification schedule (that's a further step; see Phase 5's
 * note in the plan).
 */
export function askWeight(stats: HabitStats): 'loud' | 'normal' | 'quiet' {
  if (!stats.established) return 'normal';
  if (stats.rate >= 0.8) return 'quiet';
  if (stats.rate < 0.3) return 'loud';
  return 'normal';
}

/* ------------------------------------------------------------------ *
 *  Habits in Your Tasks: a row each, a tick for today, and a count
 *  that only rises. Pure, so tests/habits.test.cjs can check it.
 * ------------------------------------------------------------------ */

/** habit.active: on, paused, or let go. Let go is kept as a row (a tombstone),
 *  not deleted, because sync carries rows and never a delete (src/sync.ts):
 *  a deleted habit would come back from the account on the next sign in. */
export const HABIT_ON = 1;
export const HABIT_PAUSED = 0;
export const HABIT_LET_GO = -1;

/** habit_log.did_minimum: the day's log was taken back (undo, the same day).
 *  The row stays and is marked, for the same reason as HABIT_LET_GO. */
export const LOG_TAKEN_BACK = -1;

/** A local calendar day, as 2026-09-27. */
export const dayKey = (at: number) => new Date(at).toLocaleDateString('en-CA');

const counts = (l: Pick<HabitLog, 'did_minimum'>) => l.did_minimum !== LOG_TAKEN_BACK;

/** How many days it happened, ever. Only rises: a missed day takes nothing
 *  away; only taking back today's own tick, the same day, lowers it. */
export function timesDone(logs: Pick<HabitLog, 'at' | 'did_minimum'>[]): number {
  return new Set(logs.filter(counts).map(l => dayKey(l.at))).size;
}

export function isDoneToday(logs: Pick<HabitLog, 'at' | 'did_minimum'>[], now = Date.now()): boolean {
  const today = dayKey(now);
  return logs.some(l => counts(l) && dayKey(l.at) === today);
}

/**
 * What ticking today does to the log: no log today, add one; one that
 * counts, take it back; one taken back, count it again. Today's row is
 * reused rather than a new one added each time, so ticking on and off
 * leaves one row a day.
 */
export type TodayStep =
  | { kind: 'add'; done: true }
  | { kind: 'set'; ids: string[]; to: 0 | typeof LOG_TAKEN_BACK; done: boolean };

export function todayToggle(logs: Pick<HabitLog, 'id' | 'at' | 'did_minimum'>[], now = Date.now()): TodayStep {
  const today = dayKey(now);
  const mine = logs.filter(l => dayKey(l.at) === today);
  const on = mine.filter(counts);
  if (on.length) return { kind: 'set', ids: on.map(l => l.id), to: LOG_TAKEN_BACK, done: false };
  if (mine.length) return { kind: 'set', ids: [mine[mine.length - 1].id], to: 0, done: true };
  return { kind: 'add', done: true };
}

export interface HabitView {
  habit: Habit;
  times: number;
  doneToday: boolean;
  paused: boolean;
}

/** The rows for Your Tasks: habits that are on, oldest first, then the
 *  paused ones at the bottom. A habit let go isn't listed. */
export function habitViews(habits: Habit[], logs: Pick<HabitLog, 'habit_id' | 'at' | 'did_minimum'>[], now = Date.now()): HabitView[] {
  const byHabit = new Map<string, Pick<HabitLog, 'at' | 'did_minimum'>[]>();
  for (const l of logs) {
    const xs = byHabit.get(l.habit_id);
    if (xs) xs.push(l); else byHabit.set(l.habit_id, [l]);
  }
  return habits
    .filter(h => h.active !== HABIT_LET_GO)
    .map(h => {
      const mine = byHabit.get(h.id) ?? [];
      return { habit: h, times: timesDone(mine), doneToday: isDoneToday(mine, now), paused: h.active === HABIT_PAUSED };
    })
    .sort((a, b) => Number(a.paused) - Number(b.paused) || a.habit.created_at - b.habit.created_at);
}

/** A habit's one value on the right, when it isn't done today. */
export function habitValue(v: Pick<HabitView, 'times' | 'paused'>): { big: string; small: string } {
  if (v.paused) return { big: '', small: 'Paused' };
  if (v.times === 0) return { big: '', small: 'New' };
  return { big: String(v.times), small: v.times === 1 ? 'time' : 'times' };
}

/** A habit's name: what you do, with a capital. */
export const habitName = (h: Pick<Habit, 'action'>) => h.action.charAt(0).toUpperCase() + h.action.slice(1);
