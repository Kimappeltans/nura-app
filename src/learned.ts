import { getFlag, setFlag, type PatternRow } from './db';
import { getProfile, MIN_DAYS } from './learn/signals';
import type { BehaviorProfile } from './learn/types';
import { labelById } from './labels';
import { ENOUGH, TRUSTED, offId, storedPatterns } from './patterns';

/**
 * What Nura has learned, as the screen shows it (app/learned.tsx): each
 * pattern as one plain fact, what it rests on, and how far along it is.
 *
 *   learning   nothing yet, or too little to say
 *   noticing   a pattern, but not one the planner acts on (under TRUSTED)
 *   learned    the planner uses it
 *
 * learnedFrom() is the arithmetic and the words, on plain rows, so it can be
 * tested without a database; loadLearned() is the reads that feed it.
 *
 * No count here goes down. The profile looks back over a window, so what a
 * pattern rests on can shrink as old days leave it: the screen shows the most
 * each count has ever been (flag learned.seen).
 */

export type Stage = 'learning' | 'noticing' | 'learned';

export const STAGE_NAME: Record<Stage, string> = {
  learning: 'Still learning',
  noticing: 'Starting to notice',
  learned: 'Learned',
};

/** How far along a pattern is, from how sure Nura is of it. */
export function stageOf(confidence: number | null | undefined): Stage {
  if (confidence == null || !(confidence > 0)) return 'learning';
  return confidence >= TRUSTED ? 'learned' : 'noticing';
}

/** Counts only go up: the most each has been seen at. */
export function highWater(seen: Record<string, number>, counts: Record<string, number>): Record<string, number> {
  const out = { ...seen };
  for (const [k, n] of Object.entries(counts)) {
    if (Number.isFinite(n) && n > (out[k] ?? 0)) out[k] = n;
  }
  return out;
}

export interface LearnedRow {
  /** stable while the row is: the pattern's offId, or the kind while there's nothing yet */
  key: string;
  /** the fact, or what Nura is still learning */
  title: string;
  stage: Stage;
  /** turned off with "That's not me": the numbers go on underneath */
  off: boolean;
  /** what it rests on: "From 8 timed tasks", "2 of 5 timed tasks so far" */
  evidence: string | null;
  /** the stored pattern behind it, which the off switch acts on; none while there's nothing yet */
  pattern: Pick<PatternRow, 'kind' | 'scope' | 'value'> | null;
}

export interface LearnedGroup { key: string; title: string; rows: LearnedRow[] }

export interface Learned {
  /** how much history it all rests on: "From 12 days", "2 of 5 days so far" */
  basis: string;
  groups: LearnedGroup[];
  /** the counts as shown, to keep (learned.seen) */
  seen: Record<string, number>;
}

/* ---------------- the words ---------------- */

const some = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a count says: short of ENOUGH, how far along; from there, what it rests on. */
const restsOn = (n: number, one: string, many = `${one}s`) =>
  n >= ENOUGH ? `From ${some(n, one, many)}` : `${n} of ${ENOUGH} ${many} so far`;

const hourSaid = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });

function minutesSaid(min: number): string {
  const m = Math.max(1, Math.round(min));
  const h = Math.floor(m / 60), rest = m % 60;
  if (!h) return some(m, 'minute');
  return rest ? `${some(h, 'hour')} ${some(rest, 'minute')}` : some(h, 'hour');
}

const timesSaid = (n: number) => (n <= 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

const SHARES = [[1, 10], [1, 5], [1, 4], [1, 3], [2, 5], [1, 2], [3, 5], [2, 3], [3, 4], [4, 5], [9, 10]] as const;

/** A share as the nearest plain one ("1 in 4 …"), with the two ends in words. */
function shareSaid(rate: number, what: string, does: (one: boolean) => string): string {
  if (rate < 0.05) return `${what} rarely ${does(false)}`;
  if (rate > 0.95) return `${what} nearly always ${does(false)}`;
  const far = (s: readonly [number, number]) => Math.abs(s[0] / s[1] - rate);
  const [k, of] = SHARES.reduce<readonly [number, number]>((best, s) => (far(s) < far(best) ? s : best), SHARES[0]);
  return `${k} in ${of} ${what.toLowerCase()} ${does(k === 1)}`;
}

function paceSaid(ratio: number, label?: string): string {
  const r = Math.round(ratio * 10) / 10;
  const name = label ? labelById(label)?.name ?? label : null;
  if (r === 1) return name ? `${name} takes about as long as you guess` : 'Things take about as long as you guess';
  return name ? `${name} takes you ${r}× your guess` : `Things take you ${r}× your guess`;
}

/* ---------------- the rows ---------------- */

type Stored = Pick<PatternRow, 'kind' | 'scope' | 'value' | 'confidence' | 'sample_count'>;

export function learnedFrom(input: {
  rows: Stored[];
  off?: Set<string>;
  profile?: Pick<BehaviorProfile, 'days' | 'estimateN'> | null;
  seen?: Record<string, number>;
}): Learned {
  const off = input.off ?? new Set<string>();
  // a row the profile no longer supports is kept at confidence 0: nothing to show yet
  const live = input.rows.filter(r => r.confidence > 0 && Number.isFinite(r.value));
  const counts: Record<string, number> = {
    days: input.profile?.days ?? 0,
    timed: input.profile?.estimateN ?? 0,
  };
  for (const r of live) counts[offId(r)] = r.sample_count;
  const seen = highWater(input.seen ?? {}, counts);
  const n = (key: string) => seen[key] ?? 0;

  const fact = (r: Stored, title: string, one: string, many?: string): LearnedRow => ({
    key: offId(r), title, stage: stageOf(r.confidence), off: off.has(offId(r)),
    evidence: restsOn(n(offId(r)), one, many),
    pattern: { kind: r.kind, scope: r.scope, value: r.value },
  });
  const learning = (key: string, title: string, evidence: string | null = null): LearnedRow =>
    ({ key, title, stage: 'learning', off: false, evidence, pattern: null });
  const of = (kind: string) => live.filter(r => r.kind === kind);
  const one = (kind: string) => of(kind).find(r => r.scope === 'all');

  // Planning: your pace, then each label that has its own
  const pace = one('estimate_ratio');
  const planning: LearnedRow[] = [
    pace ? fact(pace, paceSaid(pace.value), 'timed task')
      // with the timed tasks there, it's days it waits on: the basis says those
      : learning('estimate_ratio', 'How long things take you', n('timed') < ENOUGH ? restsOn(n('timed'), 'timed task') : null),
    ...of('estimate_ratio').filter(r => r.scope !== 'all' && labelById(r.scope))
      .sort((a, b) => b.sample_count - a.sample_count)
      .map(r => fact(r, paceSaid(r.value, r.scope), 'timed task')),
  ];

  const session = one('session_length'), early = one('early_stop');
  const focus: LearnedRow[] = [
    session ? fact(session, `A usual session is ${minutesSaid(session.value)}`, 'day')
      : learning('session_length', 'How long a session lasts'),
    early ? fact(early, shareSaid(early.value, 'Sessions', o => (o ? 'ends before the timer' : 'end before the timer')), 'day')
      : learning('early_stop', 'Sessions that end before the timer'),
  ];

  // Starting: the labels that get moved, the most moved first. Under once
  // in two tasks there's nothing to say about a label.
  const moved = of('putoff_rate').filter(r => r.value >= 0.5 && labelById(r.scope))
    .sort((a, b) => b.value - a.value).slice(0, 3);
  const starting: LearnedRow[] = moved.length
    ? moved.map(r => fact(r, `${labelById(r.scope)!.name} tasks get moved about ${timesSaid(Math.round(r.value))} each`, 'task'))
    : [learning('putoff_rate', 'What gets moved to later')];

  const big = one('too_big'), stuck = one('blocked');
  const projects: LearnedRow[] = [
    big ? fact(big, shareSaid(big.value, 'Project steps', o => (o ? 'turns out too big' : 'turn out too big')), 'day')
      : learning('too_big', 'Project steps that turn out too big'),
    stuck ? fact(stuck, shareSaid(stuck.value, 'Project steps', o => (o ? 'gets stuck' : 'get stuck')), 'day')
      : learning('blocked', 'Project steps that get stuck'),
  ];

  const hours = of('best_hour').sort((a, b) => Number(a.scope) - Number(b.scope));
  const holds = one('capacity');
  const day: LearnedRow[] = [
    ...(hours.length
      ? hours.map(r => fact(r, `You get things done around ${hourSaid(r.value)}`, 'thing done', 'things done'))
      : [learning('best_hour', 'When you get things done')]),
    holds ? fact(holds, `A usual day holds ${minutesSaid(holds.value)}`, 'day')
      : learning('capacity', 'What a day holds'),
  ];

  return {
    basis: n('days') >= MIN_DAYS ? `From ${some(n('days'), 'day')}` : `${n('days')} of ${MIN_DAYS} days so far`,
    groups: [
      { key: 'planning', title: 'Planning', rows: planning },
      { key: 'focus', title: 'Focus', rows: focus },
      { key: 'starting', title: 'Starting', rows: starting },
      { key: 'projects', title: 'Projects', rows: projects },
      { key: 'day', title: 'Your day', rows: day },
    ],
    seen,
  };
}

/** A row as it's read out: the fact, how far along (or Off), what it rests on. */
export const rowSaid = (r: LearnedRow) =>
  [r.title, r.off ? 'Off' : STAGE_NAME[r.stage], r.evidence].filter(Boolean).join(', ');

/* ---------------- the database side ---------------- */

const SEEN = 'learned.seen';

/** Everything the screen shows, up to date; the counts it showed are kept, so the next look is never lower. */
export async function loadLearned(now = Date.now()): Promise<Learned> {
  const [{ rows, off }, profile, kept] = await Promise.all([
    storedPatterns(now), getProfile().catch(() => null), getFlag(SEEN).catch(() => null),
  ]);
  let seen: Record<string, number> = {};
  try { seen = JSON.parse(kept ?? '{}') ?? {}; } catch { /* a bad flag is only a flag: start from what's there now */ }
  const out = learnedFrom({ rows, off, profile, seen });
  const next = JSON.stringify(out.seen);
  if (next !== JSON.stringify(seen)) await setFlag(SEEN, next).catch(() => {});
  return out;
}
