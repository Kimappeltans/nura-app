import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { Primary } from '../ui';
import { radius } from '../theme';
import { OnbFrame } from '../components/OnbFrame';
import { capture } from '../db';
import { parseTask } from '../assistant';

/**
 * "What do you need to get done?" — Nu, learned by using it.
 *
 * The whole app depends on capture costing nothing, so onboarding's job is
 * to make the first capture happen, not to describe it. One line per thing,
 * no order, no fields. Each line goes through the same on-device sentence
 * parser as Chat, so "call the bank tomorrow at 6pm" still lands with its
 * date — but nobody has to know that to use it.
 *
 * This screen used to offer ready-made tasks to tap ("Reply to Sam"). They
 * were someone else's life: tapping one put a stranger's errand on your
 * list. What helps a blank page is a nudge for your own memory instead —
 * the places things hide — so that's all it offers.
 */
export default function BrainDump({ onNext, onBack }: { onNext: (ids: string[]) => void; onBack: () => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

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
    <OnbFrame step={2} onBack={onBack} onSkip={() => onNext([])}
      title="What do you need to get done?"
      sub="One per line."
      footer={
        <Primary tone="ra" onPress={save} disabled={!lines.length}
          label={saving ? 'Saving…' : lines.length ? `Continue · ${lines.length} thing${lines.length === 1 ? '' : 's'}` : 'Continue'} />
      }>
      <TextInput
        value={text} onChangeText={setText} multiline autoFocus
        accessibilityLabel="What you need to get done, one per line"
        placeholder={'Pay the phone bill\nBook a haircut\nSend the report by friday'}
        placeholderTextColor={t.ink3}
        style={{
          marginTop: 22, minHeight: 170, textAlignVertical: 'top',
          color: t.ink, fontSize: 17, lineHeight: 26,
          padding: 16, borderRadius: radius.lg,
          backgroundColor: t.layer, borderWidth: 1, borderColor: t.strokeStrong,
          borderLeftWidth: 3, borderLeftColor: t.nu,
        }}
      />
    </OnbFrame>
  );
}
