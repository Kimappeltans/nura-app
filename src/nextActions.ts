import * as db from './db';
import type { Task } from './db';
import { activeProjects, type ProjectSummary } from './projects';
import { todayEvents } from './calendar';
import { currentPatterns } from './patterns';
import { rankActions, decide, type NextContext, type PlannerDecision, type MoveInfo } from './next';

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
    if (c?.task_id) moves.set(c.task_id, { project: p.project.title, touchedAt: p.project.updated_at, blocked: !!(c as { blocked_reason?: string | null }).blocked_reason });
  }
  const pinned = pin && pin.day === new Date(now).toDateString() && pin.rule === 'chosen' ? pin.id : null;
  const ctx: NextContext = { now, dayEndMin, energy, anchors, pinId: pinned, passedIds, moves, patterns, putOffs };
  return { ctx, candidates, projects };
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
