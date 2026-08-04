import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Primary, Ghost } from '../../src/ui';
import { useStore, useTheme } from '../../src/store';
import {
  getTask, updateTask, dropTask, pickForToday, addSteps, steps, completeStep,
  type Task,
} from '../../src/db';
import { reconcileNudges } from '../../src/notifications';
import { radius, type as T } from '../../src/theme';

const MINUTES = [2, 5, 10, 15, 30, 60];
const DUE = [
  { label: 'None',     ms: null },
  { label: 'Tonight',  ms: 6 * 3600_000 },
  { label: 'Tomorrow', ms: 24 * 3600_000 },
  { label: 'This week',ms: 5 * 24 * 3600_000 },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: .06, marginBottom: 9 }}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{
        paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: on ? t.nu : 'transparent',
        borderWidth: 1, borderColor: on ? t.nu : t.strokeStrong,
      }}>
      <Text style={{ color: on ? '#fff' : t.ink2, fontSize: 13, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export default function TaskDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const refresh = useStore(s => s.refresh);

  const [task, setTask] = useState<Task | null>(null);
  const [subs, setSubs] = useState<Task[]>([]);
  const [stepText, setStepText] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setTask(await getTask(id));
    setSubs(await steps(id));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!task) return <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} />;

  // every edit writes through immediately — no save button to forget
  const patch = async (p: Parameters<typeof updateTask>[1]) => {
    await updateTask(task.id, p);
    setTask({ ...task, ...p } as Task);
    await refresh(); await reconcileNudges();
  };

  const addStep = async () => {
    if (!stepText.trim()) return;
    await addSteps(task.id, [stepText]);
    setStepText(''); await load(); await refresh();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const isToday = task.state === 'today' || task.state === 'doing';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 48 }}>

        <Pressable onPress={() => router.back()} style={{ paddingVertical: 6, marginBottom: 8 }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Back</Text>
        </Pressable>

        <TextInput
          value={task.title}
          onChangeText={v => setTask({ ...task, title: v })}
          onEndEditing={() => patch({ title: task.title })}
          multiline
          style={{ color: t.ink, fontSize: 26, fontFamily: T.display, lineHeight: 33 }}
        />

        {/* The single most useful field in the app. A task is a verb plus a
            first physical action; this is where that action gets written down. */}
        <Row label="First physical action">
          <TextInput
            value={task.first_action ?? ''}
            onChangeText={v => setTask({ ...task, first_action: v })}
            onEndEditing={() => patch({ first_action: task.first_action || null })}
            placeholder="Open the doc that's already on your second monitor"
            placeholderTextColor={t.ink3}
            multiline
            style={{
              color: t.ink2, fontSize: 15, lineHeight: 21, padding: 13,
              backgroundColor: t.nuWash, borderRadius: radius.md,
              borderWidth: 1, borderColor: t.stroke, minHeight: 62,
            }}
          />
        </Row>

        <Row label="How long, roughly">
          <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
            {MINUTES.map(m => (
              <Chip key={m} label={`${m}m`} on={task.est_minutes === m}
                onPress={() => patch({ est_minutes: task.est_minutes === m ? null : m })} />
            ))}
          </View>
        </Row>

        <Row label="Due">
          <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
            {DUE.map(d => {
              const on = d.ms === null ? !task.due_at
                : !!task.due_at && Math.abs(task.due_at - (Date.now() + d.ms)) < 3600_000 * 12;
              return <Chip key={d.label} label={d.label} on={on}
                onPress={() => patch({ due_at: d.ms === null ? null : Date.now() + d.ms })} />;
            })}
          </View>
        </Row>

        {/* Break it down. One level only. */}
        {!task.parent_id && (
          <Row label={subs.length ? 'Steps' : 'Too big? Break it into steps'}>
            {subs.map(s => (
              <Pressable key={s.id}
                onPress={async () => {
                  if (s.state === 'done') return;
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  await completeStep(s.id); await load(); await refresh();
                }}
                style={{
                  flexDirection: 'row', gap: 11, alignItems: 'center',
                  paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.stroke,
                }}>
                <Text style={{ color: s.state === 'done' ? t.ra : t.ink3, fontSize: 15 }}>
                  {s.state === 'done' ? '✓' : '○'}
                </Text>
                <Text style={{
                  color: s.state === 'done' ? t.ink3 : t.ink, fontSize: 15, flex: 1,
                  textDecorationLine: s.state === 'done' ? 'line-through' : 'none',
                }}>{s.title}</Text>
              </Pressable>
            ))}
            <TextInput
              value={stepText}
              onChangeText={setStepText}
              onSubmitEditing={addStep}
              blurOnSubmit={false}
              returnKeyType="done"
              placeholder="Absurdly small first step…"
              placeholderTextColor={t.ink3}
              style={{
                color: t.ink, fontSize: 15, paddingVertical: 13, marginTop: 4,
                borderBottomWidth: 2, borderBottomColor: t.nu,
              }}
            />
          </Row>
        )}

        <View style={{ height: 30 }} />

        <Primary
          label={isToday ? '✓ On today’s plan' : 'Add to today'}
          tone={isToday ? 'ra' : 'nu'}
          onPress={async () => { await pickForToday(task.id, !isToday); await load(); await refresh(); }}
        />

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Ghost label="Start now" onPress={() => router.replace({ pathname: '/timer', params: { id: task.id } })} />
          <Ghost label="Let it go" onPress={() => {
            // not a delete — it stays in the event log, it just stops asking
            Alert.alert('Let this go?', 'It stops appearing. Nothing is counted against you.', [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Let it go', style: 'destructive',
                onPress: async () => { await dropTask(task.id); await refresh(); router.back(); } },
            ]);
          }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
