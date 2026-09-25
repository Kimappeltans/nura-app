import { getDb, logEvent, markActed, handOverPin, type Task } from './db';

/**
 * Projects — a goal too big to be one task, and the path Nu keeps for it.
 *
 * The shape of it (SCOPE.md → Projects):
 *   - a PROJECT is the goal in the person's words, what "done" means, and the
 *     guesses Nu made along the way (labelled as guesses, never as facts);
 *   - its STEPS are a short, ordered, editable path. At most one is
 *     `current`: the move Ra shows. Done steps are history and never change;
 *   - only the current move is ever a TASK. It's created when the step
 *     becomes current and linked by `task_id`, so Nu, Ra, the timer, Stop
 *     and Done all work on it exactly as on any other task. Nothing here
 *     touches `parent_id`, which stays one level of micro-steps.
 *
 * `edited` marks a step the person wrote or changed. Replanning keeps those
 * as written (see planner.ts → mergePath) — Nura never quietly rewrites
 * something you wrote.
 *
 * The task is the source of truth for whether the move happened: ticking it
 * in Nu, Done in Ra or the timer, or letting it go all show up here through
 * reconcile(), wherever it was done. Stopping a session early leaves the
 * task open (db.endSession), so it leaves the step open too.
 */

export type ProjectState = 'active' | 'done' | 'dropped';
export type StepState = 'todo' | 'current' | 'done' | 'dropped';

export interface Note { q: string; a: string }

export interface Project {
  id: string;
  goal: string;
  title: string;
  done_means: string | null;
  /** JSON string[] — see assumptionsOf() */
  assumptions: string | null;
  /** JSON Note[] — the questions Nu asked and what you said */
  notes: string | null;
  state: ProjectState;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

export interface Step {
  id: string;
  project_id: string;
  position: number;
  title: string;
  first_action: string | null;
  why: string | null;
  est_minutes: number | null;
  state: StepState;
  edited: number;
  task_id: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

/** A step as the editor and the planner hand it over: no id = a new one. */
export interface StepDraft {
  id?: string;
  title: string;
  first_action: string | null;
  why: string | null;
  est_minutes: number | null;
  edited: boolean;
}

export interface ProjectSummary {
  project: Project;
  current: Step | null;
  /** the first step still to do after the current one — "then" */
  next: Step | null;
  done: number;
  total: number;
}

export type ProjectEventKind =
  | 'created' | 'edited' | 'answered' | 'too_big' | 'blocked' | 'done'
  | 'replanned' | 'let_go' | 'finished' | 'reopened';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const clean = (s: string | null | undefined) => (s ?? '').trim() || null;

export function assumptionsOf(p: Project): string[] {
  try { const v = JSON.parse(p.assumptions ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
export function notesOf(p: Project): Note[] {
  try { const v = JSON.parse(p.notes ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

export async function logProjectEvent(projectId: string, kind: ProjectEventKind, stepId?: string | null, note?: string | null, at = Date.now()) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO project_event (project_id, step_id, kind, note, at) VALUES (?, ?, ?, ?, ?)',
    projectId, stepId ?? null, kind, clean(note), at);
}

async function touch(projectId: string) {
  const db = await getDb();
  await db.runAsync('UPDATE project SET updated_at = ? WHERE id = ?', Date.now(), projectId);
}

/* ------------------------------------------------------------------ *
 *  Reading
 * ------------------------------------------------------------------ */

export async function getProject(id: string): Promise<{ project: Project; steps: Step[] } | null> {
  await reconcile();
  const db = await getDb();
  const project = await db.getFirstAsync<Project>('SELECT * FROM project WHERE id = ?', id);
  if (!project) return null;
  return { project, steps: await stepsOf(id) };
}

/** The path in order, without the steps that were let go. */
export async function stepsOf(projectId: string): Promise<Step[]> {
  const db = await getDb();
  return db.getAllAsync<Step>(
    `SELECT * FROM project_step WHERE project_id = ? AND state != 'dropped' ORDER BY position ASC, created_at ASC`,
    projectId);
}

/** Projects still under way, most recently touched first — what Nu shows. */
export async function activeProjects(): Promise<ProjectSummary[]> {
  await reconcile();
  const db = await getDb();
  const projects = await db.getAllAsync<Project>(
    `SELECT * FROM project WHERE state = 'active' ORDER BY updated_at DESC`);
  const out: ProjectSummary[] = [];
  for (const project of projects) {
    const steps = await stepsOf(project.id);
    const current = steps.find(s => s.state === 'current') ?? null;
    const at = current ? steps.indexOf(current) : -1;
    const next = steps.find((s, i) => s.state === 'todo' && i > at) ?? null;
    out.push({ project, current, next, done: steps.filter(s => s.state === 'done').length, total: steps.length });
  }
  return out;
}

/** Which project and step a task is the move for, if any. */
export async function stepForTask(taskId: string): Promise<{ project: Project; step: Step } | null> {
  const db = await getDb();
  const step = await db.getFirstAsync<Step>('SELECT * FROM project_step WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1', taskId);
  if (!step) return null;
  const project = await db.getFirstAsync<Project>('SELECT * FROM project WHERE id = ?', step.project_id);
  return project ? { project, step } : null;
}

/**
 * The task is where the move actually happens, so the step follows it:
 *   - ticked, Done in Ra or the timer (or on another device) → step done
 *   - "Let it go" → step let go; the project waits for its next move
 *   - retitled in task details → the step says what the task says, and
 *     counts as yours from then on
 * Runs before every read, so the path is never out of step with the list.
 */
let reconciling: Promise<void> | null = null;
export function reconcile(): Promise<void> {
  // refresh() and a project screen often read at the same moment; two passes
  // at once would both see the step as current and log it done twice
  reconciling ??= runReconcile().finally(() => { reconciling = null; });
  return reconciling;
}

async function runReconcile() {
  const db = await getDb();
  const rows = await db.getAllAsync<Step & { t_state: string; t_title: string; t_first: string | null; t_est: number | null; t_completed: number | null }>(
    `SELECT s.*, t.state AS t_state, t.title AS t_title, t.first_action AS t_first,
            t.est_minutes AS t_est, t.completed_at AS t_completed
       FROM project_step s JOIN task t ON t.id = s.task_id
      WHERE s.state = 'current'`);
  const now = Date.now();
  for (const r of rows) {
    if (r.t_state === 'done') {
      const at = r.t_completed ?? now;
      await db.runAsync(`UPDATE project_step SET state = 'done', completed_at = ?, updated_at = ? WHERE id = ?`, at, now, r.id);
      await logProjectEvent(r.project_id, 'done', r.id, null, at);
      await touch(r.project_id);
    } else if (r.t_state === 'dropped') {
      await db.runAsync(`UPDATE project_step SET state = 'dropped', updated_at = ? WHERE id = ?`, now, r.id);
      await logProjectEvent(r.project_id, 'let_go', r.id);
      await touch(r.project_id);
    } else if (r.t_title !== r.title || (r.t_first ?? null) !== (r.first_action ?? null) || (r.t_est ?? null) !== (r.est_minutes ?? null)) {
      await db.runAsync(
        `UPDATE project_step SET title = ?, first_action = ?, est_minutes = ?, edited = 1, updated_at = ? WHERE id = ?`,
        r.t_title, r.t_first, r.t_est, now, r.id);
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Writing
 * ------------------------------------------------------------------ */

export interface NewProject {
  goal: string;
  title: string;
  done_means: string | null;
  assumptions: string[];
  notes: Note[];
  steps: StepDraft[];
  /** which of `steps` is the move to start with */
  current: number;
}

/** Save a path the person has seen and accepted. Returns the project and
 *  the task for its first move. */
export async function createProject(p: NewProject): Promise<{ id: string; taskId: string | null }> {
  const db = await getDb();
  const id = uid();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO project (id, goal, title, done_means, assumptions, notes, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    id, p.goal.trim(), p.title.trim() || p.goal.trim(), clean(p.done_means),
    JSON.stringify(p.assumptions.map(s => s.trim()).filter(Boolean)), JSON.stringify(p.notes), now, now);
  const ids: string[] = [];
  for (const [i, s] of p.steps.entries()) {
    const sid = uid();
    ids.push(sid);
    await db.runAsync(
      `INSERT INTO project_step (id, project_id, position, title, first_action, why, est_minutes, state, edited, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?)`,
      sid, id, i, s.title.trim(), clean(s.first_action), clean(s.why), s.est_minutes ?? null, s.edited ? 1 : 0, now, now);
  }
  await logProjectEvent(id, 'created');
  await markActed('project');
  const first = ids[Math.max(0, Math.min(p.current, ids.length - 1))];
  const taskId = first ? await setCurrent(id, first) : null;
  return { id, taskId };
}

export async function updateProject(id: string, patch: { title?: string; done_means?: string | null; assumptions?: string[] }) {
  const db = await getDb();
  const sets: string[] = [], args: (string | number | null)[] = [];
  if (patch.title !== undefined && patch.title.trim()) { sets.push('title = ?'); args.push(patch.title.trim()); }
  if (patch.done_means !== undefined) { sets.push('done_means = ?'); args.push(clean(patch.done_means)); }
  if (patch.assumptions !== undefined) { sets.push('assumptions = ?'); args.push(JSON.stringify(patch.assumptions)); }
  if (!sets.length) return;
  await db.runAsync(`UPDATE project SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...args, Date.now(), id);
  await markActed('project');
}

export async function addNote(id: string, note: Note) {
  const db = await getDb();
  const row = await db.getFirstAsync<Project>('SELECT * FROM project WHERE id = ?', id);
  if (!row) return;
  const notes = [...notesOf(row), note].slice(-12);
  await db.runAsync('UPDATE project SET notes = ?, updated_at = ? WHERE id = ?', JSON.stringify(notes), Date.now(), id);
}

/** A replaced move's task leaves quietly: not done, not a skip you made. */
async function retireTask(taskId: string) {
  const db = await getDb();
  const r = await db.runAsync(
    `UPDATE task SET state = 'dropped', updated_at = ? WHERE id = ? AND state NOT IN ('done','dropped')`,
    Date.now(), taskId);
  if (r.changes) await logEvent('skipped', taskId, { replaced: true });
}

/**
 * Make `stepId` the move, or clear the move with null. The old move goes
 * back into the path as a step still to do and its task is retired; the new
 * one gets a task (sitting in "everything", not put on Today — you choose
 * when). If you had chosen the old move in Nu, you've chosen the new one.
 * Returns the new move's task id.
 */
export async function setCurrent(projectId: string, stepId: string | null): Promise<string | null> {
  const db = await getDb();
  const now = Date.now();
  const steps = await stepsOf(projectId);
  let oldTask: string | null = null;
  for (const s of steps) {
    if (s.state !== 'current' || s.id === stepId) continue;
    await db.runAsync(`UPDATE project_step SET state = 'todo', task_id = NULL, updated_at = ? WHERE id = ?`, now, s.id);
    if (s.task_id) { oldTask = s.task_id; await retireTask(s.task_id); }
  }
  if (!stepId) return null;
  const st = steps.find(s => s.id === stepId);
  if (!st || st.state === 'done') return null;

  let taskId = st.task_id;
  const live = taskId
    ? await db.getFirstAsync<Task>(`SELECT * FROM task WHERE id = ? AND state NOT IN ('done','dropped')`, taskId)
    : null;
  if (live && taskId) {
    await db.runAsync(`UPDATE task SET title = ?, first_action = ?, est_minutes = ?, updated_at = ? WHERE id = ?`,
      st.title, st.first_action, st.est_minutes, now, taskId);
  } else {
    taskId = uid();
    await db.runAsync(
      `INSERT INTO task (id, title, first_action, est_minutes, state, created_at, priority, updated_at)
       VALUES (?, ?, ?, ?, 'inbox', ?, 0, ?)`,
      taskId, st.title, st.first_action, st.est_minutes, now, now);
    await logEvent('captured', taskId, { project: projectId });
  }
  await db.runAsync(`UPDATE project_step SET state = 'current', task_id = ?, updated_at = ? WHERE id = ?`, taskId, now, stepId);
  if (oldTask && taskId) await handOverPin(oldTask, taskId);
  await touch(projectId);
  return taskId;
}

/**
 * Save the path as the editor (or a replan) leaves it. `drafts` is every
 * step still to do, in order; done steps aren't in it and never change.
 * A step that disappeared from the list is let go. `current` picks the move
 * by index into `drafts`; leave it out to keep the move you had — or, if it
 * was deleted, to take the first step left. Returns the move's task id.
 */
export async function savePath(projectId: string, drafts: StepDraft[], current?: number | null, kind: ProjectEventKind = 'edited', note?: string | null): Promise<string | null> {
  const db = await getDb();
  const now = Date.now();
  const before = await stepsOf(projectId);
  const done = before.filter(s => s.state === 'done');
  const kept = new Set(drafts.map(d => d.id).filter(Boolean) as string[]);
  const ids: string[] = [];

  for (const [i, d] of drafts.entries()) {
    const pos = done.length + i;
    const old = d.id ? before.find(s => s.id === d.id && s.state !== 'done') : undefined;
    if (old) {
      const changed = old.title !== d.title.trim() || (old.first_action ?? null) !== clean(d.first_action)
        || (old.est_minutes ?? null) !== (d.est_minutes ?? null);
      await db.runAsync(
        `UPDATE project_step SET position = ?, title = ?, first_action = ?, why = ?, est_minutes = ?, edited = ?, updated_at = ? WHERE id = ?`,
        pos, d.title.trim(), clean(d.first_action), clean(d.why), d.est_minutes ?? null,
        old.edited || (d.edited && changed) ? 1 : 0, now, old.id);
      // the move's task says what the step says
      if (old.state === 'current' && old.task_id && changed) {
        await db.runAsync(`UPDATE task SET title = ?, first_action = ?, est_minutes = ?, updated_at = ? WHERE id = ?`,
          d.title.trim(), clean(d.first_action), d.est_minutes ?? null, now, old.task_id);
      }
      ids.push(old.id);
    } else {
      const sid = uid();
      await db.runAsync(
        `INSERT INTO project_step (id, project_id, position, title, first_action, why, est_minutes, state, edited, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?)`,
        sid, projectId, pos, d.title.trim(), clean(d.first_action), clean(d.why), d.est_minutes ?? null, d.edited ? 1 : 0, now, now);
      ids.push(sid);
    }
  }

  for (const s of before) {
    if (s.state === 'done' || kept.has(s.id)) continue;
    await db.runAsync(`UPDATE project_step SET state = 'dropped', task_id = NULL, updated_at = ? WHERE id = ?`, now, s.id);
    if (s.task_id) await retireTask(s.task_id);
  }

  const hadMove = before.find(s => s.state === 'current' && kept.has(s.id));
  const target = current != null && current >= 0 && current < ids.length ? ids[current]
    : hadMove ? hadMove.id
    : ids[0] ?? null;
  const taskId = await setCurrent(projectId, target);
  await logProjectEvent(projectId, kind, target, note);
  await markActed('project');
  return taskId;
}

/** The next step on the path becomes the move, without asking the planner —
 *  "that's enough for now", and the way on when the planner can't be
 *  reached. Returns its task, or null when the path has nothing left. */
export async function advance(projectId: string): Promise<string | null> {
  const steps = await stepsOf(projectId);
  const cur = steps.find(s => s.state === 'current');
  if (cur?.task_id) return cur.task_id;
  const next = steps.find(s => s.state === 'todo');
  return next ? setCurrent(projectId, next.id) : null;
}

/** You decided the project is finished. Nura never decides this for you. */
export async function finishProject(id: string) {
  const db = await getDb();
  await setCurrent(id, null);
  await db.runAsync(`UPDATE project SET state = 'done', completed_at = ?, updated_at = ? WHERE id = ?`, Date.now(), Date.now(), id);
  await logProjectEvent(id, 'finished');
  await markActed('project');
}

/** Not important any more — gone from Nu, nothing to explain. */
export async function letProjectGo(id: string) {
  const db = await getDb();
  await setCurrent(id, null);
  await db.runAsync(`UPDATE project SET state = 'dropped', updated_at = ? WHERE id = ?`, Date.now(), id);
  await logProjectEvent(id, 'let_go');
  await markActed('project');
}

/* ------------------------------------------------------------------ *
 *  What the planner is told
 * ------------------------------------------------------------------ */

export interface PlanState {
  goal: string;
  title: string;
  done_means: string | null;
  assumptions: string[];
  notes: Note[];
  steps: { ref: string; title: string; first_action: string | null; est_minutes: number | null; state: 'done' | 'current' | 'todo'; edited: boolean }[];
  history: { kind: string; note: string | null; step: string | null; hours_ago: number }[];
}

/**
 * The project as the planner needs to see it — compact, not the whole
 * conversation. Model calls resend this instead of a transcript, so the
 * cost of a replan doesn't grow with the life of the project.
 */
export async function planState(projectId: string): Promise<PlanState | null> {
  const got = await getProject(projectId);
  if (!got) return null;
  const db = await getDb();
  const events = await db.getAllAsync<{ kind: string; note: string | null; step_id: string | null; at: number }>(
    `SELECT kind, note, step_id, at FROM project_event WHERE project_id = ? ORDER BY at DESC LIMIT 10`, projectId);
  const titleOf = new Map(got.steps.map(s => [s.id, s.title]));
  return {
    goal: got.project.goal,
    title: got.project.title,
    done_means: got.project.done_means,
    assumptions: assumptionsOf(got.project),
    notes: notesOf(got.project),
    steps: got.steps.map(s => ({
      ref: s.id, title: s.title, first_action: s.first_action, est_minutes: s.est_minutes,
      state: s.state === 'dropped' ? 'todo' : s.state, edited: !!s.edited,
    })),
    history: events.reverse().map(e => ({
      kind: e.kind, note: e.note, step: e.step_id ? titleOf.get(e.step_id) ?? null : null,
      hours_ago: Math.round((Date.now() - e.at) / 360_000) / 10,
    })),
  };
}
