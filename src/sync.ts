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

const TABLES = ['task', 'habit', 'habit_log'] as const;

let syncing = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Safe to call after every local mutation — see store.ts's refresh(). */
export function scheduleSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { runSync(); }, 5000);
}

export async function runSync() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || syncing) return;
  syncing = true;
  try {
    const pushCursor = Number((await getFlag('sync.push_cursor')) ?? 0);
    const pullCursor = Number((await getFlag('sync.pull_cursor')) ?? 0);
    const pushedMax = await pushAll(session.user.id, pushCursor);
    const pulledMax = await pullAll(session.user.id, pullCursor);
    if (pushedMax > pushCursor) await setFlag('sync.push_cursor', String(pushedMax));
    if (pulledMax > pullCursor) await setFlag('sync.pull_cursor', String(pulledMax));
  } catch {
    // offline/transient — next trigger point (sign-in, foreground, next
    // debounced mutation) retries from the same cursors, nothing is lost
  } finally {
    syncing = false;
  }
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
  try {
    const pushedMax = await pushAll(session.user.id, 0);
    const pulledMax = await pullAll(session.user.id, 0);
    const cursor = String(Math.max(pushedMax, pulledMax));
    await setFlag('sync.push_cursor', cursor);
    await setFlag('sync.pull_cursor', cursor);
    await setFlag('sync.adopted', '1');
  } catch {
    // leave sync.adopted unset — retried on the next SIGNED_IN/foreground pass
  } finally {
    syncing = false;
  }
}

export async function hasAdopted() {
  return (await getFlag('sync.adopted')) === '1';
}

async function pushAll(userId: string, cursor: number): Promise<number> {
  const db = await getDb();
  let max = cursor;
  for (const table of TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE updated_at > ? ORDER BY updated_at ASC`, cursor);
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows.map(r => ({ ...r, user_id: userId })));
    if (error) throw error;
    max = Math.max(max, ...rows.map(r => r.updated_at as number));
  }
  return max;
}

async function pullAll(userId: string, cursor: number): Promise<number> {
  const db = await getDb();
  let max = cursor;
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*')
      .eq('user_id', userId).gt('updated_at', cursor).order('updated_at', { ascending: true });
    if (error) throw error;
    for (const remote of (data ?? []) as Record<string, unknown>[]) {
      const { user_id, ...local } = remote;
      const id = local.id as string;
      const updatedAt = local.updated_at as number;
      const existing = await db.getFirstAsync<{ updated_at: number }>(
        `SELECT updated_at FROM ${table} WHERE id = ?`, id);
      if (existing && existing.updated_at >= updatedAt) continue; // ours is newer or equal — keep it
      const cols = Object.keys(local);
      await db.runAsync(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
         ON CONFLICT(id) DO UPDATE SET ${cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')}`,
        ...cols.map(c => local[c] as never));
      max = Math.max(max, updatedAt);
    }
  }
  return max;
}
