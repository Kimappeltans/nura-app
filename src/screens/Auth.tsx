import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { radius, raTheme, type as T } from '../theme';
import { Primary, Mica, Character } from '../ui';

/* --- brand glyphs, drawn rather than shipped as logo files ---------------- */

function AppleGlyph({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.05 12.9c-.03-2.7 2.2-4 2.3-4.06-1.25-1.83-3.2-2.08-3.9-2.11-1.66-.17-3.24.98-4.08.98-.84 0-2.14-.96-3.52-.93-1.81.03-3.48 1.05-4.41 2.67-1.88 3.27-.48 8.1 1.35 10.75.9 1.3 1.97 2.75 3.38 2.7 1.36-.06 1.87-.88 3.51-.88s2.1.88 3.53.85c1.46-.02 2.38-1.32 3.27-2.63 1.03-1.5 1.46-2.96 1.48-3.04-.03-.01-2.85-1.09-2.88-4.3zM14.4 4.6c.74-.9 1.24-2.15 1.1-3.4-1.07.05-2.36.71-3.13 1.61-.68.79-1.28 2.06-1.12 3.28 1.19.09 2.41-.6 3.15-1.49z" />
    </Svg>
  );
}

function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-3.9H24v7.1h12.1c-.2 1.8-1.6 4.6-4.5 6.4l6.9 5.3c4.1-3.8 6.6-9.4 6.6-15z" />
      <Path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.5 46 24 46z" />
      <Path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.7-4.5l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 10z" />
      <Path fill="#EA4335" d="M24 10.4c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.9 4.4 14l7.1 5.5c1.8-5.3 6.7-9.1 12.5-9.1z" />
    </Svg>
  );
}

type Mode = 'choose' | 'email';

/**
 * Sign in / create an account.
 *
 * Deliberately NOT a gate. It sits behind a "Sign in" link on the welcome
 * screen and behind Settings, and the app is fully usable without ever opening
 * it — everything is on the device already. Signing in buys sync across
 * devices, a backup, and the integrations that need a server.
 *
 * Two rules that are not negotiable when this goes live:
 *
 *  1. SIGN IN WITH APPLE IS MANDATORY on iOS the moment Google sign-in is
 *     offered (App Store Guideline 4.8). Apps get rejected for missing it, so
 *     Apple is listed first and given equal weight.
 *  2. Requiring registration to use core features that work fine without an
 *     account trips Guideline 5.1.1(v). Hence the "keep using without an
 *     account" escape at the bottom, which is also simply better product.
 *
 * Email used to be magic-link only ("nothing to invent, nothing to forget").
 * That's still offered as a fallback on sign-in, but a proper account needs a
 * real form too — name, email, password — so creating one collects all three,
 * with client-side validation (name present, password ≥8 characters, the two
 * password fields matching) before anything is submitted.
 *
 * The handlers below are wired to the UI but not to a backend yet — each one
 * marks where the Supabase call goes. Nothing here pretends to have signed you
 * in, and nothing typed here is written to disk — the password fields exist
 * only in this screen's own state and are gone the moment you navigate away.
 */
export default function Auth(
  { onClose, onBack }: { onClose: () => void; onBack?: () => void },
) {
  // Fixed bright, like Connect.tsx and Compose.tsx — this is onboarding
  // chrome, not the Nu/Ra experience, so it shouldn't inherit whatever mode
  // happens to be active (which, before onboarding ever runs, is Nu — navy
  // text-and-background pairing would otherwise collide with Mica reading
  // the global mode independently of this screen's own fixed palette).
  const t = raTheme;
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const inputStyle = {
    color: t.ink, fontSize: 16, paddingVertical: 15, paddingHorizontal: 16,
    backgroundColor: t.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: t.strokeStrong,
  } as const;

  const notYet = (what: string) => {
    setBusy(null);
    Alert.alert(
      `${what} isn’t connected yet`,
      'The screens are built; the backend comes next. Nothing is stored, and the app keeps working without an account.',
      [{ text: 'OK' }],
    );
  };

  // → supabase.auth.signInWithIdToken({ provider: 'apple', token })
  const withApple = async () => {
    setBusy('apple'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => notYet('Sign in with Apple'), 450);
  };
  // → supabase.auth.signInWithIdToken({ provider: 'google', token })
  const withGoogle = async () => {
    setBusy('google'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => notYet('Google'), 450);
  };
  // → supabase.auth.signInWithOtp({ email })  — magic link, no password to forget.
  // Still offered, but only as a sign-in fallback now — creating an account
  // goes through withPassword below, which collects a real password.
  const withEmail = async () => {
    if (!email.includes('@')) return;
    setBusy('email'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => notYet('Email'), 450);
  };
  // → creating: supabase.auth.signUp({ email, password, options: { data: { name } } })
  // → signing in: supabase.auth.signInWithPassword({ email, password })
  const withPassword = async () => {
    setFormError(null);
    if (creating && !name.trim()) return setFormError('Add your name.');
    if (!email.includes('@')) return setFormError('Add a valid email address.');
    if (password.length < 8) return setFormError('Password needs at least 8 characters.');
    if (creating && password !== confirm) return setFormError('Passwords don’t match.');
    setBusy('password'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => notYet(creating ? 'Creating your account' : 'Sign in'), 450);
  };

  const Social = ({ id, label, glyph, dark }: {
    id: string; label: string; glyph: React.ReactNode; dark?: boolean;
  }) => (
    <Pressable
      onPress={id === 'apple' ? withApple : withGoogle}
      disabled={!!busy}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 15, borderRadius: radius.lg,
        backgroundColor: dark ? '#FFFFFF' : t.card,
        borderWidth: 1, borderColor: dark ? '#FFFFFF' : t.strokeStrong,
        opacity: pressed || busy ? 0.85 : 1,
      })}>
      {busy === id
        ? <ActivityIndicator size="small" color={dark ? '#111' : t.ink} />
        : <>{glyph}<Text style={{
            color: dark ? '#111111' : t.ink, fontSize: 16.5, fontFamily: T.brand,
          }}>{label}</Text></>}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica force="ra" />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 6, paddingBottom: 14 }}>
        <Pressable onPress={onBack ?? onClose} hitSlop={14} style={{ paddingVertical: 8, alignSelf: 'flex-start' }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Back</Text>
        </Pressable>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}>
          <Character name="ra-wave" size={104} motion="greet" style={{ alignSelf: 'center', marginTop: 4 }} />

          <Text style={{
            color: t.ink, fontSize: 29, lineHeight: 37, fontFamily: T.display,
            letterSpacing: -0.9, marginTop: 6,
          }}>
            {creating ? 'Create your account.' : 'Welcome back.'}
          </Text>
          <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 22, marginTop: 8, maxWidth: 310 }}>
            An account keeps your tasks on every device and unlocks the calendar
            and work-app integrations. Everything already on this phone stays put.
          </Text>

          <View style={{ height: 24 }} />

          {mode === 'choose' ? (
            <View style={{ gap: 11 }}>
              {/* Apple first, and always present on iOS — Guideline 4.8. */}
              {Platform.OS !== 'android' && (
                <Social id="apple" dark label="Continue with Apple" glyph={<AppleGlyph color="#111111" />} />
              )}
              <Social id="google" label="Continue with Google" glyph={<GoogleGlyph />} />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: t.stroke }} />
                <Text style={{ color: t.ink3, fontSize: 12 }}>or</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: t.stroke }} />
              </View>

              <Pressable onPress={() => setMode('email')} style={({ pressed }) => ({
                paddingVertical: 15, borderRadius: radius.lg, alignItems: 'center',
                backgroundColor: pressed ? t.subtle : t.card,
                borderWidth: 1, borderColor: t.strokeStrong,
              })}>
                <Text style={{ color: t.ink, fontSize: 16.5, fontFamily: T.brand }}>
                  {creating ? 'Sign up with email' : 'Continue with email'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {creating && (
                <TextInput
                  autoFocus value={name} onChangeText={setName}
                  placeholder="Your name" placeholderTextColor={t.ink3}
                  autoCapitalize="words" autoComplete="name" returnKeyType="next"
                  style={inputStyle}
                />
              )}
              <TextInput
                autoFocus={!creating} value={email} onChangeText={setEmail}
                placeholder="you@example.com" placeholderTextColor={t.ink3}
                keyboardType="email-address" autoCapitalize="none" autoComplete="email"
                returnKeyType="next"
                style={inputStyle}
              />
              <TextInput
                value={password} onChangeText={setPassword}
                placeholder="Password" placeholderTextColor={t.ink3}
                secureTextEntry autoCapitalize="none"
                autoComplete={creating ? 'new-password' : 'current-password'}
                returnKeyType={creating ? 'next' : 'go'}
                onSubmitEditing={creating ? undefined : withPassword}
                style={inputStyle}
              />
              {creating && (
                <TextInput
                  value={confirm} onChangeText={setConfirm}
                  onSubmitEditing={withPassword} returnKeyType="go"
                  placeholder="Confirm password" placeholderTextColor={t.ink3}
                  secureTextEntry autoCapitalize="none" autoComplete="new-password"
                  style={inputStyle}
                />
              )}

              {!!formError && (
                <Text style={{ color: '#D14343', fontSize: 13.5, lineHeight: 18 }}>{formError}</Text>
              )}

              <Primary
                label={busy === 'password' ? (creating ? 'Creating…' : 'Signing in…') : (creating ? 'Create account' : 'Sign in')}
                tone="ra" onPress={withPassword} />

              {/* A link, not a password — still here as a fallback for anyone
                  who'd rather not type one, or who's forgotten theirs. Not
                  offered on the signup side: creating an account is where the
                  password gets set in the first place. */}
              {!creating && (
                <Pressable onPress={withEmail} hitSlop={10}>
                  <Text style={{ color: t.ink3, fontSize: 13.5, textAlign: 'center' }}>
                    {busy === 'email' ? 'Sending…' : 'Forgot it? Email me a sign-in link instead'}
                  </Text>
                </Pressable>
              )}

              <Pressable onPress={() => setMode('choose')} hitSlop={10}>
                <Text style={{ color: t.ink3, fontSize: 14, textAlign: 'center' }}>
                  Use Apple or Google instead
                </Text>
              </Pressable>
            </View>
          )}

          <View style={{ flex: 1, minHeight: 20 }} />

          <Pressable onPress={() => {
            setCreating(c => !c); setMode('choose');
            setFormError(null); setPassword(''); setConfirm('');
          }} hitSlop={10}>
            <Text style={{ color: t.ink2, fontSize: 14, textAlign: 'center', marginTop: 18 }}>
              {creating ? 'Already have an account? ' : 'New to Nura? '}
              <Text style={{ color: t.raDeep, fontFamily: T.brand }}>
                {creating ? 'Sign in' : 'Create an account'}
              </Text>
            </Text>
          </Pressable>

          {/* Not a gate. */}
          <Pressable onPress={onClose} hitSlop={10} style={{ marginTop: 14 }}>
            <Text style={{ color: t.ink3, fontSize: 13.5, textAlign: 'center', lineHeight: 19 }}>
              {onBack ? 'Skip — start without an account' : 'Keep using Nura without an account'}
            </Text>
          </Pressable>

          <Text style={{ color: t.ink3, fontSize: 12.5, textAlign: 'center', lineHeight: 17, marginTop: 14 }}>
            By continuing you agree to the Terms and Privacy Policy.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
