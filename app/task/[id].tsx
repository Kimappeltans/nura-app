import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Primary, Ghost, Mica } from '../../src/ui';
import { useStore, useTheme } from '../../src/store';
import {
  getTask, updateTask, dropTask, pickForToday, addSteps, steps, completeStep,
  REPEAT_LABEL, type Task, type RepeatRule,
} from '../../src/db';
import { reconcileNudges } from '../../src/notifications';
import { radius, type as T } from '../../src/theme';
import { LABELS, type LabelId } from '../../src/labels';
import { PRIORITIES } from '../../src/priority';
import { LabelChip } from '../../src/components/LabelIcon';
import { DatePicker, formatDue } from '../../src/components/DatePicker';

const MINUTES = [2, 5, 10, 15, 30, 60];
const REPEATS: { label: string; rule: RepeatRule | null }[] = [
  { label: 'Never', rule: null },
  { label: REPEAT_LABEL.daily, rule: 'daily' },
  { label: REPEAT_LABEL.weekdays, rule: 'weekdays' },
  { label: REPEAT_LABEL.weekly, rule: 'weekly' },
  { label: REPEAT_LABEL.monthly, rule: 'monthly' },
];
const QUICK = [
  { label: 'Tonight',  h: 18, add: 0 },
  { label: 'Tomorrow', h: 9,  add: 1 },
  { label: 'Next week',h: 9,  add: 7 },
];
function quickDate(add: number, h: number) {
  const d = new Date();
  d.setDate(d.getDate() + add);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: t.ink3, fontSize: 12.5, letterSpacing: 1.4, marginBottom: 10, fontFamily: T.brand }}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
        backgroundColor: on ? t.nu : 'transparent',
        borderWidth: 1, borderColor: on ? t.nu : t.strokeStrong,
      }}>
      <Text style={{ color: on ? t.base : t.ink, fontSize: 14, fontFamily: on ? T.brand : undefined }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TaskDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const refresh = useStore(s => s.refresh);
  const celebrate = useStore(s => s.celebrate);

  const [task, setTask] = useState<Task | null>(null);
  const [subs, setSubs] = useState<Task[]>([]);
  const [stepText, setStepText] = useState('');
  const [showCal, setShowCal] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  // Drives the footer bar below — a screen full of chips and text fields
  // with no visible save story reads as unfinished, even though every field
  // has already been written through by the time you see it change state.
  // This doesn't change that: it just says so.
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setTask(await getTask(id));
    setSubs(await steps(id));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!task) return <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} />;

  // every edit writes through immediately — no save button to forget.
  // setTask uses the functional updater, not `{ ...task, ...p }` closed over
  // the render's task snapshot — two chips tapped in quick succession (before
  // the first's `await updateTask` round-trip re-renders the screen) both
  // close over the same stale `task`, so the second patch's merge would
  // silently overwrite the first one's field on screen even though the
  // database itself ends up correct for both.
  const patch = async (p: Parameters<typeof updateTask>[1]) => {
    setSaving(true);
    await updateTask(task.id, p);
    setTask(prev => (prev ? { ...prev, ...p } as Task : prev));
    await refresh(); await reconcileNudges();
    setSaving(false);
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
      <Mica />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 8, marginBottom: 6 }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Back</Text>
        </Pressable>

        <TextInput
          value={task.title}
          onChangeText={v => setTask({ ...task, title: v })}
          onEndEditing={() => patch({ title: task.title })}
          multiline
          style={{ color: t.ink, fontSize: 27, fontFamily: T.display, lineHeight: 35 }}
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
              color: t.ink2, fontSize: 16.5, lineHeight: 22, padding: 14,
              backgroundColor: t.layer, borderRadius: radius.md,
              borderWidth: 1, borderColor: t.stroke,
              borderLeftWidth: 3, borderLeftColor: t.ra, minHeight: 64,
            }}
          />
        </Row>

        <Row label="How long, roughly">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {MINUTES.map(m => (
              <Chip key={m} label={`${m}m`} on={task.est_minutes === m}
                onPress={() => patch({ est_minutes: task.est_minutes === m ? null : m })} />
            ))}
          </View>
        </Row>

        {/* Which part of life this belongs to. A guess is made at capture from
            the words you typed; this is where it's confirmed or corrected. */}
        <Row label="Label">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {LABELS.map(l => (
              <Pressable key={l.id}
                onPress={() => { Haptics.selectionAsync(); patch({ label: task.label === l.id ? null : l.id }); }}>
                <LabelChip id={l.id} on={task.label === l.id} onPress={() => {}} />
              </Pressable>
            ))}
          </View>
        </Row>

        {/* Quick relative dates cover most of real use in one tap; the grid is
            there for the cases they can't express, which is any actual date. */}
        <Row label="When">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label="None" on={!task.due_at}
              onPress={() => { setShowCal(false); patch({ due_at: null, has_time: 0 }); }} />
            {QUICK.map(q => {
              const target = quickDate(q.add, q.h);
              const on = !!task.due_at && Math.abs(task.due_at - target) < 3600_000 * 6;
              return <Chip key={q.label} label={q.label} on={on}
                onPress={() => patch({ due_at: target, has_time: 1 })} />;
            })}
            <Chip label={showCal ? 'Hide calendar' : 'Pick a date…'} on={showCal}
              onPress={() => setShowCal(v => !v)} />
          </View>

          {!!task.due_at && (
            <Text style={{ color: t.ra, fontSize: 14, marginTop: 10, fontFamily: T.brand }}>
              {formatDue(task.due_at, !!task.has_time)}
            </Text>
          )}

          {showCal && (
            <View style={{ marginTop: 12 }}>
              <DatePicker
                value={task.due_at} hasTime={!!task.has_time}
                onChange={(ms, ht) => patch({ due_at: ms, has_time: ht ? 1 : 0 })}
              />
            </View>
          )}
        </Row>

        <Row label="Priority">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {PRIORITIES.map(x => {
              const on = (task.priority ?? 0) === x.n;
              const c = t.key === 'ra' ? x.onLight : x.color;
              return (
                <Pressable key={x.n}
                  onPress={() => { Haptics.selectionAsync(); patch({ priority: x.n }); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill,
                    backgroundColor: on ? `${c}26` : 'transparent',
                    borderWidth: 1.5, borderColor: on ? c : t.strokeStrong,
                  }}>
                  {x.n > 0 && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? c : t.ink3 }} />}
                  <Text style={{ color: on ? c : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>{x.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Row>

        {/* Repeats. Collapsed by default — one more always-visible row of chips
            on a screen that's already mostly chips is what made this read as
            a form rather than a task. It doesn't earn a slot until either you
            open it or a rule is already set, and once a rule is set it stays
            open rather than hiding an active setting behind a tap.
            Completing a recurring task never rewinds it — the done row stays
            done and a fresh one is created for the next occurrence, so your
            history stays honest. */}
        {!task.parent_id && (() => {
          const open = showRepeat || !!task.repeat_rule;
          const current = REPEATS.find(r => (task.repeat_rule ?? null) === r.rule);
          return (
            <Row label="Repeats">
              {open ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {REPEATS.map(r => (
                      <Chip key={r.label} label={r.label} on={(task.repeat_rule ?? null) === r.rule}
                        onPress={() => patch({ repeat_rule: r.rule })} />
                    ))}
                  </View>
                  {!!task.repeat_rule && !task.due_at && (
                    <Text style={{ color: t.ink3, fontSize: 13, marginTop: 9, lineHeight: 18 }}>
                      Set a due date too, or the next one is scheduled from whenever you finish this.
                    </Text>
                  )}
                </>
              ) : (
                <Pressable onPress={() => setShowRepeat(true)} hitSlop={8}>
                  <Text style={{ color: t.ink3, fontSize: 14.5 }}>
                    {current?.label ?? 'Never'} <Text style={{ color: t.nu }}>· change</Text>
                  </Text>
                </Pressable>
              )}
            </Row>
          );
        })()}

        {/* Break it down. One level only. */}
        {!task.parent_id && (
          <Row label={subs.length ? 'Steps' : 'Too big? Break it into steps'}>
            {subs.map(s => (
              <Pressable key={s.id}
                onPress={async () => {
                  if (s.state === 'done') return;
                  const award = await completeStep(s.id);
                  celebrate(award);
                  await load(); await refresh();
                }}
                style={{
                  flexDirection: 'row', gap: 12, alignItems: 'center',
                  paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: t.stroke,
                }}>
                <Text style={{ color: s.state === 'done' ? t.ra : t.ink3, fontSize: 16 }}>
                  {s.state === 'done' ? '✓' : '○'}
                </Text>
                <Text style={{
                  color: s.state === 'done' ? t.ink3 : t.ink, fontSize: 16.5, flex: 1,
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
                color: t.ink, fontSize: 16.5, paddingVertical: 14, marginTop: 4,
                borderBottomWidth: 2, borderBottomColor: t.nu,
              }}
            />
          </Row>
        )}

        <View style={{ height: 32 }} />

        <Primary
          label={isToday ? '✓ On today’s plan' : 'Add to today'}
          tone={isToday ? 'ra' : 'nu'}
          onPress={async () => { await pickForToday(task.id, !isToday); await load(); await refresh(); }}
        />

        {/* No "Start now" here. This sheet is reached from Nu, and starting
            something from inside Nu is precisely the thing the two-mode design
            exists to prevent — you'd be picking from a list again, which is the
            decision that doesn't get made. The only way anything starts is
            Nu → Ra → Begin. */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
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

      {/* Persistent save status. Every field above already writes through on
          blur — see `patch` — but nothing on screen said so, and a sheet full
          of text fields and chips with no save button and no confirmation
          reads as unfinished even when it isn't. This doesn't change the
          autosave; it just stops leaving you to guess whether it happened. */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.stroke,
        backgroundColor: t.base,
      }}>
        {saving ? (
          <>
            <ActivityIndicator size="small" color={t.ink3} />
            <Text style={{ color: t.ink3, fontSize: 12.5, fontFamily: T.brand }}>Saving…</Text>
          </>
        ) : (
          <>
            <Text style={{ color: t.ra, fontSize: 13 }}>✓</Text>
            <Text style={{ color: t.ink3, fontSize: 12.5, fontFamily: T.brand }}>All changes saved</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
