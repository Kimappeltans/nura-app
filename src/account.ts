import { supabase } from './supabase';
import { setFlag } from './db';
import { ask, notify } from './notify';

/**
 * The account's two doors out: Log out at the foot of Settings, Delete
 * account on Profile. An account is required to use Nura, so once either one finishes the app is
 * back at the sign-in screen by itself (app/index.tsx watches the session).
 */

/** Asks, then logs out. True if logged out. */
export async function signOut(): Promise<boolean> {
  if (!(await ask('Log out?', 'Your tasks stay on this device.', 'Log out', true))) return false;
  await supabase.auth.signOut();
  return true;
}

/** Asks, then deletes the account and what it synced (supabase/functions/nura-account).
 *  What's on this device stays, and a new account later adopts it afresh. */
export async function deleteAccount(): Promise<boolean> {
  const yes = await ask('Delete your account?',
    'Your account and everything it synced are deleted for good.', 'Delete', true);
  if (!yes) return false;
  const { error } = await supabase.functions.invoke('nura-account', { method: 'POST' });
  if (error) { notify('Couldn’t delete your account', 'Try again in a moment.'); return false; }
  await supabase.auth.signOut();
  await setFlag('sync.adopted', ''); await setFlag('sync.push_cursor', '0'); await setFlag('sync.pull_cursor', '0');
  return true;
}
