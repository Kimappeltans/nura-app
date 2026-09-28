/**
 * THE GUIDE (Kim, 28 September): one first-run guide, the same on the
 * phone's Home and the desktop's. Show first, then do; one step at a time,
 * each ticked off by what the person really did, never by a button that
 * says so.
 *
 *   1. Put it all down        a task of their own exists, in any state
 *   2. Start your next move   a `session_start`, or a session running now
 *   3. Plan something bigger  a project exists
 *   4. Change the day         Not now or Something changed, used once (the
 *                             events `swapped`, `skipped`, `snoozed`, or the
 *                             desktop's Something changed writing `guide2.4`)
 *   5. See what Nura learns   What Nura has learned opened once (`guide2.5`,
 *                             written by app/learned.tsx)
 *
 * All five done, or Hide, and it's gone for good (`guide2.off`). Never for
 * someone who was here before: a finished thing or a session older than the
 * moment this device first offered the guide means a returning person. Not
 * for someone who already hid or finished one of the two guides it replaces
 * (Start here's `start.off`, Getting started's `guide.hidden`). Not at night.
 * `?guide=again` on the web starts it over (`guide2.again`): then only what
 * happens from that moment on counts.
 *
 * Pure: the store and the database are read by useGuide
 * (src/components/Guide.tsx), and tested in tests/guide.test.cjs.
 */

export type GuideStep = 1 | 2 | 3 | 4 | 5;
export const GUIDE_STEPS: readonly GuideStep[] = [1, 2, 3, 4, 5];

export interface GuideFacts {
  now: number;
  /** when this device first offered the guide (`guide2.since`), null before that */
  since: number | null;
  /** gone for good (`guide2.off`): hidden, finished, returning, or an old guide put away */
  off: boolean;
  /** started over with `?guide=again`: only what happens from `since` counts */
  again: boolean;
  /** the guides this replaces: put away (Start here's `start.off`, Getting started's `guide.hidden`), and when Start here first showed */
  old: { off: boolean; since: number | null };
  /** steps already ticked on this device (`guide2.1` …): they stay ticked */
  crossed: readonly GuideStep[];
  /** after the day's end: nothing shows, but nothing is lost */
  night: boolean;
  /** tasks on this device, in any state, and when the newest was made */
  tasks: number;
  lastTask: number | null;
  /** the earliest finished thing: a done task's completed_at, or a `completed` event */
  firstDone: number | null;
  /** the earliest and the latest `session_start` (with a running session's start) */
  firstSession: number | null;
  lastSession: number | null;
  /** when the newest project was made */
  lastProject: number | null;
  /** the latest Not now or Something else (`swapped`, `skipped` that wasn't a delete, `snoozed`) */
  lastChange: number | null;
}

export interface Guide {
  show: boolean;
  /** write `guide2.off` with this and never show it again */
  retire: 'returning' | 'finished' | 'old' | null;
  /** write `guide2.since` with this (it was unset) */
  begin: number | null;
  /** steps 1 to 5 */
  done: [boolean, boolean, boolean, boolean, boolean];
  /** how many are done: never goes down */
  count: number;
  /** the first step not done yet: the one at full size */
  current: GuideStep | null;
  /** steps done now that weren't ticked before: write `guide2.N` */
  newly: GuideStep[];
}

const NONE: Guide['done'] = [false, false, false, false, false];
const HIDDEN = (retire: Guide['retire'], begin: number | null = null): Guide =>
  ({ show: false, retire, begin, done: NONE, count: 0, current: null, newly: [] });

export function guide(f: GuideFacts): Guide {
  if (f.off) return HIDDEN(null);
  // the first time it's offered: when Start here first showed, if it did (so what was done in it counts as new)
  const begin = f.since == null ? Math.min(f.old.since ?? f.now, f.now) : null;
  const since = f.since ?? begin!;
  if (!f.again) {
    // one of the old guides was put away, or finished: this one isn't offered on top
    if (f.since == null && f.old.off) return HIDDEN('old');
    // someone who had finished something, or begun a session, before the guide was ever offered: not new
    const before = (at: number | null) => at != null && at < since;
    if (before(f.firstDone) || before(f.firstSession)) return HIDDEN('returning');
  }

  // started over: only what happens from then on
  const from = f.again ? since : -Infinity;
  const at = (x: number | null) => x != null && x >= from;
  const was = new Set(f.crossed);
  const done: Guide['done'] = [
    was.has(1) || (f.again ? at(f.lastTask) : f.tasks > 0),
    was.has(2) || at(f.lastSession),
    was.has(3) || at(f.lastProject),
    was.has(4) || at(f.lastChange),
    was.has(5),
  ];
  const newly = GUIDE_STEPS.filter(s => done[s - 1] && !was.has(s));
  const count = done.filter(Boolean).length;
  if (count === GUIDE_STEPS.length) return { ...HIDDEN('finished', begin), done, count, newly };
  const current = GUIDE_STEPS.find(s => !done[s - 1]) ?? null;
  return { show: !f.night, retire: null, begin, done, count, current, newly };
}

/** The flags the guide keeps in app_state, and the old guides' it respects. */
export const GUIDE_KEYS = {
  since: 'guide2.since',
  off: 'guide2.off',
  again: 'guide2.again',
  step: (s: GuideStep) => `guide2.${s}`,
  /** Start here (the phone's old guide): put away, and when it first showed */
  oldStartOff: 'start.off',
  oldStartSince: 'start.since',
  /** Getting started (the desktop's old guide): hidden or finished when '1' */
  oldDeskHidden: 'guide.hidden',
} as const;

/** What you can say in step 1: one thing, and several at once. Shown, never added. */
export const SAY = [
  { what: 'One thing', words: 'pay rent friday 10 min' },
  { what: 'Several at once', words: 'finish the deck, call the dentist tue 3pm, text Sarah back' },
] as const;

/** Step 3's example: the goal, and a path Nu might make of it (a picture, not a plan). */
export const BIG = {
  words: 'launch my website',
  path: ['List the pages you need', 'Write the home page', 'Put it online'],
} as const;
