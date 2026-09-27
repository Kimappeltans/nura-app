import { getDb, getFlag, setFlag } from './db';
import { supabase } from './supabase';

/**
 * Push/pull sync against Supabase — last-write-wins on `updated_at`. No
 * merge, no CRDT, no field-level conflict resolution, on purpose: this is a
 * single-user-per-account app with no real-time multi-device collaboration
 * requirement anywhere in the product, so "whichever edit happened later
 * wins outright" isn't a shortcut, it's the correct answer for the one case
 * that actually occurs (edited on the phone, then later on the tablet).
 *
 * Local writes always succeed instantly and never wait on this file. A
 * failed push or pull (no network, expired session, whatever) fails
 * silently and retries at the next trigger — sign-in, foreground, or the
 * next debounced call after a mutation. Nothing here may throw where a
 * caller would surface it as an error the user has to deal with.
 */

/** A synced table and the column its rows are known by. */
interface Synced { name: string; key: string }

/** Tasks and habits: what sync has always carried. A failure here fails the pass. */
const TABLES: Synced[] = [
  { name: 'task', key: 'id' }, { name: 'habit', key: 'id' }, { name: 'habit_log', key: 'id' },
];

/**
 * The adaptive planner's data (target architecture, "Where things live"):
 * projects and their steps, what Nura learned (patterns, not the event log,
 * which stays on the device), what you did with its decisions, and the day
 * plan. Its own cursors, after tasks and habits, and best effort: until the
 * server has these tables (supabase/migrations/2026-09-27-planner-sync.sql)
 * they are skipped and tasks still sync.
 */
const PLAN_TABLES: Synced[] = [
  { name: 'project', key: 'id' }, { name: 'project_step', key: 'id' },
  { name: 'behavior_pattern', key: 'id' }, { name: 'decision_feedback', key: 'decision_id' },
  { name: 'daily_plan', key: 'day' },
];

/** The server doesn't have a table yet (the migration hasn't run). */
const missingTable = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === 'PGRST205' || x?.code === '42P01' || /could not find the table|does not exist/i.test(x?.message ?? '');
};
let saidMissing = false;

/** The planner's tables, with their own cursors. Never fails the pass. */
async function syncPlan(userId: string) {
  try {
    const push = Number((await getFlag('sync.plan.push_cursor')) ?? 0);
    const pull = Number((await getFlag('sync.plan.pull_cursor')) ?? 0);
    const pushed = await pushAll(userId, push, PLAN_TABLES);
    const pulled = await pullAll(userId, pull, PLAN_TABLES);
    if (pushed > push) await setFlag('sync.plan.push_cursor', String(pushed));
    if (pulled > pull) await setFlag('sync.plan.pull_cursor', String(pulled));
  } catch (e) {
    if (missingTable(e)) {
      if (!saidMissing) console.info('[nura] planner tables not on the server yet; run supabase/migrations/2026-09-27-planner-sync.sql');
      saidMissing = true;
    } else {
      console.warn('[nura] planner sync did not finish', e);
    }
  }
}

let syncing = false;
/** the pass under way, so a log out can wait for it (pushNow) */
let inFlight: Promise<boolean> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Safe to call after every local mutation — see store.ts's refresh(). */
export function scheduleSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { runSync(); }, 5000);
}

/** True when a whole push and pull went through. */
export async function runSync(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || syncing) return false;
  syncing = true;
  const pass = (async () => {
    try {
      const pushCursor = Number((await getFlag('sync.push_cursor')) ?? 0);
      const pullCursor = Number((await getFlag('sync.pull_cursor')) ?? 0);
      const pushedMax = await pushAll(session.user.id, pushCursor, TABLES);
      const pulledMax = await pullAll(session.user.id, pullCursor, TABLES);
      if (pushedMax > pushCursor) await setFlag('sync.push_cursor', String(pushedMax));
      if (pulledMax > pullCursor) await setFlag('sync.pull_cursor', String(pulledMax));
      await syncPlan(session.user.id);
      return true;
    } catch (e) {
      // offline/transient — next trigger point (sign-in, foreground, next
      // debounced mutation) retries from the same cursors, nothing is lost.
      // Said in the console, so one that isn't transient (a refused row)
      // doesn't go unseen.
      console.warn('[nura] sync did not finish', e);
      return false;
    } finally {
      syncing = false;
    }
  })();
  inFlight = pass;
  return pass;
}

/**
 * Everything on this device into the account, now: waits for a pass that's
 * already running, then runs one more (or the first adoption, for a device
 * that never finished one). True when it all went through. Used before a
 * log out clears the device (src/account.ts).
 */
/** Resolves once no pass is running (a log out waits on this before it clears the device). */
export async function syncIdle() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (inFlight) await inFlight;
}

export async function pushNow(): Promise<boolean> {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (inFlight) await inFlight;
  if (!(await hasAdopted())) { await adoptLocalData(); return hasAdopted(); }
  return runSync();
}

/**
 * The "this device already has local data" migration — runs exactly once
 * per device, the first time it ever signs in (gated by `sync.adopted`).
 * Pushes EVERY local row first, ignoring cursors, so nothing captured
 * before sign-in is left behind even if the connection drops partway
 * through; only then pulls everything already in the cloud for this
 * account (there may be rows from another device already signed in),
 * merging by id with the newer `updated_at` winning either way.
 */
export async function adoptLocalData() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || syncing) return;
  syncing = true;
  const pass = (async () => {
    try {
      const pushedMax = await pushAll(session.user.id, 0, TABLES);
      const pulledMax = await pullAll(session.user.id, 0, TABLES);
      const cursor = String(Math.max(pushedMax, pulledMax));
      await setFlag('sync.push_cursor', cursor);
      await setFlag('sync.pull_cursor', cursor);
      await setFlag('sync.adopted', '1');
      await syncPlan(session.user.id);
      return true;
    } catch (e) {
      // leave sync.adopted unset — retried on the next SIGNED_IN/foreground pass
      console.warn('[nura] first sync did not finish', e);
      return false;
    } finally {
      syncing = false;
    }
  })();
  inFlight = pass;
  await pass;
}

export async function hasAdopted() {
  return (await getFlag('sync.adopted')) === '1';
}

async function pushAll(userId: string, cursor: number, tables: Synced[]): Promise<number> {
  const db = await getDb();
  let max = cursor;
  for (const { name: table, key } of tables) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE updated_at > ? ORDER BY updated_at ASC`, cursor);
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows.map(r => ({ ...r, user_id: userId })), { onConflict: `user_id,${key}` });
    if (error) throw error;
    max = Math.max(max, ...rows.map(r => r.updated_at as number));
  }
  return max;
}

async function pullAll(userId: string, cursor: number, tables: Synced[]): Promise<number> {
  const db = await getDb();
  let max = cursor;
  for (const { name: table, key } of tables) {
    const { data, error } = await supabase.from(table).select('*')
      .eq('user_id', userId).gt('updated_at', cursor).order('updated_at', { ascending: true });
    if (error) throw error;
    for (const remote of (data ?? []) as Record<string, unknown>[]) {
      const { user_id, ...local } = remote;
      const id = local[key] as string;
      const updatedAt = local.updated_at as number;
      const existing = await db.getFirstAsync<{ updated_at: number }>(
        `SELECT updated_at FROM ${table} WHERE ${key} = ?`, id);
      if (existing && existing.updated_at >= updatedAt) continue; // ours is newer or equal — keep it
      const cols = Object.keys(local);
      await db.runAsync(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
         ON CONFLICT(${key}) DO UPDATE SET ${cols.filter(c => c !== key).map(c => `${c} = excluded.${c}`).join(', ')}`,
        ...cols.map(c => local[c] as never));
      max = Math.max(max, updatedAt);
    }
  }
  return max;
}
