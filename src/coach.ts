import { supabase } from './supabase';
import { getFlag, setFlag } from './db';
import { route } from './assistant';
import { getLanguage, languageName } from './planner';
import type { StateRead, Suggestion, SuggestionKind, WorkingNotes } from './learn/types';

/**
 * The coach — the model half of the learning loop (see src/learn/types.ts).
 *
 * Three calls to the `nura-coach` Supabase function, which holds the model
 * key (supabase/functions/nura-coach):
 *
 *   read     what you typed or said → a StateRead. The phone reads it
 *            first (assistant.ts + a few rules); only when that read isn't
 *            sure (localIsSure) does it go to the model (Haiku 4.5). Never
 *            fails from the caller's side: offline, over the daily limit,
 *            slow or wrong, it's the phone's read (source 'local').
 *   suggest  the numbers-only behaviour summary + today's open tasks + your
 *            working notes → up to 3 Suggestions (Haiku 4.5). Any failure
 *            is [] — the phone's own rules (learn/suggest.ts) still run.
 *   reflect  once a week, with enough days behind it: last notes + the
 *            week's summary + which kinds of suggestion helped → new notes
 *            (Sonnet 5, queued as a Message Batch at half price; collected
 *            on a later app open — see maybeReflect).
 *
 * What leaves the phone is only ever the compact summary, the titles,
 * minutes and priorities of today's open tasks, your working notes, and
 * counts of accepted/dismissed suggestions. Never the raw event log.
 * Speech stays on the phone (voice.ts); only the transcript's text is read.
 *
 * Every answer is checked here before anything uses it, the same way
 * planner.ts does: a wrong shape is an error, never half an answer.
 */

export class CoachError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'busy' | 'bad' | 'limit' | 'gone' = 'bad') { super(message); }
}

/** One of today's open tasks, as the coach sees it. */
export interface TodayTask { id: string; title: string; minutes: number | null; priority: number }

export interface SuggestContext {
  tasks: TodayTask[];
  /** your working notes; read from the phone when left out */
  notes?: WorkingNotes | null;
  /** the local hour (0–23); now when left out */
  hour?: number;
}

/** How one kind of suggestion has landed, over the period being reflected on. */
export interface OutcomeCount { kind: SuggestionKind; accepted: number; dismissed: number; ignored: number }

export interface ReflectInput {
  /** the last 7 days, summarised on the phone */
  summary: string;
  outcomes: OutcomeCount[];
  /** the notes being rewritten; read from the phone when left out */
  previous?: WorkingNotes | null;
}

const KINDS: SuggestionKind[] = ['best_time', 'shrink', 'estimate', 'comeback', 'plan_it', 'rest', 'batch', 'model'];
const ACTIONS = ['focus', 'shrink', 'plan', 'set_minutes', 'schedule', 'none'] as const;
const NEEDS_TASK = new Set(['focus', 'shrink', 'plan', 'set_minutes', 'schedule']);
const READ_KINDS: StateRead['kind'][] = ['task', 'tasks', 'project', 'feeling', 'question'];
const LOADS: StateRead['load'][] = ['calm', 'busy', 'overwhelmed', 'low', 'unknown'];

/** Words Nura never says to you. The prompts forbid them; this is the net
 *  under the prompts, for text that will be shown. */
const NEVER = /\b(overdue|streaks?|adhd|depress(ed|ion)|disorders?|diagnos\w*|lazy|procrastinat\w*)\b/i;

const DAY = 86_400_000;

/* ------------------------------------------------------------------ *
 *  The phone's own read
 * ------------------------------------------------------------------ */

const OVERWHELMED = /\b(overwhelm(ed|ing)?|too much|drowning|can'?t cope|swamped|so much to do|everything at once|buried|stressed( out)?)\b/i;
const LOW = /\b(i'?m|i am|feel(ing)?|so)\s+(really\s+|so\s+|a bit\s+|pretty\s+|very\s+)?(tired|exhausted|drained|sad|down|low|flat|wiped|knackered)\b|\bno energy\b|\bburn(ed|t) out\b/i;
const BUSY = /\b(busy|hectic|slammed|rushed|packed day|no time)\b/i;
const CALM = /\b(i'?m|i am|feel(ing)?)\s+(calm|relaxed|good|fine|rested|great)\b|\b(good|quiet|slow) day\b/i;
/** something to do is in there, even if a feeling came first */
const TASK_CUE = /\b(need to|have to|must|should|got to|gotta|remember to|don'?t forget|want to|call|email|text|buy|book|pay|send|finish|write|clean|fix|pick up)\b/i;
const FEELING_START = /^(i\s*'?m\b|i am\b|i feel\b|feeling\b|ugh\b|so\b|today\b|everything\b|it'?s\b|this week\b)/i;
const BIG = /^(plan|organi[sz]e|prepare for|launch|build|renovate|redo)\s+(my|the|a|our)\b/i;
/** " and " starting one of these isn't a second task: "gym tuesday and thursday" */
const AND_GUARD = /^(mon|tue|wed|thu|fri|sat|sun|today|tomorrow|tonight|next|this|every|at|on|in|by|\d)/i;
const LEAD = /^(and|also|then|plus|i need to|i have to|need to|have to|i must|i should|i gotta|remember to)\s+/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

const clean = (p: string) => p.trim().replace(LEAD, '').replace(/[.!\s]+$/, '').trim();

/** Several things in one message, in your words — or [] when it's one. */
export function splitItems(text: string): string[] {
  // a list typed one per line is a list, however short the lines
  const lines = text.split(/\n+/).map(clean).filter(Boolean);
  if (lines.length >= 2) return lines;
  const pieces = text
    .split(/\s*(?:\n|;|,|\band then\b|\bthen\b|\balso\b)\s*/i)
    .flatMap(p => {
      const parts = p.split(/\s+and\s+/i);
      const out: string[] = [];
      for (const part of parts) {
        const prev = out[out.length - 1];
        if (prev !== undefined && (AND_GUARD.test(part.trim()) || words(part) < 2 || words(prev) < 2)) out[out.length - 1] = `${prev} and ${part}`;
        else out.push(part);
      }
      return out;
    })
    .map(clean)
    .filter(Boolean);
  // "buy milk, eggs, bread" is one shopping task, not three
  return pieces.length >= 2 && pieces.every(p => words(p) >= 2) ? pieces : [];
}

function loadOf(text: string): StateRead['load'] {
  if (OVERWHELMED.test(text)) return 'overwhelmed';
  if (LOW.test(text)) return 'low';
  if (BUSY.test(text)) return 'busy';
  if (CALM.test(text)) return 'calm';
  return 'unknown';
}

const LOCAL_REPLY: Partial<Record<StateRead['load'] | 'project', string>> = {
  overwhelmed: 'That sounds like a lot. One thing at a time is enough.',
  low: 'Low days count too. One small thing is plenty.',
  busy: 'A full day. Let’s keep it simple.',
  project: 'That’s a big one. Want Nu to find a first step?',
};

/**
 * What the phone can tell on its own: the kind of message (with the same
 * routing quick capture uses), several things split apart, and how you
 * seem — only when the words say so. Instant, free, offline. Replies are
 * only written in English; in other languages there is none.
 */
export function localRead(text: string, lang = 'en'): StateRead {
  const s = text.trim();
  // phones type ’ — the rules are written with '; items keep your own
  const probe = s.replace(/[\u2018\u2019]/g, "'");
  const load = loadOf(probe);
  const reply = (key: StateRead['load'] | 'project') => (lang === 'en' ? LOCAL_REPLY[key] : undefined);
  const intent = route(probe);

  if (['help', 'now', 'today', 'progress', 'count', 'hello'].includes(intent.kind) || /\?\s*$/.test(s)) {
    return { kind: 'question', load, source: 'local' };
  }
  if (load !== 'unknown' && !TASK_CUE.test(probe) && (FEELING_START.test(probe) || words(s) <= 6)) {
    return { kind: 'feeling', load, reply: reply(load), source: 'local' };
  }
  const items = splitItems(s);
  if (items.length) return { kind: 'tasks', items, load, reply: load !== 'unknown' ? reply(load) : undefined, source: 'local' };
  if (intent.kind === 'vague' || (BIG.test(probe) && words(s) >= 3)) {
    return { kind: 'project', load, reply: reply('project'), source: 'local' };
  }
  return { kind: 'task', load, source: 'local' };
}

/**
 * Whether the phone's read can stand on its own, so the model isn't asked.
 * Sure: one short clear task, a list one per line, a plain question, a short
 * feeling, a short vague goal. Not sure: long run-on sentences, more than
 * one sentence, a feeling mixed with things to do, a split with long parts —
 * and, in languages the rules don't know, anything but a few words.
 */
export function localIsSure(text: string, local: StateRead, lang = 'en'): boolean {
  const s = text.trim();
  if (!s) return true;
  const probe = s.replace(/[\u2018\u2019]/g, "'");
  const lines = s.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return local.kind === 'tasks' && local.load === 'unknown' && lines.length <= 12
      && lines.every(l => words(l) <= 10 && !/[.!?]\s+\S/.test(l));
  }
  const n = words(s);
  if (lang !== 'en') return n <= 6 && local.kind !== 'feeling';
  if (n > 20 || /[.!?]\s+\S/.test(s)) return false;
  if (local.load !== 'unknown' && TASK_CUE.test(probe)) return false;
  switch (local.kind) {
    case 'question': return true;
    case 'feeling':
    case 'project': return n <= 10;
    case 'tasks': return (local.items?.length ?? 0) <= 6 && (local.items ?? []).every(i => words(i) <= 8);
    case 'task': return n <= 12 && local.load === 'unknown';
  }
  return false;
}

/* ------------------------------------------------------------------ *
 *  Checking what comes back
 * ------------------------------------------------------------------ */

const bad = (why: string) => new CoachError(`The coach answered in a shape Nura doesn’t understand (${why}).`);

function line(v: unknown, max: number, what: string, allowEmpty = false): string {
  if (typeof v !== 'string') throw bad(what);
  const s = v.trim();
  if (!s && !allowEmpty) throw bad(what);
  if (NEVER.test(s)) throw bad(`${what}: wording`);
  return s.slice(0, max);
}

/** The server's read → a StateRead. */
export function readState(v: any): StateRead {
  if (!v || typeof v !== 'object') throw bad('read');
  if (!READ_KINDS.includes(v.kind)) throw bad('kind');
  if (!LOADS.includes(v.load)) throw bad('load');
  if (!Array.isArray(v.items)) throw bad('items');
  const items = v.items.map((x: unknown) => line(x, 300, 'item')).slice(0, 12);
  if (v.kind === 'tasks' && items.length < 2) throw bad('tasks');
  const reply = line(v.reply ?? '', 300, 'reply', true);
  return {
    kind: v.kind,
    ...(v.kind === 'tasks' ? { items } : {}),
    load: v.load,
    ...(reply ? { reply } : {}),
    source: 'model',
  };
}

/** A short stable hash, so the same advice about the same thing keeps its id. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The server's suggestions → Suggestions. `taskIds` are the ids that were
 *  sent; one the model made up is an error. `now` sets which day a
 *  "schedule at 10" means. */
export function readSuggestions(v: any, taskIds: Iterable<string>, now = Date.now()): Suggestion[] {
  const list = v?.suggestions;
  if (!Array.isArray(list) || list.length > 3) throw bad('suggestions');
  const ids = new Set(taskIds);
  return list.map((s: any): Suggestion => {
    if (!s || typeof s !== 'object') throw bad('suggestion');
    if (!KINDS.includes(s.kind)) throw bad('kind');
    if (s.who !== 'nu' && s.who !== 'ra') throw bad('who');
    if (typeof s.confidence !== 'number' || !(s.confidence >= 0 && s.confidence <= 1)) throw bad('confidence');
    const text = line(s.text, 300, 'text');
    const why = line(s.why, 300, 'why');
    const taskId = typeof s.task_id === 'string' ? s.task_id.trim() : '';
    if (taskId && !ids.has(taskId)) throw bad('task id');
    const a = s.action;
    if (!a || typeof a !== 'object' || !ACTIONS.includes(a.type)) throw bad('action');
    if (NEEDS_TASK.has(a.type) && !taskId) throw bad('action without a task');

    let action: Suggestion['action'];
    if (a.type === 'set_minutes') {
      if (!Number.isInteger(a.minutes) || a.minutes <= 0 || a.minutes > 600) throw bad('minutes');
      action = { type: 'set_minutes', minutes: a.minutes };
    } else if (a.type === 'schedule') {
      if (!Number.isInteger(a.at_hour) || a.at_hour < 0 || a.at_hour > 23) throw bad('hour');
      const at = new Date(now);
      at.setHours(a.at_hour, 0, 0, 0);
      action = { type: 'schedule', at: at.getTime() };
    } else if (a.type !== 'none') {
      action = { type: a.type };
    }

    return {
      id: `model:${s.kind}:${taskId || hash(text.toLowerCase())}`,
      kind: s.kind,
      text,
      why,
      ...(taskId ? { taskId } : {}),
      ...(action ? { action } : {}),
      confidence: s.confidence,
      who: s.who,
      source: 'model',
    };
  });
}

/** The server's reflection → the next WorkingNotes, or null when it had
 *  nothing to say (an empty list). */
export function readNotes(v: any, previous: WorkingNotes | null, now = Date.now()): WorkingNotes | null {
  const notes = v?.notes;
  if (!Array.isArray(notes) || notes.length > 8) throw bad('notes');
  const lines = notes.map((x: unknown) => line(x, 300, 'note'));
  if (!lines.length) return null;
  return { text: lines.join('\n'), at: now, version: (previous?.version ?? 0) + 1 };
}

/** Whether a weekly reflection should be queued now: enough days to rest
 *  on, a week since the last notes (or the last accepted batch), and — if
 *  the last try didn't get through — a day since. */
export function reflectDue(o: { notesAt: number | null; triedAt: number | null; activeDays: number; now: number }): boolean {
  if (o.activeDays < 5) return false;
  if (o.notesAt != null && o.now - o.notesAt < 7 * DAY) return false;
  if (o.triedAt != null && o.now - o.triedAt < DAY) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 *  Working notes, kept on the phone
 * ------------------------------------------------------------------ */

const NOTES_KEY = 'coach.notes';
const TRIED_KEY = 'coach.reflect.tried';
const SUBMITTED_KEY = 'coach.reflect.submitted';
const BATCH_KEY = 'coach.reflect.batch';

export async function getNotes(): Promise<WorkingNotes | null> {
  try {
    const raw = await getFlag(NOTES_KEY);
    if (!raw) return null;
    const n = JSON.parse(raw);
    return typeof n?.text === 'string' && typeof n?.at === 'number' && typeof n?.version === 'number'
      ? { text: n.text, at: n.at, version: n.version } : null;
  } catch { return null; }
}

export async function saveNotes(notes: WorkingNotes): Promise<void> {
  await setFlag(NOTES_KEY, JSON.stringify({ text: notes.text, at: notes.at, version: notes.version }));
}

/* ------------------------------------------------------------------ *
 *  Calling the server
 * ------------------------------------------------------------------ */

/** The same device id the planner sends (flag `device.id`). */
async function deviceId() {
  let id = await getFlag('device.id');
  if (!id) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    await setFlag('device.id', id);
  }
  return id;
}

/** A read is waited on, and the phone has its own answer, so it gets less
 *  time than the planner's 60 s; suggest and reflect run in the background. */
const TIMEOUT_MS = { read: 10_000, suggest: 60_000, reflect_submit: 60_000, reflect_collect: 30_000 } as const;

async function call(body: { op: keyof typeof TIMEOUT_MS } & Record<string, unknown>): Promise<any> {
  if (__DEV__ && (await getFlag('dev.coach')) === 'local') return localCoach(body);
  const lang = await getLanguage();
  const invoke = supabase.functions.invoke('nura-coach', {
    body: { ...body, language: languageName(lang) },
    headers: { 'x-nura-device': await deviceId() },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CoachError('The coach took too long.', 'busy')), TIMEOUT_MS[body.op]);
  });
  let res: Awaited<typeof invoke>;
  try {
    res = await Promise.race([invoke, timeout]);
  } catch (e) {
    if (e instanceof CoachError) throw e;
    throw new CoachError('Couldn’t reach the coach.', 'offline');
  } finally {
    clearTimeout(timer);
  }
  if (res.error) {
    const status = (res.error as any)?.context?.status as number | undefined;
    if (status === 429) throw new CoachError('The coach is at today’s limit.', 'limit');
    if (status === 404 || status === 410) throw new CoachError('That reflection is gone.', 'gone');
    if (status && status >= 500) throw new CoachError('The coach is having a moment.', 'busy');
    throw new CoachError('Couldn’t reach the coach.', 'offline');
  }
  return res.data;
}

/**
 * What a typed or spoken sentence is, and how you seem. Always answers:
 * the phone's own read when it's sure, otherwise the model's when it can
 * be had, otherwise the phone's own anyway.
 */
export async function readInput(text: string): Promise<StateRead> {
  const s = text.trim().slice(0, 1000);
  let lang = 'en';
  try { lang = await getLanguage(); } catch { /* English, then */ }
  const local = localRead(s, lang);
  if (localIsSure(s, local, lang)) return local;
  try {
    return readState(await call({ op: 'read', text: s }));
  } catch {
    return local;
  }
}

/**
 * Up to 3 suggestions from the model, for today. `summary` is the compact
 * behaviour summary (numbers, computed on the phone). Any failure — offline,
 * over the limit, a bad answer — is [].
 */
export async function modelSuggestions(summary: string, context: SuggestContext): Promise<Suggestion[]> {
  try {
    const s = summary.trim().slice(0, 4000);
    if (!s) return [];
    const notes = context.notes === undefined ? await getNotes() : context.notes;
    const tasks = context.tasks.slice(0, 30).map(t => ({
      id: String(t.id).slice(0, 60),
      title: String(t.title).trim().slice(0, 200) || 'Untitled',
      minutes: typeof t.minutes === 'number' && Number.isFinite(t.minutes) && t.minutes >= 0 ? Math.min(10_000, Math.round(t.minutes)) : null,
      priority: Math.max(0, Math.min(3, Math.round(t.priority || 0))),
    }));
    const now = Date.now();
    const hour = context.hour ?? new Date(now).getHours();
    const v = await call({ op: 'suggest', summary: s, notes: notes?.text.slice(0, 2000) ?? '', hour, tasks });
    return readSuggestions(v, tasks.map(t => t.id), now);
  } catch {
    return [];
  }
}

/** What queueing a reflection gave back: a batch to collect later, or —
 *  when the server couldn't batch it — the notes straight away (null when
 *  there was nothing new to say). */
export type ReflectStart = { batch: string } | { notes: WorkingNotes | null };

/**
 * Queue a rewrite of the working notes from the last week. Doesn't save —
 * see maybeReflect. Throws a CoachError when the coach can't be reached or
 * answers wrong.
 */
export async function reflect(input: ReflectInput, now = Date.now()): Promise<ReflectStart> {
  const summary = input.summary.trim().slice(0, 4000);
  if (!summary) throw new CoachError('Nothing to reflect on yet.');
  const previous = input.previous === undefined ? await getNotes() : input.previous;
  const outcomes = input.outcomes
    .filter(o => KINDS.includes(o.kind))
    .slice(0, KINDS.length)
    .map(o => ({ kind: o.kind, accepted: o.accepted | 0, dismissed: o.dismissed | 0, ignored: o.ignored | 0 }));
  const v = await call({ op: 'reflect_submit', previous: previous?.text.slice(0, 2000) ?? '', summary, outcomes });
  if (typeof v?.batch === 'string') {
    if (!/^msgbatch_[A-Za-z0-9]{1,100}$/.test(v.batch)) throw bad('batch');
    return { batch: v.batch };
  }
  return { notes: readNotes(v, previous, now) };
}

/** Ask whether a queued reflection is done. Throws a CoachError — kind
 *  'gone' when it ended badly or no longer exists. */
export async function collectReflection(batch: string, previous: WorkingNotes | null, now = Date.now()):
  Promise<{ pending: true } | { notes: WorkingNotes | null }> {
  const v = await call({ op: 'reflect_collect', batch });
  if (v?.pending === true) return { pending: true };
  return { notes: readNotes(v, previous, now) };
}

async function queued(): Promise<{ id: string; at: number } | null> {
  try {
    const q = JSON.parse((await getFlag(BATCH_KEY)) || 'null');
    return typeof q?.id === 'string' && typeof q?.at === 'number' ? q : null;
  } catch { return null; }
}

/** New notes are saved; "nothing new" keeps the old ones and starts a new week. */
async function settle(next: WorkingNotes | null, previous: WorkingNotes | null, now: number) {
  if (next) { await saveNotes(next); return next; }
  if (previous) await saveNotes({ ...previous, at: now });
  return null;
}

/**
 * The weekly reflection. Call it on app open with the week's summary, how
 * suggestions landed, and the profile's activeDays14. It
 *   - collects a queued reflection if there is one (saving the new notes),
 *   - otherwise queues one, at most once every 7 days and only with at
 *     least 5 active days of data (a try that didn't get through is
 *     retried at most once a day).
 * Batches usually end within an hour and always within 24; one still not
 * done after 2 days is dropped. Returns the new notes when it saved some,
 * otherwise null. Never throws.
 */
export async function maybeReflect(
  input: { summary: string; outcomes: OutcomeCount[]; activeDays: number },
  now = Date.now(),
): Promise<WorkingNotes | null> {
  try {
    const previous = await getNotes();
    const q = await queued();
    if (q) {
      let res: Awaited<ReturnType<typeof collectReflection>>;
      try {
        res = await collectReflection(q.id, previous, now);
      } catch (e) {
        // ended badly, or an answer that will never pass: stop asking
        if (e instanceof CoachError && (e.kind === 'gone' || e.kind === 'bad')) await setFlag(BATCH_KEY, '');
        return null;
      }
      if ('pending' in res) {
        if (now - q.at > 2 * DAY) await setFlag(BATCH_KEY, '');
        return null;
      }
      await setFlag(BATCH_KEY, '');
      return settle(res.notes, previous, now);
    }

    const tried = Number(await getFlag(TRIED_KEY)) || null;
    const submitted = Number(await getFlag(SUBMITTED_KEY)) || 0;
    const notesAt = Math.max(previous?.at ?? 0, submitted) || null;
    if (!reflectDue({ notesAt, triedAt: tried, activeDays: input.activeDays, now })) return null;
    await setFlag(TRIED_KEY, String(now));
    const start = await reflect({ summary: input.summary, outcomes: input.outcomes, previous }, now);
    await setFlag(SUBMITTED_KEY, String(now));
    if ('batch' in start) {
      await setFlag(BATCH_KEY, JSON.stringify({ id: start.batch, at: now }));
      return null;
    }
    return settle(start.notes, previous, now);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 *  Dev only: a stand-in coach
 * ------------------------------------------------------------------ */

/**
 * Lets the learning loop run end to end before nura-coach is deployed —
 * set the flag `dev.coach` to `local`. It answers in the server's shapes
 * (so the checks above still run) with the phone's own read and fixed
 * wording; it knows nothing a model would. Compiled out of release builds
 * with the rest of __DEV__.
 */
async function localCoach(body: Record<string, any>): Promise<any> {
  await new Promise(r => setTimeout(r, 400));
  if (body.op === 'read') {
    const r = localRead(String(body.text ?? ''));
    return { kind: r.kind, items: r.items ?? [], load: r.load, reply: r.reply ?? '' };
  }
  if (body.op === 'suggest') {
    const tasks: TodayTask[] = body.tasks ?? [];
    const unsized = tasks.find(t => t.minutes == null);
    const top = [...tasks].sort((a, b) => b.priority - a.priority)[0];
    const out: any[] = [];
    if (unsized) out.push({
      kind: 'estimate', text: `Give “${unsized.title}” 25 minutes?`, why: 'Stand-in coach (dev.coach=local): it has no length yet.',
      task_id: unsized.id, action: { type: 'set_minutes', minutes: 25, at_hour: -1 }, confidence: 0.3, who: 'ra',
    });
    if (top && top !== unsized) out.push({
      kind: 'model', text: `Start with “${top.title}”?`, why: `Stand-in coach (dev.coach=local): priority ${top.priority} of 3.`,
      task_id: top.id, action: { type: 'focus', minutes: 0, at_hour: -1 }, confidence: 0.3, who: 'ra',
    });
    return { suggestions: out };
  }
  if (body.op === 'reflect_submit') return { batch: 'msgbatch_devstandin' };
  return {
    notes: [
      'These are stand-in notes from the dev coach (dev.coach=local).',
      'A real reflection is written weekly from your own numbers.',
    ],
  };
}
