import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore, useTheme } from '../store';
import { retroCapture, type Task } from '../db';
import type { UpcomingEvent } from '../calendar';
import { type as T } from '../theme';
import { Mica } from '../ui';
import { TaskPeek } from '../components/TaskPeek';
import { TaskSheet } from '../components/TaskSheet';
import { useTaskActions } from '../useTaskActions';
import { announce, decorative } from '../a11y';
import {
  DeskCard, DeskHeader, DeskRow, AddRow, LinkButton, Empty, useDeskTokens, useDeskState, useRoom, addTo, deleteTask,
  day0, addDays, sameDay, calendarDay, rel, WD, WDL, MO, CORAL, ON_CORAL, DAY,
} from './kit';
import { Chip } from './DeskHome';
import { useNow, useRange } from './useRange';

const MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const lead = (d: Date) => (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7;
const daysIn = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const hm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * CALENDAR, ON THE DESKTOP. The week as hours (or the month as a wall
 * calendar), your commitments and your dated tasks in the same grid, and
 * beside it the picked day: a small month to move around in, what's on the
 * day, and a line to add to it (or, for a day gone by, to log what you did).
 * In a narrower room the picked day goes under the grid, so the week keeps
 * the whole width.
 */
export default function DeskCalendar() {
  const t = useTheme();
  const k = useDeskTokens();
  const { height: winH } = useWindowDimensions();
  const { pad, inner } = useRoom();
  // the picked day under the grid, not beside it; its small month beside its list when there's room
  const under = inner < 1060;
  const pair = under && inner >= 640;
  const now = useNow();
  const { calMode: mode, calOff: off, calDay } = useDeskState();
  const set = useDeskState.setState;
  const { todayPicked, wins, dayStartMin, dayEndMin, refresh } = useStore();
  const { tick } = useTaskActions();
  const [peek, setPeek] = useState<Task | null>(null);
  const [held, setHeld] = useState<Task | null>(null);

  const t0 = day0(now);
  const sel = calDay != null ? day0(calDay) : t0;

  // what's on screen: seven days from today (a week at a time), or a month
  const week = Array.from({ length: 7 }, (_, i) => addDays(t0, off * 7 + i));
  const month = new Date(t0.getFullYear(), t0.getMonth() + off, 1);
  const title = mode === 'week'
    ? `${MO[week[0].getMonth()].slice(0, 3)} ${week[0].getDate()} to ${week[0].getMonth() !== week[6].getMonth() ? `${MO[week[6].getMonth()].slice(0, 3)} ` : ''}${week[6].getDate()}`
    : `${MO[month.getMonth()]} ${month.getFullYear()}`;

  // one load covers the grid and the small month beside it
  const selMonth = new Date(sel.getFullYear(), sel.getMonth(), 1);
  const from = Math.min(mode === 'week' ? week[0].getTime() : month.getTime(), selMonth.getTime());
  const to = Math.max(
    mode === 'week' ? addDays(week[6], 1).getTime() : new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime(),
    new Date(sel.getFullYear(), sel.getMonth() + 1, 1).getTime());
  const { tasks, events } = useRange(from, to);

  // where each task sits (kit's calendarDay): on Today means today, done means the day it was done
  const tasksOn = (d: Date) => {
    const ts = tasks.filter(x => sameDay(calendarDay(x, t0.getTime()), d));
    if (sameDay(d, t0)) ts.push(...todayPicked.filter(x => !x.parent_id && !ts.some(y => y.id === x.id)));
    return ts;
  };
  const eventsOn = (d: Date) => events.filter(e => sameDay(e.startsAt, d));
  const busy = (d: Date) => tasksOn(d).length + eventsOn(d).length > 0;

  const pickDay = (d: Date) => {
    set({ calDay: d.getTime() });
    // a day outside what's on screen brings the grid to it
    const diff = Math.round((day0(d).getTime() - t0.getTime()) / DAY);
    if (mode === 'week' && (diff < off * 7 || diff >= off * 7 + 7)) set({ calOff: Math.floor(diff / 7) });
    if (mode === 'month') set({ calOff: (d.getFullYear() - t0.getFullYear()) * 12 + d.getMonth() - t0.getMonth() });
  };
  const step = (n: number) => {
    set({ calOff: off + n });
    announce(n < 0 ? 'Earlier' : 'Later');
  };

  // the hours of your day, from when it starts to when it ends
  const startH = Math.floor(dayStartMin / 60);
  const endH = Math.min(24, Math.ceil(Math.min(dayEndMin, 24 * 60) / 60));
  const hours = Array.from({ length: Math.max(1, endH - startH) }, (_, i) => startH + i);
  const hh = Math.max(40, Math.floor((winH - 384) / hours.length));
  const nowH = now.getHours() + now.getMinutes() / 60;

  // the picked day: its events, its tasks, and what got done on it
  const selTasks = tasksOn(sel).filter(x => x.state !== 'done');
  const selEvents = eventsOn(sel);
  const selDone = useMemo(() => {
    const dated = tasks.filter(x => x.state === 'done' && sameDay(x.completed_at ?? x.due_at, sel));
    const more = wins.filter(w => sameDay(w.completed_at, sel) && !dated.some(x => x.id === w.id));
    return [...dated, ...more];
  }, [tasks, wins, sel]);
  const past = sel.getTime() <= t0.getTime();

  const card = { borderRadius: 18, borderWidth: 1, borderColor: t.stroke, overflow: 'hidden' as const, ...(k.shadow ?? {}) };

  return (
    <View style={{ flex: 1 }}>
      <Mica />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexGrow: 1, width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: pad, paddingBottom: 28 }}>
          <DeskHeader title="Calendar" day={sel.getTime()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 10 }}>
              <RoundButton label="‹" said={mode === 'week' ? 'Previous week' : 'Previous month'} onPress={() => step(-1)} />
              <RoundButton label="›" said={mode === 'week' ? 'Next week' : 'Next month'} onPress={() => step(1)} />
              <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 18, fontFamily: T.display, marginHorizontal: 8 }} numberOfLines={1}>{title}</Text>
              <LinkButton label="Today" onPress={() => set({ calOff: 0, calDay: null })} />
            </View>
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: k.wash, borderRadius: 10, padding: 3 }}>
              {(['week', 'month'] as const).map(m => (
                <Pressable key={m} onPress={() => set({ calMode: m, calOff: 0 })} accessibilityRole="tab" aria-selected={mode === m}
                  style={{ height: 36, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', backgroundColor: mode === m ? t.card : 'transparent', ...(mode === m ? k.shadow ?? {} : {}) }}>
                  <Text style={{ color: mode === m ? t.ink : t.ink2, fontSize: 15, fontFamily: T.brand }}>{m === 'week' ? 'Week' : 'Month'}</Text>
                </Pressable>
              ))}
            </View>
          </DeskHeader>

          <View style={{ minHeight: under ? undefined : winH - 208, flexDirection: under ? 'column' : 'row', gap: 20, alignItems: 'stretch' }}>
            {mode === 'week' ? (
              <View style={[card, under ? {} : { flex: 1, minWidth: 0, alignSelf: 'flex-start' }]}>
                <LinearGradient pointerEvents="none" colors={t.surface} style={{ position: 'absolute', inset: 0 }} />
                {/* the days */}
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.stroke }}>
                  <View style={{ width: 50 }} />
                  {week.map(d => {
                    const today = sameDay(d, t0), on = sameDay(d, sel);
                    return (
                      <Pressable key={d.getTime()} onPress={() => pickDay(d)} accessibilityRole="button" aria-selected={on}
                        accessibilityLabel={`${WDL[d.getDay()]} ${d.getDate()}${today ? ', today' : ''}`}
                        style={{ flex: 1, minWidth: 0, paddingTop: 12, paddingHorizontal: 10, paddingBottom: 10, borderLeftWidth: 1, borderLeftColor: t.stroke, backgroundColor: on ? k.wash : 'transparent' }}>
                        <Text numberOfLines={1} style={{ color: today ? k.raText : t.ink3, fontSize: 12, letterSpacing: 1.2, fontFamily: T.display, textTransform: 'uppercase' }}>{WD[d.getDay()]}</Text>
                        <Text numberOfLines={1} style={{ color: today ? k.raText : t.ink, fontSize: 26, letterSpacing: -0.4, fontFamily: T.display }}>{d.getDate()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* all day: tasks without a time */}
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.stroke }}>
                  <Text style={{ width: 50, color: t.ink3, fontSize: 12.5, fontFamily: T.brand, textAlign: 'right', paddingTop: 12, paddingRight: 8 }}>all-day</Text>
                  {week.map(d => (
                    <View key={d.getTime()} style={{ flex: 1, minWidth: 0, minHeight: 46, padding: 5, gap: 3, borderLeftWidth: 1, borderLeftColor: t.stroke }}>
                      {tasksOn(d).filter(x => !x.has_time || x.state === 'done').map(x => (
                        <Pressable key={x.id} onPress={() => setPeek(x)} accessibilityRole="button" accessibilityLabel={x.title}>
                          <Chip title={x.title} done={x.state === 'done'} />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
                {/* the hours */}
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ width: 50 }}>
                    {hours.map(h => (
                      <Text key={h} style={{ height: hh, color: t.ink3, fontSize: 12.5, fontFamily: T.brand, textAlign: 'right', paddingTop: 3, paddingRight: 8 }}>
                        {h % 12 || 12}{h < 12 || h === 24 ? 'am' : 'pm'}
                      </Text>
                    ))}
                  </View>
                  {week.map(d => {
                    const today = sameDay(d, t0);
                    const blocks: { id: string; title: string; start: number; end: number; task?: Task; ev?: UpcomingEvent }[] = [
                      ...eventsOn(d).map(e => ({ id: `e${e.id}`, title: e.title, start: e.startsAt, end: e.endsAt, ev: e })),
                      ...tasksOn(d).filter(x => !!x.has_time && x.due_at && x.state !== 'done').map(x => ({ id: x.id, title: x.title, start: x.due_at!, end: x.due_at! + (x.est_minutes ?? 30) * 60_000, task: x })),
                    ];
                    const y = (ms: number) => { const dd = new Date(ms); return (dd.getHours() + dd.getMinutes() / 60 - startH) * hh; };
                    return (
                      <Pressable key={d.getTime()} onPress={() => pickDay(d)} accessible={false}
                        style={{ flex: 1, minWidth: 0, height: hours.length * hh, borderLeftWidth: 1, borderLeftColor: t.stroke, overflow: 'hidden', backgroundColor: today ? (k.dark ? t.raWash : 'rgba(255,107,53,0.045)') : 'transparent' }}>
                        {hours.map((h, i) => <View key={h} style={{ height: hh, borderTopWidth: i ? 1 : 0, borderTopColor: t.stroke }} />)}
                        {blocks.map(b => {
                          const top = Math.max(0, y(b.start)), height = Math.max(24, y(b.end) - top - 2);
                          return (
                            <Pressable key={b.id} onPress={() => b.task && setPeek(b.task)} disabled={!b.task}
                              accessibilityRole={b.task ? 'button' : 'text'} accessibilityLabel={`${b.title}, ${hm(b.start)}${b.ev ? ', event' : ''}`}
                              style={{
                                position: 'absolute', top, left: 3, right: 3, height, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden',
                                backgroundColor: b.ev ? k.pick : t.raWash, borderLeftWidth: 3, borderLeftColor: b.ev ? t.ink2 : CORAL,
                              }}>
                              <Text numberOfLines={height > 40 ? 2 : 1} style={{ color: b.ev ? t.ink : k.raText, fontSize: 13, fontFamily: T.brand }}>{b.title}</Text>
                              {height > 44 && <Text style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand }}>{hm(b.start)}</Text>}
                            </Pressable>
                          );
                        })}
                        {today && nowH >= startH && nowH <= endH && (
                          <View {...decorative} style={{ position: 'absolute', left: 0, right: 0, top: (nowH - startH) * hh, height: 2, backgroundColor: t.ra, shadowColor: t.ra, shadowOpacity: 0.8, shadowRadius: 8 }}>
                            <View style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: t.ra }} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={[card, under ? {} : { flex: 1, minWidth: 0, alignSelf: 'flex-start' }]}>
                <LinearGradient pointerEvents="none" colors={t.surface} style={{ position: 'absolute', inset: 0 }} />
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.stroke }}>
                  {MON_FIRST.map(x => <Text key={x} style={{ flex: 1, padding: 10, color: t.ink3, fontSize: 12, letterSpacing: 1.2, fontFamily: T.display, textTransform: 'uppercase' }}>{x}</Text>)}
                </View>
                {(() => {
                  const cells: (Date | null)[] = [...Array(lead(month)).fill(null), ...Array.from({ length: daysIn(month) }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
                  while (cells.length % 7) cells.push(null);
                  const rows = cells.length / 7;
                  const h = Math.max(88, Math.floor((winH - 244 - 120) / rows));
                  return (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {cells.map((d, i) => (
                        <MonthCell key={i} d={d} h={h} today={!!d && sameDay(d, t0)} on={!!d && sameDay(d, sel)}
                          items={d ? [...eventsOn(d).map(e => ({ id: `e${e.id}`, title: e.title, event: true })), ...tasksOn(d).map(x => ({ id: x.id, title: x.title, event: false, done: x.state === 'done' }))] : []}
                          onPress={() => d && pickDay(d)} />
                      ))}
                    </View>
                  );
                })()}
              </View>
            )}

            {/* the picked day */}
            <DeskCard style={{ ...(under ? {} : { width: 320 }), paddingVertical: 18, paddingHorizontal: 20, ...(pair ? { flexDirection: 'row', gap: 32 } : {}) }}>
              <View style={pair ? { width: 300 } : undefined}>
                <MiniMonth sel={sel} today={t0} busy={busy} onPick={pickDay} bare={pair} />
              </View>
              <View style={pair ? { flex: 1, minWidth: 0 } : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 26, letterSpacing: -0.5, fontFamily: T.display }}>{WDL[sel.getDay()]} {sel.getDate()}</Text>
                <Text style={{ color: t.ink3, fontSize: 14.5, fontFamily: T.brand }}>{rel(sel.getTime())}</Text>
              </View>
              {selEvents.map(e => (
                <View key={e.id} accessible accessibilityLabel={`${e.title}, ${hm(e.startsAt)}, event`}
                  style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View {...decorative} style={{ width: 23, alignItems: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.ink2 }} /></View>
                  <Text numberOfLines={2} style={{ flex: 1, color: t.ink, fontSize: 16.5, fontFamily: T.brand }}>{e.title}</Text>
                  <Text style={{ color: t.ink3, fontSize: 13.5, fontFamily: T.brand }}>{hm(e.startsAt)}</Text>
                </View>
              ))}
              {[...selTasks, ...selDone].map(x => (
                <DeskRow key={x.id} task={x} hideDue onOpen={() => setPeek(x)} onHold={() => setHeld(x)} onDone={() => x.state !== 'done' && tick(x.id)}
                  onDelete={x.state !== 'done' ? () => deleteTask(x) : undefined} />
              ))}
              {!selEvents.length && !selTasks.length && !selDone.length && <Empty>Nothing on this day.</Empty>}
              <AddRow placeholder={past ? 'Log something you did…' : 'Add a task for this day…'}
                onAdd={async v => {
                  if (!past) return addTo(v, { day: sel.getTime() });
                  // a day gone by: noon of it; today: now
                  await retroCapture([v], sameDay(sel, t0) ? Date.now() : new Date(sel).setHours(12, 0, 0, 0));
                  await refresh();
                }} />
              </View>
            </DeskCard>
          </View>
        </View>
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
    </View>
  );
}

function RoundButton({ label, said, onPress }: { label: string; said: string; onPress: () => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel={said}
      style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: hover ? k.pick : k.wash }}>
      <Text style={{ color: t.ink2, fontSize: 20, lineHeight: 22 }}>{label}</Text>
    </Pressable>
  );
}

function MonthCell({ d, h, today, on, items, onPress }: {
  d: Date | null; h: number; today: boolean; on: boolean; items: { id: string; title: string; event: boolean; done?: boolean }[]; onPress: () => void;
}) {
  const t = useTheme();
  const k = useDeskTokens();
  const [hover, setHover] = useState(false);
  const square = { width: `${100 / 7}%` as const, minHeight: h, borderRightWidth: 1, borderBottomWidth: 1, borderColor: t.stroke };
  if (!d) return <View style={square} />;
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="button" aria-selected={on}
      accessibilityLabel={`${WDL[d.getDay()]} ${d.getDate()}${today ? ', today' : ''}${items.length ? `, ${items.length} planned` : ''}`}
      style={[square, { padding: 8, gap: 4, backgroundColor: on || hover ? k.wash : 'transparent' }]}>
      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: -2, marginLeft: -2, backgroundColor: today ? t.ra : 'transparent' }}>
        <Text style={{ color: today ? ON_CORAL : t.ink2, fontSize: 15, fontFamily: today ? T.display : T.brand }}>{d.getDate()}</Text>
      </View>
      {items.slice(0, 3).map(x => <Chip key={x.id} title={x.title} event={x.event} done={x.done} />)}
      {items.length > 3 && <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>+{items.length - 3} more</Text>}
    </Pressable>
  );
}

/** The picked day's month, small: today in coral, the picked day filled, a dot where something's planned. */
function MiniMonth({ sel, today, busy, onPick, bare }: { sel: Date; today: Date; busy: (d: Date) => boolean; onPick: (d: Date) => void; bare?: boolean }) {
  const t = useTheme();
  const k = useDeskTokens();
  const base = new Date(sel.getFullYear(), sel.getMonth(), 1);
  const cells: (Date | null)[] = [...Array(lead(base)).fill(null), ...Array.from({ length: daysIn(base) }, (_, i) => new Date(base.getFullYear(), base.getMonth(), i + 1))];
  return (
    <View style={bare ? undefined : { marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: t.stroke }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flex: 1, color: t.ink, fontSize: 15, fontFamily: T.display }}>{MO[base.getMonth()]} {base.getFullYear()}</Text>
        <Pressable onPress={() => onPick(new Date(base.getFullYear(), base.getMonth() - 1, 1))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Previous month" style={{ paddingHorizontal: 6 }}>
          <Text style={{ color: t.ink3, fontSize: 18 }}>‹</Text>
        </Pressable>
        <Pressable onPress={() => onPick(new Date(base.getFullYear(), base.getMonth() + 1, 1))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Next month" style={{ paddingHorizontal: 6 }}>
          <Text style={{ color: t.ink3, fontSize: 18 }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => (
          <Text key={i} {...decorative} style={{ width: `${100 / 7}%`, textAlign: 'center', color: t.ink3, fontSize: 12, fontFamily: T.brand, paddingVertical: 4 }}>{x}</Text>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 36 }} />;
          const isT = sameDay(d, today), on = sameDay(d, sel), has = busy(d);
          return (
            <Pressable key={i} onPress={() => onPick(d)} accessibilityRole="button" aria-selected={on}
              accessibilityLabel={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${isT ? ', today' : ''}${has ? ', has plans' : ''}`}
              style={{ width: `${100 / 7}%`, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.subtle : 'transparent' }}>
              <Text style={{ color: isT ? k.raText : on ? t.ink : t.ink2, fontSize: 14, fontFamily: isT ? T.display : T.brand }}>{d.getDate()}</Text>
              {has && <View {...decorative} style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: t.ra }} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
