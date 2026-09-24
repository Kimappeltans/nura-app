import type { UpcomingEvent } from './calendar';
import type { Task } from './db';

/**
 * Does what's left of today actually fit in what's left of today?
 *
 * Nobody has a "workday end" setting here — that's a real gap, not a
 * design choice, and DAY_END_H is a placeholder until there's somewhere to
 * put a real one. Everything else is arithmetic: how much of the remaining
 * time is already claimed by the calendar, how much the remaining tasks
 * are guessed to need, and whether the second number is bigger than what's
 * left over after the first.
 */
const DAY_END_H = 21;
const DEFAULT_TASK_MIN = 15;   // a task with no estimate gets a plain, unremarkable guess

export interface Capacity {
  bookedMin: number;
  taskMin: number;
  freeMin: number;
  fits: boolean;
  overflowMin: number;
}

export function capacityFor(
  events: UpcomingEvent[], tasks: Task[], now = Date.now(),
): Capacity {
  const until = new Date(now);
  until.setHours(DAY_END_H, 0, 0, 0);
  const untilMs = Math.max(now, until.getTime());

  const clip = (s: number, e: number) => Math.max(0, Math.min(e, untilMs) - Math.max(s, now));
  const bookedMin = Math.round(
    events.reduce((sum, e) => sum + clip(e.startsAt, e.endsAt), 0) / 60000,
  );

  const taskMin = tasks.reduce((sum, x) => sum + (x.est_minutes ?? DEFAULT_TASK_MIN), 0);

  const windowMin = Math.round((untilMs - now) / 60000);
  const freeMin = Math.max(0, windowMin - bookedMin);
  const fits = taskMin <= freeMin;

  return { bookedMin, taskMin, freeMin, fits, overflowMin: fits ? 0 : taskMin - freeMin };
}
