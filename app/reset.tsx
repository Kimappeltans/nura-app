import { inWorld } from '../src/world';
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../src/store';
import { isAuthPKCECodeVerifierMissingError } from '@supabase/supabase-js';
import { supabase, openedFromLink, codeFromElsewhere, verifyLink, inRecovery, onRecovery, endRecovery } from '../src/supabase';
import { notify } from '../src/notify';
import { radius, type as T } from '../src/theme';
import { Primary, Mica } from '../src/ui';
import { plainAuthError, LINK_ELSEWHERE, LINK_EXPIRED } from '../src/useAuthActions';
import { announce } from '../src/a11y';

/** Codes already swapped, so a second mount doesn't swap one again and call it broken. */
const swapped = new Set<string>();

/**
 * A new password, from the reset email (useAuthActions → resetPassword):
 * its code typed in on Sign in (withCode), or its link. A link with the
 * email's token (…?token_hash=…&type=recovery, supabase/README.md) is
 * verified here and works on any device. A link with a code swaps only
 * where the reset was asked for: on the web the Supabase client swaps it by
 * itself (src/supabase.ts), on the phone (nura://reset?code=…) it's swapped
 * here, and anywhere else this says so. The form shows only once one of
 * them says it was a recovery (inRecovery): a session on its own, from
 * signing in, isn't enough.
 */
function Reset() {
  const t = useTheme();
  const { code, token_hash: tokenHash, type } = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string }>();
  const session = useStore(s => s.session);
  const [recovering, setRecovering] = useState(inRecovery);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  /** the link was asked for on another device, so its code can't be swapped here */
  const [elsewhere, setElsewhere] = useState(codeFromElsewhere);
  // came here from a link at all (an expired one comes back with an error instead of a code)
  const [fromLink] = useState(() => Platform.OS === 'web'
    ? openedFromLink || /[?&#]error(_code)?=/.test(`${window.location.search}${window.location.hash}`)
    : !!code || !!tokenHash);

  useEffect(() => onRecovery(setRecovering), []);
  useEffect(() => {
    verifyLink(tokenHash, type)?.then(r => { if (r === 'failed') setBroken(true); });
  }, [tokenHash]);
  useEffect(() => {
    if (Platform.OS === 'web' || !code || swapped.has(code)) return;
    swapped.add(code);
    supabase.auth.exchangeCodeForSession(code)
      .then(({ error: e }) => {
        if (isAuthPKCECodeVerifierMissingError(e)) setElsewhere(true);
        else if (e) setBroken(true);
      })
      .catch(() => setBroken(true));
  }, [code]);
  // no recovery a few seconds after landing means the link was used or has expired
  useEffect(() => {
    if (recovering || !fromLink || elsewhere) return;
    const late = setTimeout(() => setBroken(true), 6000);
    return () => clearTimeout(late);
  }, [recovering, fromLink, elsewhere]);
  // an error, or a link that didn't work, is said as well as shown
  useEffect(() => { announce(error); }, [error]);
  const trouble = recovering ? null : elsewhere ? LINK_ELSEWHERE : broken ? LINK_EXPIRED : null;
  useEffect(() => { if (trouble) announce(`${trouble.title} ${trouble.body}`); }, [trouble]);

  const save = async () => {
    setError(null);
    if (password.length < 8) return setError('Password needs at least 8 characters.');
    if (password !== confirm) return setError('Passwords don’t match.');
    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ password }).catch(x => ({ error: x }));
    setBusy(false);
    if (e) return setError(plainAuthError(e));
    endRecovery();
    notify('Password changed', 'You’re signed in with the new one.', () => router.replace('/'));
  };

  const field = (id: string) => ({
    color: t.ink, fontSize: 16, paddingVertical: 15, paddingHorizontal: 16,
    backgroundColor: t.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: focused === id ? t.raDeep : t.strokeStrong,
  } as const);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 6, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <Pressable onPress={() => router.replace('/')} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back" style={{ paddingVertical: 8, alignSelf: 'flex-start' }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Back</Text>
        </Pressable>
        <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 29, lineHeight: 36, fontFamily: T.display, letterSpacing: -0.9, marginTop: 8, marginBottom: 8 }}>
          A new password.
        </Text>

        {trouble ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
            <Text style={{ color: t.ink, fontSize: 17, lineHeight: 23, fontFamily: T.brand }}>{trouble.title}</Text>
            <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 22 }}>{trouble.body}</Text>
          </View>
        ) : !(recovering && session) ? (
          <Text accessibilityLiveRegion="polite" style={{ color: t.ink2, fontSize: 16, lineHeight: 22 }}>
            {!fromLink && !recovering ? 'Open the link in your reset email, or enter its code on Sign in.'
              : 'Opening your link…'}
          </Text>
        ) : (
          <>
            <TextInput value={password} onChangeText={setPassword} autoFocus
              placeholder="New password" placeholderTextColor={t.ink3} accessibilityLabel="New password"
              secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType="next"
              onFocus={() => setFocused('p')} onBlur={() => setFocused(null)} style={field('p')} />
            <TextInput value={confirm} onChangeText={setConfirm}
              placeholder="Confirm new password" placeholderTextColor={t.ink3} accessibilityLabel="Confirm new password"
              secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType="go"
              onSubmitEditing={save}
              onFocus={() => setFocused('c')} onBlur={() => setFocused(null)} style={field('c')} />
            {!!error && <Text accessibilityLiveRegion="polite" style={{ color: t.raDeep, fontSize: 13.5, lineHeight: 18 }}>{error}</Text>}
            <Primary label={busy ? 'Saving…' : 'Save password'} tone="ra" onPress={save} disabled={busy} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

export default inWorld('utility', Reset);
