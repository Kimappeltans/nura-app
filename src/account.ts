import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { supabase, signOutHere, within } from './supabase';
import { getFlag, setFlag, wipeLocalData } from './db';
import { pushNow, syncIdle } from './sync';
import { useStore } from './store';
import { ask, notify } from './notify';

/**
 * The account's two doors out: Log out at the foot of Settings, Delete
 * account on Profile. An account is required to use Nura, so once either one finishes the app is
 * back at the sign-in screen by itself (app/index.tsx watches the session).
 *
 * This device holds one account's things at a time. Logging out clears it
 * (the tasks stay in the account, and come back on the next sign-in), so
 * does deleting the account, and
 * `sync.user` remembers whose they are, so a different account signing in
 * starts from a clean device instead of seeing, or syncing into, someone
 * else's (claimDevice, on SIGNED_IN in app/_layout.tsx).
 */

/** Kept through a clear: the device's own settings, not a person's things. */
const DEVICE_KEYS = ['device.id', 'appearance', 'lang', 'dev.'] as const;

/** Log out lands on the sign-in step of onboarding, not its welcome (Onboarding.tsx). */
let signInNext = false;
export const landsOnSignIn = () => signInNext;
export const landedOnSignIn = () => { signInNext = false; };
/** A sign-in link that didn't sign in here (app/_layout.tsx): the sign-in, not the welcome. */
export const toSignInNext = () => { signInNext = true; };

/** Nothing of the last person left: their rows, their flags, their reminders. */
async function clearDevice(keep: readonly string[]) {
  if (Platform.OS !== 'web') await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  await wipeLocalData(keep);
}

/**
 * On every SIGNED_IN (app/_layout.tsx), before sync adopts anything: a
 * different account than the one this device belongs to starts from a clean
 * device. The very first sign-in (nobody stored yet, as in onboarding) keeps
 * what's here: it becomes that account's.
 */
export async function claimDevice(userId: string) {
  const owner = await getFlag('sync.user');
  if (owner && owner !== userId) {
    // where onboarding is stays too: this may be its sign-in step
    await clearDevice([...DEVICE_KEYS, 'onboarded', 'onb.']);
    useStore.setState({ running: null });
  }
  if (owner !== userId) await setFlag('sync.user', userId);
}

/** Asks, sends what's left to the account, clears this device, logs out. True if logged out. */
export async function signOut(): Promise<boolean> {
  if (!(await ask('Log out?', 'Nura clears this device. Your tasks stay in your account.', 'Log out', true))) return false;
  // the last changes, into the account before they're cleared from here
  const sent = await within(15_000, pushNow()).catch(() => false);
  if (!sent && !(await ask('Log out anyway?',
    'Your latest changes haven’t reached your account yet. Logging out now loses them.', 'Log out', true))) {
    return false;
  }
  await leaveDevice();
  return true;
}

/** Logged out here, then a clear device (only its own settings kept), then the sign-in. */
async function leaveDevice() {
  signInNext = true;
  // logged out first, and no sync pass left running, so nothing is pulled
  // back into the device once it's clear
  await signOutHere();
  useStore.setState({ session: null, running: null, tab: 'home', telling: false, celebration: null });
  await syncIdle().catch(() => {});
  try {
    await clearDevice(DEVICE_KEYS);
  } catch (e) {
    // still logged out: `sync.user` survived too, so the next account to
    // sign in here clears the device before it sees anything (claimDevice)
    console.warn('[nura] could not clear this device', e);
  }
  await useStore.getState().refresh().catch(() => {});
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}

/** Asks, then deletes the account and what it synced (supabase/functions/nura-account),
 *  then clears this device the way Log out does, so the next account starts clean. */
export async function deleteAccount(): Promise<boolean> {
  const yes = await ask('Delete your account?',
    'Your account and everything it synced are deleted for good, and Nura clears this device.', 'Delete', true);
  if (!yes) return false;
  const { error } = await supabase.functions.invoke('nura-account', { method: 'POST' });
  if (error) { notify('Couldn’t delete your account', 'Try again in a moment.'); return false; }
  await leaveDevice();
  return true;
}
