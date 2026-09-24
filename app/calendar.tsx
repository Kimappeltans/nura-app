import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore } from '../src/store';
import { tasksBetween, type Task } from '../src/db';
import { eventsBetween, type UpcomingEvent } from '../src/calendar';
import { radius, type as T } from '../src/theme';
import { Mica, Surface, Enter, IconChevron, IconClock } from '../src/ui';
import { LabelTile } from '../src/components/LabelIcon';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const sameDay = (a: Date, b: Date) => iso(a) === iso(b);

const DAY_START_H = 7, DAY_END_H = 22, HOUR_ROW = 56;
const fmtHour = (h: number) => h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`;
const fmtDur = (ms: number) => {
  const mins = Math.round(ms / 60000);
  return mins < 60 ? `${mins}m` : `${Math.round(mins / 30) / 2}h`;
};

interface TimedItem {
  kind: 'event' | 'task';
  id: string;
  title: string;
  start: number;
  end: number;
  task?: Task;
}

/**
 * The day, as a line down the middle of it rather than a list beside it.
 * Additive to the month grid above, not a replacement — the month view
 * answers "which day", this answers "when, exactly, on this one" and where
 * the actual open stretches are. Only items with a real time show up here;
 * an all-day task has no honest position on an hourly grid.
 */
function TimelineDay({ picked, dayEvents, dayTasks }: {
  picked: Date; dayEvents: UpcomingEvent[]; dayTasks: Task[];
}) {
  const t = useTheme();
  const hours = useMemo(
    () => Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => DAY_START_H + i),
    [],
  );
  const dayStart = new Date(picked).setHours(DAY_START_H, 0, 0, 0);
  const dayEnd = new Date(picked).setHours(DAY_END_H, 0, 0, 0);
  const totalHeight = (DAY_END_H - DAY_START_H) * HOUR_ROW;
  const timeToY = (ms: number) =>
    Math.max(0, Math.min(totalHeight, ((ms - dayStart) / 3600_000) * HOUR_ROW));

  const items: TimedItem[] = useMemo(() => [
    ...dayEvents.map(e => ({ kind: 'event' as const, id: e.id, title: e.title, start: e.startsAt, end: Math.max(e.endsAt, e.startsAt + 20 * 60000) })),
    ...dayTasks.filter(x => x.has_time && x.due_at).map(x => ({
      kind: 'task' as const, id: x.id, title: x.title, start: x.due_at!,
      end: x.due_at! + (x.est_minutes ?? 20) * 60000, task: x,
    })),
  ].sort((a, b) => a.start - b.start), [dayEvents, dayTasks]);

  // Clear water: the open stretches once the busy blocks are merged. A day
  // with nothing on it is one giant gap — worth naming, not just implying.
  const gaps = useMemo(() => {
    const merged: [number, number][] = [];
    for (const it of items) {
      const s = Math.max(it.start, dayStart), e = Math.min(it.end, dayEnd);
      if (e <= s) continue;
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    const out: [number, number][] = [];
    let cursor = dayStart;
    for (const [s, e] of merged) {
      if (s - cursor >= 20 * 60000) out.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (dayEnd - cursor >= 20 * 60000) out.push([cursor, dayEnd]);
    return out;
  }, [items, dayStart, dayEnd]);

  const now = Date.now();
  const showNow = sameDay(picked, new Date()) && now >= dayStart && now <= dayEnd;

  return (
    <Surface>
      <View style={{ padding: 14, flexDirection: 'row' }}>
        <View style={{ width: 38 }}>
          {hours.map(h => (
            <View key={h} style={{ height: HOUR_ROW }}>
              <Text style={{ color: t.ink3, fontSize: 11 }}>{fmtHour(h)}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, height: totalHeight, position: 'relative' }}>
          {hours.map((h, i) => (
            <View key={h} style={{
              position: 'absolute', left: 0, right: 0, top: i * HOUR_ROW,
              height: 1, backgroundColor: t.stroke,
            }} />
          ))}

          {gaps.map(([s, e], i) => {
            const top = timeToY(s), h = Math.max(18, timeToY(e) - timeToY(s));
            return (
              <View key={i} style={{
                position: 'absolute', left: 2, right: 2, top, height: h,
                borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: t.strokeStrong,
                padding: 4, justifyContent: 'flex-end',
              }}>
                {h > 26 && (
                  <Text style={{ color: t.ink3, fontSize: 10.5 }}>clear · {fmtDur(e - s)}</Text>
                )}
              </View>
            );
          })}

          {items.map(it => {
            const top = timeToY(it.start), h = Math.max(20, timeToY(it.end) - timeToY(it.start));
            const isEvent = it.kind === 'event';
            const done = it.task?.state === 'done';
            return (
              <Pressable key={`${it.kind}-${it.id}`}
                disabled={isEvent}
                onPress={() => it.task && router.push({ pathname: '/task/[id]', params: { id: it.task.id } })}
                style={{
                  position: 'absolute', left: 2, right: 2, top, height: h,
                  borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden',
                  backgroundColor: done ? t.subtle : isEvent ? t.nuWash : t.raWash,
                  borderLeftWidth: 3, borderLeftColor: isEvent ? t.nu : t.ra,
                }}>
                <Text numberOfLines={1} style={{
                  color: done ? t.ink3 : t.ink, fontSize: 12.5, fontFamily: T.brand,
                  textDecorationLine: done ? 'line-through' : 'none',
                }}>{it.title}</Text>
              </Pressable>
            );
          })}

          {showNow && (
            <View style={{ position: 'absolute', left: -4, right: 0, top: timeToY(now) - 1, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.ra }} />
              <View style={{ flex: 1, height: 1.5, backgroundColor: t.ra }} />
            </View>
          )}
        </View>
      </View>
    </Surface>
  );
}

function gridFor(year: number, month: number) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/**
 * The month, and the day you tapped.
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
export default function CalendarScreen() {
  const t = useTheme();
  const refresh = useStore(s => s.refresh);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [dayView, setDayView] = useState<'list' | 'timeline'>('list');

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

  const agenda = [
    ...dayEvents.map(e => ({ kind: 'event' as const, at: e.startsAt, event: e })),
    ...dayTasks.map(x => ({ kind: 'task' as const, at: x.due_at!, task: x })),
  ].sort((a, b) => a.at - b.at);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ flex: 1, paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>← Today</Text>
        </Pressable>
        <Pressable onPress={() => { Haptics.selectionAsync(); const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setPicked(d); }}
          hitSlop={10}>
          <Text style={{ color: t.ra, fontSize: 14, fontFamily: T.brand }}>Today</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>

        <Surface style={{ marginTop: 4 }}>
          <View style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Pressable onPress={() => step(-1)} hitSlop={14} style={{ transform: [{ rotate: '180deg' }] }}>
                <IconChevron size={20} color={t.ink2} />
              </Pressable>
              <Text style={{ flex: 1, textAlign: 'center', color: t.ink, fontSize: 17, fontFamily: T.display }}>
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <Pressable onPress={() => step(1)} hitSlop={14}>
                <IconChevron size={20} color={t.ink2} />
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              {DOW.map((d, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', color: t.ink3, fontSize: 12, fontFamily: T.brand }}>{d}</Text>
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((d, i) => {
                if (d === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 46 }} />;
                const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
                const load = byDay.get(iso(date));
                const isSel = sameDay(date, picked);
                const isToday = sameDay(date, today);
                return (
                  <Pressable key={i} onPress={() => { Haptics.selectionAsync(); setPicked(date); }}
                    style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{
                      width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isSel ? t.ra : 'transparent',
                      borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: t.ra,
                    }}>
                      <Text style={{
                        color: isSel ? t.onRa : t.ink, fontSize: 14.5,
                        fontFamily: isSel || isToday ? T.brand : undefined,
                      }}>{d}</Text>
                    </View>
                    {/* density, not counts — coral for your work, indigo for
                        other people's claims on your time */}
                    <View style={{ flexDirection: 'row', gap: 2.5, position: 'absolute', bottom: 4 }}>
                      {!!load?.tasks && !isSel && (
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.ra }} />
                      )}
                      {!!load?.events && !isSel && (
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.nu }} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Surface>

        <View style={{
          flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 8,
        }}>
          <Text style={{
            flex: 1, color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand, marginLeft: 4,
          }}>
            {picked.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
          </Text>

          {/* List vs. timeline — the list is the honest default (it's
              everything, timed or not); the timeline only earns its keep
              once there's at least one thing with a real time on it. */}
          {agenda.some(it => it.kind === 'event' || it.task.has_time) && (
            <View style={{ flexDirection: 'row', gap: 3, padding: 3, borderRadius: radius.pill, backgroundColor: t.layer, borderWidth: 1, borderColor: t.stroke }}>
              {(['list', 'timeline'] as const).map(v => (
                <Pressable key={v} onPress={() => { Haptics.selectionAsync(); setDayView(v); }}
                  style={{
                    paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill,
                    backgroundColor: dayView === v ? t.ra : 'transparent',
                  }}>
                  <Text style={{
                    color: dayView === v ? t.onRa : t.ink2, fontSize: 12,
                    fontFamily: dayView === v ? T.brand : undefined,
                  }}>{v === 'list' ? 'List' : 'Timeline'}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {!agenda.length ? (
          <Surface>
            <Text style={{ color: t.ink3, fontSize: 14, padding: 18, lineHeight: 20 }}>
              Nothing on this day. That's allowed.
            </Text>
          </Surface>
        ) : dayView === 'timeline' ? (
          <TimelineDay picked={picked} dayEvents={dayEvents} dayTasks={dayTasks} />
        ) : (
          <Surface>
            {agenda.map((it, i) => (
              <Enter key={it.kind === 'event' ? `e${it.event.id}` : `t${it.task.id}`} index={i}>
                {i > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 58 }} />}
                {it.kind === 'event' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <View style={{
                      width: 30, height: 30, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: t.nuWash,
                    }}>
                      <IconClock size={16} color={t.nu} />
                    </View>
                    <Text style={{ color: t.ink2, fontSize: 16, flex: 1 }} numberOfLines={1}>{it.event.title}</Text>
                    <Text style={{ color: t.ink3, fontSize: 12.5 }}>
                      {new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => router.push({ pathname: '/task/[id]', params: { id: it.task.id } })}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                      backgroundColor: pressed ? t.subtle : 'transparent',
                    })}>
                    <LabelTile id={it.task.label} />
                    <Text style={{
                      color: it.task.state === 'done' ? t.ink3 : t.ink, fontSize: 16, flex: 1,
                      textDecorationLine: it.task.state === 'done' ? 'line-through' : 'none',
                    }} numberOfLines={2}>{it.task.title}</Text>
                    {!!it.task.has_time && (
                      <Text style={{ color: t.ink3, fontSize: 12.5 }}>
                        {new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                    <IconChevron size={15} color={t.ink3} />
                  </Pressable>
                )}
              </Enter>
            ))}
          </Surface>
        )}

        <View style={{ flexDirection: 'row', gap: 16, marginTop: 14, paddingLeft: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.ra }} />
            <Text style={{ color: t.ink3, fontSize: 12 }}>your work</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.nu }} />
            <Text style={{ color: t.ink3, fontSize: 12 }}>calendar</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
