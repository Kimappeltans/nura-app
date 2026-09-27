import { getPatterns, savePatterns, type PatternRow } from './db';
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
 */

type Row = Omit<PatternRow, 'id' | 'updated_at'>;

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

let _last = 0;

/**
 * The patterns, brought up to date with the profile (at most every few
 * minutes; the profile itself is cached for hours). A pattern the profile no
 * longer supports is kept at confidence 0, not deleted, so every device
 * hears that it stopped counting.
 */
export async function currentPatterns(now = Date.now()): Promise<PatternRow[]> {
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

/** One pattern's value, when it's trusted enough to act on. */
export function patternValue(rows: Pick<PatternRow, 'kind' | 'scope' | 'value' | 'confidence'>[], kind: string, scope = 'all', min = 0.5): number | null {
  const r = rows.find(x => x.kind === kind && x.scope === scope);
  return r && r.confidence >= min ? r.value : null;
}
