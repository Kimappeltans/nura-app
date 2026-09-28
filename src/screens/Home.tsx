import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme, isDaylight } from '../store';
import type { Task } from '../db';
import { type as T } from '../theme';
import { Mica, poseImage } from '../ui';
import { Image } from 'react-native';
import { DotMatrix } from '../components/DotMatrix';
import { labelById } from '../labels';
import { LabelGlyph } from '../components/LabelIcon';
import { TodayStack } from '../components/TodayStack';
import { byPlan, reasonFor } from '../next';
import { DayPath } from '../components/DayPath';
import { useArcThings } from '../components/ArcMarks';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { RoomBar } from '../components/RoomBar';
import { SlippingCheckIn } from '../components/SlippingCheckIn';
import { HomeAsks } from '../components/HomeAsks';
import { Suggestions } from '../components/Suggestions';
import type { Tab } from '../components/TabBar';
import { HeldRow } from '../components/HeldRow';
import { colOf, moveTo, deleteTask } from '../desk/kit';
import { useTaskActions } from '../useTaskActions';
import { ROOM_MAX, useDesk, useScreen } from '../screen';
import { decorative } from '../a11y';
import { StartHere, useStartHere } from '../components/StartHere';

/** High before Medium before Low before none; then the soonest date; then the oldest. */
export const byPriority = (a: Task, b: Task) =>
  (b.priority ?? 0) - (a.priority ?? 0)
  || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)
  || a.created_at - b.created_at;

/** How much of what's still here Home shows before handing over to Your tasks (on a wide window, under the stack). */
const STILL_MAX = 6;
/** a room's side padding on a wide window */
const DESK_PAD = 40;

/**
 * HOME — what should I do now? (design/nura-journey-blend-v5.html, 7:12)
 *
 *   - the greeting, by name;
 *   - the day's path: Ra where the day is, dots where things got done;
 *   - Nu is holding: Today as a stack — the one Nu found in front (Begin),
 *     the rest behind; tap one to bring it to the front.
 *
 * The earlier homes are in src/legacy (HomeFirst, NuHome, Nu).
 */
export default function Home({ onTab }: { onTab: (t: Tab) => void }) {
  // a short phone (an SE): a smaller greeting, a lower path, one card behind — so Begin is on screen
  // a wide web window: the path and the stack side by side (src/components/Desk.tsx)
  const desk = useDesk();
  const room = useScreen().width;
  const inner = Math.min(ROOM_MAX, room - DESK_PAD * 2);
  const side = Math.min(440, Math.round(inner * 0.46));    // the stack's column
  const winH = useWindowDimensions().height;
  const short = winH < 740;
  const compact = !desk && short;
  // a wide window: the path grows with the window's height, so the room fills it
  const pathH = Math.max(200, Math.min(320, Math.round(winH * 0.28)));
  const head = compact ? 30 : 34;
  const t = useTheme();
  const { inbox, todayPicked, projects, now, nowDecision, decisions, focusOn, toRa, wins, profile, agenda, dayEndMin } = useStore();
  const { tick } = useTaskActions();
  const [held, setHeld] = useState<Task | null>(null);     // the actions (long press)
  const [peek, setPeek] = useState<Task | null>(null);     // the task sheet (tap)

  // the planner's order (src/next.ts): the same one Ra and Your Tasks use
  const order = useMemo(() => byPlan(decisions, byPriority), [decisions]);
  const today = useMemo(() => [...todayPicked].filter(x => !x.parent_id).sort(order), [todayPicked, order]);
  const projectOf = useMemo(() => new Map(
    projects.filter(p => p.current?.task_id).map(p => [p.current!.task_id!, p])), [projects]);

  // the next clear step: what the engine picked (store.now), else a project's move
  const one: Task | null = useMemo(() => {
    if (now) return now;
    const p = projects.find(x => x.current?.task_id);
    return p ? inbox.find(x => x.id === p.current!.task_id) ?? null : null;
  }, [now, projects, inbox]);
  // a stone tapped to the front, until it's begun or gone
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = pickedId ? [...today, ...inbox].find(x => x.id === pickedId) ?? null : null;
  const held_ = picked ?? one;
  // the one in front's facts: the planner's reason for it (at most two)
  const fact = reasonFor(decisions, held_?.id, nowDecision);
  const oneProject = held_ ? projectOf.get(held_.id) : undefined;

  // still here: the rest of Today, then everything else
  const still = useMemo(() => {
    const at = Date.now();
    const later = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
    const rest = [...inbox].filter(x => !later(x)).sort(order);
    return [...today, ...rest].filter(x => x.id !== held_?.id);
  }, [today, inbox, held_?.id, order]);
  const watched = useMemo(() => [...today, ...inbox], [today, inbox]);   // for the slipping check-in

  const doneAt = wins.map(w => w.completed_at ?? 0).filter(at => at >= new Date().setHours(0, 0, 0, 0));
  // what's on the day's path: what's done, what has a time, and the move in front, at now (src/arcMarks.ts)
  const onArc = useArcThings(held_);
  const arc = {
    ...onArc,
    onStart: (id: string) => { setPickedId(null); focusOn(id); },
    onOpen: (id: string) => { const x = [...today, ...inbox].find(y => y.id === id); if (x) setPeek(x); },
    onDay: () => onTab('day'),
  };
  // the sunrise behind Home: the coral glow climbs and warms as things get done (full by five)
  const sunUp = Math.min(1, doneAt.length / 5);
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // always by name: the profile's, or else the name on the signed-in account
  const session = useStore(s => s.session);
  const accountName = (session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name) as string | undefined;
  const firstName = (profile.name || accountName || '').trim().split(' ')[0];

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });

  // NIGHT (design 11:50 PM): once the day you set has ended, Home is quiet —
  // Ra has sat down at the horizon, Nu is resting, and tomorrow is waiting
  const night = !isDaylight(dayEndMin);
  // someone new: three steps under the path, until the last is done (src/startHere.ts)
  const start = useStartHere(!night);
  const tomorrow = useMemo(() => {
    const from = new Date(); from.setHours(24, 0, 0, 0);
    const to = from.getTime() + 86400_000;
    return [...today, ...inbox].filter(x => x.due_at && x.due_at >= from.getTime() && x.due_at < to)
      .sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0)).slice(0, 3);
  }, [today, inbox]);
  if (night) {
    const hhmm = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[AP]M$/i, '');
    // the clock drops AM/PM; said aloud, it keeps it
    const saidTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    const timeOf = (x: Task) => x.has_time && x.due_at ? new Date(x.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : x.est_minutes ? `${x.est_minutes} min` : '';
    const tomorrowRows = tomorrow.length > 0 && (
      <>
        <Text accessibilityRole="header" style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.7, fontFamily: T.display, marginHorizontal: desk ? 0 : 24, marginTop: desk ? 0 : 26, marginBottom: 10 }}>TOMORROW</Text>
        {tomorrow.map(x => {
          const l = labelById(x.label);
          return (
            <View key={x.id} accessible accessibilityLabel={timeOf(x) ? `${x.title}, ${timeOf(x)}` : x.title}
              style={{ minHeight: 56, paddingVertical: 8, marginHorizontal: desk ? 0 : 24, marginBottom: 6, borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.key === 'nu' ? 'rgba(170,185,255,0.09)' : 'rgba(23,19,19,0.06)' }}>
                {l && <LabelGlyph id={l.id} size={17} color={t.key === 'nu' ? l.color : l.onLight} />}
              </View>
              <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 15.5, fontFamily: T.brand, letterSpacing: -0.3 }}>{x.title}</Text>
              <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>
                {timeOf(x)}
              </Text>
            </View>
          );
        })}
      </>
    );
    // a wide window: the clock and the headline, then the path beside tomorrow
    // and Nu resting, in the middle of the window's height
    if (desk) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
          <Mica sunProgress={sunUp} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: DESK_PAD, paddingTop: 48, paddingBottom: 72 }} showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', maxWidth: ROOM_MAX, alignSelf: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <DotMatrix text={hhmm} dot={9} color={t.ink} label={saidTime} />
                <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 40, lineHeight: 42, fontFamily: T.display, letterSpacing: -1.8, marginTop: 24, textAlign: 'center' }}>Your day is done{firstName ? `, ${firstName}` : ''}.</Text>
                <Text style={{ color: t.mute ?? t.ink3, fontSize: 40, lineHeight: 42, fontFamily: T.display, letterSpacing: -1.8, textAlign: 'center' }}>Anything now is extra.</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: DESK_PAD, marginTop: 36, alignItems: 'flex-start' }}>
                <DayPath done={doneAt} events={agenda.map(e => e.startsAt)} height={pathH} style={{ flex: 1, minWidth: 0 }} />
                <View style={{ width: side }}>
                  {tomorrowRows}
                  {/* Nu, resting */}
                  <Image {...decorative} source={poseImage('nu-rest')} resizeMode="contain" style={{ width: 200, height: 168, alignSelf: 'center', marginTop: tomorrow.length ? 16 : 36 }} />
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
        <Mica sunProgress={sunUp} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 24, paddingTop: 22, alignItems: 'center' }}>
            <DotMatrix text={hhmm} dot={9} color={t.ink} label={saidTime} />
            <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5, marginTop: 22, textAlign: 'center' }}>Your day is done{firstName ? `, ${firstName}` : ''}.</Text>
            <Text style={{ color: t.mute ?? t.ink3, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5, textAlign: 'center' }}>Anything now is extra.</Text>
          </View>
          <DayPath done={doneAt} events={agenda.map(e => e.startsAt)} height={120} style={{ marginHorizontal: 24, marginTop: 28 }} />
          {tomorrowRows}
          {/* Nu, resting */}
          <Image {...decorative} source={poseImage('nu-rest')} resizeMode="contain" style={{ width: 176, height: 148, alignSelf: 'center', marginTop: 10 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const holding = (
    <Text accessibilityRole="header" accessibilityLabel={`Nu is holding, ${still.length + (held_ ? 1 : 0)}`}
      style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.7, fontFamily: T.display, marginHorizontal: desk ? 0 : 24, marginTop: desk ? 0 : compact ? 10 : 14, marginBottom: 10 }}>
      NU IS HOLDING · {still.length + (held_ ? 1 : 0)}
    </Text>
  );
  const stack = (
    <TodayStack front={held_} back={still.slice(0, compact ? 1 : 2)} from={oneProject?.project.title} fact={fact}
      onBegin={() => { if (held_) { setPickedId(null); focusOn(held_.id); } }}
      onOpen={setPeek}
      onPick={x => setPickedId(x.id)}
      onHold={setHeld}
      waiting={still.length > 0}
      onChoose={toRa}
      onPlan={() => router.push('/project/new')} />
  );
  const sheets = (
    <>
      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <SlippingCheckIn tasks={watched} />
    </>
  );

  // A WIDE WINDOW: the greeting; the day's path and the stack side by side;
  // what else Nu is holding under them, up to STILL_MAX, then Your Tasks.
  // In the middle of the window's height, not stuck to the top of it.
  if (desk) {
    const more = still.slice(2, 2 + STILL_MAX);
    const half = Math.ceil(more.length / 2);
    const row = (x: Task) => (
      <HeldRow key={x.id} task={x} meta={projectOf.get(x.id)?.project.title} onPress={() => setPeek(x)} onHold={() => setHeld(x)}
        col={colOf(x)} onDone={() => tick(x.id)} onMove={c => moveTo(x, c)} onDelete={() => deleteTask(x)} />
    );
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
        <Mica sunProgress={sunUp} />
        <RoomBar who="nu" />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: DESK_PAD, paddingTop: short ? 32 : 48, paddingBottom: short ? 48 : 72 }}
          showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: ROOM_MAX, alignSelf: 'center' }}>
            <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 40, lineHeight: 42, fontFamily: T.display, letterSpacing: -1.8 }}>
              {greeting}{firstName ? `, ${firstName}` : ''}.
            </Text>
            <View style={{ flexDirection: 'row', gap: DESK_PAD, marginTop: 32, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <DayPath done={doneAt} events={agenda.map(e => e.startsAt)} height={pathH} things={arc} />
                <HomeAsks taskCount={inbox.length + todayPicked.length} style={{ marginTop: 28 }} />
                {/* what the planner proposes to change, one at a time (src/interventions.ts) */}
                <View style={{ marginTop: 20 }}><Suggestions limit={1} /></View>
              </View>
              <View style={{ width: side }}>
                {!more.length && holding}
                {stack}
              </View>
            </View>
            {more.length > 0 && (
              <View style={{ marginTop: 44 }}>
                {holding}
                <View style={{ flexDirection: 'row', gap: DESK_PAD }}>
                  <View style={{ flex: 1, minWidth: 0 }}>{more.slice(0, half).map(row)}</View>
                  <View style={{ flex: 1, minWidth: 0 }}>{more.slice(half).map(row)}</View>
                </View>
                {still.length > 2 + STILL_MAX && (
                  <Pressable onPress={() => onTab('tasks')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Your Tasks" style={{ alignSelf: 'flex-start', marginTop: 16 }}>
                    <Text style={{ color: t.nu, fontSize: 14.5, fontFamily: T.display }}>Your Tasks ›</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </ScrollView>
        {sheets}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica sunProgress={sunUp} />
      <RoomBar who="nu" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}>

        {/* the greeting, by name, centred over the day's path */}
        <View style={{ paddingHorizontal: 24, paddingTop: compact ? 6 : 16 }}>
          <Text accessibilityRole="header" style={{ color: t.ink, fontSize: head, lineHeight: head + 2, fontFamily: T.display, letterSpacing: -1.5, textAlign: 'center' }}>
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </Text>
        </View>

        <DayPath done={doneAt} events={agenda.map(e => e.startsAt)} height={compact ? 96 : 118} things={arc}
          style={{ marginHorizontal: 24, marginTop: compact ? 24 : 20 }} />

        {/* someone new: put it all down, let Ra pick one, begin five minutes */}
        {start.show && (
          <View style={{ marginHorizontal: 24, marginTop: compact ? 14 : 18 }}>
            <StartHere start={start} />
          </View>
        )}

        {/* what Nu is holding: the one she found in front, the rest behind
            (with nothing in front, Start here's steps stand in for the empty card) */}
        {!(start.show && !held_) && (
          <>
            {holding}
            <View style={{ marginHorizontal: 24 }}>
              {stack}
            </View>
          </>
        )}

        <HomeAsks taskCount={inbox.length + todayPicked.length} style={{ marginTop: 22, marginHorizontal: 24 }} />
        {/* what the planner proposes to change, one at a time (src/interventions.ts) */}
        <View style={{ marginTop: 16, marginHorizontal: 24 }}><Suggestions limit={1} /></View>
      </ScrollView>

      {sheets}
    </SafeAreaView>
  );
}
