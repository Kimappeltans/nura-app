import type { Task } from './db';
import { byPlan, type PlannerDecision } from './next';
import type { DayProposal } from './dayPlan';
import { localSuggestions, suggestionId, type SuggestContext } from './learn/suggest';
import type { InterventionType, Suggestion } from './learn/types';

/**
 * INTERVENTIONS — what the planner proposes to change (target architecture,
 * "Interventions"). Suggestion cards stop being a separate system with
 * their own idea of what matters: they read the same evidence as the next
 * action (the planner's order, the day plan, the learned profile), each
 * carries a type saying what Yes changes, and none is offered without a
 * Yes that works.
 *
 *   next_action        do this now: your good hour, or a small way back in
 *   resize_task        make it smaller: put off again and again
 *   reschedule         do it later today, at your good hour
 *   replan_project     let Nu plan it: it's really a project
 *   reduce_day         today holds more than you finish: keep a few
 *   return_after_gap   a few days away: one small thing
 *   increase_estimate  things like this take you longer than you guess
 *   rest               your day is done
 */

export interface InterventionContext extends SuggestContext {
  /** every live task, in the planner's order */
  decisions: PlannerDecision[];
  /** the day plan's proposal, when today holds more than it can */
  day: DayProposal | null;
}

/** What Yes changes, for a suggestion from any source. */
export function typeOf(s: Suggestion): InterventionType {
  switch (s.kind) {
    case 'best_time': return s.action?.type === 'schedule' ? 'reschedule' : 'next_action';
    case 'shrink': return 'resize_task';
    case 'estimate': return 'increase_estimate';
    case 'comeback': return 'return_after_gap';
    case 'plan_it': return 'replan_project';
    case 'rest': return 'rest';
    case 'reduce_day': return 'reduce_day';
    case 'batch': return 'next_action';
    default:
      return s.action?.type === 'shrink' ? 'resize_task'
        : s.action?.type === 'plan' ? 'replan_project'
        : s.action?.type === 'set_minutes' ? 'increase_estimate'
        : s.action?.type === 'schedule' ? 'reschedule'
        : s.action?.type === 'none' ? 'rest'
        : 'next_action';
  }
}

const short = (s: string) => (s.length > 32 ? s.slice(0, 31).trimEnd() + '…' : s);

/** "A", "A and B", "A, B and C", "A, B and 2 more" */
export function names(titles: string[]): string {
  const q = titles.map(t => `“${short(t)}”`);
  if (q.length <= 1) return q[0] ?? '';
  if (q.length <= 3) return `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`;
  return `${q.slice(0, 2).join(', ')} and ${q.length - 2} more`;
}

/** The day plan's proposal as something to say yes or no to. */
export function reduceDay(day: DayProposal, nowMs: number): Suggestion {
  return {
    id: suggestionId('reduce_day', undefined, nowMs),
    kind: 'reduce_day',
    type: 'reduce_day',
    who: 'nu',
    source: 'local',
    text: `Today holds more than ${day.learned ? 'you usually finish' : 'there’s time for'}. Keep ${names(day.keep.map(d => d.task.title))}, and leave the rest for later?`,
    why: day.reason,
    taskIds: [...day.keep, ...day.defer].map(d => d.taskId),
    action: { type: 'reduce_day', keep: day.keep.map(d => d.taskId), defer: day.defer.map(d => d.taskId) },
    // a day that doesn't fit matters more than advice about one task in it
    confidence: day.learned ? 0.9 : 0.8,
  };
}

/** Every intervention worth offering now, typed; rank() (learn/suggest.ts) picks what to show. */
export function interventionsFrom(c: InterventionContext): Suggestion[] {
  // the rules read tasks in the planner's order, so "the first thing on Today" is the planner's first
  const order = byPlan(c.decisions, (a: Task, b: Task) => a.created_at - b.created_at);
  const out = localSuggestions({ ...c, tasks: [...c.tasks].sort(order) }).map(s => {
    // a batch is several small things: Yes starts on the first of them
    if (s.kind === 'batch' && !s.taskId && s.taskIds?.length) {
      return { ...s, taskId: s.taskIds[0], action: { ...(s.action ?? { type: 'focus' as const }), type: 'focus' as const } };
    }
    return s;
  });
  // past your day's end the only advice is rest (localSuggestions already
  // returned just that); otherwise a smaller day, when today is too full
  const pastEnd = out.length === 1 && out[0].kind === 'rest' && c.day == null;
  if (c.day && !pastEnd) out.push(reduceDay(c.day, c.nowMs));
  return out.map(s => ({ ...s, type: s.type ?? typeOf(s) }));
}
