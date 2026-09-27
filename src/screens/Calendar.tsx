import { useCallback, useId, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, RadialGradient, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';
import { useTheme, useStore } from '../store';
import { tasksBetween, type Task } from '../db';
import { eventsBetween, type UpcomingEvent } from '../calendar';
import { type as T } from '../theme';
import { Mica, IconChevron } from '../ui';
import { Suggestions } from '../components/Suggestions';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** A day's sun, small, as the opening draws it: a disc from pale gold into
 *  sunrise orange, in a soft glow, with the date on it. The more got done,
 *  the bigger the disc and the warmer the glow; five fills the day. */
function MiniSun({ n, cell = 48 }: { n: number; cell?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const level = Math.min(1, n / 5);
  const G = 64, c = G / 2;                      // the glow spills a little past the day
  const disc = 13 + level * 3;                  // wide enough to sit the date on
  return (
    // centred on the whole day, not inside its ring (a border would push it off)
    <Svg width={G} height={G} style={{ position: 'absolute', left: '50%', marginLeft: -c, top: cell / 2 - c }}>
      <Defs>
        <RadialGradient id={`g${id}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE2B8" stopOpacity={0.6} />
          <Stop offset="0.45" stopColor="#FFB067" stopOpacity={0.2 + level * 0.15} />
          <Stop offset="0.75" stopColor="#FF8A5C" stopOpacity={0.06 + level * 0.08} />
          <Stop offset="1" stopColor="#FF6B35" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id={`d${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF0D6" />
          <Stop offset="0.45" stopColor="#FFB067" />
          <Stop offset="1" stopColor="#FF7A3D" />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill={`url(#g${id})`} />
      <Circle cx={c} cy={c} r={disc} fill={`url(#d${id})`} />
    </Svg>
  );
}

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const sameDay = (a: Date, b: Date) => iso(a) === iso(b);

function gridFor(year: number, month: number) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/**
 * CALENDAR — the third room: the month, and the day you tapped. (It was Your
 * Day; Home already shows how today is going, so this room is the overview.)
 *
 * Nura's whole argument is that you plan against the hours you actually have,
 * and until now the only place that was visible was a couple of rows on Home.
 * This is the view that makes the argument: your commitments and your dated
 * work in the same grid, so an over-full week is something you can see rather
 * than something you discover on Thursday.
 *
 * Read-only for events, as everywhere else — Nura writes to your calendar only
 * when two-way sync is explicitly on, and only ever events it created itself.
 */
export default function Calendar() {
  const t = useTheme();
  const refresh = useStore(s => s.refresh);
  const grid = useStore(s => s.grid);
  const doneOn = useMemo(() => new Map(grid.map(g => [g.day, g.n])), [grid]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);

  const load = useCallback(async () => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
    setTasks(await tasksBetween(from, to));
    setEvents(await eventsBetween(from, to));
  }, [cursor]);
  useFocusEffect(useCallback(() => { load(); refresh(); }, [load]));

  /** day -> what's on it, so the grid can show density at a glance */
  const byDay = useMemo(() => {
    const m = new Map<string, { tasks: number; events: number }>();
    const bump = (ms: number, k: 'tasks' | 'events') => {
      const key = iso(new Date(ms));
      const cur = m.get(key) ?? { tasks: 0, events: 0 };
      cur[k]++; m.set(key, cur);
    };
    tasks.forEach(x => x.due_at && bump(x.due_at, 'tasks'));
    events.forEach(e => bump(e.startsAt, 'events'));
    return m;
  }, [tasks, events]);

  const dayTasks = tasks.filter(x => x.due_at && sameDay(new Date(x.due_at), picked));
  const dayEvents = events.filter(e => sameDay(new Date(e.startsAt), picked));
  const cells = useMemo(() => gridFor(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const today = new Date();

  const step = (n: number) => {
    Haptics.selectionAsync();
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  };

  const wins = useStore(s => s.wins);
  const flow = useMemo(() => {
    const doneThatDay = wins.filter(w => w.completed_at && sameDay(new Date(w.completed_at), picked) && !dayTasks.some(x => x.id === w.id));
    return [
      ...dayEvents.map(e => ({ kind: 'event' as const, id: `e${e.id}`, at: e.startsAt, title: e.title, timed: true, done: false, task: null as Task | null })),
      ...dayTasks.map(x => ({ kind: 'task' as const, id: `t${x.id}`, at: x.state === 'done' && x.completed_at ? x.completed_at : x.due_at!, title: x.title, timed: !!x.has_time || x.state === 'done', done: x.state === 'done', task: x as Task | null })),
      ...doneThatDay.map(w => ({ kind: 'task' as const, id: `d${w.id}`, at: w.completed_at!, title: w.title, timed: true, done: true, task: w as Task | null })),
    ].sort((a, b) => (a.timed === b.timed ? a.at - b.at : a.timed ? -1 : 1));
  }, [dayEvents, dayTasks, wins, picked]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>

        {/* two-tone: the month, then the year — and the arrows */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>{MONTHS[cursor.getMonth()]}</Text>
            <Text style={{ color: t.mute ?? t.ink3, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>{cursor.getFullYear()}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            {(!sameDay(picked, today) || cursor.getMonth() !== today.getMonth() || cursor.getFullYear() !== today.getFullYear()) && (
              <Pressable onPress={() => { Haptics.selectionAsync(); setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setPicked(new Date()); }}
                hitSlop={6} accessibilityRole="button"
                style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.layer }}>
                <Text style={{ color: t.ink, fontSize: 14, fontFamily: T.brand }}>Today</Text>
              </Pressable>
            )}
            {[-1, 1].map(n => (
              <Pressable key={n} onPress={() => step(n)} hitSlop={8} accessibilityRole="button" accessibilityLabel={n < 0 ? 'Previous month' : 'Next month'}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.layer, transform: [{ rotate: n < 0 ? '180deg' : '0deg' }] }}>
                <IconChevron size={18} color={t.ink2} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 22, marginBottom: 6 }}>
          {DOW.map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', color: t.ink3, fontSize: 12, fontFamily: T.brand }}>{d}</Text>
          ))}
        </View>

        {/* a month of suns: each day's sun as big as what got done; a quiet day is just its number */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
          {cells.map((d, i) => {
            if (d === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 48 }} />;
            const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
            const n = doneOn.get(iso(date)) ?? 0;
            const on = byDay.get(iso(date));
            const hasItems = !!on && (on.events + on.tasks) > 0;
            const isSel = sameDay(date, picked);
            const isToday = sameDay(date, today);
            const past = !isToday && date.getTime() < today.getTime();
            // today's sun is always up, small until something's done; a past day has one if you did something
            const lit = isToday || (n > 0 && date.getTime() <= today.getTime());
            return (
              <Pressable key={i} onPress={() => { Haptics.selectionAsync(); setPicked(date); }}
                accessibilityRole="button" accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${n ? `, ${n} done` : ''}`}
                style={{ width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                {lit && <MiniSun n={n} />}
                <View style={{
                  width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  // only the picked day and today are ringed; an empty day is just its number
                  borderWidth: isSel ? 2 : isToday && !lit ? 1.5 : 0, borderColor: isSel ? t.nu : t.ink3,
                }}>
                  <Text style={{ color: lit ? '#3B1204' : isSel || isToday ? t.ink : past ? t.ink3 : t.ink2, fontSize: 13, fontFamily: lit || isToday ? T.display : T.brand, letterSpacing: -0.3 }}>{d}</Text>
                </View>
                {hasItems && <View style={{ position: 'absolute', bottom: 0, width: 5, height: 5, borderRadius: 3, backgroundColor: t.ink2 }} />}
              </Pressable>
            );
          })}
        </View>

        {/* the picked day, two-tone, then its flow */}
        <Text style={{ color: t.ink, fontSize: 22, fontFamily: T.display, letterSpacing: -0.8, marginHorizontal: 8, marginTop: 24, marginBottom: 8 }}>
          {picked.toLocaleDateString(undefined, { weekday: 'long' })} {picked.getDate()}
          <Text style={{ color: t.mute ?? t.ink3 }}>{doneOn.get(iso(picked)) ? ` · ${doneOn.get(iso(picked))} done` : ''}</Text>
        </Text>
        <View style={{ marginHorizontal: 8, borderTopWidth: 1, borderTopColor: t.stroke }}>
          {flow.map(it => (
            <Pressable key={it.id} disabled={!it.task} onPress={() => it.task && router.push({ pathname: '/task/[id]', params: { id: it.task.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 48, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
              <Text style={{ width: 44, color: t.ink3, fontSize: 13, fontFamily: T.brand }}>
                {it.timed ? new Date(it.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '') : 'any'}
              </Text>
              <Text numberOfLines={1} style={{
                flex: 1, color: it.done ? t.ink3 : t.ink, fontSize: 15.5, fontFamily: T.brand, letterSpacing: -0.3,
                textDecorationLine: it.done ? 'line-through' : 'none',
              }}>{it.title}</Text>
              <View style={{
                width: 12, height: 12, borderRadius: 6,
                backgroundColor: it.kind === 'event' ? t.nu : it.done ? '#FF6B35' : 'transparent',
                borderWidth: it.kind === 'task' && !it.done ? 2.5 : 0, borderColor: '#FF6B35',
              }} />
            </Pressable>
          ))}
          {!flow.length && <Text style={{ color: t.ink3, fontSize: 14.5, paddingVertical: 14 }}>Nothing on this day.</Text>}
        </View>

        {/* what Nu and Ra noticed about today, with Yes / Not now */}
        {sameDay(picked, today) && <View style={{ marginTop: 18, marginHorizontal: 2 }}><Suggestions /></View>}

        {picked.getTime() <= today.getTime() || sameDay(picked, today) ? (
          <Pressable onPress={() => router.push('/retro')} hitSlop={6} style={{ paddingTop: 16, marginHorizontal: 8, alignSelf: 'flex-start' }}>
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.display }}>Add something you did ›</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => useStore.setState({ telling: true })} hitSlop={6} style={{ paddingTop: 16, marginHorizontal: 8, alignSelf: 'flex-start' }}>
            <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.display }}>Add something for this day ›</Text>
          </Pressable>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
