/**
 * THE LEARNING LOOP — the shared shapes.
 *
 * Nura learns how you work without training a model on you: it keeps a small
 * behaviour profile computed on the phone from what you already do (the
 * event log, tasks, projects), a few lines of "working notes" a model
 * rewrites now and then from that profile, and a record of which suggestions
 * helped. Suggestions are ranked by what has helped before, so they change
 * as you do. See src/learn/README.md.
 *
 *   capture  → signals.ts   (on the phone, free)      → BehaviorProfile
 *   read     → coach.ts     (Haiku 4.5, cheap)        → StateRead of what you typed or said
 *   suggest  → suggest.ts   (local rules, free) + coach.ts (Sonnet 5) → Suggestion[]
 *   learn    → feedback.ts  (on the phone)            → which kinds of suggestion work for you
 *   evolve   → coach.ts     (Sonnet 5, weekly)        → WorkingNotes
 */

/** One hour-of-day or weekday bucket: how often things started there got done. */
export interface RateBucket { key: number; started: number; completed: number }

export interface BehaviorProfile {
  /** when it was computed (ms) — recomputed at most every few hours */
  at: number;
  /** how many days of history it rests on; below ~5 the rest is a guess */
  days: number;
  /** completions per hour of the day (0–23) and weekday (0 = Sunday) */
  byHour: RateBucket[];
  byWeekday: RateBucket[];
  /** the hours where finishing is likeliest, best first (at most 3) */
  bestHours: number[];
  /** actual ÷ estimated minutes, median over tasks with both (1 = spot on, 1.6 = 60% over) */
  estimateRatio: number | null;
  /** how many finished, estimated tasks estimateRatio rests on (optional: added by signals.ts) */
  estimateN?: number;
  /** what a focus session usually lasts, in minutes (median) */
  typicalSessionMin: number | null;
  /** how often a session is stopped early and still counts (0–1) */
  earlyStopRate: number | null;
  /** snoozes/skips per task, by label — which kinds of task get put off */
  putOffByLabel: { label: string; rate: number; n: number }[];
  /** how a started project step usually goes: replans as too big / blocked, per step */
  tooBigRate: number | null;
  blockedRate: number | null;
  /** tasks captured vs finished over the last 7 days */
  captured7: number;
  completed7: number;
  /** days in the last 14 with at least one thing done */
  activeDays14: number;
  /** days since the app was last opened before today (a comeback, if large) */
  gapDays: number;
  /** actual ÷ estimated, per label with at least 3 finished tasks ("writing takes you 1.6×") */
  estimateByLabel?: { label: string; ratio: number; n: number }[];
  /** what you really finish on a day you do something, in minutes (median, last 14 days) */
  capacityMin?: number | null;
  /** how many days capacityMin rests on */
  capacityDays?: number;
}

/** What a sentence you typed or said seems to be, and how you seem to be. */
export interface StateRead {
  /** a task, several tasks, something too big to be a task, a feeling, a question */
  kind: 'task' | 'tasks' | 'project' | 'feeling' | 'question';
  /** when it's several: the separate things, in your words */
  items?: string[];
  /** how you come across — only when the words actually say so */
  load: 'calm' | 'busy' | 'overwhelmed' | 'low' | 'unknown';
  /** a short, kind reply Nu could say, if one would help (never a lecture) */
  reply?: string;
  /** where it came from: the rules on the phone, or the model */
  source: 'local' | 'model';
}

export type SuggestionKind =
  | 'best_time'        // "you finish writing in the morning — do this at 10?"
  | 'shrink'           // "this has been put off 3 times — make it smaller?"
  | 'estimate'         // "things like this take you ~1.5× longer — give it 25 min?"
  | 'comeback'         // after a gap: one small thing, no backlog
  | 'plan_it'          // a task that's really a project — let Nu plan it
  | 'rest'             // a lot done / past your day's end — stop is allowed
  | 'batch'            // several small admin things — do them in one go
  | 'model'            // written by the model from your notes
  | 'reduce_day';      // today holds more than you finish — keep a few, leave the rest?

/**
 * What kind of change the planner proposes (target architecture,
 * "Interventions"): suggestions are the planner's proposals, typed by what
 * Yes would change, not by the rule that noticed.
 */
export type InterventionType =
  | 'next_action' | 'resize_task' | 'reschedule' | 'replan_project' | 'reduce_day'
  | 'return_after_gap' | 'increase_estimate' | 'rest';

export interface Suggestion {
  id: string;                 // stable for the same advice about the same thing
  kind: SuggestionKind;
  text: string;               // what Nu or Ra says, one or two short sentences
  why?: string;               // what it's based on, in plain words ("5 of your last 6…")
  taskId?: string;
  /** when it's about several tasks at once (batch): all of them, taskId unset */
  taskIds?: string[];
  /** what "Yes" does */
  action?: {
    type: 'focus' | 'shrink' | 'plan' | 'set_minutes' | 'schedule' | 'reduce_day' | 'none';
    minutes?: number; at?: number;
    /** reduce_day: what stays on Today, and what's left for later */
    keep?: string[]; defer?: string[];
  };
  /** the planner's kind of change (interventions.ts) */
  type?: InterventionType;
  /** 0–1: how sure, from the data behind it */
  confidence: number;
  who: 'nu' | 'ra';
  source: 'local' | 'model';
}

export type SuggestionOutcome = 'shown' | 'accepted' | 'dismissed' | 'ignored';

/** The model's running notes about how this person works — plain sentences, rewritten weekly. */
export interface WorkingNotes { text: string; at: number; version: number }
