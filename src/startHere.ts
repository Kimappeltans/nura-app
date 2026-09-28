/**
 * START HERE, on Home (Kim, 28 September): three real steps for someone new,
 * each crossed off when it's done, and the whole block gone after the last.
 *
 *   1. Put it all down     done once there's a task (Tell Nu)
 *   2. Let Ra pick one     done once Ra has shown a task (the event `shown`)
 *   3. Begin · 5 minutes   done once a session has started (`session_start`,
 *                          or one running now); then the block leaves for good
 *
 * Per device (app_state), and never for someone who was here before: a
 * finished thing or a session older than the moment this device first
 * offered Start here means a returning person, and it's retired for good.
 * That also catches done tasks that arrive by sync after it first showed.
 *
 * Pure: the store and the database are read by useStartHere
 * (src/components/StartHere.tsx), and tested in tests/starthere.test.cjs.
 */

export type StartStep = 1 | 2 | 3;

export interface StartFacts {
  now: number;
  /** when this device first offered Start here (`start.since`), null before that */
  since: number | null;
  /** retired for good (`start.off`): skipped, finished, or a returning person */
  off: boolean;
  /** steps already crossed off on this device (`start.1` …): they stay crossed */
  crossed: readonly StartStep[];
  /** tasks on this device, in any state */
  tasks: number;
  /** the earliest finished thing: a done task's completed_at, or a `completed` event */
  firstDone: number | null;
  /** the earliest `session_start`, or the running session's start */
  firstSession: number | null;
  /** the latest `shown`: Ra showing a task */
  lastShown: number | null;
}

export interface StartHere {
  show: boolean;
  /** write `start.off` with this and never show it again */
  retire: 'returning' | 'finished' | null;
  /** write `start.since` with this (it was unset and the block is showing) */
  begin: number | null;
  /** steps 1, 2, 3 */
  done: [boolean, boolean, boolean];
  /** the first step not done yet */
  current: StartStep | null;
  /** steps done now that weren't crossed off before: write `start.N` */
  newly: StartStep[];
}

const HIDDEN = (retire: StartHere['retire']): StartHere =>
  ({ show: false, retire, begin: null, done: [false, false, false], current: null, newly: [] });

export function startHere(f: StartFacts): StartHere {
  if (f.off) return HIDDEN(null);
  const since = f.since ?? f.now;
  const before = (at: number | null) => at != null && at < since;
  // someone who had already finished something, or begun a session, before
  // Start here was ever offered on this device: not new
  if (before(f.firstDone) || before(f.firstSession)) return HIDDEN('returning');

  const was = new Set(f.crossed);
  const started = was.has(3) || f.firstSession != null;
  if (started) return HIDDEN('finished');
  const picked = was.has(2) || (f.lastShown != null && f.lastShown >= since);
  const down = was.has(1) || picked || f.tasks > 0 || f.firstDone != null;

  const done: [boolean, boolean, boolean] = [down, picked, false];
  const current: StartStep = !down ? 1 : !picked ? 2 : 3;
  const newly = ([1, 2] as const).filter(s => done[s - 1] && !was.has(s));
  return { show: true, retire: null, begin: f.since == null ? f.now : null, done, current, newly };
}

/** The flags Start here keeps in app_state. */
export const START_KEYS = {
  since: 'start.since',
  off: 'start.off',
  step: (s: StartStep) => `start.${s}`,
} as const;
