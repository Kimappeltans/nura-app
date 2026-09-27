import type { PlannerDecision } from './next';
import { DEFAULT_MINUTES } from './next';

/**
 * THE DAY PLAN (target architecture, "Making today smaller"). Today is what
 * you put on it; the planner compares it with what a day of yours really
 * holds, and when it's clearly more, Nu offers a smaller day: keep the few
 * that matter most, leave the rest for later. Never silently: one tap to
 * accept, one to undo, and nothing is ever called late or missed.
 *
 * Capacity comes from what you actually finish (the `capacity` pattern:
 * minutes done on a day you do something). Until Nura has learned that, it
 * is only the time left before your day ends, minus your events.
 */

export interface DayProposal {
  keep: PlannerDecision[];
  defer: PlannerDecision[];
  /** minutes planned on Today, at your real pace */
  planned: number;
  /** what the day can hold */
  capacity: number;
  /** capacity came from what you really finish, not just the clock */
  learned: boolean;
  /** "About 4 h planned · you usually finish 1 h 30" */
  reason: string;
}

/** Room to spare before Nu says anything: a day a little over is still a day. */
const SLACK = 1.15;

export const minutesOf = (d: PlannerDecision) => d.suggestedMinutes ?? d.task.est_minutes ?? DEFAULT_MINUTES;

/** 90 → "1 h 30", 45 → "45 min", 120 → "2 h". */
export function hm(m: number): string {
  const r = Math.max(0, Math.round(m / 5) * 5);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60), rest = r % 60;
  return rest ? `${h} h ${rest}` : `${h} h`;
}

/**
 * What the day could be. `today` is Today in the planner's order;
 * `learned` is the capacity pattern (null until trusted); `timeLeft` is the
 * minutes before your day ends, less your events.
 */
export function proposeDay(today: PlannerDecision[], o: { learned: number | null; timeLeft: number; doneToday: number }): DayProposal | null {
  if (today.length < 3 || o.timeLeft <= 0) return null;
  const learnedLeft = o.learned != null ? Math.max(0, o.learned - o.doneToday) : null;
  const capacity = Math.min(o.timeLeft, learnedLeft ?? o.timeLeft);
  const planned = today.reduce((a, d) => a + minutesOf(d), 0);
  if (planned <= capacity * SLACK || capacity <= 0) return null;

  // what stays whatever happens: your pick, what's under way, what's due today
  const must = (d: PlannerDecision) => (d.factors.user_pin ?? 0) > 0 || d.task.state === 'doing' || (d.factors.deadline ?? 0) >= 30;
  const keep: PlannerDecision[] = [], defer: PlannerDecision[] = [];
  let used = 0;
  for (const d of today) {
    const m = minutesOf(d);
    if (must(d) || used + m <= capacity || keep.length === 0) { keep.push(d); used += m; }
    else defer.push(d);
  }
  if (!defer.length) return null;
  const learned = learnedLeft != null && learnedLeft < o.timeLeft;
  const reason = `About ${hm(planned)} planned · ${learned ? `you usually finish ${hm(o.learned as number)}` : `${hm(o.timeLeft)} left today`}`;
  return { keep, defer, planned, capacity, learned, reason };
}
