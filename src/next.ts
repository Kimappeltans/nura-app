import type { Task, Energy, PatternRow } from './db';

/**
 * THE NEXT-ACTION ENGINE — the one planner (target architecture, "The
 * planner contract"). Every place that puts a task in front of you asks
 * this: Home's front card, Ra's one thing and its three options, the fact
 * line, the day plan. There is no second set of rules anywhere else.
 *
 * Deterministic on purpose: no model decides what comes next. Each factor
 * is kept separately, so when Nura makes a strange pick the answer to "why
 * this one?" is right there in `factors`, and the plain `reason` shown on
 * the card is built from the same numbers.
 *
 * Guidelines still hold: a reason is at most two facts, never a sentence of
 * reasons, never "late" or "overdue". Put-offs lower a task a little; they
 * never bury it, and they are never shown as a number.
 */

export type PlannerSignal =
  | 'user_pin' | 'deadline' | 'priority' | 'project_dependency' | 'available_time'
  | 'energy_fit' | 'historical_duration' | 'repeated_putoff' | 'recent_progress'
  | 'blocked_project' | 'waiting';

export interface PlannerDecision {
  taskId: string;
  task: Task;
  score: number;
  factors: Partial<Record<PlannerSignal, number>>;
  /** at most two plain facts: "Fits before 7:30 PM · Due today" */
  reason: string | null;
  /** every fact, in the card's order; the desktop's next move shows up to three */
  facts: string[];
  /** your estimate, adjusted by how long things like it really take you */
  suggestedMinutes: number | null;
}

/** What the engine knows about a task that is a project's move. */
export interface MoveInfo { project: string; touchedAt: number; blocked: boolean }

export interface NextContext {
  now: number;
  /** minutes after midnight when your day ends (may run past 24 h) */
  dayEndMin: number;
  energy: Energy;
  /** things with a time today that a task has to fit before: events, timed tasks */
  anchors: number[];
  /** the task you chose yourself, held until it's done */
  pinId?: string | null;
  /** passed on today with Something else */
  passedIds?: string[];
  /** tasks that are a project's current move */
  moves?: Map<string, MoveInfo>;
  patterns?: Pick<PatternRow, 'kind' | 'scope' | 'value' | 'confidence' | 'sample_count'>[];
  /** recent not now / something else when the planner offered it, per task */
  putOffs?: Map<string, number>;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A task with no estimate counts as this long. */
export const DEFAULT_MINUTES = 15;
/** A pattern with less confidence than this doesn't change anything. */
const TRUSTED = 0.5;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
const roundTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

function pattern(ctx: NextContext, kind: string, scope: string) {
  return ctx.patterns?.find(p => p.kind === kind && p.scope === scope && p.confidence >= TRUSTED);
}

/** How long it will really take you: your guess × how your guesses run (for its label, else overall). */
export function predictMinutes(task: Task, ctx: NextContext): number | null {
  const est = task.est_minutes && task.est_minutes > 0 ? task.est_minutes : null;
  if (!est) return null;
  const ratio = (task.label && pattern(ctx, 'estimate_ratio', task.label)) || pattern(ctx, 'estimate_ratio', 'all');
  if (!ratio || ratio.value <= 1.1) return est;
  return roundTo5(est * Math.min(3, ratio.value));
}

/**
 * When the day you're in ends. A day can end after midnight (dayEndMin past
 * 24 h, "1:30 AM" is 1530): after midnight, before that end, you are still in
 * yesterday's day, so its end is counted from yesterday's midnight.
 */
export function dayEndAt(now: number, dayEndMin: number): number {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const into = (now - midnight.getTime()) / 60_000;
  const start = dayEndMin > 24 * 60 && into < dayEndMin - 24 * 60
    ? new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() - 1)
    : midnight;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, dayEndMin).getTime();
}

/** When today's room runs out: the end of the day you set. */
function dayEnd(ctx: NextContext) {
  return dayEndAt(ctx.now, ctx.dayEndMin);
}

/** One task, scored and explained. */
export function decide(task: Task, ctx: NextContext): PlannerDecision {
  const f: Partial<Record<PlannerSignal, number>> = {};
  // facts in the card's order (guidelines rule 7): fits, due, high priority,
  // then the rest; the first two are the reason
  const facts: [number, string][] = [];
  const now = ctx.now;
  const predicted = predictMinutes(task, ctx);
  const minutes = predicted ?? task.est_minutes ?? DEFAULT_MINUTES;

  // you chose it: nothing outranks that
  if (ctx.pinId === task.id) f.user_pin = 100;

  // a date is a fact, not a feeling
  if (task.due_at != null) {
    const until = task.due_at - now;
    // a time that has passed is never said: no "late" (rule 8)
    const fact = !sameDay(task.due_at, now) ? null
      : !task.has_time ? 'Due today'
      : task.due_at > now ? `Due at ${clock(task.due_at)}` : null;
    if (until <= 2 * HOUR) f.deadline = 40;
    else if (sameDay(task.due_at, now)) f.deadline = 30;
    else if (until <= 3 * DAY) f.deadline = 15;
    if (fact) facts.push([2, fact]);
    // later this week: the day it's due, after the facts about today and before what Nura learned
    else if (until > 0 && until <= 6 * DAY) {
      const days = Math.round((new Date(task.due_at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
      facts.push([4.5, days === 1 ? 'Due tomorrow' : `Due ${new Date(task.due_at).toLocaleDateString(undefined, { weekday: 'long' })}`]);
    }
  }

  const pr = task.priority ?? 0;
  if (pr > 0) {
    f.priority = [0, 5, 12, 20][pr];
    if (pr >= 3) facts.push([3, 'High priority']);
  }

  // already started: finishing beats starting something new
  if (task.state === 'doing') { f.recent_progress = 25; facts.push([4, 'Already started']); }

  const move = ctx.moves?.get(task.id);
  if (move) {
    f.project_dependency = 12;
    facts.push([5, `Next move on ${move.project}`]);
    if (now - move.touchedAt < 2 * DAY) f.recent_progress = (f.recent_progress ?? 0) + 6;
    if (move.blocked) f.blocked_project = -15;
  }

  // does it fit before the next thing with a time, or the end of your day?
  const end = dayEnd(ctx);
  const next = ctx.anchors.filter(a => a > now && a <= end && a !== task.due_at).sort((a, b) => a - b)[0];
  const until = next ?? (end > now ? end : null);
  if (until != null) {
    if (now + minutes * 60_000 <= until) {
      f.available_time = 10;
      if (task.est_minutes) facts.push([1, `Fits before ${clock(until)}`]);
    } else if (!f.deadline || f.deadline < 30) {
      f.available_time = -10;
    }
  }

  // energy: small things on a low day; your good hour for longer work
  if (ctx.energy === 'low') f.energy_fit = minutes <= 10 ? 8 : minutes > 30 ? -8 : 0;
  const hour = new Date(now).getHours();
  const good = ctx.patterns?.some(p => p.kind === 'best_hour' && p.value === hour && p.confidence >= TRUSTED);
  if (good && minutes >= 25) {
    f.energy_fit = (f.energy_fit ?? 0) + 6;
    facts.push([6, 'Your good hour']);
  }

  // what Nura learned about your pace, said as a fact: the card shows how long it
  // will really take you, this says what you guessed
  if (predicted != null && task.est_minutes && predicted !== task.est_minutes) {
    f.historical_duration = 0;
    facts.push([6, `You guessed ${task.est_minutes} min`]);
  }

  // put off before: a little lower each time, never buried
  const off = (task.snooze_count ?? 0) + (ctx.putOffs?.get(task.id) ?? 0);
  if (off >= 2) f.repeated_putoff = -Math.min(12, 3 * off);

  // waiting a long time still counts for something, so nothing is buried for good
  const days = Math.max(0, (now - task.created_at) / DAY);
  if (days >= 1) f.waiting = Math.min(8, Math.round(days / 3));

  const score = Object.values(f).reduce((a, b) => a + (b ?? 0), 0);
  const all = facts.sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const reason = all.slice(0, 2).join(' · ') || null;
  return { taskId: task.id, task, score, factors: f, reason, facts: all, suggestedMinutes: predicted };
}

/**
 * The candidates, best first. Passed-on tasks are left out; ties go to the
 * older task, so the order never flickers between refreshes.
 */
export function rankActions(tasks: Task[], ctx: NextContext): PlannerDecision[] {
  const passed = new Set(ctx.passedIds ?? []);
  return tasks
    .filter(t => t.state !== 'done' && t.state !== 'dropped' && !t.parent_id && !passed.has(t.id)
      && !(t.snoozed_until && t.snoozed_until > ctx.now))
    .map(t => decide(t, ctx))
    .sort((a, b) => b.score - a.score || a.task.created_at - b.task.created_at);
}

/**
 * A sort in the planner's order, for lists: ranked tasks first, best first;
 * anything the planner left out (snoozed, passed on) after, as `fallback` has it.
 */
export function byPlan(decisions: PlannerDecision[], fallback: (a: Task, b: Task) => number) {
  const at = new Map(decisions.map((d, i) => [d.taskId, i]));
  return (a: Task, b: Task) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9) || fallback(a, b);
}

/** The reason on a task's card: the planner's, when it ranked the task. */
export function reasonFor(decisions: PlannerDecision[], id: string | undefined | null, extra?: PlannerDecision | null): string | null {
  if (!id) return null;
  if (extra?.taskId === id) return extra.reason;
  return decisions.find(d => d.taskId === id)?.reason ?? null;
}
