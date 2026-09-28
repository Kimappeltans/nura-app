import { supabase } from './supabase';
import { getFlag, setFlag } from './db';
import { aiAllowed, noDashes, signedIn } from './ai';
import { getProject, planState, savePath, addNote, markBlocked, type PlanState, type Step, type StepDraft, type Note } from './projects';

/**
 * Nu's planner — the one part of Nura that runs on a server.
 *
 * Quick capture stays on the phone (assistant.ts): instant, free, offline.
 * Turning "finish my website" into a path is a different job — it needs
 * judgement, not a parser — so it goes to the `nura-plan` Supabase function,
 * which holds the model key and calls Claude (supabase/functions/nura-plan).
 * The phone never holds a model credential.
 *
 * Calls happen only when you do something — send a goal, answer a question,
 * say "too big", "blocked" or "done", or ask for a fresh look. Each call
 * sends the compact project state (projects.ts → planState), never the
 * whole history. Only after you've said yes to AI help (ai.ts), and only
 * signed in: the function answers nobody else.
 *
 * Every response is checked here before anything uses it, even though the
 * server already asked for structured output: a response that doesn't have
 * the right shape is an error with a retry, never half a plan. And nothing
 * the planner returns is saved until you've seen it — the screens show the
 * proposal and you accept it.
 */

export interface Question { text: string; options: string[] }

export interface MoveDraft {
  /** an existing step's id when the planner is talking about one */
  ref: string | null;
  title: string;
  first_action: string | null;
  why: string | null;
  est_minutes: number | null;
  /** indexes of earlier steps in the same list that this one waits on */
  after: number[];
  /** helps, but the goal doesn't need it */
  optional: boolean;
}

export type StartResult =
  | { kind: 'task'; title: string; reply: string }
  | { kind: 'project'; title: string; reply: string; question: Question | null; plan: PlanResult | null };

export interface PlanResult {
  title: string;
  done_means: string;
  assumptions: string[];
  reply: string;
  steps: MoveDraft[];
  current: number;
}

export type ReplanEvent = 'too_big' | 'blocked' | 'done' | 'replan';

export interface ReplanResult {
  reply: string;
  steps: MoveDraft[];
  /** index into steps, or -1 when the planner is asking instead */
  current: number;
  question: Question | null;
  /** the planner thinks "done" might be reached — only ever a question to you */
  maybe_done: boolean;
}

export class PlannerError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'busy' | 'bad' | 'limit' | 'auth' | 'consent' | 'access' = 'bad') { super(message); }
}

/* ------------------------------------------------------------------ *
 *  Language
 * ------------------------------------------------------------------ */

export const LANGUAGES = [
  { code: 'en', name: 'English', bcp: 'en-US' },
  { code: 'nl', name: 'Nederlands', bcp: 'nl-NL' },
  { code: 'fr', name: 'Français', bcp: 'fr-FR' },
  { code: 'de', name: 'Deutsch', bcp: 'de-DE' },
  { code: 'es', name: 'Español', bcp: 'es-ES' },
  { code: 'it', name: 'Italiano', bcp: 'it-IT' },
  { code: 'pt', name: 'Português', bcp: 'pt-PT' },
] as const;
export type LangCode = typeof LANGUAGES[number]['code'];

/** The language Nu and Ra speak and listen in. Defaults to the phone's, when
 *  it's one of the list. The rest of the interface is still English — this
 *  is not a translation of the app. */
export async function getLanguage(): Promise<LangCode> {
  const saved = await getFlag('lang');
  if (saved && LANGUAGES.some(l => l.code === saved)) return saved as LangCode;
  const device = (Intl.DateTimeFormat().resolvedOptions().locale || 'en').slice(0, 2).toLowerCase();
  return (LANGUAGES.find(l => l.code === device)?.code ?? 'en') as LangCode;
}
export async function setLanguage(code: LangCode) { await setFlag('lang', code); }
export const languageName = (code: string) => LANGUAGES.find(l => l.code === code)?.name ?? 'English';
export const languageTag = (code: string) => LANGUAGES.find(l => l.code === code)?.bcp ?? 'en-US';

/* ------------------------------------------------------------------ *
 *  Checking what comes back
 * ------------------------------------------------------------------ */

/** Every string the planner sends back: trimmed, capped, and without dashes. */
const str = (v: unknown, max = 400) => (typeof v === 'string' ? noDashes(v).trim().slice(0, max) : '');
const strs = (v: unknown, n: number, max = 200) =>
  Array.isArray(v) ? v.map(x => str(x, max)).filter(Boolean).slice(0, n) : [];
const mins = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(600, Math.round(v)) : null;

function question(text: unknown, options: unknown): Question | null {
  const q = str(text, 300);
  return q ? { text: q, options: strs(options, 5, 80) } : null;
}

function move(v: any): MoveDraft | null {
  if (!v || typeof v !== 'object') return null;
  const title = str(v.title, 160);
  if (!title) return null;
  return {
    ref: str(v.ref, 60) || null,
    title,
    first_action: str(v.first_action, 240) || null,
    why: str(v.why, 240) || null,
    est_minutes: mins(v.est_minutes),
    after: Array.isArray(v.after) ? v.after.filter((n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0) : [],
    optional: v.optional === true,
  };
}

/** The moves in order; a step can only wait on steps before it (anything else is dropped, so there's never a loop). */
function moves(v: unknown): MoveDraft[] {
  // a whole path: every step the goal needs (the planner is asked for 6 to 14)
  const list = Array.isArray(v) ? v.map(move).filter((m): m is MoveDraft => !!m).slice(0, 20) : [];
  return list.map((m, i) => ({ ...m, after: [...new Set(m.after.filter(n => n < i))] }));
}

function plan(v: any, fallbackTitle: string): PlanResult | null {
  const steps = moves(v?.steps);
  if (!steps.length) return null;
  const cur = Number.isInteger(v?.current) ? v.current : 0;
  return {
    title: str(v?.title, 80) || fallbackTitle,
    done_means: str(v?.done_means, 300),
    assumptions: strs(v?.assumptions, 5, 200),
    reply: str(v?.reply, 500),
    steps,
    current: cur >= 0 && cur < steps.length ? cur : 0,
  };
}

export function readStart(v: any, goal: string): StartResult {
  const title = str(v?.title, 80) || goal.slice(0, 60);
  if (v?.kind === 'task') return { kind: 'task', title, reply: str(v?.reply, 500) };
  if (v?.kind !== 'project') throw new PlannerError('The planner answered in a shape Nura doesn’t understand.');
  const q = question(v?.question, v?.options);
  const p = q ? null : plan(v, title);
  if (!q && !p) throw new PlannerError('The planner didn’t come back with a first move.');
  return { kind: 'project', title, reply: str(v?.reply, 500), question: q, plan: p };
}

export function readPlan(v: any, goal: string): PlanResult {
  const p = plan(v, goal.slice(0, 60));
  if (!p) throw new PlannerError('The planner didn’t come back with a first move.');
  return p;
}

export function readReplan(v: any): ReplanResult {
  const steps = moves(v?.steps);
  const q = question(v?.question, v?.options);
  const cur = Number.isInteger(v?.current) ? v.current : -1;
  const current = cur >= 0 && cur < steps.length ? cur : -1;
  if (current < 0 && !q && !steps.length) throw new PlannerError('The planner didn’t come back with a next move.');
  return { reply: str(v?.reply, 500), steps, current: current < 0 && steps.length && !q ? 0 : current, question: q, maybe_done: v?.maybe_done === true };
}

/* ------------------------------------------------------------------ *
 *  Merging a replan into the path you have
 * ------------------------------------------------------------------ */

/**
 * The planner proposes a whole path; this decides what it's allowed to
 * change. The rules, which the planner is also told:
 *   - done steps are history — they aren't in the result and can't change;
 *   - a step you wrote or edited keeps your words, wherever the planner
 *     moved it, and if the planner left it out it stays anyway, at the end;
 *   - a step Nu wrote can be reworded, moved or dropped;
 *   - the planner's `current` picks the move, by its position in the list.
 * Returns drafts for projects.savePath, and the index of the move.
 */
export function mergePath(local: Step[], res: Pick<ReplanResult, 'steps' | 'current'>): { drafts: StepDraft[]; current: number | null } {
  const open = local.filter(s => s.state !== 'done' && s.state !== 'dropped');
  const byId = new Map(open.map(s => [s.id, s]));
  const used = new Set<string>();
  const drafts: StepDraft[] = [];
  let current: number | null = null;
  const at = new Map<number, number>();   // the planner's index → the draft's

  res.steps.forEach((m, i) => {
    const mine = m.ref ? byId.get(m.ref) : undefined;
    if (m.ref && !mine && local.some(s => s.id === m.ref)) return;   // a done step, sent back: ignore
    if (mine && used.has(mine.id)) return;                          // the same step twice: keep the first
    if (i === res.current) current = drafts.length;
    // what it waits on, as positions in the drafts (a step skipped above can't be waited on)
    const after = (m.after ?? []).map(k => at.get(k)).filter((k): k is number => k != null);
    const plan = { after, optional: !!m.optional };
    at.set(i, drafts.length);
    if (mine) {
      used.add(mine.id);
      drafts.push(mine.edited
        ? { id: mine.id, title: mine.title, first_action: mine.first_action, why: mine.why, est_minutes: mine.est_minutes, edited: true, ...plan }
        : { id: mine.id, title: m.title, first_action: m.first_action, why: m.why, est_minutes: m.est_minutes, edited: false, ...plan });
    } else {
      drafts.push({ title: m.title, first_action: m.first_action, why: m.why, est_minutes: m.est_minutes, edited: false, ...plan });
    }
  });

  for (const s of open) {
    if (s.edited && !used.has(s.id)) {
      drafts.push({ id: s.id, title: s.title, first_action: s.first_action, why: s.why, est_minutes: s.est_minutes, edited: true });
    }
  }
  return { drafts, current };
}

/**
 * Ask Nu to look again after "too big", "blocked", "done" or a fresh look,
 * and save what comes back into the path (keeping your edits). When Nu only
 * asks a question and offers no move, nothing is saved — the question goes
 * back to the screen. Returns the answer and the new move's task, if any.
 */
export async function askAgain(projectId: string, event: ReplanEvent, note?: string | null):
  Promise<{ res: ReplanResult; taskId: string | null }> {
  const state = await planState(projectId);
  if (!state) throw new PlannerError('That project is gone.');
  // blocked: say so on the move first, so the planner lowers it even if
  // the replan can't be had right now
  if (event === 'blocked') await markBlocked(projectId, note ?? null);
  const res = await replan(state, event, note);
  if (note?.trim() && event !== 'replan') {
    await addNote(projectId, { q: event === 'done' ? 'What happened?' : event === 'blocked' ? 'What’s in the way?' : 'Too big', a: note.trim() });
  }
  if (res.current < 0) return { res, taskId: null };
  const got = await getProject(projectId);
  const { drafts, current } = mergePath(got?.steps ?? [], res);
  const kind = event === 'too_big' ? 'too_big' : event === 'blocked' ? 'blocked' : 'replanned';
  const taskId = await savePath(projectId, drafts, current, kind, note);
  return { res, taskId };
}

/* ------------------------------------------------------------------ *
 *  Calling the server
 * ------------------------------------------------------------------ */

async function deviceId() {
  let id = await getFlag('device.id');
  if (!id) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    await setFlag('device.id', id);
  }
  return id;
}

const TIMEOUT_MS = 60_000;

const OFFLINE = 'Nu couldn’t reach the planner. Check your connection and try again.';
export const SIGN_IN_AGAIN = 'Sign in again to plan with Nu.';
export const NEEDS_OK = 'Turn on AI help in Settings to plan with Nu.';
/** The function's 403 ai_access: this account isn't on the list for AI yet. */
export const NOT_OPEN = 'AI help isn’t open yet. You can write the first move yourself.';

/** What a failed call means, from the function's status. No status at all
 *  means the request never got an answer: the connection. */
export function plannerError(status: number | undefined): PlannerError {
  if (status === 401) return new PlannerError(SIGN_IN_AGAIN, 'auth');
  if (status === 403) return new PlannerError(NOT_OPEN, 'access');
  if (status === 429) return new PlannerError('That’s all the planning for today. Try again tomorrow.', 'limit');
  if (status === 422) return new PlannerError('Nu couldn’t use that. Try saying it another way.', 'bad');
  if (status === 400 || status === 413) return new PlannerError('Nu couldn’t use that. Try it in fewer words.', 'bad');
  if (status === 504) return new PlannerError('Nu took too long to answer. Try again in a minute.', 'busy');
  if (status) return new PlannerError('The planner is having a moment. Try again in a minute.', 'busy');
  return new PlannerError(OFFLINE, 'offline');
}

async function call(body: Record<string, unknown>): Promise<any> {
  if (__DEV__ && (await getFlag('dev.planner')) === 'local') return localPlanner(body);
  // nothing leaves the phone without your yes, and only with a session
  if (!(await aiAllowed())) throw new PlannerError(NEEDS_OK, 'consent');
  if (!(await signedIn())) throw new PlannerError(SIGN_IN_AGAIN, 'auth');
  const lang = await getLanguage();
  // invoke sends the session's access token as the Authorization header
  const invoke = supabase.functions.invoke('nura-plan', {
    body: { ...body, language: languageName(lang) },
    headers: { 'x-nura-device': await deviceId() },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PlannerError('Nu took too long to answer.', 'busy')), TIMEOUT_MS);
  });
  let res: Awaited<typeof invoke>;
  try {
    res = await Promise.race([invoke, timeout]);
  } catch (e) {
    if (e instanceof PlannerError) throw e;
    throw new PlannerError(OFFLINE, 'offline');
  } finally {
    clearTimeout(timer);
  }
  if (res.error) throw plannerError((res.error as any)?.context?.status as number | undefined);
  return res.data;
}

/** A goal, as the person put it: is it one task, or a project — and if a
 *  project, one question or a first path straight away. */
export async function start(goal: string): Promise<StartResult> {
  return readStart(await call({ action: 'start', goal: goal.slice(0, 1200) }), goal);
}

/** The first path, once any question has been answered or skipped. */
export async function draftPlan(goal: string, notes: Note[]): Promise<PlanResult> {
  return readPlan(await call({ action: 'plan', goal: goal.slice(0, 1200), notes }), goal);
}

/** After "too big", "blocked", "done" or "have another look". */
export async function replan(state: PlanState, event: ReplanEvent, note?: string | null): Promise<ReplanResult> {
  return readReplan(await call({ action: 'replan', state, event: { kind: event, note: note?.trim().slice(0, 600) || null } }));
}

/* ------------------------------------------------------------------ *
 *  Dev only: a stand-in planner
 * ------------------------------------------------------------------ */

/**
 * Lets the whole flow be clicked through on a simulator before the server
 * function is deployed — set the flag `dev.planner` to `local`. It is not
 * a planner: it reshuffles fixed wording and knows nothing about the goal.
 * Compiled out of release builds with the rest of __DEV__.
 */
async function localPlanner(body: Record<string, any>): Promise<any> {
  await new Promise(r => setTimeout(r, 700));
  const goal: string = body.goal ?? body.state?.goal ?? '';
  const title = goal.replace(/^(i need to|i have to|i want to|help me)\s+/i, '').replace(/^\w/, c => c.toUpperCase()).slice(0, 60);
  const path = [
    { ref: '', title: 'Write one sentence about what finished means', first_action: 'Open a note and type “Finished means…”', why: 'A clear target makes the next move obvious.', est_minutes: 5 },
    { ref: '', title: 'List what’s already done', first_action: 'Open what you have so far.', why: 'So the path starts where you are.', est_minutes: 10 },
    { ref: '', title: 'Pick the part that matters most', first_action: 'Circle one item on the list.', why: 'Content before polish.', est_minutes: 5 },
    { ref: '', title: 'Do the first half hour of it', first_action: 'Set out what you need for it.', why: 'Real progress on the main thing.', est_minutes: 30 },
  ];
  if (body.action === 'start') {
    if (goal.split(/\s+/).length <= 3 && !/finish|project|plan|build|write|launch/i.test(goal)) {
      return { kind: 'task', title, reply: 'That sounds like one task. Add it to your list?' };
    }
    return {
      kind: 'project', title, reply: 'Let’s find a way in.',
      question: 'What would “finished” look like?', options: ['Ready to share', 'Mostly done', 'Just started', 'Something else'],
      done_means: '', assumptions: [], steps: [], current: 0,
    };
  }
  if (body.action === 'plan') {
    return {
      title, done_means: body.notes?.[0]?.a ? `${body.notes[0].a}.` : 'Finished and shared.',
      assumptions: ['You already have a draft to start from.'],
      reply: 'Here’s a possible path. The first move is small on purpose.',
      steps: path, current: 0,
    };
  }
  const st = body.state as PlanState;
  const open = st.steps.filter(s => s.state !== 'done');
  const cur = open.find(s => s.state === 'current');
  const keep = open.map(s => ({ ref: s.ref, title: s.title, first_action: s.first_action, why: null, est_minutes: s.est_minutes }));
  const kind = body.event?.kind;
  if (kind === 'too_big' && cur) {
    // the smaller move is the step's own first action, when it has one — short and concrete
    const small = { ref: '', title: cur.first_action ? cur.first_action.replace(/[.…]+$/, '') : `Start: ${cur.title}`, first_action: cur.first_action ?? 'Open it.', why: 'Smaller, so it’s easy to begin.', est_minutes: 2 };
    return { reply: 'Here’s a smaller way in.', steps: [small, ...keep], current: 0, question: '', options: [], maybe_done: false };
  }
  if (kind === 'blocked') {
    const around = { ref: '', title: 'Write down exactly what’s missing', first_action: 'Open a note titled “What I need”.', why: 'Naming the blocker is a move too.', est_minutes: 5 };
    return { reply: 'Let’s go around it.', steps: [around, ...keep], current: 0, question: body.event?.note ? '' : 'What’s in the way?', options: ['Waiting on someone', 'Missing information', 'Not sure where to start'], maybe_done: false };
  }
  const rest = keep.filter(s => s.ref !== cur?.ref);
  return { reply: rest.length ? 'Nice. Here’s the next move.' : 'That was the last step on the path.', steps: rest, current: rest.length ? 0 : -1, question: '', options: [], maybe_done: !rest.length };
}
