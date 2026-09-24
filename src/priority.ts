/**
 * Priority — four levels, and a deliberate refusal to make it load-bearing.
 *
 * Priority in a task app is where guilt accumulates: everything gets marked
 * important, the flags stop meaning anything, and the red ones become a wall
 * of accusation you avoid opening. So here it is a TIEBREAK, not a tier — the
 * NOW engine still sorts by deadline, then by what fits your energy, and only
 * uses priority to choose between things that are otherwise equal.
 *
 * "Urgent" is deliberately absent. Everything that is genuinely urgent has a
 * date, and a date is a fact rather than a feeling.
 */

import { CEILING, type Task, type Energy } from './db';

export interface Priority { n: number; name: string; color: string; onLight: string }

export const PRIORITIES: Priority[] = [
  { n: 0, name: 'None',   color: '#7E87AC', onLight: '#7B7360' },
  { n: 1, name: 'Low',    color: '#7FC4FF', onLight: '#0369A1' },
  { n: 2, name: 'Medium', color: '#F5D07A', onLight: '#A16207' },
  { n: 3, name: 'High',   color: '#FF8A5C', onLight: '#C2410C' },
];

export const priorityOf = (n?: number | null): Priority =>
  PRIORITIES[Math.max(0, Math.min(3, n ?? 0))];

/**
 * Why THIS one. `pickNow()` in db.ts already has a real reason for every
 * task it hands you — a deadline, a resume, a fit with your energy — it
 * just never said so out loud. This mirrors its tiers (same order, same
 * CEILING) purely to put that reason into words on the hero card, so
 * "recommended" doesn't read as a black box. Returns null on the fallback
 * tier, where the honest answer is "nothing else was more due" — the card
 * just omits the line rather than inventing a reason.
 */
export function whyNow(task: Task, energy: Energy, now = Date.now()): string | null {
  const soon = now + 2 * 60 * 60 * 1000;
  const threeDays = now + 72 * 60 * 60 * 1000;

  if (task.due_at != null && task.due_at <= soon) {
    return task.due_at <= now ? 'past due' : 'due within the next couple of hours';
  }
  if (task.state === 'doing') return 'you already started this one';
  if (task.due_at != null && task.due_at <= threeDays) return 'due in the next few days';
  if (task.est_minutes != null && task.est_minutes <= CEILING[energy]) {
    return energy === 'low' ? 'short enough for right now' : 'fits the time you’ve got';
  }
  return null;
}
