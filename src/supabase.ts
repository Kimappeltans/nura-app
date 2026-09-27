import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * One client, module-scoped — the same shape as getDb() in db.ts being one
 * connection. This is the ONLY place that talks to Supabase directly; every
 * screen and src/sync.ts go through this.
 *
 * PKCE + AsyncStorage session persistence is the standard native-app
 * pattern. detectSessionInUrl is on for the web only: a Google sign-in, a
 * magic link or a password reset comes back to the page with a code in the
 * address, and the client swaps it for the session. The phone has no address
 * bar; its links come back through the nura:// scheme instead. AsyncStorage over expo-secure-store
 * deliberately — SecureStore's ~2KB per-value iOS Keychain ceiling is a
 * known trap for a full session payload (access + refresh JWT + user
 * metadata), and everything else this app persists is already plaintext
 * local SQLite, so this introduces no new class of risk.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

/** This page was opened from a link with a code (an email, or back from
 *  Google), read before the client takes the code out of the address. */
export const openedFromLink = Platform.OS === 'web' && typeof window !== 'undefined'
  && /[?&]code=/.test(window.location.search);

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // on the web the client swaps a ?code= in the address for the session
    // (when this browser holds the matching PKCE verifier) and takes the
    // code out of the address itself
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

/**
 * The session on this device at launch (app/_layout.tsx). Never throws.
 *
 * Offline with an expired access token, getSession() tries to refresh it,
 * fails for a network reason and answers null, though the session is still
 * saved and nothing is wrong with it. Everything is local, so that person is
 * let in on the saved session; the client refreshes it once the network is
 * back (and signs out by itself, SIGNED_OUT, if the refresh is refused).
 * Sync waits until then: it asks getSession() for itself (src/sync.ts).
 */
export async function loadSession(): Promise<Session | null> {
  try {
    const { data, error } = await within(10_000, supabase.auth.getSession());
    if (data.session) return data.session;
    if (!error || !isAuthRetryableFetchError(error)) return null;
  } catch {
    // no answer in time, or it threw: fall back to what's saved
  }
  return savedSession();
}

/** Where the client saves the session (its default, from the project URL). */
const sessionKey = () => (supabase.auth as unknown as { storageKey: string }).storageKey;

/** The saved session, read straight from storage, with no refresh. */
async function savedSession(): Promise<Session | null> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(sessionKey())) ?? 'null') as Session | null;
    return saved?.refresh_token && saved.user?.id ? saved : null;
  } catch { return null; }
}

/**
 * Logged out on this device. The client's own signOut() keeps the session
 * when it can't reach Supabase (offline, say), so then the saved session is
 * removed by hand: logged out here either way.
 */
export async function signOutHere() {
  const { error } = await supabase.auth.signOut({ scope: 'local' }).catch(e => ({ error: e }));
  if (!error) return;
  const key = sessionKey();
  await Promise.all([key, `${key}-code-verifier`, `${key}-user`].map(k => AsyncStorage.removeItem(k))).catch(() => {});
}

/** Rejects if `p` hasn't settled within `ms`. */
export function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const late = setTimeout(() => reject(new Error('timed out')), ms);
    p.then(v => { clearTimeout(late); resolve(v); }, e => { clearTimeout(late); reject(e); });
  });
}
