import { localRead, localIsSure, readByModel } from './coach';
import { stripFiller } from './assistant';

// the filler rules live with the parser (src/assistant.ts), so every way in uses them
export { stripFiller };
import type { StateRead } from './learn/types';

/**
 * UNDERSTAND: what did you just give Nu, and how sure is the phone?
 * (Target architecture, "Understand"; the Claude Doc "Nura: spec and
 * architecture", tab Target.)
 *
 * Tell Nu used to ask "can I read this as a task?" and the phone's answer
 * was final whenever the sentence was short, so "finish my website" became
 * a task and "hello, I want to finish my website" a greeting. Now:
 *
 *   1. the filler goes first ("hello", "I want to", "can you help me");
 *   2. the phone reads what's left and scores how sure it is;
 *   3. only a confident read is final:
 *        0.85 or more   the phone's read stands, no model;
 *        0.5 to 0.85    Claude reads it when AI help is on (models propose,
 *                       Nura decides: the answer is checked in coach.ts);
 *                       without AI the phone's read stands;
 *        under 0.5      unclear: Nu asks one question instead of guessing.
 */

export type UnderstoodType = 'quick_task' | 'task_with_steps' | 'project' | 'note' | 'deadline' | 'unclear';

export interface Understood {
  type: UnderstoodType;
  /** 0 to 1: how sure the reading is */
  confidence: number;
  /** your words with the filler taken off, for the parser and the planner */
  text: string;
  /** a name for it: for a project, the goal without its purpose clause */
  title: string;
  /** why or when, for a project: "before I start applying" */
  purpose: string | null;
  needsPlanning: boolean;
  /** the one question, when unclear */
  question?: string;
  /** several things in one sentence, in your words */
  items?: string[];
  /** the read underneath: its kind, how you seem, and a reply when there is one */
  read: StateRead;
}

/** At or above: the phone's read is final. */
export const SURE = 0.85;
/** Under: Nu asks rather than guessing. */
export const UNSURE = 0.5;

/** Verbs that start a goal, not a single action. */
const GOAL_VERB = /^(finish|complete|launch|ship|build|create|make|design|redesign|redo|rebuild|renovate|organi[sz]e|plan|prepare(?:\s+for)?|get\s+ready(?:\s+for)?|set\s+up|start|write|learn|move|improve|update|overhaul|clean\s+up|declutter|study\s+for|apply\s+(?:for|to))\b/i;
/** Things big enough that "finish X" is a project. */
const BIG_THING = /\b(website|site|app|portfolio|thesis|dissertation|book|novel|chapter|business|startup|company|shop|store|house|flat|apartment|garage|kitchen|bathroom|garden|wedding|trip|holiday|move|taxes|tax return|course|exam|exams|presentation|project|report|paper|essay|application|applications|cv|resume|campaign|album|podcast|channel|brand|product|plan|budget|studio|room|wardrobe|closet|research|proposal|pitch|deck|game|film|video|newsletter|blog|launch)\b/i;
/** Verbs that make one small, concrete action. */
const SMALL_VERB = /^(call|ring|phone|email|e-mail|text|message|dm|reply|buy|get\s+some|pay|book|pick\s+up|drop\s+off|send|return|order|cancel|renew|print|sign|post|check|water|feed|take|bring|collect|wash|charge|remind|ask|tell|thank|invite|confirm|schedule|file|submit|read|watch|listen|clean|tidy|fix)\b/i;
/** "before I start applying", "so that I can...": a goal with a reason. */
const PURPOSE = /\s+(before|by the time|so that|so i can|so we can|because|in time for|ahead of)\s+/i;
/** It's a deadline when the words say due or by. */
const DEADLINE = /\b(due|deadline|by (?:mon|tue|wed|thu|fri|sat|sun|tomorrow|tonight|next|the \d|\d))/i;
/** Hedges: the words themselves aren't sure what the thing is. */
const HEDGE = /\b(maybe|perhaps|not sure|or something|something about|kind of|sort of|i guess|idk)\b/i;
/** Any verb at all at the front: without one, a hedged line is unclear. */
const ANY_VERB = new RegExp(`${GOAL_VERB.source}|${SMALL_VERB.source}|^(do|see|meet|go|find|think|look|sort|deal|work|figure|try|see|visit|talk|practise|practice|write)\\b`, 'i');

const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
const cap = (s: string) => s.replace(/^\w/, c => c.toUpperCase());

/** The phone's own reading: instant, free, offline. One line at a time. */
export function understandLocal(input: string, lang = 'en'): Understood {
  const text = stripFiller(input) || input.trim();
  const read = localRead(text, lang);
  const n = count(text);
  const sure = localIsSure(text, read, lang);
  const [goalPart, ...rest] = text.split(PURPOSE);
  const purpose = rest.length ? text.slice(goalPart.length).trim() : null;
  const base = { text, title: cap(goalPart.trim()), purpose, read };

  // several things in one sentence
  if (read.kind === 'tasks' && read.items?.length) {
    return { ...base, type: 'quick_task', confidence: sure ? 0.9 : 0.7, needsPlanning: false, items: read.items };
  }
  // a feeling or a question: not a thing to do, whoever reads it
  if (read.kind === 'feeling' || read.kind === 'question') {
    return { ...base, type: 'note', confidence: sure ? 0.9 : 0.6, needsPlanning: false };
  }
  // the old rules already call it a project ("work on…", "plan my…")
  if (read.kind === 'project') {
    return { ...base, type: 'project', confidence: 0.9, needsPlanning: true };
  }
  // "finish my website", "launch the podcast before spring"
  if (GOAL_VERB.test(text) && BIG_THING.test(goalPart)) {
    return { ...base, type: 'project', confidence: purpose ? 0.84 : 0.8, needsPlanning: true };
  }
  // a hedge and no verb: "Sarah about the dentist maybe Thursday"
  if (HEDGE.test(text) && !ANY_VERB.test(text)) {
    return { ...base, type: 'unclear', confidence: 0.35, needsPlanning: false, question: 'What’s the thing to do?' };
  }
  if (DEADLINE.test(text)) {
    return { ...base, title: cap(text), type: 'deadline', confidence: 0.88, needsPlanning: false };
  }
  // a small, concrete action: "buy toothpaste tomorrow"
  if (SMALL_VERB.test(text) && n <= 12) {
    return { ...base, title: cap(text), type: 'quick_task', confidence: 0.95, needsPlanning: false };
  }
  // a goal verb on something that may or may not be big: "finish the slides"
  if (GOAL_VERB.test(text)) {
    return { ...base, title: cap(text), type: 'quick_task', confidence: 0.6, needsPlanning: false };
  }
  // anything else: sure when it's short, less so as it grows
  const confidence = n <= 6 ? 0.9 : n <= 12 ? 0.8 : 0.6;
  return { ...base, title: cap(text), type: 'quick_task', confidence: sure ? confidence : Math.min(confidence, 0.6), needsPlanning: false };
}

/** A model read, turned into the same shape; the model's word decides the type. */
export function fromModel(local: Understood, r: StateRead): Understood {
  const read = r;
  if (r.kind === 'tasks' && r.items?.length) return { ...local, type: 'quick_task', confidence: 0.9, items: r.items, needsPlanning: false, question: undefined, read };
  if (r.kind === 'project') return { ...local, type: 'project', confidence: 0.9, items: undefined, needsPlanning: true, question: undefined, read };
  if (r.kind === 'task') {
    const type = local.type === 'deadline' ? 'deadline' : 'quick_task';
    return { ...local, type, title: cap(local.text), confidence: 0.9, items: undefined, needsPlanning: false, question: undefined, read };
  }
  return { ...local, type: 'note', confidence: 0.9, items: undefined, needsPlanning: false, question: undefined, read };
}

/**
 * The whole read: the phone's, and Claude's when the phone isn't sure and
 * AI help is on. Never fails: without the model it's the phone's read.
 */
export async function understand(input: string, lang = 'en'): Promise<Understood> {
  const local = understandLocal(input, lang);
  // sure enough to stand, or unsure enough that Nu should ask, not guess
  if (local.confidence >= SURE || local.confidence < UNSURE) return local;
  const r = await readByModel(local.text);
  return r ? fromModel(local, r) : local;
}
