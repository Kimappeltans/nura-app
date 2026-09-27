import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore, useTheme } from '../store';
import type { Task } from '../db';
import { type as T } from '../theme';
import { Mica, poseImage } from '../ui';
import { DotMatrix } from '../components/DotMatrix';
import { TaskPeek } from '../components/TaskPeek';
import { TaskSheet } from '../components/TaskSheet';
import { Suggestions } from '../components/Suggestions';
import { HomeAsks } from '../components/HomeAsks';
import { byPlan, reasonFor } from '../next';
import { byPriority } from '../screens/Home';
import type { Tab } from '../components/TabBar';
import { useTaskActions } from '../useTaskActions';
import { decorative } from '../a11y';
import {
  DeskCard, TellNuField, DeskRow, AddRow, Label, LinkButton, Empty, Key, columns, moveTo, addTo, useDeskTokens, useDeskState,
  day0, addDays, sameDay, WD, WDL, MO, CORAL, ON_CORAL,
} from './kit';
import { DayArc } from './DayArc';
import { useNow, useRange } from './useRange';

/**
 * HOME, ON THE DESKTOP. The day at full size on the left: the time, how much
 * of the day is left, the sun's arc and what's been done. Beside it, Today
 * (or tomorrow, once the day is over) and Begin, the one way into Focus.
 * Under both, the next seven days; a day opens the Calendar on it.
 */
export default function DeskHome({ onTab }: { onTab: (t: Tab) => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  const { width: winW, height: winH } = useWindowDimensions();
  const now = useNow();
  const { inbox, todayPicked, wins, decisions, now: pick0, nowDecision, focusOn, toRa, profile, dayStartMin, dayEndMin } = useStore();
  const session = useStore(s => s.session);
  const { tick } = useTaskActions();
  const [peek, setPeek] = useState<Task | null>(null);
  const [held, setHeld] = useState<Task | null>(null);

  const order = useMemo(() => byPlan(decisions, byPriority), [decisions]);
  const cols = useMemo(() => columns(inbox, todayPicked, order), [inbox, todayPicked, order]);

  // where the day is: before it starts, running, or over (it can run past midnight)
  const m = now.getHours() * 60 + now.getMinutes();
  const mm = dayEndMin > 24 * 60 && m < dayStartMin ? m + 24 * 60 : m;
  const phase: 'early' | 'day' | 'night' = mm < dayStartMin ? 'early' : mm >= dayEndMin ? 'night' : 'day';

  const accountName = (session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name) as string | undefined;
  const first = (profile.name || accountName || '').trim().split(' ')[0];
  const by = first ? `, ${first}` : '';
  const startClock = `${Math.floor(dayStartMin / 60) % 12 || 12}:${String(dayStartMin % 60).padStart(2, '0')}`;
  const [line1, line2] = (() => {
    if (phase === 'night') return [`Your day is done${by}.`, 'Anything now is extra.'];
    if (phase === 'early') return [`Morning${by}.`, `Your day starts at ${startClock}.`];
    const hi = now.getHours();
    const g = hi < 12 ? 'Morning' : hi < 17 ? 'Afternoon' : 'Evening';
    return [`${g}${by}.`, ''];
  })();

  // what the right-hand card holds: today, or once the day is over, the next one
  const focusDay = phase === 'night' && m >= dayStartMin ? addDays(day0(now), 1) : day0(now);
  const isToday = sameDay(focusDay, now);
  const todayStart = day0(now).getTime();
  const doneToday = useMemo(() => wins.filter(w => (w.completed_at ?? 0) >= todayStart), [wins, todayStart]);
  const focus = useMemo(() => {
    if (isToday) return cols.today;
    return [...cols.today, ...cols.week].filter(x => sameDay(x.due_at, focusDay));
  }, [cols, isToday, focusDay]);
  const later = cols.week.filter(x => !focus.includes(x));

  const pick = pick0 ?? cols.today[0] ?? null;
  const fact = pick ? reasonFor(decisions, pick.id, nowDecision) : null;

  // the next seven days, with what's on each
  const from = day0(now).getTime();
  const { tasks: dated, events } = useRange(from, from + 7 * 86400_000);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    const ts = dated.filter(x => sameDay(x.due_at, d) && x.state !== 'done');
    const extra = i === 0 ? cols.today.filter(x => !ts.some(y => y.id === x.id)) : [];
    const es = events.filter(e => sameDay(e.startsAt, d));
    return { d, items: [...es.map(e => ({ id: `e${e.id}`, title: e.title, event: true })), ...[...extra, ...ts].map(x => ({ id: x.id, title: x.title, event: false }))] };
  });
  const openDay = (d: Date) => {
    useDeskState.setState({ calMode: 'week', calOff: 0, calDay: d.getTime() });
    onTab('day');
  };

  const head = Math.round(Math.max(36, Math.min(56, winW * 0.034, winH * 0.06)));
  // the arc takes whatever height the card has left, so the whole room fits the window
  const [arcBox, setArcBox] = useState(0);
  const arcH = Math.max(90, arcBox - 62);
  const sunUp = Math.min(1, doneToday.length / 5);
  const row = (x: Task, col?: 'today' | 'week') => (
    <DeskRow key={x.id} task={x} col={col} hideDue={!col || (col === 'today' && !x.has_time && sameDay(x.due_at, Date.now()))} onOpen={() => setPeek(x)} onHold={() => setHeld(x)}
      onDone={() => tick(x.id)} onMove={c => moveTo(x, c)} />
  );
  // no header: Home is one screen, the next seven days included; a short window scrolls
  const PAD = 28;

  return (
    <View style={{ flex: 1 }}>
      <Mica sunProgress={sunUp} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: Math.max(640, winH), width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 40, paddingVertical: PAD, gap: 20 }}>
            <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 20 }}>
              {/* the day, at full size */}
              <DeskCard style={{ flex: 7, minWidth: 0, paddingTop: 26, paddingHorizontal: 38, paddingBottom: 20, overflow: 'hidden' }}>
                <Text accessibilityRole="header" style={{ color: t.ink3, fontSize: 16, fontFamily: T.brand, marginBottom: 14 }}>
                  {WDL[now.getDay()]}, {MO[now.getMonth()]} {now.getDate()}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 16 }}>
                  <DotMatrix text={`${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`} dot={8} color={t.ink}
                    label={now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />
                  <Text {...decorative} style={{ color: t.ink3, fontSize: 18, fontFamily: T.brand }}>{now.getHours() < 12 ? 'am' : 'pm'}</Text>
                </View>
                <Text accessibilityRole="header" style={{ color: t.ink, fontSize: head, lineHeight: Math.round(head * 1.08), letterSpacing: -2, fontFamily: T.display }}>
                  {line1}{!!line2 && <Text style={{ color: t.mute ?? t.ink3 }}>{'\n'}{line2}</Text>}
                </Text>
                {/* the arc fills what's left, and never holds the card open itself */}
                <View style={{ flex: 1, minHeight: 150 }} onLayout={e => setArcBox(Math.round(e.nativeEvent.layout.height - 24))}>
                  {arcBox > 0 && (
                    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
                      <DayArc now={now} height={arcH} done={doneToday.map(w => w.completed_at ?? 0)} />
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.stroke }}>
                  <Stat n={doneToday.length} label="done today" />
                  <Stat n={cols.week.length} label="this week" />
                  <Stat n={cols.someday.length} label="someday" />
                </View>
              </DeskCard>

              <View style={{ flex: 5, minWidth: 0, gap: 16 }}>
                <TellNuField stacked />
                {/* a short window, or a long day: Today scrolls on its own; Begin and the week stay in view */}
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, gap: 16 }} showsVerticalScrollIndicator={false}>
                {/* today, or tomorrow once the day is over */}
                <DeskCard style={{ flexGrow: 1, paddingBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 24 }}>
                    <Label>{phase !== 'night' ? 'Today' : isToday ? `Up next · ${WDL[focusDay.getDay()]}` : `Tomorrow · ${WDL[focusDay.getDay()]}`}</Label>
                    <Text style={{ color: t.ink3, fontSize: 14.5, fontFamily: T.brand }}>{MO[focusDay.getMonth()].slice(0, 3)} {focusDay.getDate()}</Text>
                  </View>
                  <View>
                    {focus.map(x => row(x, isToday ? 'today' : undefined))}
                    {isToday && doneToday.map(x => row(x))}
                    {!focus.length && !(isToday && doneToday.length) && <Empty>Nothing planned for {isToday ? 'today' : 'tomorrow'} yet.</Empty>}
                    <AddRow placeholder={isToday ? 'Add for today…' : 'Add for tomorrow…'}
                      onAdd={v => addTo(v, isToday ? 'today' : { day: focusDay.getTime() })} />
                    {later.length > 0 && (
                      <>
                        <Label color={t.mute ?? t.ink3} style={{ marginTop: 18, marginBottom: 2 }}>Later this week</Label>
                        {later.map(x => row(x, 'week'))}
                      </>
                    )}
                  </View>
                </DeskCard>

                {/* what Nu asks, or what the planner proposes to change: one at a time, only when there is one */}
                <HomeAsks taskCount={inbox.length + todayPicked.length} />
                <Suggestions limit={1} />
                </ScrollView>

                {phase !== 'night' ? (
                  <DeskCard style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, paddingHorizontal: 22 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: t.ink, fontSize: 19, fontFamily: T.display, marginBottom: 2 }}>Ready for one thing?</Text>
                      <Text numberOfLines={2} style={{ color: t.ink2, fontSize: 15.5, lineHeight: 22, fontFamily: T.brand }}>
                        {pick ? `“${pick.title}”` : 'Pick one task for today and give it your full attention.'}
                      </Text>
                      {!!fact && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 13.5, fontFamily: T.brand, marginTop: 3 }}>{fact}</Text>}
                    </View>
                    <BeginButton label={pick ? `Begin ${pick.title}` : 'Begin'} onPress={() => (pick ? focusOn(pick.id) : toRa())} />
                  </DeskCard>
                ) : (
                  <DeskCard style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 14, paddingHorizontal: 22 }}>
                    <Image {...decorative} source={poseImage('nu-rest')} resizeMode="contain" style={{ width: 110, height: 86 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: t.ink, fontSize: 19, fontFamily: T.display, marginBottom: 3 }}>Nu is resting.</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 23, fontFamily: T.brand }}>Something on your mind? Press </Text>
                        <Key k="N" />
                        <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 23, fontFamily: T.brand }}> and tell Nu before you sleep.</Text>
                      </View>
                    </View>
                  </DeskCard>
                )}
              </View>
            </View>

            {/* the next seven days, always in view */}
            <DeskCard style={{ paddingVertical: 16, paddingHorizontal: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Label>Next 7 days</Label>
                <LinkButton label="Open calendar →" accessibilityLabel="Open calendar" onPress={() => onTab('day')} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {days.map(({ d, items }, i) => (
                  <DayCell key={i} d={d} today={i === 0} items={items} onPress={() => openDay(d)} />
                ))}
              </View>
            </DeskCard>
        </View>
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${n} ${label}`}>
      <Text style={{ color: t.ink, fontSize: 30, letterSpacing: -0.6, fontFamily: T.display }}>{n}</Text>
      <Text style={{ color: t.ink3, fontSize: 14, fontFamily: T.brand }}>{label}</Text>
    </View>
  );
}

/** Begin: the one coral thing on Home, with the sun's glow under it. */
function BeginButton({ label, onPress }: { label: string; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 50, paddingHorizontal: 30, borderRadius: 25, justifyContent: 'center', overflow: 'hidden',
        shadowColor: CORAL, shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
        transform: [{ scale: pressed ? 0.97 : 1 }], opacity: hover ? 0.94 : 1,
      })}>
      <LinearGradient pointerEvents="none" colors={['#FF6B35', '#FFA05C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      <Text style={{ color: ON_CORAL, fontSize: 17, fontFamily: T.display }}>Begin</Text>
    </Pressable>
  );
}

function DayCell({ d, today, items, onPress }: {
  d: Date; today: boolean; items: { id: string; title: string; event: boolean }[]; onPress: () => void;
}) {
  const t = useTheme();
  const k = useDeskTokens();
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="button"
      accessibilityLabel={`${today ? 'Today' : WDL[d.getDay()]} ${d.getDate()}, ${items.length ? `${items.length} planned` : 'free'}`}
      style={{
        flex: 1, minWidth: 0, minHeight: 100, borderRadius: 14, borderWidth: 1, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12, gap: 4,
        borderColor: today ? t.ra : hover ? t.strokeStrong : t.stroke, backgroundColor: hover ? k.pick : k.wash,
      }}>
      <Text style={{ color: today ? k.raText : t.ink3, fontSize: 12, letterSpacing: 1.2, fontFamily: T.display, textTransform: 'uppercase' }}>{today ? 'Today' : WD[d.getDay()]}</Text>
      <Text style={{ color: t.ink, fontSize: 24, letterSpacing: -0.4, fontFamily: T.display, marginBottom: 2 }}>{d.getDate()}</Text>
      {items.slice(0, 2).map(x => <Chip key={x.id} title={x.title} event={x.event} />)}
      {items.length > 2 && <Text style={{ color: t.ink3, fontSize: 14, fontFamily: T.brand }}>+{items.length - 2} more</Text>}
      {!items.length && <Text style={{ color: t.mute ?? t.ink3, fontSize: 14, fontFamily: T.brand, marginTop: 'auto' }}>Free</Text>}
    </Pressable>
  );
}

/** A task (coral) or a calendar event (ink) on a day. */
export function Chip({ title, event }: { title: string; event?: boolean }) {
  const t = useTheme();
  const k = useDeskTokens();
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: event ? k.pick : t.raWash }}>
      <Text numberOfLines={1} style={{ color: event ? t.ink : k.raText, fontSize: 13.5, fontFamily: T.brand }}>{title}</Text>
    </View>
  );
}
