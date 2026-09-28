import { getDb, getPatterns, savePatterns, setFlag, type PatternRow } from './db';
import { getProfile } from './learn/signals';
import type { BehaviorProfile } from './learn/types';

/**
 * What Nura learned, as rows the planner can use (behavior_pattern). The
 * profile (learn/signals.ts) is worked out from the event log, which stays
 * on the device; these rows are the part that syncs, so a second device
 * knows how you work without ever seeing the log itself.
 *
 *   estimate_ratio  all | <label>   actual ÷ your guess
 *   best_hour       1 | 2 | 3       the hours you finish things in
 *   putoff_rate     <label>         put-offs per task
 *   session_length  all             a usual session, minutes
 *   early_stop      all             share of sessions stopped early
 *   too_big         all             share of project moves that were too big
 *   blocked         all             share that got blocked
 *   capacity        all             minutes you really finish on a day
 *
 * "That's not me" (app/learned.tsx) turns one off: the row and its numbers
 * stay, and currentPatterns() hands it back at confidence 0.
 */

type Row = Omit<PatternRow, 'id' | 'updated_at'>;

/** A pattern this sure is one the planner acts on (TRUSTED in src/next.ts). */
export const TRUSTED = 0.5;
/** The samples it takes to get there: trust(5) is 0.5. */
export const ENOUGH = 5;

/** How far to trust a number resting on n samples: 5 samples is halfway. */
export const trust = (n: number) => (n <= 0 ? 0 : Math.round((n / (n + 5)) * 100) / 100);

export function patternsFrom(p: BehaviorProfile): Row[] {
  const rows: Row[] = [];
  const add = (kind: string, scope: string, value: number | null | undefined, n: number) => {
    if (value == null || !Number.isFinite(value) || n <= 0) return;
    rows.push({ kind, scope, value, confidence: trust(n), sample_count: n });
  };
  add('estimate_ratio', 'all', p.estimateRatio, p.estimateN ?? 0);
  for (const l of p.estimateByLabel ?? []) add('estimate_ratio', l.label, l.ratio, l.n);
  p.bestHours.forEach((h, i) => {
    const b = p.byHour[h];
    add('best_hour', String(i + 1), h, b ? b.completed : 0);
  });
  for (const l of p.putOffByLabel) add('putoff_rate', l.label, l.rate, l.n);
  add('session_length', 'all', p.typicalSessionMin, p.days);
  add('early_stop', 'all', p.earlyStopRate, p.days);
  add('too_big', 'all', p.tooBigRate, p.days);
  add('blocked', 'all', p.blockedRate, p.days);
  add('capacity', 'all', p.capacityMin, p.capacityDays ?? 0);
  return rows;
}

/* ---------------- "That's not me" ---------------- */

/**
 * What a pattern is known by when it's turned off. A good hour is known by
 * the hour, not by its place among the three (its scope): the order moves
 * with the profile, and 10 AM turned off stays off wherever it ranks.
 */
export const offId = (r: Pick<PatternRow, 'kind' | 'scope' | 'value'>) =>
  `${r.kind}.${r.kind === 'best_hour' ? r.value : r.scope}`;

const OFF = 'learned.off.';

/** Everything turned off, by offId (flags: learned.off.<kind>.<scope>). On this device: flags don't sync. */
export async function turnedOff(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ k: string }>(`SELECT k FROM app_state WHERE k LIKE ? AND v = '1'`, `${OFF}%`);
  return new Set(rows.map(r => r.k.slice(OFF.length)));
}

/** Turn a pattern off, or back on. Its row is left as it is, so the numbers keep adding up underneath. */
export async function setOff(r: Pick<PatternRow, 'kind' | 'scope' | 'value'>, off: boolean) {
  await setFlag(OFF + offId(r), off ? '1' : '0');
}

/** The rows as Nura may use them: one that's turned off has confidence 0. */
export function withoutOff<R extends Pick<PatternRow, 'kind' | 'scope' | 'value' | 'confidence'>>(rows: R[], off: Set<string>): R[] {
  return off.size ? rows.map(r => (off.has(offId(r)) ? { ...r, confidence: 0 } : r)) : rows;
}

/**
 * The same for the profile, for what reads it directly (the suggestion rules
 * in learn/suggest.ts, the summary the coach gets): what's turned off isn't there.
 */
export function profileWithout(p: BehaviorProfile, off: Set<string>): BehaviorProfile {
  if (!off.size) return p;
  const on = (kind: string, scope: string | number = 'all') => !off.has(`${kind}.${scope}`);
  return {
    ...p,
    estimateRatio: on('estimate_ratio') ? p.estimateRatio : null,
    estimateByLabel: p.estimateByLabel?.filter(l => on('estimate_ratio', l.label)),
    bestHours: p.bestHours.filter(h => on('best_hour', h)),
    putOffByLabel: p.putOffByLabel.filter(l => on('putoff_rate', l.label)),
    typicalSessionMin: on('session_length') ? p.typicalSessionMin : null,
    earlyStopRate: on('early_stop') ? p.earlyStopRate : null,
    tooBigRate: on('too_big') ? p.tooBigRate : null,
    blockedRate: on('blocked') ? p.blockedRate : null,
    capacityMin: on('capacity') ? p.capacityMin : null,
  };
}

const noneOff = () => new Set<string>();

/** The profile, less what's turned off. */
export async function profileInUse(): Promise<BehaviorProfile> {
  const [p, off] = await Promise.all([getProfile(), turnedOff().catch(noneOff)]);
  return profileWithout(p, off);
}

/* ---------------- the rows ---------------- */

let _last = 0;

/**
 * The stored rows, brought up to date with the profile (at most every few
 * minutes; the profile itself is cached for hours). A pattern the profile no
 * longer supports is kept at confidence 0, not deleted, so every device
 * hears that it stopped counting.
 */
async function upToDate(now: number): Promise<PatternRow[]> {
  try {
    if (now - _last > 5 * 60_000) {
      _last = now;
      const rows = patternsFrom(await getProfile());
      const ids = new Set(rows.map(r => `${r.kind}:${r.scope}`));
      const stale = (await getPatterns()).filter(r => !ids.has(r.id) && r.confidence > 0)
        .map(r => ({ kind: r.kind, scope: r.scope, value: r.value, confidence: 0, sample_count: r.sample_count }));
      await savePatterns([...rows, ...stale], now);
    }
  } catch { /* learning is a bonus: without it the planner still ranks */ }
  return getPatterns().catch(() => []);
}

/**
 * The patterns, for everything that acts on them. The one place "That's not
 * me" is applied: a pattern that's turned off comes back at confidence 0, so
 * the planner and the day plan, which only act on TRUSTED, pass over it.
 */
export async function currentPatterns(now = Date.now()): Promise<PatternRow[]> {
  const [rows, off] = await Promise.all([upToDate(now), turnedOff().catch(noneOff)]);
  return withoutOff(rows, off);
}

/** The rows as they stand, and what's turned off beside them: for the screen that shows both (src/learned.ts). */
export async function storedPatterns(now = Date.now()): Promise<{ rows: PatternRow[]; off: Set<string> }> {
  const [rows, off] = await Promise.all([upToDate(now), turnedOff().catch(noneOff)]);
  return { rows, off };
}

/** One pattern's value, when it's trusted enough to act on. */
export function patternValue(rows: Pick<PatternRow, 'kind' | 'scope' | 'value' | 'confidence'>[], kind: string, scope = 'all', min = TRUSTED): number | null {
  const r = rows.find(x => x.kind === kind && x.scope === scope);
  return r && r.confidence >= min ? r.value : null;
}
