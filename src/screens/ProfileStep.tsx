import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useStore, useTheme } from '../store';
import { Primary, Ghost, Character } from '../ui';
import { radius, type as T } from '../theme';
import { OnbFrame, FooterLink } from '../components/OnbFrame';
import { useAuthActions, useConfirmWait } from '../useAuthActions';
import { AppleGlyph, GoogleGlyph, Legal } from './Auth';

/**
 * "Create your profile" — onboarding step 3, straight after the brain dump.
 *
 * Asked here rather than first because now there is something to keep: the
 * tasks you just wrote. Apps that ask for an account before showing anything
 * lose people at the door; asking once the work exists is the same moment
 * Duolingo asks, after the first lesson.
 *
 * Light, like the sign-in screen (Kim preferred it to navy here): an
 * account is a different kind of moment from the questions around it.
 *
 * No back arrow on the first view: the tasks are already saved, and going
 * back to an empty brain dump would only invite writing them twice.
 *
 * Email with "Confirm email" on: made, but no session until the link in the
 * email is opened, so the step waits on "Check your email" (Resend, or a
 * different address) and carries on by itself once the session arrives
 * (useConfirmWait). The tasks from the brain dump are local and stay.
 *
 * Not skippable: an account is required (Kim, 26 September; see Auth.tsx
 * for the App Store side of that). The same three doors as the sign-in screen (Auth.tsx), via
 * the same code (useAuthActions): Apple first on iPhone (Guideline 4.8),
 * Google, and email with a name and password.
 */
type Mode = 'choose' | 'email';

export default function ProfileStep({ onDone, beforeRedirect }: {
  onDone: () => void;
  /** remember where onboarding was, before the web page leaves for Google
   *  or while it waits on the confirmation link (a reload picks up from there) */
  beforeRedirect?: () => Promise<void>;
}) {
  const t = useTheme();
  const { busy, formError, setFormError, withApple, withGoogle, withPassword, resend } = useAuthActions(onDone, { beforeRedirect });
  const [mode, setMode] = useState<Mode>('choose');
  const [creating, setCreating] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  /** made, waiting on the link in the email */
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null);
  const [sent, setSent] = useState(false);
  const session = useStore(s => s.session);

  // the link opened: signed in, so onboarding carries on where it was (once)
  const went = useRef(false);
  useConfirmWait(pending);
  useEffect(() => {
    if (!pending || !session || went.current) return;
    went.current = true;
    onDone();
  }, [pending, session]);

  const submit = async () => {
    const r = await withPassword({ creating, name, email, password, confirm });
    if (r === 'signed-in') onDone();
    if (r === 'check-email') {
      setSent(false);
      setPending({ email: email.trim(), password });
      beforeRedirect?.();
    }
  };
  const again = async () => {
    if (pending && await resend(pending.email)) setSent(true);
  };
  const otherEmail = () => {
    setPending(null); setEmail(''); setFormError(null); setCreating(true); setMode('email');
  };

  const field = (id: string) => ({
    color: t.ink, fontSize: 16, paddingVertical: 15, paddingHorizontal: 16,
    backgroundColor: t.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: t.strokeStrong,
    borderBottomWidth: 2, borderBottomColor: focused === id ? t.ra : t.strokeStrong,
  } as const);
  const on = (id: string) => ({ onFocus: () => setFocused(id), onBlur: () => setFocused(null) });

  // Apple's own rule for its button: black on a light background
  const Social = ({ id, label, glyph, onPress, black }: {
    id: string; label: string; glyph: React.ReactNode; onPress: () => void; black?: boolean;
  }) => (
    <Pressable onPress={onPress} disabled={!!busy} accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 16, borderRadius: radius.lg,
        backgroundColor: black ? '#111111' : t.card,
        borderWidth: 1, borderColor: black ? '#111111' : t.strokeStrong,
        opacity: pressed || (busy && busy !== id) ? 0.8 : 1,
      })}>
      {busy === id
        ? <ActivityIndicator size="small" color={black ? '#FFFFFF' : t.ink} />
        : <>{glyph}<Text style={{ color: black ? '#FFFFFF' : t.ink, fontSize: 16.5, fontFamily: T.brand }}>{label}</Text></>}
    </Pressable>
  );

  const toEmail = (asNew: boolean) => { setCreating(asNew); setFormError(null); setMode('email'); };

  if (pending) {
    return (
      <OnbFrame step={3} onBack={() => { setPending(null); setFormError(null); }}
        title="Check your email"
        footer={(
          <>
            <Ghost label={busy === 'resend' ? 'Sending…' : sent ? 'Sent again' : 'Resend email'} onPress={again} />
            <FooterLink label="Use a different email" onPress={otherEmail} />
          </>
        )}>
        <View style={{ flex: 1, gap: 8, marginTop: 18 }}>
          <Text style={{ color: t.ink, fontSize: 17, lineHeight: 23, fontFamily: T.brand }}>{pending.email}</Text>
          <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 23 }}>Open the link in the email to finish.</Text>
          {!!formError && <Text style={{ color: '#D14343', fontSize: 14, lineHeight: 19, marginTop: 6 }}>{formError}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginTop: 'auto', paddingTop: 26 }}>
            <Character name="nu-idle" size={176} />
            <Character name="ra-wave" size={176} />
          </View>
        </View>
      </OnbFrame>
    );
  }

  return (
    <>
      <OnbFrame step={3} onBack={mode === 'email' ? () => setMode('choose') : undefined}
        title={creating ? 'Create your profile' : 'Sign in'}
        footer={mode === 'choose' ? (
          <>
            {Platform.OS === 'ios' && (
              <Social id="apple" black label="Continue with Apple" glyph={<AppleGlyph color="#FFFFFF" />} onPress={withApple} />
            )}
            <Social id="google" label="Continue with Google" glyph={<GoogleGlyph />} onPress={withGoogle} />
            <Social id="email" label="Sign up with email" glyph={null} onPress={() => toEmail(true)} />
            <FooterLink label="I already have an account" onPress={() => toEmail(false)} />
          </>
        ) : (
          <>
            <Primary tone="ra" onPress={submit}
              label={busy === 'password' ? (creating ? 'Creating…' : 'Signing in…') : (creating ? 'Create profile' : 'Sign in')} />
            <FooterLink label={Platform.OS === 'ios' ? 'Use Apple or Google instead' : 'Use Google instead'} onPress={() => { setCreating(true); setMode('choose'); }} />
          </>
        )}>
        {mode === 'choose' ? (
          <View style={{ flex: 1, marginTop: 18 }}>
            <Legal style={{ fontSize: 13, lineHeight: 18 }} />
            {/* one size for both: the two images fill their frames alike, so
                equal boxes read as equal characters. At the bottom, standing
                on the buttons, and still after a hello — a looping float
                pulled the eye away from the choice this screen is for. */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginTop: 'auto', paddingTop: 26 }}>
              <Character name="nu-idle" size={176} motion="greet" />
              <Character name="ra-wave" size={176} motion="greet" />
            </View>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 22 }}>
            {creating && (
              <TextInput autoFocus value={name} onChangeText={setName} {...on('name')}
                placeholder="Your first name" placeholderTextColor={t.ink3}
                autoCapitalize="words" autoComplete="given-name" returnKeyType="next" style={field('name')} />
            )}
            <TextInput autoFocus={!creating} value={email} onChangeText={setEmail} {...on('email')}
              placeholder="you@example.com" placeholderTextColor={t.ink3}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next"
              style={field('email')} />
            <TextInput value={password} onChangeText={setPassword} {...on('password')}
              placeholder={creating ? 'Password (8 or more characters)' : 'Password'} placeholderTextColor={t.ink3}
              secureTextEntry autoCapitalize="none" autoComplete={creating ? 'new-password' : 'current-password'}
              returnKeyType={creating ? 'next' : 'go'} onSubmitEditing={creating ? undefined : submit}
              style={field('password')} />
            {creating && (
              <TextInput value={confirm} onChangeText={setConfirm} {...on('confirm')}
                placeholder="Password again" placeholderTextColor={t.ink3}
                secureTextEntry autoCapitalize="none" autoComplete="new-password"
                returnKeyType="go" onSubmitEditing={submit} style={field('confirm')} />
            )}
            {!!formError && <Text style={{ color: '#D14343', fontSize: 14, lineHeight: 19 }}>{formError}</Text>}
          </View>
        )}
      </OnbFrame>
    </>
  );
}
