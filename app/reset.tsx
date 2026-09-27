import { inWorld } from '../src/world';
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../src/store';
import { supabase } from '../src/supabase';
import { notify } from '../src/notify';
import { radius, type as T } from '../src/theme';
import { Primary, Mica } from '../src/ui';
import { plainAuthError } from '../src/useAuthActions';

/**
 * A new password, from the link in the reset email (useAuthActions →
 * resetPassword). On the web the link comes back to this page with a code in
 * the address, which the Supabase client swaps for a session by itself
 * (src/supabase.ts); on the phone it opens nura://reset?code=…, and the code
 * is swapped here. Either way, once there's a session, the password is set.
 */
function Reset() {
  const t = useTheme();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const session = useStore(s => s.session);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !code || session) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error: e }) => { if (e) setBroken(true); });
  }, [code]);
  // on the web: no session a few seconds after landing means the link was used or has expired
  useEffect(() => {
    if (session) return;
    const late = setTimeout(() => setBroken(true), 6000);
    return () => clearTimeout(late);
  }, [session]);

  const save = async () => {
    setError(null);
    if (password.length < 8) return setError('Password needs at least 8 characters.');
    if (password !== confirm) return setError('Passwords don’t match.');
    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ password }).catch(x => ({ error: x }));
    setBusy(false);
    if (e) return setError(plainAuthError(e));
    notify('Password changed', 'You’re signed in with the new one.', () => router.replace('/'));
  };

  const field = (id: string) => ({
    color: t.ink, fontSize: 16, paddingVertical: 15, paddingHorizontal: 16,
    backgroundColor: t.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: focused === id ? t.ra : t.strokeStrong,
  } as const);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 6, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <Pressable onPress={() => router.replace('/')} hitSlop={14} style={{ paddingVertical: 8, alignSelf: 'flex-start' }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Back</Text>
        </Pressable>
        <Text style={{ color: t.ink, fontSize: 29, lineHeight: 36, fontFamily: T.display, letterSpacing: -0.9, marginTop: 8, marginBottom: 8 }}>
          A new password.
        </Text>

        {!session ? (
          <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 22 }}>
            {broken ? 'This link has been used or has expired. Ask for a new one from Sign in.' : 'Opening your link…'}
          </Text>
        ) : (
          <>
            <TextInput value={password} onChangeText={setPassword} autoFocus
              placeholder="New password" placeholderTextColor={t.ink3}
              secureTextEntry autoCapitalize="none" autoComplete="new-password" returnKeyType="next"
              onFocus={() => setFocused('p')} onBlur={() => setFocused(null)} style={field('p')} />
            <TextInput value={confirm} onChangeText={setConfirm}
              placeholder="Confirm new password" placeholderTextColor={t.ink3}
              secureTextEntry autoCapitalize="none" autoComplete="new-password" returnKeyType="go"
              onSubmitEditing={save}
              onFocus={() => setFocused('c')} onBlur={() => setFocused(null)} style={field('c')} />
            {!!error && <Text style={{ color: '#D14343', fontSize: 13.5, lineHeight: 18 }}>{error}</Text>}
            <Primary label={busy ? 'Saving…' : 'Save password'} tone="ra" onPress={save} disabled={busy} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

export default inWorld('utility', Reset);
