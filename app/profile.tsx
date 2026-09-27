import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { withTabs } from '../src/components/WithTabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { View, Text, Pressable, ScrollView, TextInput, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore } from '../src/store';
import { deleteAccount } from '../src/account';
import { type as T } from '../src/theme';
import { Mica } from '../src/ui';
import { AvatarButton, AvatarPicker } from '../src/components/Avatar';
import { Sheet } from '../src/components/Sheet';

/**
 * You and your account, nothing else. Your picture, your name and a line
 * about you at the top; below, what you'd change about yourself (name,
 * pronouns, about me), then the account: its email, and deleting it (Log out
 * is at the foot of Settings, which opens this as its Account row). How the
 * app behaves lives in Settings; how it's going lives in Wins. Everything
 * saves as you go: there's no Save button to forget.
 *
 * The name is the one Home greets you by (its first word); with none, Home
 * uses the name on the account.
 */
function Profile() {
  const t = useTheme();
  const { session, profile } = useStore();
  const [name, setName] = useState(profile.name);
  const [pronouns, setPronouns] = useState(profile.pronouns);
  const [about, setAbout] = useState(profile.tagline);
  const [sheet, setSheet] = useState<'picture' | null>(null);
  const nameInput = useRef<TextInput>(null);

  // the profile can arrive after this screen (a reload on the web): take it when it does
  useEffect(() => {
    setName(profile.name); setPronouns(profile.pronouns); setAbout(profile.tagline);
  }, [profile.name, profile.pronouns, profile.tagline]);

  // saved when a field is left, and when the screen is: what was typed is kept
  const draft = useRef({ name, pronouns, tagline: about });
  draft.current = { name, pronouns, tagline: about };
  const save = useCallback(() => {
    const d = draft.current;
    const { profile: p, saveProfile } = useStore.getState();
    const next = { name: d.name.trim(), pronouns: d.pronouns.trim(), tagline: d.tagline.trim() };
    if (next.name !== p.name || next.pronouns !== p.pronouns || next.tagline !== p.tagline) saveProfile(next);
  }, []);
  useEffect(() => save, [save]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => goBack()} hitSlop={12} style={{ flex: 1, paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 34 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ---- who ---- */}
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <AvatarButton size={112} onPress={() => setSheet('picture')} />
          {/* your name, big, once there is one (the field below is where it's written) */}
          {!!name.trim() && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', columnGap: 8, marginTop: 14 }}>
              <Text style={{ color: t.ink, fontSize: 30, lineHeight: 34, fontFamily: T.display, letterSpacing: -1.2 }}>{name.trim()}</Text>
              {!!pronouns.trim() && <Text style={{ color: t.ink3, fontSize: 15 }}>{pronouns.trim()}</Text>}
            </View>
          )}
          {!!about.trim() && (
            <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 21, marginTop: 6, textAlign: 'center', maxWidth: 300 }}>
              {about.trim()}
            </Text>
          )}
        </View>

        <Group title="About you">
          <Field inputRef={nameInput} label="Name" value={name} onChangeText={setName} onBlur={save}
            maxLength={40} autoCapitalize="words" autoComplete="given-name" returnKeyType="done" />
          <Line />
          <Field label="Pronouns" value={pronouns} onChangeText={setPronouns} onBlur={save}
            maxLength={24} autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
          <Line />
          {/* one line that wraps: Return finishes it (blurOnSubmit for the web) */}
          <Field stacked label="About me" value={about} onChangeText={v => setAbout(v.replace(/\s*\n+\s*/g, ' '))}
            onBlur={save} onSubmitEditing={save} maxLength={90} multiline
            submitBehavior="blurAndSubmit" blurOnSubmit returnKeyType="done" />
        </Group>

        {/* an account is required, so there's always one here; signing out or
            deleting it brings the sign-in screen back by itself */}
        {session && (
          <Group title="Account">
            <Row label="Email" value={session.user.email ?? ''} />
            <Line />
            <Row label="Delete account" danger onPress={deleteAccount} />
          </Group>
        )}
      </ScrollView>

      <Sheet visible={sheet === 'picture'} onClose={() => setSheet(null)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 16 }}>
          <Text style={{ color: t.ink, fontSize: 22, fontFamily: T.display, letterSpacing: -0.4 }}>Your picture</Text>
          <Pressable onPress={() => setSheet(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"
            style={{ marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: t.layer }}>
            <Text style={{ color: t.ink2, fontSize: 18, lineHeight: 20 }}>×</Text>
          </Pressable>
        </View>
        <AvatarPicker />
      </Sheet>

    </SafeAreaView>
  );
}

/* Out here, not inside Profile: a field redefined on every keystroke would
   lose its focus after each letter. */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginBottom: 8, marginLeft: 4 }}>
        {title.toUpperCase()}
      </Text>
      {/* flat: a fill and a hairline */}
      <View style={{ borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function Line() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 16 }} />;
}

/** A label and its value, editable where it sits. `stacked` puts a longer one under its label. */
function Field({ label, stacked, inputRef, ...input }: TextInputProps & { label: string; stacked?: boolean; inputRef?: React.Ref<TextInput> }) {
  const t = useTheme();
  return (
    <View style={stacked
      ? { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }
      : { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand, width: stacked ? undefined : 92 }}>{label}</Text>
      <TextInput ref={inputRef} placeholder="Add" placeholderTextColor={t.ink3} {...input}
        style={stacked
          ? { color: t.ink, fontSize: 15.5, lineHeight: 21, paddingVertical: 6, minHeight: 44, textAlignVertical: 'top' }
          : { flex: 1, color: t.ink, fontSize: 15.5, textAlign: 'right', paddingVertical: 16 }} />
    </View>
  );
}

/** A label and its value; with `onPress`, an action (`danger` for the one that can't be undone). */
function Row({ label, value, danger, onPress }: { label: string; value?: string; danger?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress ? () => { Haptics.selectionAsync(); onPress(); } : undefined} disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: pressed && onPress ? t.subtle : 'transparent',
      })}>
      <Text style={{ color: danger ? t.raDeep : t.ink, fontSize: 15.5, fontFamily: T.brand }}>{label}</Text>
      {!!value && <Text numberOfLines={1} style={{ flex: 1, color: t.ink3, fontSize: 15, textAlign: 'right' }}>{value}</Text>}
    </Pressable>
  );
}

export default inWorld('utility', withTabs(Profile));
