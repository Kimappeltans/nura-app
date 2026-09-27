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

import type { Task, Energy, PickRule } from './db';

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
 * Why THIS one — the rule the engine actually used, put into words. The rule
 * comes back from db.pickWithRule() with the task, so this can't drift from
 * the engine the way the old whyNow() could: that re-derived the tiers here,
 * a second copy that had already fallen out of step (it never mentioned a
 * task you'd picked for today, or one you'd chosen yourself).
 */
export function whyLine(rule: PickRule | null, task: Task, energy: Energy, now = Date.now()): string | null {
  switch (rule) {
    case 'chosen':   return 'you picked it';
    case 'due':      return task.due_at != null && task.due_at <= now ? 'past due' : 'due within the next couple of hours';
    case 'started':  return 'you already started this one';
    case 'today':    return (task.priority ?? 0) > 0
      ? `top of your Today, ${['', 'low', 'medium', 'high'][task.priority ?? 0]} priority`
      : 'next on your Today list';
    case 'priority': return `you marked it ${['', 'low', 'medium', 'high'][task.priority ?? 0]} priority`;
    case 'upcoming': return 'due in the next few days';
    case 'fits':     return energy === 'low' ? 'short enough for right now' : 'fits the time you’ve got';
    case 'smallest': return 'the smallest thing there is';
    default:         return null;
  }
}

/**
 * The facts behind the one in front, as one quiet line on its card: when it
 * fits before (the next thing with a time, else the end of your day), when
 * it's due, and a high priority. At most two, joined with a dot. Never a
 * sentence of reasons, and never late or overdue (guidelines, rules 7 and 8).
 */
export function factLine(task: Task, anchors: number[], dayEndMin: number, now = Date.now()): string | null {
  const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const facts: string[] = [];
  const mins = task.est_minutes ?? 0;
  if (mins > 0) {
    const end = new Date(now); end.setHours(0, dayEndMin, 0, 0);
    // only what's still ahead today counts: tomorrow's 6 PM is not today's limit
    const next = anchors.filter(a => a > now && a <= end.getTime() && a !== task.due_at).sort((a, b) => a - b)[0];
    const until = next ?? (end.getTime() > now ? end.getTime() : null);
    if (until && now + mins * 60000 <= until) facts.push(`Fits before ${clock(until)}`);
  }
  if (task.due_at && new Date(task.due_at).toDateString() === new Date(now).toDateString()) {
    if (!task.has_time) facts.push('Due today');
    else if (task.due_at > now) facts.push(`Due at ${clock(task.due_at)}`);
  }
  if ((task.priority ?? 0) >= 3) facts.push('High priority');
  return facts.length ? facts.slice(0, 2).join(' · ') : null;
}
