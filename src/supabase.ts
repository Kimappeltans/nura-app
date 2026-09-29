import 'react-native-url-polyfill/auto';
import { createClient, isAuthRetryableFetchError, type EmailOtpType, type Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { sessionStore } from './sessionStore';

/**
 * One client, module-scoped — the same shape as getDb() in db.ts being one
 * connection. This is the ONLY place that talks to Supabase directly; every
 * screen and src/sync.ts go through this.
 *
 * PKCE, with the session kept by sessionStore: on the phone encrypted, the
 * AES key in the Keychain and the rest in AsyncStorage (a whole session is
 * too big for the Keychain; sessionStore.native.ts), on the web in
 * localStorage. detectSessionInUrl is on for the web only: a Google sign-in, a
 * magic link or a password reset comes back to the page with a code in the
 * address, and the client swaps it for the session. The phone has no address
 * bar; its links come back through the nura:// scheme instead.
 *
 * A code swaps only where it was asked for (the PKCE verifier stays on that
 * device), so our emails carry their own token instead (verifyLink, and the
 * email templates in supabase/README.md) and a code to type in
 * (useAuthActions → withCode): both work on any device.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

/** The web page's address as it was opened, before the client tidies it. */
const opened = Platform.OS === 'web' && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search) : null;

/** This page was opened from a link with a code (an email, or back from
 *  Google) or an email's token, read before the client takes it out of the address. */
export const openedFromLink = !!opened && (opened.has('code') || opened.has('token_hash'));

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: sessionStore,
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
 * A password reset link was opened in this visit: the client swapped a
 * recovery code for the session and said PASSWORD_RECOVERY. Only then does
 * app/reset.tsx offer a new password; a session alone isn't enough. Listened
 * for from here, as the client starts, so the web's own swap isn't missed.
 */
let recovering = false;
const recoveryWatchers = new Set<(on: boolean) => void>();
const setRecovering = (on: boolean) => {
  recovering = on;
  recoveryWatchers.forEach(w => w(on));
};
supabase.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') setRecovering(true);
  else if (event === 'SIGNED_OUT') setRecovering(false);
});
export const inRecovery = () => recovering;
/** The new password is set: the link has done its job. */
export const endRecovery = () => setRecovering(false);
export function onRecovery(watch: (on: boolean) => void): () => void {
  recoveryWatchers.add(watch);
  return () => { recoveryWatchers.delete(watch); };
}

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

/**
 * Web: the page came back with a code this browser never asked for (no PKCE
 * verifier here), so the client can't swap it: the link was opened on a
 * different device or browser from the one that asked. The client leaves
 * such a code alone; read now, before it starts on one it can swap.
 */
export const codeFromElsewhere = !!opened?.has('code') && (() => {
  try { return !window.localStorage.getItem(`${sessionKey()}-code-verifier`); } catch { return false; }
})();

const LINK_TYPES: EmailOtpType[] = ['recovery', 'signup', 'invite', 'magiclink', 'email', 'email_change'];
const linksVerified = new Map<string, Promise<'ok' | 'failed'>>();
/**
 * A link from one of our emails with its token in it (…?token_hash=…&type=…,
 * supabase/README.md, Email templates): unlike a code it needs nothing from
 * the device that asked, so it signs in wherever it's opened. A recovery one
 * says PASSWORD_RECOVERY (then app/reset.tsx), the rest SIGNED_IN. Each token
 * is tried once, however many screens ask; null when there's no token.
 */
export function verifyLink(tokenHash: unknown, type: unknown): Promise<'ok' | 'failed'> | null {
  if (typeof tokenHash !== 'string' || !tokenHash) return null;
  let done = linksVerified.get(tokenHash);
  if (!done) {
    const kind = LINK_TYPES.includes(type as EmailOtpType) ? type as EmailOtpType : 'email';
    done = supabase.auth.verifyOtp({ token_hash: tokenHash, type: kind })
      .then(({ error }) => (error ? 'failed' as const : 'ok' as const), () => 'failed' as const);
    linksVerified.set(tokenHash, done);
  }
  return done;
}

/** The saved session, read straight from storage, with no refresh. */
async function savedSession(): Promise<Session | null> {
  try {
    const saved = JSON.parse((await sessionStore.getItem(sessionKey())) ?? 'null') as Session | null;
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
  await Promise.all([key, `${key}-code-verifier`, `${key}-user`].map(k => sessionStore.removeItem(k))).catch(() => {});
}

/** Rejects if `p` hasn't settled within `ms`. */
export function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const late = setTimeout(() => reject(new Error('timed out')), ms);
    p.then(v => { clearTimeout(late); resolve(v); }, e => { clearTimeout(late); reject(e); });
  });
}
