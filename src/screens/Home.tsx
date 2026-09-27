import { useMemo, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
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
import { factLine } from '../priority';
import { DayPath } from '../components/DayPath';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { RoomBar } from '../components/RoomBar';
import { SlippingCheckIn } from '../components/SlippingCheckIn';
import { HomeAsks } from '../components/HomeAsks';
import type { Tab } from '../components/TabBar';

/** High before Medium before Low before none; then the soonest date; then the oldest. */
export const byPriority = (a: Task, b: Task) =>
  (b.priority ?? 0) - (a.priority ?? 0)
  || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)
  || a.created_at - b.created_at;

/** How much of what's still here Home shows before handing over to Your tasks. */
const STILL_MAX = 6;

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
  const compact = useWindowDimensions().height < 740;
  const head = compact ? 30 : 34;
  const t = useTheme();
  const { inbox, todayPicked, projects, now, focusOn, wins, profile, agenda, dayEndMin } = useStore();
  const [held, setHeld] = useState<Task | null>(null);     // the actions (long press)
  const [peek, setPeek] = useState<Task | null>(null);     // the task sheet (tap)

  const today = useMemo(() => [...todayPicked].filter(x => !x.parent_id).sort(byPriority), [todayPicked]);
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
  // what the one in front has to fit before: today's events and anything else with a time
  const fact = held_ ? factLine(held_, [
    ...agenda.map(e => e.startsAt),
    ...[...today, ...inbox].filter(x => x.id !== held_.id && x.has_time && x.due_at).map(x => x.due_at as number),
  ], dayEndMin) : null;
  const oneProject = held_ ? projectOf.get(held_.id) : undefined;

  // still here: the rest of Today, then everything else
  const still = useMemo(() => {
    const at = Date.now();
    const later = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
    const rest = [...inbox].filter(x => !later(x)).sort(byPriority);
    return [...today, ...rest].filter(x => x.id !== held_?.id);
  }, [today, inbox, held_?.id]);
  const watched = useMemo(() => [...today, ...inbox], [today, inbox]);   // for the slipping check-in

  const doneAt = wins.map(w => w.completed_at ?? 0).filter(at => at >= new Date().setHours(0, 0, 0, 0));
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
  const tomorrow = useMemo(() => {
    const from = new Date(); from.setHours(24, 0, 0, 0);
    const to = from.getTime() + 86400_000;
    return [...today, ...inbox].filter(x => x.due_at && x.due_at >= from.getTime() && x.due_at < to)
      .sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0)).slice(0, 3);
  }, [today, inbox]);
  if (night) {
    const hhmm = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[AP]M$/i, '');
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
        <Mica sunProgress={sunUp} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
            <DotMatrix text={hhmm.padStart(5, '0')} dot={9} color={t.ink} muted={t.stroke} muteLeadingZeros />
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5, marginTop: 22 }}>Your day is done{firstName ? `, ${firstName}` : ''}.</Text>
            <Text style={{ color: t.mute ?? t.ink3, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>Anything now is extra.</Text>
          </View>
          <DayPath done={doneAt} events={agenda.map(e => e.startsAt)} height={120} style={{ marginHorizontal: 24, marginTop: 28 }} />
          {tomorrow.length > 0 && (
            <>
              <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.7, fontFamily: T.display, marginHorizontal: 24, marginTop: 26, marginBottom: 10 }}>TOMORROW</Text>
              {tomorrow.map(x => {
                const l = labelById(x.label);
                return (
                  <View key={x.id} style={{ height: 56, marginHorizontal: 24, marginBottom: 6, borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.key === 'nu' ? 'rgba(170,185,255,0.09)' : 'rgba(23,19,19,0.06)' }}>
                      {l && <LabelGlyph id={l.id} size={17} color={t.key === 'nu' ? l.color : l.onLight} />}
                    </View>
                    <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 15.5, fontFamily: T.brand, letterSpacing: -0.3 }}>{x.title}</Text>
                    <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>
                      {x.has_time && x.due_at ? new Date(x.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : x.est_minutes ? `${x.est_minutes} min` : ''}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
          {/* Nu, resting */}
          <Image source={poseImage('nu-rest')} resizeMode="contain" style={{ width: 176, height: 148, alignSelf: 'center', marginTop: 10 }} />
        </ScrollView>
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
          <Text style={{ color: t.ink, fontSize: head, lineHeight: head + 2, fontFamily: T.display, letterSpacing: -1.5, textAlign: 'center' }}>
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </Text>
        </View>

        <DayPath done={doneAt} events={agenda.map(e => e.startsAt)} height={compact ? 96 : 118}
          style={{ marginHorizontal: 24, marginTop: compact ? 24 : 20 }} />

        {/* what Nu is holding: the one she found in front, the rest behind */}
        <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.7, fontFamily: T.display, marginHorizontal: 24, marginTop: compact ? 10 : 14, marginBottom: 10 }}>
          NU IS HOLDING · {still.length + (held_ ? 1 : 0)}
        </Text>
        <View style={{ marginHorizontal: 24 }}>
          <TodayStack front={held_} back={still.slice(0, compact ? 1 : 2)} from={oneProject?.project.title} fact={fact}
            onBegin={() => { if (held_) { setPickedId(null); focusOn(held_.id); } }}
            onOpen={setPeek}
            onPick={x => setPickedId(x.id)}
            onHold={setHeld}
            onPlan={() => router.push('/project/new')} />
        </View>

        <HomeAsks taskCount={inbox.length + todayPicked.length} style={{ marginTop: 22, marginHorizontal: 24 }} />
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <SlippingCheckIn tasks={watched} />
    </SafeAreaView>
  );
}
