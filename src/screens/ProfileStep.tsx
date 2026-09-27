import { useState } from 'react';
import type React from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform, Alert } from 'react-native';
import { useTheme } from '../store';
import { Primary, IconCheck, Character } from '../ui';
import { radius, type as T } from '../theme';
import { OnbFrame, FooterLink } from '../components/OnbFrame';
import { useAuthActions } from '../useAuthActions';
import { AppleGlyph, GoogleGlyph } from './Auth';

/**
 * "Create your profile" — onboarding step 3, straight after the brain dump.
 *
 * Asked here rather than first because now there is something to keep: the
 * list you just wrote. Apps that ask for an account before showing anything
 * lose people at the door; asking once the work exists is the same moment
 * Duolingo asks, after the first lesson.
 *
 * Light, like the sign-in screen (Kim preferred it to navy here): an
 * account is a different kind of moment from the questions around it.
 *
 * No back arrow on the first view: the list is already saved, and going
 * back to an empty brain dump would only invite writing it twice.
 *
 * Not skippable: an account is required (Kim, 26 September; see Auth.tsx
 * for the App Store side of that). The same three doors as the sign-in screen (Auth.tsx), via
 * the same code (useAuthActions): Apple first on iPhone (Guideline 4.8),
 * Google, and email with a name and password.
 */
type Mode = 'choose' | 'email';

const PERKS = ['Backed up, so nothing gets lost', 'The same list on every device'];

export default function ProfileStep({ onDone, beforeRedirect }: {
  onDone: () => void;
  /** remember where onboarding was, before the web page leaves for Google */
  beforeRedirect?: () => Promise<void>;
}) {
  const t = useTheme();
  const { busy, formError, setFormError, withApple, withGoogle, withPassword } = useAuthActions(onDone, { beforeRedirect });
  const [mode, setMode] = useState<Mode>('choose');
  const [creating, setCreating] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const submit = async () => {
    const r = await withPassword({ creating, name, email, password, confirm });
    if (r === 'signed-in') onDone();
    if (r === 'check-email') {
      const body = `We sent a link to ${email}. Confirm it any time. You can carry on now.`;
      // react-native-web's Alert does nothing, so the browser's own stands in
      if (Platform.OS === 'web') { window.alert(`Check your email\n\n${body}`); onDone(); return; }
      Alert.alert('Check your email', body, [{ text: 'OK', onPress: onDone }]);
    }
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

  return (
    <>
      <OnbFrame step={3} onBack={mode === 'email' ? () => setMode('choose') : undefined}
        title={creating ? 'Create your profile' : 'Sign in'}
        sub={creating
          ? 'Keep your list safe and use Nura on any device.'
          : 'Your list comes with you.'}
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
          <View style={{ flex: 1, gap: 12, marginTop: 26 }}>
            {PERKS.map(p => (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.raWash, alignItems: 'center', justifyContent: 'center' }}>
                  <IconCheck size={17} color={t.raDeep} />
                </View>
                <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, flex: 1 }}>{p}</Text>
              </View>
            ))}
            <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18, marginTop: 14 }}>
              By continuing you agree to the Terms and Privacy Policy. No marketing email.
            </Text>
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
