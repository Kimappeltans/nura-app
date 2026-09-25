import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import type { Task } from '../db';
import { eventsBetween, type UpcomingEvent } from '../calendar';
import { capacityFor } from '../capacity';
import { whyLine } from '../priority';
import { type as T } from '../theme';
import { Mica, poseImage } from '../ui';
import { RoomBar } from '../components/RoomBar';
import { SectionHead, ListCard } from '../components/ListCard';
import { TaskLine, taskMeta } from '../components/TaskLine';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { Sheet } from '../components/Sheet';
import { NuGlow, NU_SIZE } from '../components/NuGlow';

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
  const { wins, inbox, todayPicked, agenda, now, nowRule, energy, nextEvent, focusOn, dayEndMin, setDayEnd } = useStore();
  const [offset, setOffset] = useState(0);
  const [held, setHeld] = useState<Task | null>(null);     // the actions (long press)
  const [peek, setPeek] = useState<Task | null>(null);     // the task sheet (tap)
  const [showRisen, setShowRisen] = useState(true);
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
  const floating = all.filter(x => !x.has_time && x.id !== (isToday ? now?.id : undefined)
    && (onDay(x) || (isToday && todayPicked.some(p => p.id === x.id) && !x.due_at)));
  const risen = wins.filter(w => w.completed_at && w.completed_at >= from && w.completed_at < to)
    .sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0));

  const flow = useMemo(() => [
    ...events.map(e => ({ kind: 'event' as const, at: e.startsAt, e })),
    ...timed.map(task => ({ kind: 'task' as const, at: task.due_at ?? 0, task })),
  ].sort((a, b) => a.at - b.at), [events, timed]);

  const dayTasks = [...timed, ...floating];
  const cap = capacityFor(isToday ? events.filter(e => e.endsAt > Date.now()) : events, dayTasks,
    isToday ? Date.now() : from + 8 * 3600_000, dayEndMin);
  const planned = cap.bookedMin + cap.taskMin;
  const endLabel = DAY_ENDS.find(d => d.min === dayEndMin)?.label ?? clock(new Date().setHours(0, dayEndMin, 0, 0));
  const nowTask = isToday && now ? now : null;
  // past the edge of the day you set: nothing "doesn't fit" — anything now is extra
  const ended = isToday && Date.now() >= new Date().setHours(0, dayEndMin, 0, 0);
  const clearUntil = nextEvent ? `clear until ${clock(nextEvent.startsAt)}` : ended ? 'extra time' : `clear until ${endLabel}`;

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });
  const warm = t.key === 'nu' ? t.raSoft : t.raDeep;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <RoomBar title="Your day" who="ra" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingTop: 2, paddingBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 26, lineHeight: 31, fontFamily: T.display, letterSpacing: -0.9 }}>{weekday}</Text>
          </View>
          <Pressable onPress={() => router.push('/calendar')} hitSlop={8}>
            <Text style={{ color: t.nu, fontSize: 13.5, fontFamily: T.brand }}>Calendar ›</Text>
          </Pressable>
        </View>

        {/* the days either side */}
        <View style={{ flexDirection: 'row', gap: 7, marginBottom: 16 }}>
          {[-1, 0, 1, 2, 3].map(o => {
            const d = new Date(startOf(o)); const on = o === offset;
            return (
              <Pressable key={o} onPress={() => { Haptics.selectionAsync(); setOffset(o); }}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1,
                  borderColor: on ? t.nu : t.stroke, backgroundColor: on ? t.nuWash : t.layer,
                }}>
                <Text style={{ color: on ? t.ink : t.ink3, fontSize: 11, fontFamily: T.brand, letterSpacing: 0.6 }}>
                  {d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                </Text>
                <Text style={{ color: on ? t.ink : t.ink2, fontSize: 17, fontFamily: T.display, marginTop: 1 }}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* the day at a glance */}
        <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: t.stroke, marginBottom: 14 }}>
          <LinearGradient colors={t.key === 'nu' ? ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.035)'] : [t.card, t.layer]}
            start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
          <View style={{ position: 'absolute', right: 0, bottom: -6, opacity: 0.95 }}>
            <NuGlow size={NU_SIZE}><Image source={poseImage('nu-listen')} style={{ width: NU_SIZE, height: NU_SIZE }} resizeMode="contain" /></NuGlow>
          </View>
          <View style={{ padding: 15, paddingRight: 118 }}>
            <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 1.9, fontFamily: T.brand }}>
              {isToday ? 'TODAY AT A GLANCE' : `${weekday.toUpperCase()} AT A GLANCE`}
            </Text>
            <Text style={{ color: t.ink, fontSize: 19, lineHeight: 24, fontFamily: T.display, letterSpacing: -0.4, marginTop: 6 }}>
              {offset < 0 ? (risen.length ? 'Look what rose.' : 'A quiet day. That counts too.')
                : ended ? 'Your day is done. Anything now is extra.'
                : cap.fits ? 'Enough room for what matters.' : 'More than fits — nothing is late.'}
            </Text>
            <Text style={{ color: t.ink2, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
              {`${events.length} anchored · ${floating.length + timed.length} task${floating.length + timed.length === 1 ? '' : 's'} · the day ends at ${endLabel}.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
              <Stat value={planned ? span(planned) : '—'} label="planned" />
              <Stat value={String(floating.length)} label="flexible" />
              <Stat value={String(risen.length)} label="risen" />
            </View>
          </View>
        </View>

        {/* now: the one thing that fits before the next anchor */}
        {nowTask && (
          <View style={{ borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,139,88,0.30)' }}>
            <LinearGradient colors={t.key === 'nu' ? ['rgba(255,150,100,0.13)', 'rgba(255,255,255,0.03)'] : [t.card, t.layer]}
              start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: warm, fontSize: 10.5, letterSpacing: 1.8, fontFamily: T.brand }}>NOW · {clock(Date.now())}</Text>
                <Text style={{ color: t.ink3, fontSize: 12 }}>{clearUntil}</Text>
              </View>
              <Text style={{ color: t.ink, fontSize: 16, lineHeight: 21, fontFamily: T.display, marginTop: 8 }}>{nowTask.title}</Text>
              {!!whyLine(nowRule, nowTask, energy) && (
                <Text style={{ color: t.ink2, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
                  Why this one: {whyLine(nowRule, nowTask, energy)}.
                </Text>
              )}
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); focusOn(nowTask.id); }}
                accessibilityRole="button" style={({ pressed }) => ({ marginTop: 12, alignSelf: 'flex-start', opacity: pressed ? 0.9 : 1 })}>
                <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: t.onRa, fontSize: 14, fontFamily: T.display }}>Begin · 5 minutes</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}

        {/* your flow: the calendar, and anything with a time */}
        <SectionHead label="Your flow" />
        {flow.length ? (
          <View>
            {flow.map((it, i) => {
              const past = isToday && (it.kind === 'event' ? it.e.endsAt : it.at) < Date.now();
              const last = i === flow.length - 1;
              return (
                <View key={it.kind === 'event' ? `e${it.e.id}` : `t${it.task.id}`}
                  style={{ flexDirection: 'row', gap: 8, opacity: past ? 0.5 : 1 }}>
                  <Text style={{ width: 58, textAlign: 'right', color: t.ink3, fontSize: 12, paddingTop: 11 }}>{clock(it.at)}</Text>
                  <View style={{ width: 14, alignItems: 'center' }}>
                    {!last && <View style={{ position: 'absolute', top: 16, bottom: -2, width: 1, backgroundColor: t.strokeStrong }} />}
                    <View style={{
                      marginTop: 13, width: 9, height: 9, borderRadius: 5,
                      backgroundColor: it.kind === 'task' ? t.ra : t.ink3, borderWidth: 2, borderColor: t.base,
                    }} />
                  </View>
                  <View style={{ flex: 1, paddingBottom: 10 }}>
                    {it.kind === 'event' ? (
                      <View style={{ borderRadius: 13, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.layer, padding: 11 }}>
                        <Text numberOfLines={1} style={{ color: t.ink, fontSize: 14, fontFamily: T.brand }}>{it.e.title}</Text>
                        <Text style={{ color: t.ink3, fontSize: 12, marginTop: 2 }}>
                          {span(Math.max(1, Math.round((it.e.endsAt - it.e.startsAt) / 60000)))} · Calendar
                        </Text>
                      </View>
                    ) : (
                      <View style={{ borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,139,88,0.45)', padding: 11 }}>
                        <Text numberOfLines={1} style={{ color: t.ink, fontSize: 14, fontFamily: T.brand }}>{it.task.title}</Text>
                        <Text style={{ color: t.ink3, fontSize: 12, marginTop: 2 }}>
                          {[it.task.est_minutes ? `${it.task.est_minutes} min` : null, 'Task'].filter(Boolean).join(' · ')}
                        </Text>
                        {!past && (
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                            <MiniButton label="Start" warm onPress={() => focusOn(it.task.id)} />
                            <MiniButton label="Move" onPress={() => setPeek(it.task)} />
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: t.ink3, fontSize: 14, lineHeight: 20, paddingVertical: 6 }}>
            Nothing anchored. The whole day is open.
          </Text>
        )}

        {/* floating: on the day, no time */}
        {floating.length > 0 && (
          <>
            <SectionHead label={`Floating · ${floating.length}`} />
            <ListCard>
              {floating.map((task, i) => (
                <TaskLine key={task.id} title={task.title} divider={i < floating.length - 1}
                  meta={[...taskMeta(task, { due: false }), 'flexible']}
                  onPress={() => setPeek(task)} onHold={() => setHeld(task)}
                  onStart={isToday ? () => focusOn(task.id) : undefined}
                  onMore={isToday ? undefined : () => setPeek(task)} />
              ))}
            </ListCard>
          </>
        )}

        {/* risen */}
        {offset <= 0 && (
          <>
            <SectionHead label={`Risen${isToday ? ' today' : ''} · ${risen.length}`}
              action={risen.length ? (showRisen ? 'Hide' : 'Show') : undefined}
              onAction={risen.length ? () => setShowRisen(s => !s) : undefined} />
            {risen.length > 0 && showRisen && (
              <ListCard>
                {risen.map((w, i) => (
                  <TaskLine key={w.id} title={w.title} done divider={i < risen.length - 1}
                    meta={[w.completed_at ? clock(w.completed_at) : null]} />
                ))}
              </ListCard>
            )}
            <Pressable onPress={() => router.push('/retro')} hitSlop={6} style={{ paddingTop: 12, alignSelf: 'flex-start' }}>
              <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>
                Add something you did ›
              </Text>
            </Pressable>
          </>
        )}

        {/* when the day ends — yours */}
        <View style={{
          marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderRadius: 15, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.layer, padding: 13,
        }}>
          <Text style={{ color: t.ink, fontSize: 14, fontFamily: T.brand }}>Your day ends at {endLabel}</Text>
          <Pressable onPress={() => setAdjusting(true)} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>Adjust</Text>
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
      <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 2, fontFamily: T.brand }}>YOUR DAY</Text>
      <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display, letterSpacing: -0.4, marginTop: 5 }}>When should today end?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
        {DAY_ENDS.map(d => {
          const on = d.min === pick;
          return (
            <Pressable key={d.min} onPress={() => { Haptics.selectionAsync(); setPick(d.min); }} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexGrow: 1, minWidth: '30%', minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: on ? t.nu : t.strokeStrong, backgroundColor: on ? t.nuWash : t.layer }}>
              <Text style={{ color: on ? t.ink : t.ink2, fontSize: 13.5, fontFamily: T.brand }}>{d.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => onKeep(pick)} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 14, opacity: pressed ? 0.9 : 1 })}>
        <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.onRa, fontSize: 15.5, fontFamily: T.display }}>Keep {label}</Text>
        </LinearGradient>
      </Pressable>
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
