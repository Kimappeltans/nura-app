import { useState } from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { Primary, Mica } from '../ui';
import { radius, type as T } from '../theme';
import { capture } from '../db';
import { parseTask } from '../assistant';

/**
 * "What's on your mind?" — Nu, learned by using it.
 *
 * The whole app depends on capture costing nothing, so onboarding's job is
 * to make the first capture happen, not to describe it. One line per thing,
 * no order, no fields. Each line goes through the same on-device sentence
 * parser as Chat, so "call mum tomorrow at 6" still lands with its date —
 * but nobody has to know that to use it.
 */
const EXAMPLES = ['Reply to Sam', 'Book the dentist', 'Do the laundry', 'Finish the report'];

export default function BrainDump({ onNext }: { onNext: (ids: string[]) => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const add = (example: string) => {
    Haptics.selectionAsync();
    setText(v => (v.trim() ? `${v.replace(/\n*$/, '')}\n${example}` : example));
  };

  const save = async () => {
    if (!lines.length || saving) return;
    setSaving(true);
    const ids: string[] = [];
    for (const line of lines) {
      const d = parseTask(line);
      ids.push(await capture(d.title || line, {
        activity: d.activity, label: d.label, est_minutes: d.est_minutes,
        due_at: d.due_at, has_time: d.has_time,
        repeat_rule: d.repeat_rule, repeat_days: d.repeat_days, priority: d.priority,
      }));
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onNext(ids);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 12 }}>
          <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand }}>2 OF 3</Text>
          <Text style={{
            color: t.ink, fontSize: 30, lineHeight: 36, fontFamily: T.display,
            letterSpacing: -0.8, marginTop: 8,
          }}>What’s on your mind?</Text>
          <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 22, marginTop: 8 }}>
            Everything you’re carrying, one per line. No order, no dates needed.
          </Text>

          <TextInput
            value={text} onChangeText={setText} multiline autoFocus
            placeholder={'Reply to Sam\nBook the dentist\nCall mum tomorrow at 6'}
            placeholderTextColor={t.ink3}
            style={{
              marginTop: 22, minHeight: 170, textAlignVertical: 'top',
              color: t.ink, fontSize: 17, lineHeight: 26,
              padding: 16, borderRadius: radius.lg,
              backgroundColor: t.layer, borderWidth: 1, borderColor: t.strokeStrong,
              borderLeftWidth: 3, borderLeftColor: t.nu,
            }}
          />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {EXAMPLES.filter(e => !lines.includes(e)).map(e => (
              <Pressable key={e} onPress={() => add(e)} style={{
                paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill,
                backgroundColor: t.subtle, borderWidth: 1, borderColor: t.stroke,
              }}>
                <Text style={{ color: t.ink2, fontSize: 13.5 }}>+ {e}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flex: 1, minHeight: 24 }} />

          <View style={{ gap: 14 }}>
            {lines.length ? (
              <Primary tone="ra" onPress={save}
                label={saving ? 'Putting it down…' : `That’s it for now · ${lines.length} thing${lines.length === 1 ? '' : 's'}`} />
            ) : (
              <Text style={{ color: t.ink3, fontSize: 14, textAlign: 'center' }}>
                Write one thing, or tap an example.
              </Text>
            )}
            <Pressable onPress={() => onNext([])} hitSlop={10}>
              <Text style={{ color: t.ink3, fontSize: 14, textAlign: 'center' }}>I’ll add things later</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
