import * as db from './db';
import type { Task } from './db';
import { activeProjects, type ProjectSummary } from './projects';
import { todayEvents } from './calendar';
import { currentPatterns, patternValue } from './patterns';
import { proposeDay, type DayProposal } from './dayPlan';
import type { UpcomingEvent } from './calendar';
import { rankActions, decide, dayEndAt, type NextContext, type PlannerDecision, type MoveInfo } from './next';

/**
 * The planner, fed: gathers what src/next.ts needs from the device (your
 * tasks, today's events, your projects' moves, what Nura has learned, what
 * you did with earlier decisions) and hands back ranked decisions.
 *
 *   getNextActions('all')    every live task, best first: Ra's options, the
 *                            day plan, interventions
 *   getNextActions('today')  only what you put on Today
 *   currentDecision()        the one thing: the task you chose, else the
 *                            top of YOUR Today. The planner orders what you
 *                            chose; it never pushes something you didn't.
 */

const DAY = 86_400_000;

export interface PlannerState {
  ctx: NextContext;
  candidates: Task[];
  projects: ProjectSummary[];
  events: UpcomingEvent[];
}

/** Everything the engine reads, in one pass. `projects` can be handed in when the caller already has them. */
export async function plannerState(given?: { projects?: ProjectSummary[] }): Promise<PlannerState> {
  const now = Date.now();
  const d = await db.getDb();
  const [candidates, events, projects, patterns, putOffs, energy, pin, passedIds, end] = await Promise.all([
    d.getAllAsync<Task>(
      `SELECT * FROM task WHERE state NOT IN ('done','dropped') AND parent_id IS NULL LIMIT 500`),
    todayEvents().catch(() => []),
    given?.projects ? Promise.resolve(given.projects) : activeProjects(),
    currentPatterns(now),
    db.putOffsSince(now - 14 * DAY).catch(() => new Map<string, number>()),
    db.getEnergy(),
    db.readPin(),
    db.passedToday(),
    db.getFlag('day.end'),
  ]);
  const dayEndMin = Number(end) > 0 ? Number(end) : 21 * 60;
  const today = new Date(now).toDateString();
  const anchors = [
    ...events.map(e => e.startsAt),
    ...candidates.filter(t => t.has_time && t.due_at && new Date(t.due_at).toDateString() === today).map(t => t.due_at as number),
  ];
  const moves = new Map<string, MoveInfo>();
  for (const p of projects) {
    const c = p.current;
    if (c?.task_id) moves.set(c.task_id, { project: p.project.title, touchedAt: p.project.updated_at, blocked: !!c.blocked_reason });
  }
  const pinned = pin && pin.day === new Date(now).toDateString() && pin.rule === 'chosen' ? pin.id : null;
  const ctx: NextContext = { now, dayEndMin, energy, anchors, pinId: pinned, passedIds, moves, patterns, putOffs };
  return { ctx, candidates, projects, events };
}

/** Ranked decisions. `exclude`: ids already seen ("show me something else"). */
export async function getNextActions(scope: 'all' | 'today' = 'all', exclude: string[] = [], state?: PlannerState): Promise<PlannerDecision[]> {
  const s = state ?? await plannerState();
  const skip = new Set(exclude);
  const pool = s.candidates.filter(t => !skip.has(t.id) && (scope === 'all' || t.state === 'today' || t.state === 'doing'));
  return rankActions(pool, s.ctx);
}

/** The one thing now, or null (Ra then offers options and you choose). */
export async function currentDecision(state?: PlannerState): Promise<PlannerDecision | null> {
  const s = state ?? await plannerState();
  if (s.ctx.pinId) {
    const held = await db.getTask(s.ctx.pinId);
    if (held && held.state !== 'done' && held.state !== 'dropped' && !(held.snoozed_until && held.snoozed_until > s.ctx.now)) {
      return decide(held, s.ctx);
    }
  }
  return (await getNextActions('today', [], s))[0] ?? null;
}

/** How the one in front got there, in the old PickRule terms some screens still use. */
export function ruleOf(d: PlannerDecision | null, pinId?: string | null): db.PickRule | null {
  if (!d) return null;
  if (pinId && d.taskId === pinId) return 'chosen';
  return d.task.state === 'doing' ? 'started' : 'today';
}

/* ---------------- the day (src/dayPlan.ts) ---------------- */

/** Minutes left before your day ends, less what your events still take. */
export function timeLeft(s: PlannerState): number {
  const now = s.ctx.now;
  const end = dayEndAt(now, s.ctx.dayEndMin);
  if (end <= now) return 0;
  const busy = s.events.reduce((a, e) => {
    const from = Math.max(e.startsAt, now), to = Math.min(e.endsAt, end);
    return a + Math.max(0, to - from);
  }, 0);
  return Math.max(0, Math.round((end - now - busy) / 60_000));
}

/**
 * Today's proposal, when Today holds clearly more than the day can: once a
 * day, and not again once you've answered it. The day's row keeps what was
 * planned, what the day could hold, and what you really did.
 */
export async function dayProposal(state?: PlannerState): Promise<DayProposal | null> {
  const s = state ?? await plannerState();
  const [plan, done] = await Promise.all([db.getDayPlan(), db.minutesDoneToday(s.ctx.now)]);
  const answered = plan && (plan.state === 'accepted' || plan.state === 'declined' || plan.state === 'undone');
  const p = answered ? null : proposeDay(await getNextActions('today', [], s), {
    learned: patternValue(s.ctx.patterns ?? [], 'capacity'),
    timeLeft: timeLeft(s),
    doneToday: done,
  });
  const ids = (xs: { taskId: string }[]) => JSON.stringify(xs.map(x => x.taskId));
  await db.saveDayPlan({
    day: db.planDay(s.ctx.now),
    committed_ids: p ? ids(p.keep) : plan?.committed_ids ?? null,
    flexible_ids: plan?.flexible_ids ?? null,
    deferred_ids: p ? ids(p.defer) : plan?.deferred_ids ?? null,
    planned_minutes: p ? p.planned : plan?.planned_minutes ?? null,
    capacity_minutes: p ? p.capacity : plan?.capacity_minutes ?? null,
    actual_minutes: done,
    reason: p ? p.reason : plan?.reason ?? null,
    state: answered ? plan!.state : p ? 'proposed' : 'open',
    recalculated_at: s.ctx.now,
  }).catch(() => {});
  return p;
}

/** Yes to a smaller day: what's deferred leaves Today (it stays in Someday, nothing is lost). */
export async function acceptDay(keep: string[], defer: string[]) {
  for (const id of defer) await db.pickForToday(id, false);
  const plan = await db.getDayPlan();
  await db.saveDayPlan({
    day: db.planDay(), committed_ids: JSON.stringify(keep), flexible_ids: plan?.flexible_ids ?? null,
    deferred_ids: JSON.stringify(defer), planned_minutes: plan?.planned_minutes ?? null,
    capacity_minutes: plan?.capacity_minutes ?? null, actual_minutes: plan?.actual_minutes ?? null,
    reason: plan?.reason ?? null, state: 'accepted', recalculated_at: Date.now(),
  });
  await db.markActed('reduce_day');
}

/** Undo: what was left for later goes back on Today. */
export async function undoDay() {
  const plan = await db.getDayPlan();
  if (!plan || plan.state !== 'accepted') return;
  let ids: string[] = [];
  try { ids = JSON.parse(plan.deferred_ids ?? '[]'); } catch { /* nothing to put back */ }
  for (const id of ids) {
    const t = await db.getTask(id);
    if (t && t.state === 'inbox') await db.pickForToday(id, true);
  }
  await db.saveDayPlan({ ...plan, state: 'undone', recalculated_at: Date.now() });
}

/** No to a smaller day: not asked again today. */
export async function declineDay() {
  const plan = await db.getDayPlan();
  if (plan) await db.saveDayPlan({ ...plan, state: 'declined', recalculated_at: Date.now() });
}
