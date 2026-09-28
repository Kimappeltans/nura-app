import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useStore, useTheme } from '../store';
import { passOn, pickForToday, updateTask, type Task } from '../db';
import { type as T } from '../theme';
import { Mica, poseImage } from '../ui';
import { TaskPeek } from '../components/TaskPeek';
import { TaskSheet } from '../components/TaskSheet';
import { ActionSheet, type SheetAction } from '../components/ActionSheet';
import { Suggestions } from '../components/Suggestions';
import { HomeAsks } from '../components/HomeAsks';
import { byPlan, DEFAULT_MINUTES } from '../next';
import { byPriority } from '../screens/Home';
import type { Tab } from '../components/TabBar';
import { useTaskActions } from '../useTaskActions';
import { announce, decorative } from '../a11y';
import {
  DeskCard, TellNuField, Label, LinkButton, columns, deleteTask, useDeskTokens, useRoom,
  day0, addDays, WDL, MO, CORAL, ON_CORAL,
} from './kit';
import { useNow } from './useRange';
import { DayArc } from './DayArc';
import { Guide, useGuide } from './Guide';
import { backToSession } from '../nav';

/**
 * HOME, ON THE DESKTOP: what Nura figured out, not a dashboard (Kim, 28
 * September). Tell Nu across the top, for whatever's going on. Under it the
 * one thing at full size: your next move, how long it will really take you,
 * the planner's facts for why this one, and Start, Not now or Something
 * changed. Above it, as on the phone, the greeting and the sun's arc with Ra
 * where the day is. Beside the move, your day: the time you actually have
 * left, what Today holds, and what Nu suggests changing (one tap, with
 * Undo). Under the move, what comes after
 * it. Until you've done the three things Nura is for, Getting started shows
 * them (src/desk/Guide.tsx). The clock, the counts and the week live in the
 * Calendar; the sun's glow still rises behind the room as things get done.
 */
export default function DeskHome({ onTab }: { onTab: (t: Tab) => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  const { pad, inner } = useRoom();
  const { height: winH } = useWindowDimensions();
  const now = useNow();
  const {
    inbox, todayPicked, wins, decisions, now: pick0, nowDecision, focusOn, profile, projects,
    dayStartMin, dayEndMin, left: leftThen, leftAt, refresh, showToast,
  } = useStore();
  // the time left as of the last refresh, less the minutes since (the clock moves every half minute)
  const left = Math.max(0, leftThen - Math.max(0, (now.getTime() - leftAt) / 60_000));
  const session = useStore(s => s.session);
  const running = useStore(s => s.running);
  const { tick } = useTaskActions();
  const [peek, setPeek] = useState<Task | null>(null);
  const [held, setHeld] = useState<Task | null>(null);
  const [changing, setChanging] = useState(false);
  const guide = useGuide();

  const order = useMemo(() => byPlan(decisions, byPriority), [decisions]);
  const cols = useMemo(() => columns(inbox, todayPicked, order), [inbox, todayPicked, order]);

  // where the day is: before it starts, running, or over (it can run past midnight)
  const m = now.getHours() * 60 + now.getMinutes();
  const mm = dayEndMin > 24 * 60 && m < dayStartMin ? m + 24 * 60 : m;
  const phase: 'early' | 'day' | 'night' = mm < dayStartMin ? 'early' : mm >= dayEndMin ? 'night' : 'day';

  const accountName = (session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name) as string | undefined;
  const first = (profile.name || accountName || '').trim().split(' ')[0];
  const by = first ? `, ${first}` : '';
  const hi = now.getHours();
  const greeting = phase === 'night' ? `Your day is done${by}.` : `${hi < 12 ? 'Good morning' : hi < 17 ? 'Good afternoon' : 'Good evening'}${by}.`;

  // the one thing: what you put first on Today (or chose), else the planner's first of everything
  const front = pick0 ?? decisions[0]?.task ?? null;
  const frontD = front ? (nowDecision?.taskId === front.id ? nowDecision : decisions.find(d => d.taskId === front.id) ?? null) : null;
  const minutes = frontD?.suggestedMinutes ?? front?.est_minutes ?? null;
  // the facts that say most first: a day, a priority, a project; "fits before" last
  const telling = (fs: string[]) => [...fs.filter(f => !f.startsWith('Fits')), ...fs.filter(f => f.startsWith('Fits'))];
  const facts = telling(frontD?.facts ?? []).slice(0, 3);
  const move = front ? projects.find(p => p.current?.task_id === front.id) ?? null : null;
  // after it: the rest of Today first, then everything else, each in the planner's order
  const onToday = new Set(cols.today.map(x => x.id));
  const queue = decisions.filter(d => d.taskId !== front?.id);
  const after = [...queue.filter(d => onToday.has(d.taskId)), ...queue.filter(d => !onToday.has(d.taskId))].slice(0, 3);
  const more = Math.max(0, queue.length - after.length);

  // your day: the time you really have, and what Today holds
  const minsOf = (x: Task) => decisions.find(d => d.taskId === x.id)?.suggestedMinutes ?? x.est_minutes ?? DEFAULT_MINUTES;
  const todayMins = cols.today.reduce((a, x) => a + minsOf(x), 0);
  const doneAt = wins.map(w => w.completed_at ?? 0).filter(at => at >= day0(now).getTime());
  const doneToday = doneAt.length;
  const sunUp = Math.min(1, doneToday / 5);

  // Not now: out of the running for today, and the next one comes up
  const notNow = async () => {
    if (!front) return;
    await passOn(front.id);
    await refresh();
    announce('Not now. The next one is up.');
  };
  const tomorrow = async (x: Task) => {
    const was = { due_at: x.due_at, has_time: x.has_time, state: x.state };
    if (x.state === 'today' || x.state === 'doing') await pickForToday(x.id, false);
    await updateTask(x.id, { due_at: addDays(day0(Date.now()), 1).setHours(9), has_time: 0 });
    await refresh();
    showToast(`Moved to tomorrow: ${x.title}`, async () => {
      await updateTask(x.id, { due_at: was.due_at, has_time: was.has_time });
      if (was.state === 'today' || was.state === 'doing') await pickForToday(x.id, true);
      await refresh();
    });
  };
  const openMove = () => move && router.push({ pathname: '/project/[id]', params: { id: move.project.id } });
  const changed: SheetAction[] = front ? [
    move
      ? { key: 'bigger', glyph: '↘', label: 'It’s bigger than I thought', sub: 'Nu finds a smaller way in', onPress: openMove }
      : { key: 'bigger', glyph: '↘', label: 'It’s bigger than I thought', sub: 'Nu plans it as steps', onPress: () => router.push({ pathname: '/project/new', params: { goal: front.title, auto: '1' } }) },
    move
      ? { key: 'stuck', glyph: '⤳', label: 'I’m stuck or waiting on someone', sub: 'Nu finds a way around', onPress: openMove }
      : { key: 'stuck', glyph: '⤳', label: 'I’m stuck or waiting on someone', sub: 'Out of the way until tomorrow', onPress: () => tomorrow(front) },
    { key: 'tomorrow', glyph: '→', label: 'Not today', sub: 'Moves it to tomorrow', onPress: () => tomorrow(front) },
    { key: 'done', glyph: '✓', label: 'Already done', onPress: () => tick(front.id) },
    { key: 'drop', glyph: '×', label: 'Not needed any more', tone: 'quiet', onPress: () => deleteTask(front) },
  ] : [];

  // the move and your day side by side when there's room; one column when not
  const side = inner >= 900;
  // the arc: a fifth of the window's height, so the move under it stays in view
  const arcH = Math.round(Math.max(120, Math.min(190, winH * 0.2)));

  return (
    <View style={{ flex: 1 }}>
      <Mica sunProgress={sunUp} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: pad, paddingTop: 28, paddingBottom: 36, gap: 22 }}>
          {/* Tell Nu, across the top: whatever's going on, in any order */}
          <View style={{ zIndex: 10 }}><TellNuField stacked /></View>

          {/* the day, as on the phone: the greeting, and under it the sun's arc with Ra where the day is */}
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 34, letterSpacing: -1.2, fontFamily: T.display, textAlign: 'center' }}>{greeting}</Text>
            <Text style={{ color: t.ink3, fontSize: 16, fontFamily: T.brand }}>
              {WDL[now.getDay()]}, {MO[now.getMonth()]} {now.getDate()}
            </Text>
          </View>
          <View style={{ marginTop: 30 }}>
            <DayArc now={now} height={arcH} done={doneAt} count />
          </View>

          <View style={{ flexDirection: side ? 'row' : 'column', gap: 20, alignItems: side ? 'flex-start' : 'stretch' }}>
            <View style={{ flex: side ? 3 : undefined, minWidth: 0, gap: 20 }}>
              {/* the one thing, at full size */}
              {phase === 'night' ? (
                <Resting first={decisions[0]?.task ?? null} />
              ) : !front && guide.show ? (
                <Guide full done={guide.done} at={guide.at} onHide={guide.hide} />
              ) : !front ? (
                <Start />
              ) : (
                <DeskCard style={{ paddingTop: 26, paddingHorizontal: 30, paddingBottom: 26, overflow: 'hidden' }}>
                  {/* Ra, the one thing you're doing, with the sun's glow behind */}
                  <View {...decorative} pointerEvents="none" style={{ position: 'absolute', right: -80, top: -90, width: 320, height: 320 }}>
                    <Svg width={320} height={320}>
                      <Defs>
                        <RadialGradient id="raGlow" cx="50%" cy="50%" r="50%">
                          <Stop offset="0" stopColor="#FFB067" stopOpacity={0.42} />
                          <Stop offset="0.45" stopColor="#FF8A5C" stopOpacity={0.16} />
                          <Stop offset="1" stopColor="#FF6B35" stopOpacity={0} />
                        </RadialGradient>
                      </Defs>
                      <Circle cx={160} cy={160} r={160} fill="url(#raGlow)" />
                    </Svg>
                  </View>
                  <Image {...decorative} source={poseImage('ra-hello')} resizeMode="contain"
                    style={{ position: 'absolute', right: 24, top: 20, width: 92, height: 92 }} />

                  <Text style={{ color: k.raText, fontSize: 13, letterSpacing: 1.4, fontFamily: T.display, textTransform: 'uppercase' }}>Your next move</Text>
                  <Text accessibilityRole="header" numberOfLines={3}
                    style={{ color: t.ink, fontSize: 36, lineHeight: 41, letterSpacing: -1.4, fontFamily: T.display, marginTop: 10, marginRight: 116 }}>
                    {front.title}
                  </Text>
                  {!!(minutes || move) && (
                    <Text style={{ color: t.ink2, fontSize: 17, fontFamily: T.brand, marginTop: 8 }}>
                      {[minutes ? `About ${fmtMins(minutes)}` : null, move ? move.project.title : null].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {facts.length > 0 && (
                    <View accessible accessibilityLabel={`Why this one: ${facts.join(', ')}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                      {facts.map(f => (
                        <View key={f} style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: k.wash }}>
                          <Text style={{ color: t.ink2, fontSize: 14, fontFamily: T.brand }}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 24 }}>
                    {running && running.id === front.id
                      ? <StartButton text="Back to it" label={`Back to ${front.title}`} onPress={() => backToSession(running)} />
                      : <StartButton text="Start" label={`Start ${front.title}`} onPress={() => focusOn(front.id)} />}
                    <QuietButton label="Not now" onPress={notNow} />
                    <QuietButton label="Something changed" onPress={() => setChanging(true)} />
                  </View>
                </DeskCard>
              )}

              {/* what comes after it, in the planner's order */}
              {phase !== 'night' && after.length > 0 && (
                <DeskCard style={{ paddingVertical: 18, paddingHorizontal: 24 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Label>After that</Label>
                    <LinkButton label={more ? `All tasks · ${more} more ›` : 'All tasks ›'} accessibilityLabel="All tasks" onPress={() => onTab('tasks')} />
                  </View>
                  {after.map((d, i) => (
                    <AfterRow key={d.taskId} n={i + 2} task={d.task} minutes={d.suggestedMinutes ?? d.task.est_minutes}
                      fact={onToday.has(d.taskId) ? ['On Today', ...d.facts.filter(f => !f.startsWith('Fits'))].slice(0, 2).join(' · ') : d.facts.find(f => !f.startsWith('Fits')) ?? null}
                      onPress={() => setPeek(d.task)} onHold={() => setHeld(d.task)} />
                  ))}
                </DeskCard>
              )}
            </View>

            {/* your day: the time you have, what Today holds, and what Nu would change */}
            <View style={{ flex: side ? 2 : undefined, minWidth: 0, gap: 16 }}>
              {/* getting started, small, once there's a move in front */}
              {!!front && guide.show && phase !== 'night' && <Guide done={guide.done} at={guide.at} onHide={guide.hide} />}
              <DeskCard style={{ paddingVertical: 20, paddingHorizontal: 24 }}>
                <Label>Your day</Label>
                <Text style={{ color: t.ink, fontSize: 32, letterSpacing: -1, fontFamily: T.display, marginTop: 10 }}>
                  {phase === 'day' ? fmtMins(left) : phase === 'early' ? clockOf(dayStartMin) : 'Done'}
                </Text>
                <Text style={{ color: t.ink3, fontSize: 15, fontFamily: T.brand }}>
                  {phase === 'day' ? 'left today, around your events' : phase === 'early' ? 'is when your day starts' : 'Anything now is extra.'}
                </Text>
                {phase === 'day' && left > 0 && todayMins > 0 && (
                  <View {...decorative} style={{ height: 6, borderRadius: 3, backgroundColor: k.wash, marginTop: 14, overflow: 'hidden' }}>
                    <LinearGradient colors={['#FF6B35', '#FFA05C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ height: 6, width: `${Math.min(100, Math.round((todayMins / left) * 100))}%`, borderRadius: 3 }} />
                  </View>
                )}
                <View style={{ marginTop: 14, gap: 4 }}>
                  <Text style={{ color: t.ink2, fontSize: 15, fontFamily: T.brand }}>
                    {cols.today.length
                      ? `Today holds ${cols.today.length === 1 ? '1 thing' : `${cols.today.length} things`}, about ${fmtMins(todayMins)}.`
                      : 'Nothing on Today yet.'}
                  </Text>
                </View>
              </DeskCard>
              {/* what Nu asks, or what the planner proposes to change: one tap, with Undo */}
              <HomeAsks taskCount={inbox.length + todayPicked.length} />
              <Suggestions limit={2} />
            </View>
          </View>
        </View>
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <ActionSheet visible={changing} title={front ? `What changed about “${front.title}”?` : ''} actions={changed}
        dismissLabel="Nothing, keep it" onDismiss={() => setChanging(false)} />
    </View>
  );
}

/** "25 min", "1 h 5 min", "2 h". */
function fmtMins(n: number) {
  const m = Math.max(0, Math.round(n));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
function clockOf(min: number) {
  return `${Math.floor(min / 60) % 12 || 12}:${String(min % 60).padStart(2, '0')}`;
}

/** Nothing held, and the guide put away: Nu, and the question. The answer goes in Tell Nu, above. */
function Start() {
  const t = useTheme();
  return (
    <DeskCard style={{ paddingVertical: 28, paddingHorizontal: 30, flexDirection: 'row', gap: 24, alignItems: 'center' }}>
      <Image {...decorative} source={poseImage('nu-listen')} resizeMode="contain" style={{ width: 110, height: 110 }} />
      <Text accessibilityRole="header" style={{ flex: 1, color: t.ink, fontSize: 30, letterSpacing: -1, fontFamily: T.display }}>What’s going on?</Text>
    </DeskCard>
  );
}

/** After your day's end: Nu resting, and what tomorrow starts with. */
function Resting({ first }: { first: Task | null }) {
  const t = useTheme();
  return (
    <DeskCard style={{ paddingVertical: 24, paddingHorizontal: 28, flexDirection: 'row', gap: 22, alignItems: 'center' }}>
      <Image {...decorative} source={poseImage('nu-rest')} resizeMode="contain" style={{ width: 120, height: 94 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.ink, fontSize: 24, letterSpacing: -0.6, fontFamily: T.display }}>Nu is resting.</Text>
        <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 23, fontFamily: T.brand, marginTop: 4 }}>
          {first ? `Tomorrow starts with “${first.title}”.` : 'Something on your mind? Tell Nu before you sleep.'}
        </Text>
      </View>
    </DeskCard>
  );
}

/** Next in line: its place, its name, the planner's first fact, and how long. */
function AfterRow({ n, task, minutes, fact, onPress, onHold }: {
  n: number; task: Task; minutes: number | null; fact: string | null; onPress: () => void; onHold: () => void;
}) {
  const t = useTheme();
  const k = useDeskTokens();
  return (
    <Pressable onPress={onPress} onLongPress={onHold}
      {...({ onContextMenu: (e: { preventDefault: () => void }) => { e.preventDefault(); onHold(); } } as object)}
      accessibilityRole="button" accessibilityLabel={[task.title, fact, minutes ? fmtMins(minutes) : null].filter(Boolean).join(', ')}
      style={(s) => {
        const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
        return {
          minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10,
          backgroundColor: pressed || hovered ? k.wash : 'transparent',
        };
      }}>
      <View {...decorative} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: t.strokeStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.display }}>{n}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontSize: 16.5, fontFamily: T.brand, letterSpacing: -0.2 }}>{task.title}</Text>
        {!!fact && <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 13.5, fontFamily: T.brand, marginTop: 1 }}>{fact}</Text>}
      </View>
      {!!minutes && <Text style={{ color: t.ink2, fontSize: 15, fontFamily: T.brand }}>{fmtMins(minutes)}</Text>}
    </Pressable>
  );
}

/** Start: the one coral thing on Home, with the sun's glow under it. */
function StartButton({ label, onPress, text }: { label: string; onPress: () => void; text: string }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 52, paddingHorizontal: 34, borderRadius: 26, justifyContent: 'center', overflow: 'hidden',
        shadowColor: CORAL, shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
        transform: [{ scale: pressed ? 0.97 : 1 }], opacity: hover ? 0.94 : 1,
      })}>
      <LinearGradient pointerEvents="none" colors={['#FF6B35', '#FFA05C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      <Text style={{ color: ON_CORAL, fontSize: 17, fontFamily: T.display }}>{text}</Text>
    </Pressable>
  );
}

function QuietButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={(s) => {
        const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
        return { height: 52, paddingHorizontal: 22, borderRadius: 26, justifyContent: 'center', borderWidth: 1, borderColor: t.strokeStrong, backgroundColor: pressed || hovered ? k.wash : 'transparent' };
      }}>
      <Text style={{ color: t.ink, fontSize: 16, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );
}

/** A task (coral) or a calendar event (ink) on a day; a done task ticked, struck through and quiet. */
export function Chip({ title, event, done }: { title: string; event?: boolean; done?: boolean }) {
  const t = useTheme();
  const k = useDeskTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: event ? k.pick : done ? k.wash : t.raWash }}>
      {done && <Text {...decorative} style={{ color: t.ink3, fontSize: 12, fontFamily: T.display }}>✓</Text>}
      <Text numberOfLines={1} accessibilityLabel={done ? `${title}, done` : undefined}
        style={{ flexShrink: 1, color: event ? t.ink : done ? t.ink3 : k.raText, fontSize: 13.5, fontFamily: T.brand, textDecorationLine: done ? 'line-through' : 'none' }}>{title}</Text>
    </View>
  );
}
