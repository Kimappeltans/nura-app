import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { createHabit } from '../src/db';
import { radius, raTheme, type as T } from '../src/theme';
import { Mica, Primary, Eyebrow } from '../src/ui';

/**
 * A new habit — cue, tiny action, and an honest fallback for a bad day.
 *
 * Deliberately not "set a time and a repeat rule": that's what a
 * recurring task is for, and it's already a tap away on Compose. This
 * form only accepts the shape that actually builds automaticity — an
 * existing moment in your day, and something small enough to survive it.
 */
export default function NewHabit() {
  const t = raTheme;   // onboarding-style chrome, not the Nu/Ra mode — see Compose.tsx
  const [cue, setCue] = useState('');
  const [action, setAction] = useState('');
  const [minimum, setMinimum] = useState('');
  const [busy, setBusy] = useState(false);

  const canSave = cue.trim().length > 0 && action.trim().length > 0;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await createHabit(cue, action, minimum);
    router.back();
  };

  const field = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <TextInput
      value={value} onChangeText={onChange}
      placeholder={placeholder} placeholderTextColor={t.ink3}
      multiline
      style={{
        color: t.ink, fontSize: 16.5, lineHeight: 22, padding: 14,
        backgroundColor: t.card, borderRadius: radius.lg,
        borderWidth: 1, borderColor: t.strokeStrong, minHeight: 54,
      }}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica force="ra" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 4 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 10 }}>
            <Text style={{ color: t.ink3, fontSize: 15 }}>← Back</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6, gap: 22 }} keyboardShouldPersistTaps="handled">
          <View>
            <Eyebrow label="New habit" tone="ra" />
            <Text style={{ color: t.ink, fontSize: 26, fontFamily: T.display, letterSpacing: -0.6, marginTop: 6 }}>
              After something, do a little.
            </Text>
            <Text style={{ color: t.ink2, fontSize: 14.5, lineHeight: 20, marginTop: 6 }}>
              Not a time — a moment that already happens. "7am" gets missed by a bad
              morning; "after I make coffee" doesn't.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 12.5, letterSpacing: 1.4, fontFamily: T.brand }}>
              AFTER…
            </Text>
            {field(cue, setCue, 'I make coffee')}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 12.5, letterSpacing: 1.4, fontFamily: T.brand }}>
              I WILL…
            </Text>
            {field(action, setAction, 'revise one paragraph')}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 12.5, letterSpacing: 1.4, fontFamily: T.brand }}>
              ON A BAD DAY, INSTEAD (OPTIONAL)
            </Text>
            {field(minimum, setMinimum, 'read one sentence')}
            <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18 }}>
              A version small enough that "too tired" is never a reason to skip it
              entirely. Counts exactly the same.
            </Text>
          </View>

          <Primary label={busy ? 'Saving…' : 'Start it'} tone="ra" onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
