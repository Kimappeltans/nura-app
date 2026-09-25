import { getDb } from '../db';
import type { Suggestion, SuggestionKind, SuggestionOutcome } from './types';

/**
 * LEARN — which kinds of advice actually help you.
 *
 * Every suggestion shown is written down here, and so is what happened to it:
 * taken, waved away, or left alone. Each kind gets an acceptance rate that
 * starts at an even 50/50 (a Beta(1,1) prior) and moves with what you do,
 * with older answers counting for less (half-life three weeks), so a kind
 * you turned down in the spring gets another chance by summer. Kinds that
 * help rise in rank; kinds that get dismissed fade — never to zero.
 *
 * Local only, like the event table. Nothing here is synced or sent.
 */

const DAY = 86_400_000;
export const HALF_LIFE_DAYS = 21;
/** a dismissal says "not this" — the same advice stays away a week; taken, it rests a day */
export const DISMISS_COOLDOWN_MS = 7 * DAY;
export const ACCEPT_COOLDOWN_MS = DAY;
/** "rest" is about one evening, not a thing — a no tonight isn't a no all week */
const REST_DISMISS_COOLDOWN_MS = 20 * 3600_000;
/** shown and never answered for this long counts as a quiet "not really" */
const IGNORED_AFTER_MS = 12 * 3600_000;
/** an ignore is weaker evidence than a dismissal */
const IGNORE_WEIGHT = 0.25;

export const KINDS: SuggestionKind[] = ['best_time', 'shrink', 'estimate', 'comeback', 'plan_it', 'rest', 'batch', 'model'];

export interface LogRow { sid: string; kind: string; outcome: string; at: number }

/**
 * The advice without the day: "shrink:abc:2026-09-25" → "shrink:abc", so a
 * cooldown carries over to tomorrow's copy of the same suggestion. A model's
 * id without a date suffix is its own key.
 */
export const keyOf = (id: string) => id.replace(/:\d{4}-\d{2}-\d{2}$/, '');

let _ready: Promise<void> | null = null;
/** the table, made the first time it's needed — so db.ts's schema stays as it is */
function ready(): Promise<void> {
  if (_ready) return _ready;
  _ready = (async () => {
    const db = await getDb();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS suggestion_log (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        sid     TEXT NOT NULL,
        skey    TEXT NOT NULL,
        kind    TEXT NOT NULL,
        task_id TEXT,
        source  TEXT NOT NULL,
        outcome TEXT NOT NULL,
        at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sugg_at  ON suggestion_log(at);
      CREATE INDEX IF NOT EXISTS idx_sugg_key ON suggestion_log(skey);
    `);
  })().catch(e => { _ready = null; throw e; });
  return _ready;
}

export async function recordOutcome(s: Suggestion, outcome: SuggestionOutcome, at = Date.now()) {
  await ready();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO suggestion_log (sid, skey, kind, task_id, source, outcome, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    s.id, keyOf(s.id), s.kind, s.taskId ?? s.taskIds?.[0] ?? null, s.source, outcome, at);
}

/** 'shown', once per suggestion id — ids carry the day, so once a day */
export async function markShown(list: Suggestion[], at = Date.now()) {
  if (!list.length) return;
  await ready();
  const db = await getDb();
  const ids = list.map(s => s.id);
  const have = await db.getAllAsync<{ sid: string }>(
    `SELECT DISTINCT sid FROM suggestion_log WHERE outcome = 'shown' AND sid IN (${ids.map(() => '?').join(',')})`, ...ids);
  const seen = new Set(have.map(r => r.sid));
  for (const s of list) if (!seen.has(s.id)) await recordOutcome(s, 'shown', at);
}

/* ---------------- the arithmetic ---------------- */

/** how much an answer from `ageMs` ago still counts: 1 now, ½ after a half-life */
export const decay = (ageMs: number, halfLifeDays = HALF_LIFE_DAYS) =>
  Math.pow(0.5, Math.max(0, ageMs) / (halfLifeDays * DAY));

/**
 * Acceptance rate per kind, from the log. Each suggestion counts once, by
 * what finally happened to it: taken beats waved away beats ignored. A
 * suggestion only shown, and never answered for half a day, is an ignore.
 */
export function weightsFrom(rows: LogRow[], now = Date.now(), halfLifeDays = HALF_LIFE_DAYS): Record<SuggestionKind, number> {
  const RANK: Record<string, number> = { shown: 0, ignored: 1, dismissed: 2, accepted: 3 };
  const final = new Map<string, LogRow>();
  for (const r of rows) {
    const cur = final.get(r.sid);
    if (!cur || (RANK[r.outcome] ?? -1) > (RANK[cur.outcome] ?? -1)) final.set(r.sid, r);
  }
  const ab = new Map<string, { a: number; b: number }>();
  for (const r of final.values()) {
    const w = decay(now - r.at, halfLifeDays);
    const g = ab.get(r.kind) ?? { a: 1, b: 1 };
    if (r.outcome === 'accepted') g.a += w;
    else if (r.outcome === 'dismissed') g.b += w;
    else if (r.outcome === 'ignored' || (r.outcome === 'shown' && now - r.at >= IGNORED_AFTER_MS)) g.b += w * IGNORE_WEIGHT;
    ab.set(r.kind, g);
  }
  const out = {} as Record<SuggestionKind, number>;
  for (const k of KINDS) {
    const g = ab.get(k) ?? { a: 1, b: 1 };
    out[k] = g.a / (g.a + g.b);
  }
  return out;
}

/** the keys (see keyOf) resting after a recent yes or no */
export function hiddenFrom(rows: LogRow[], now = Date.now()): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const age = now - r.at;
    const dismissFor = r.kind === 'rest' ? REST_DISMISS_COOLDOWN_MS : DISMISS_COOLDOWN_MS;
    if ((r.outcome === 'dismissed' && age < dismissFor) || (r.outcome === 'accepted' && age < ACCEPT_COOLDOWN_MS)) {
      out.add(keyOf(r.sid));
    }
  }
  return out;
}

/* ---------------- reading ---------------- */

/** Old enough that decay has made it noise: ~8 half-lives. */
const LOOKBACK_MS = 180 * DAY;

export async function kindWeights(now = Date.now()): Promise<Record<SuggestionKind, number>> {
  await ready();
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    `SELECT sid, kind, outcome, at FROM suggestion_log WHERE at >= ?`, now - LOOKBACK_MS);
  return weightsFrom(rows, now);
}

/** Was this advice (any day's copy of it) answered within `withinMs`? */
export async function seenRecently(
  id: string, withinMs: number, outcomes: SuggestionOutcome[] = ['accepted', 'dismissed'],
): Promise<boolean> {
  await ready();
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM suggestion_log
      WHERE skey = ? AND at >= ? AND outcome IN (${outcomes.map(() => '?').join(',')})`,
    keyOf(id), Date.now() - withinMs, ...outcomes);
  return (r?.n ?? 0) > 0;
}

/** Everything resting right now, in one query — what the hook filters by. */
export async function hiddenKeys(now = Date.now()): Promise<Set<string>> {
  await ready();
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    `SELECT sid, kind, outcome, at FROM suggestion_log
      WHERE outcome IN ('accepted','dismissed') AND at >= ?`, now - DISMISS_COOLDOWN_MS);
  return hiddenFrom(rows, now);
}
