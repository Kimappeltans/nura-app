import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import type { Task } from '../db';
import { eventsBetween, type UpcomingEvent } from '../calendar';
import { type as T } from '../theme';
import { Mica, Primary } from '../ui';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { Sheet } from '../components/Sheet';
import { Suggestions } from '../components/Suggestions';
import { DayPath } from '../components/DayPath';

const DAY = 86400_000;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const span = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);
const startOf = (offset: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d.getTime(); };
const DAY_ENDS = [
  { min: 21 * 60, label: '9:00 PM' }, { min: 22 * 60, label: '10:00 PM' }, { min: 23 * 60, label: '11:00 PM' },
  { min: 24 * 60, label: 'Midnight' }, { min: 25 * 60, label: '1:00 AM' },
];

/**
 * YOUR DAY — what is happening today, and what happened?
 *
 *   - a strip of days: yesterday to a few days on;
 *   - the day at a glance: does it fit, what's anchored, what floats, what rose;
 *   - NOW: the one thing that fits the time before the next anchor (today);
 *   - your flow: the calendar and anything with a time, in order;
 *   - floating: what's on the day with no time — fit it anywhere;
 *   - risen: what got done, and a way to add what you did but never wrote down;
 *   - when the day ends — yours to set; it's only what "fits" is measured to.
 * (The earlier tide screen is still src/screens/Tide.tsx, for the /tide link.)
 */
export default function Day() {
  const t = useTheme();
  const { wins, inbox, todayPicked, agenda, dayEndMin, setDayEnd } = useStore();
  const [offset, setOffset] = useState(0);
  const [held, setHeld] = useState<Task | null>(null);     // the actions (long press)
  const [peek, setPeek] = useState<Task | null>(null);     // the task sheet (tap)
  const [adjusting, setAdjusting] = useState(false);
  const [otherEvents, setOtherEvents] = useState<UpcomingEvent[]>([]);

  const isToday = offset === 0;
  const from = startOf(offset), to = from + DAY;
  const date = new Date(from);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });

  useEffect(() => {
    if (isToday) return;
    let dead = false;
    eventsBetween(from, to).then(e => { if (!dead) setOtherEvents(e); }).catch(() => setOtherEvents([]));
    return () => { dead = true; };
  }, [offset]);

  const events = isToday ? agenda : otherEvents;
  const all = useMemo(() => [...todayPicked.filter(x => !x.parent_id), ...inbox], [todayPicked, inbox]);
  const onDay = (x: Task) => !!x.due_at && x.due_at >= from && x.due_at < to;
  const timed = all.filter(x => onDay(x) && !!x.has_time).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
  const floating = all.filter(x => !x.has_time
    && (onDay(x) || (isToday && todayPicked.some(p => p.id === x.id) && !x.due_at)));
  const risen = wins.filter(w => w.completed_at && w.completed_at >= from && w.completed_at < to)
    .sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0));

  // your flow: the calendar, anything with a time, and what got done — in order
  const flow = useMemo(() => [
    ...events.map(e => ({ kind: 'event' as const, at: e.startsAt, id: `e${e.id}`, title: e.title })),
    ...timed.map(task => ({ kind: 'task' as const, at: task.due_at ?? 0, id: `t${task.id}`, title: task.title, task })),
    ...risen.map(w => ({ kind: 'done' as const, at: w.completed_at ?? 0, id: `d${w.id}`, title: w.title })),
  ].sort((a, b) => a.at - b.at), [events, timed, risen]);

  const dayTasks = [...timed, ...floating];
  const endLabel = DAY_ENDS.find(d => d.min === dayEndMin)?.label ?? clock(new Date().setHours(0, dayEndMin, 0, 0));
  const plural = (n: number) => `${n} done`;
  const summary = offset > 0
    ? (dayTasks.length ? `${dayTasks.length} planned.` : 'Nothing planned yet.')
    : offset < 0 ? (risen.length ? `${plural(risen.length)}.` : 'A quiet day.')
    : dayTasks.length ? `${plural(risen.length)}, ${dayTasks.length} to go.` : risen.length ? `${plural(risen.length)}. That’s the day.` : 'Nothing planned yet.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* two-tone: the day, then how it's going (v5: no bar above it) */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 24, paddingTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>{weekday}</Text>
            <Text style={{ color: t.mute ?? t.ink3, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>{summary}</Text>
          </View>
          <Pressable onPress={() => router.push('/calendar')} hitSlop={8} style={{ marginTop: 8 }}>
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.display }}>Calendar ›</Text>
          </Pressable>
        </View>

        {/* the days either side */}
        <View style={{ flexDirection: 'row', gap: 7, marginTop: 18, paddingHorizontal: 24 }}>
          {[-1, 0, 1, 2, 3].map(o => {
            const d = new Date(startOf(o)); const on = o === offset;
            return (
              <Pressable key={o} onPress={() => { Haptics.selectionAsync(); setOffset(o); }}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                style={{
                  flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1,
                  borderColor: on ? (t.key === 'nu' ? '#7772C2' : t.nu) : t.stroke,
                  backgroundColor: on ? (t.key === 'nu' ? '#403B7D' : t.nuWash) : 'transparent',
                }}>
                <Text style={{ color: on ? t.ink : t.ink3, fontSize: 10.5, fontFamily: T.display, letterSpacing: 0.8 }}>
                  {d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                </Text>
                <Text style={{ color: on ? t.ink : t.ink2, fontSize: 18, fontFamily: T.brand, letterSpacing: -0.5, marginTop: 1 }}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* the day's path: Nu at the water where it starts, Ra where the day is */}
        {isToday && (
          <DayPath nu done={risen.map(w => w.completed_at ?? 0)} events={events.map(e => e.startsAt)} height={124}
            style={{ marginHorizontal: 24, marginTop: 30 }} />
        )}

        {/* your flow */}
        <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.7, fontFamily: T.display, marginHorizontal: 24, marginTop: 24, marginBottom: 4 }}>
          YOUR FLOW
        </Text>
        <View style={{ marginHorizontal: 24, borderTopWidth: 1, borderTopColor: t.stroke }}>
          {flow.map(it => {
            const struck = it.kind === 'done';
            return (
              <Pressable key={it.id} disabled={it.kind !== 'task'}
                onPress={() => it.kind === 'task' && setPeek(it.task)}
                onLongPress={() => it.kind === 'task' && setHeld(it.task)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 48, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
                <Text style={{ width: 44, color: t.ink3, fontSize: 13, fontFamily: T.brand }}>{clock(it.at).replace(/\s?[AP]M$/i, '')}</Text>
                <Text numberOfLines={1} style={{
                  flex: 1, color: struck ? t.ink3 : t.ink, fontSize: 15.5, fontFamily: T.brand, letterSpacing: -0.3,
                  textDecorationLine: struck ? 'line-through' : 'none',
                }}>{it.title}</Text>
                <View style={{
                  width: 10, height: 10, borderRadius: 5,
                  backgroundColor: it.kind === 'event' ? t.nu : it.kind === 'done' ? '#FF6B35' : 'transparent',
                  borderWidth: it.kind === 'task' ? 2 : 0, borderColor: '#FF6B35',
                }} />
              </Pressable>
            );
          })}
          {floating.map(x => (
            <Pressable key={`f${x.id}`} onPress={() => setPeek(x)} onLongPress={() => setHeld(x)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 48, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
              <Text style={{ width: 44, color: t.ink3, fontSize: 13, fontFamily: T.brand }}>any</Text>
              <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 15.5, fontFamily: T.brand, letterSpacing: -0.3 }}>{x.title}</Text>
              <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#FF6B35' }} />
            </Pressable>
          ))}
          {!flow.length && !floating.length && (
            <Text style={{ color: t.ink3, fontSize: 14.5, paddingVertical: 14 }}>Nothing on this day.</Text>
          )}
        </View>

        {/* what Nu and Ra noticed — the learning, with Yes / Not now */}
        {isToday && <View style={{ marginTop: 18, marginHorizontal: 18 }}><Suggestions /></View>}

        {offset <= 0 && (
          <Pressable onPress={() => router.push('/retro')} hitSlop={6} style={{ paddingTop: 16, marginHorizontal: 24, alignSelf: 'flex-start' }}>
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.display }}>Add something you did ›</Text>
          </Pressable>
        )}

        {/* when the day ends — yours; By the sun turns the rooms navy then */}
        <View style={{
          marginTop: 22, marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: 16, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, padding: 14,
        }}>
          <Text style={{ color: t.ink, fontSize: 14.5, fontFamily: T.brand }}>Your Day ends at {endLabel}</Text>
          <Pressable onPress={() => setAdjusting(true)} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.display }}>Adjust</Text>
          </Pressable>
        </View>
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <DayEndSheet visible={adjusting} current={dayEndMin} onClose={() => setAdjusting(false)}
        onKeep={m => { setDayEnd(m); setAdjusting(false); }} />
    </SafeAreaView>
  );
}

/** When should today end? — a few times as chips, and one button to keep the choice. */
function DayEndSheet({ visible, current, onClose, onKeep }: { visible: boolean; current: number; onClose: () => void; onKeep: (min: number) => void }) {
  const t = useTheme();
  const [pick, setPick] = useState(current);
  useEffect(() => { if (visible) setPick(current); }, [visible]);
  const label = DAY_ENDS.find(d => d.min === pick)?.label ?? '';
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display, letterSpacing: -0.4 }}>When should today end?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
        {DAY_ENDS.map(d => {
          const on = d.min === pick;
          return (
            <Pressable key={d.min} onPress={() => { Haptics.selectionAsync(); setPick(d.min); }} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexGrow: 1, minWidth: '30%', minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: on ? t.pickEdge ?? t.nu : t.strokeStrong, backgroundColor: on ? t.pick ?? t.nuWash : t.layer }}>
              <Text style={{ color: on ? t.ink : t.ink2, fontSize: 13.5, fontFamily: T.brand }}>{d.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Primary label={`Keep ${label}`} tone="ra" onPress={() => onKeep(pick)} style={{ marginTop: 14 }} />
    </Sheet>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.display }}>{value}</Text>
      <Text style={{ color: t.ink3, fontSize: 10, letterSpacing: 1, fontFamily: T.brand, marginTop: 1 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

function MiniButton({ label, onPress, warm }: { label: string; onPress: () => void; warm?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, borderWidth: 1,
      borderColor: warm ? 'rgba(255,139,88,0.40)' : t.strokeStrong,
      backgroundColor: pressed ? t.subtle : warm ? 'rgba(255,107,53,0.08)' : t.layer,
    })}>
      <Text style={{ color: warm ? (t.key === 'nu' ? t.raSoft : t.raDeep) : t.ink2, fontSize: 12, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );
}
