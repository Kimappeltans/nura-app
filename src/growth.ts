import { ACTIVITIES, type ActivityId } from './activities';

/**
 * Growing Nu and Ra.
 *
 * The reward system already banks light, but light is a number, and a number
 * is a weak reward — it tells you that you did something without ever showing
 * you anything. Growth turns the same ledger into a visible companion: the
 * characters you see forty times a day are literally bigger and brighter than
 * they were last month, and you didn't have to open a stats screen to notice.
 *
 * Two rules, both inherited from the light economy and both non-negotiable:
 *
 *  1. GROWTH NEVER REVERSES. There is no decay, no "your pet is sad because
 *     you didn't open the app", no guilt mechanic. Tamagotchi-style neglect
 *     pressure is precisely the wrong instrument for someone whose problem is
 *     that they already feel behind.
 *  2. IT'S NOT A GATE. Nothing in the app is locked behind a stage. Growth is
 *     something to notice, not a currency to spend.
 */

export interface Stage {
  n: number;
  name: string;
  at: number;          // light required
  /** how much bigger the characters render, relative to base */
  scale: number;
  /** the aura behind them: opacity of the radial glow */
  glow: number;
  /** what visibly changed, said plainly */
  note: string;
}

export const STAGES: Stage[] = [
  { n: 0, name: 'Spark',    at: 0,    scale: 1.00, glow: 0.00, note: 'Just arrived.' },
  { n: 1, name: 'Ember',    at: 60,   scale: 1.05, glow: 0.10, note: 'A faint warmth around them.' },
  { n: 2, name: 'Glow',     at: 200,  scale: 1.10, glow: 0.20, note: 'They give off light now.' },
  { n: 3, name: 'Beacon',   at: 500,  scale: 1.16, glow: 0.32, note: 'Bright enough to see by.' },
  { n: 4, name: 'Radiant',  at: 1200, scale: 1.22, glow: 0.44, note: 'Hard to look away from.' },
  { n: 5, name: 'Luminous', at: 2600, scale: 1.28, glow: 0.58, note: 'They light the whole screen.' },
  { n: 6, name: 'Solar',    at: 5000, scale: 1.34, glow: 0.72, note: 'As far as they go. Very few get here.' },
];

export function stageFor(light: number): Stage {
  let out = STAGES[0];
  for (const s of STAGES) if (light >= s.at) out = s;
  return out;
}

export function nextStage(light: number): Stage | null {
  return STAGES.find(s => s.at > light) ?? null;
}

/** 0..1 through the current stage. */
export function stageProgress(light: number): number {
  const cur = stageFor(light), nxt = nextStage(light);
  if (!nxt) return 1;
  return Math.max(0, Math.min(1, (light - cur.at) / (nxt.at - cur.at)));
}

/* ------------------------------------------------------------------ *
 *  The collection.
 *
 *  Every one of the 36 activity scenes starts locked and is revealed the
 *  first time you actually FINISH something of that kind. It costs nothing
 *  to build — the art already ships — and it turns the catalogue into a
 *  record of your life rather than a menu.
 *
 *  Deliberately unlocked by DOING, not by scheduling. You can't fill the
 *  book by planning, which is the failure mode this whole app is about.
 * ------------------------------------------------------------------ */

export interface Collection {
  unlocked: Set<string>;
  total: number;
  /** the next few still to find, in catalogue order */
  remaining: ActivityId[];
}

export function collectionFrom(doneActivities: string[]): Collection {
  const unlocked = new Set(doneActivities.filter(Boolean));
  return {
    unlocked,
    total: ACTIVITIES.length,
    remaining: ACTIVITIES.filter(a => !unlocked.has(a.id)).map(a => a.id),
  };
}
