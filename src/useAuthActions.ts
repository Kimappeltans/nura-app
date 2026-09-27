import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getProfile, setProfile } from './db';
import { useStore } from './store';
import { notify } from './notify';

/**
 * Signing in and creating an account, shared by the sign-in screen
 * (Auth.tsx) and onboarding's "Create your profile" step, so both go through
 * the same three doors with the same rules.
 *
 * Apple goes through the native Sign-in-with-Apple sheet (Apple requires
 * the native experience whenever another social login is offered). Google
 * goes through Supabase's hosted OAuth redirect: on the phone in an in-app
 * browser sheet, bounced back via the app's `nura://` scheme; on the web the
 * whole page goes to Google and comes back (a popup can't reach back to a
 * page that's cross-origin isolated, which the web database needs). Email is
 * name, email and password, with a magic link and a password reset for when
 * the password's gone.
 *
 * Whatever name comes back becomes the local profile name when there isn't
 * one yet, so "Good morning, Kim" works straight after signing up.
 */
export type PasswordResult = 'signed-in' | 'check-email' | 'error';

async function keepName(name: string | null | undefined) {
  const first = name?.trim();
  if (first && !(await getProfile()).name) await setProfile({ name: first });
}

/** The first name Google (or a sign-up form) put on the account, kept as the
 *  local name if there isn't one — after a web redirect, the only moment the
 *  app sees it is the SIGNED_IN event (app/_layout.tsx). */
export async function keepNameFrom(meta: Record<string, unknown> | undefined) {
  const full = (meta?.full_name ?? meta?.name) as string | undefined;
  await keepName(full?.split(' ')[0]);
}

/** Where a link from an email or Google lands: this page on the web, the app's scheme on the phone. */
const backTo = (path: string) => (Platform.OS === 'web' ? `${window.location.origin}${path}` : Linking.createURL(path));

const OFFLINE = 'Can’t reach Nura. Check your connection.';

/** What went wrong, in plain words, for anything Supabase (or the network) throws back. */
export function plainAuthError(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string; name?: string };
  const msg = (err.message ?? '').toLowerCase();
  if (isAuthRetryableFetchError(e) || err.name === 'AuthRetryableFetchError'
    || /failed to fetch|network request failed|load failed|networkerror|timed out/.test(msg)) return OFFLINE;
  switch (err.code) {
    case 'invalid_credentials': return 'That email and password don’t match.';
    case 'email_exists':
    case 'user_already_exists': return 'There’s already an account with this email. Sign in instead.';
    case 'weak_password': return 'That password is too easy to guess. Try a longer one.';
    case 'email_not_confirmed': return 'Open the link in the email we sent to finish.';
    case 'email_address_invalid': return 'Check the email address.';
    case 'over_email_send_rate_limit': return 'Too many emails for now. Try again in a few minutes.';
    case 'over_request_rate_limit': return 'Too many tries. Wait a minute, then try again.';
    case 'otp_expired': return 'This link has expired. Ask for a new one.';
    case 'same_password': return 'That’s your current password. Pick a new one.';
    case 'signup_disabled': return 'New accounts are closed for now.';
  }
  if (msg.includes('invalid login credentials')) return 'That email and password don’t match.';
  if (msg.includes('already registered')) return 'There’s already an account with this email. Sign in instead.';
  if (msg.includes('email not confirmed')) return 'Open the link in the email we sent to finish.';
  return 'Something went wrong. Try again in a moment.';
}

/** Sends the confirmation email again, with its link back to Nura. Null when sent, else what went wrong. */
export async function resendConfirmation(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: backTo('/') } });
  return error ? plainAuthError(error) : null;
}

/**
 * Waiting on the confirmation link ("Check your email", Auth.tsx and
 * ProfileStep.tsx). The session usually arrives by itself: the link opened
 * in this browser (another tab tells this one) or on this phone
 * (app/_layout.tsx swaps its code). Coming back to the page or the app also
 * checks, and if the link was opened somewhere else, like the phone's mail
 * app for an account made on a laptop, the email is confirmed but this
 * device has no session, so it signs in with the password still in hand.
 */
export function useConfirmWait(pending: { email: string; password: string } | null) {
  useEffect(() => {
    if (!pending) return;
    let last = 0;
    const check = async () => {
      if (Date.now() - last < 3000 || useStore.getState().session) return;
      last = Date.now();
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) { useStore.getState().setSession(data.session); return; }
        if (pending.password) await supabase.auth.signInWithPassword(pending);   // SIGNED_IN, or not confirmed yet
      } catch { /* offline: the next look tries again */ }
    };
    if (Platform.OS === 'web') {
      const onVisible = () => { if (document.visibilityState === 'visible') check(); };
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', onVisible);
      return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', onVisible); };
    }
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [pending?.email, pending?.password]);
}

export function useAuthActions(onDone: () => void, opts: {
  /** runs just before the web page leaves for Google, so the screen can pick up where it was */
  beforeRedirect?: () => Promise<void>;
} = {}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fail = (title: string, message?: string) => {
    setBusy(null);
    notify(title, message ?? 'Try again in a moment.');
  };

  const withApple = async () => {
    setBusy('apple'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple didn’t return an identity token.');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple', token: credential.identityToken,
      });
      if (error) throw error;
      // Apple sends the name only the first time, so it's kept now or never
      await keepName(credential.fullName?.givenName);
      setBusy(null);
      onDone();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'ERR_REQUEST_CANCELED') { setBusy(null); return; }   // backed out, not a failure
      fail('Sign in with Apple failed', plainAuthError(e));
    }
  };

  const withGoogle = async () => {
    setBusy('google'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (Platform.OS === 'web') {
        // the page goes to Google and comes back to /; the client reads the
        // code from the address (supabase.ts) and the name is kept on SIGNED_IN
        await opts.beforeRedirect?.();
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: backTo('/') } });
        if (error) throw error;
        return;
      }
      const redirectTo = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) throw error ?? new Error('No sign-in link came back.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) { setBusy(null); return; }   // cancelled
      const code = new URL(result.url).searchParams.get('code');
      if (!code) throw new Error('No authorization code came back.');
      const { data: ex, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) throw exErr;
      const meta = ex.session?.user.user_metadata as { full_name?: string; name?: string } | undefined;
      await keepName((meta?.full_name ?? meta?.name)?.split(' ')[0]);
      setBusy(null);
      onDone();
    } catch (e) {
      fail('Google sign-in failed', plainAuthError(e));
    }
  };

  /** Magic link, no password to forget — a sign-in fallback only. */
  const withEmailLink = async (email: string) => {
    if (!email.includes('@')) return;
    setBusy('email'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { emailRedirectTo: backTo('/') },
    }).catch(e => ({ error: e }));
    setBusy(null);
    if (error) return fail('Couldn’t send the link', plainAuthError(error));
    notify('Check your email', `We sent a sign-in link to ${email}.`, onDone);
  };

  /** Forgot the password: a link to set a new one, which opens the /reset page. */
  const resetPassword = async (email: string) => {
    setFormError(null);
    if (!email.includes('@')) { setFormError('Add your email first.'); return; }
    setBusy('reset'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: backTo('/reset') })
      .catch(e => ({ error: e }));
    setBusy(null);
    if (error) return fail('Couldn’t send the link', plainAuthError(error));
    notify('Check your email', `We sent a link to ${email} for setting a new password.`);
  };

  /** Checked before anything is sent: name present, password ≥ 8, the two passwords matching. */
  const withPassword = async (f: { creating: boolean; name: string; email: string; password: string; confirm: string }):
    Promise<PasswordResult> => {
    setFormError(null);
    const bad = (m: string) => { setFormError(m); return 'error' as const; };
    if (f.creating && !f.name.trim()) return bad('Add your name.');
    if (!f.email.includes('@')) return bad('Add a valid email address.');
    if (f.password.length < 8) return bad('Password needs at least 8 characters.');
    if (f.creating && f.password !== f.confirm) return bad('Passwords don’t match.');
    setBusy('password'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // the confirmation link comes back to Nura: this page, or the app (app/_layout.tsx)
    const { data, error } = await (f.creating
      ? supabase.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { name: f.name.trim() }, emailRedirectTo: backTo('/') },
      })
      : supabase.auth.signInWithPassword({ email: f.email, password: f.password })
    ).catch(e => ({ data: { user: null, session: null }, error: e }));
    setBusy(null);
    // made, but never confirmed: the same "Check your email", with Resend
    if (!f.creating && (error as { code?: string } | null)?.code === 'email_not_confirmed') return 'check-email';
    if (error) return bad(plainAuthError(error));
    // with "Confirm email" on, an address that already has an account comes
    // back looking like a new one, with no identities and no email sent
    if (f.creating && data.user && !data.session && data.user.identities?.length === 0) {
      return bad(plainAuthError({ code: 'email_exists' }));
    }
    if (f.creating) await keepName(f.name);
    // "Confirm email" stays on in the Supabase dashboard — signUp() then
    // returns a user but no session until the link is clicked. Expected,
    // not an error.
    return f.creating && !data.session ? 'check-email' : 'signed-in';
  };

  /** "Resend" on Check your email: true when it went. */
  const resend = async (email: string) => {
    setFormError(null);
    setBusy('resend');
    const problem = await resendConfirmation(email).catch(e => plainAuthError(e));
    setBusy(null);
    if (problem) setFormError(problem);
    return !problem;
  };

  return { busy, formError, setFormError, withApple, withGoogle, withEmailLink, withPassword, resetPassword, resend };
}
