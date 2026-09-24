import type { HabitLog } from './db';

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
    logs.filter(l => l.at >= since).map(l => new Date(l.at).toLocaleDateString('en-CA')),
  );
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);

  return {
    loggedDays: loggedDates.size,
    windowDays: window,
    rate: window > 0 ? Math.min(1, loggedDates.size / window) : 0,
    doneToday: logs.some(l => l.at >= startOfToday),
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
