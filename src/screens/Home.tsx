import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../store';
import type { Task } from '../db';
import { whyLine } from '../priority';
import { type as T } from '../theme';
import { Mica, poseImage } from '../ui';
import { NowCard } from '../components/NowCard';
import { TaskLine, taskMeta } from '../components/TaskLine';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { RoomBar } from '../components/RoomBar';
import { SectionHead, ListCard } from '../components/ListCard';
import { SlippingCheckIn } from '../components/SlippingCheckIn';
import { HomeAsks } from '../components/HomeAsks';
import { NuGlow, NU_SIZE } from '../components/NuGlow';
import type { Tab } from '../components/TabBar';

/** High before Medium before Low before none; then the soonest date; then the oldest. */
export const byPriority = (a: Task, b: Task) =>
  (b.priority ?? 0) - (a.priority ?? 0)
  || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)
  || a.created_at - b.created_at;

/** How much of what's still here Home shows before handing over to Your tasks. */
const STILL_MAX = 4;

/**
 * HOME — what should I do now? One clear move, then the rest can wait.
 *
 *   - YOUR NEXT CLEAR STEP: one move, why it's this one, and Begin;
 *   - Add anything, with Nu — Capture, whatever shape it is;
 *   - STILL HERE: the rest of Today first, then a few of everything else;
 *     all of it is in Your tasks, one tab over.
 *
 * Ra is in the corner here: Home is choosing and beginning.
 * The earlier homes are in src/legacy (HomeFirst, NuHome, Nu).
 */
export default function Home({ onTab, onCapture }: { onTab: (t: Tab) => void; onCapture: () => void }) {
  const t = useTheme();
  const { inbox, todayPicked, projects, now, nowRule, energy, focusOn, wins, profile } = useStore();
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
  const oneProject = one ? projectOf.get(one.id) : undefined;
  const why = !one ? null
    : one === now ? whyLine(nowRule, one, energy)
    : oneProject ? 'it’s the next move on your path' : null;

  // still here: the rest of Today, then everything else
  const still = useMemo(() => {
    const at = Date.now();
    const later = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
    const rest = [...inbox].filter(x => !later(x)).sort(byPriority);
    return [...today, ...rest].filter(x => x.id !== one?.id);
  }, [today, inbox, one?.id]);
  const watched = useMemo(() => [...today, ...inbox], [today, inbox]);   // for the slipping check-in

  const doneToday = wins.filter(w => w.completed_at && w.completed_at >= new Date().setHours(0, 0, 0, 0)).length;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile.name || '').split(' ')[0];
  const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <RoomBar who="ra" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}>

        <View style={{ paddingBottom: 16 }}>
          <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 2, fontFamily: T.brand }}>
            {weekday}{doneToday ? ` · ${doneToday} DONE` : ''}
          </Text>
          <Text style={{ color: t.ink, fontSize: 27, lineHeight: 32, fontFamily: T.display, letterSpacing: -0.9, marginTop: 4 }}>
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </Text>
        </View>

        <NowCard task={one} why={why} from={oneProject?.project.title}
          onBegin={() => one && focusOn(one.id)} onOpen={() => one && setPeek(one)}
          onAnother={() => onTab('tasks')} onPlan={() => router.push('/project/new')} />

        {/* put anything down — Nu works out what it is */}
        <Pressable onPress={onCapture} accessibilityRole="button" accessibilityLabel="Add anything"
          style={({ pressed }) => ({ marginTop: NU_SIZE - 44, opacity: pressed ? 0.92 : 1 })}>
          <View style={{ height: 60, borderRadius: 15, borderWidth: 1, borderColor: t.strokeStrong, overflow: 'visible' }}>
            <LinearGradient colors={t.key === 'nu' ? ['rgba(140,151,246,0.24)', 'rgba(140,151,246,0.10)'] : [t.card, t.layer]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }}>
              <LinearGradient colors={t.nuBtn} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 20, lineHeight: 23, fontFamily: T.brand }}>+</Text>
              </LinearGradient>
              <Text style={{ flex: 1, color: t.ink2, fontSize: 15.5 }}>Add anything…</Text>
            </LinearGradient>
            {/* Nu, standing on the bar — the one who takes it */}
            <View pointerEvents="none" style={{ position: 'absolute', right: 10, bottom: 4 }}>
              <NuGlow size={NU_SIZE}>
                <Image source={poseImage('nu-listen')} style={{ width: NU_SIZE, height: NU_SIZE }} resizeMode="contain" />
              </NuGlow>
            </View>
          </View>
        </Pressable>

        {still.length > 0 && (
          <>
            <SectionHead label={`Still here · ${still.length}`} action="See all" onAction={() => onTab('tasks')} />
            <ListCard>
              {still.slice(0, STILL_MAX).map((task, i, shown) => (
                <TaskLine key={task.id} title={task.title} label={task.label} divider={i < shown.length - 1}
                  meta={[projectOf.get(task.id)?.project.title, ...taskMeta(task)]}
                  onPress={() => setPeek(task)} onHold={() => setHeld(task)} onMore={() => setPeek(task)} />
              ))}
            </ListCard>
          </>
        )}

        <HomeAsks taskCount={inbox.length + todayPicked.length} style={{ marginTop: 22 }} />
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <SlippingCheckIn tasks={watched} />
    </SafeAreaView>
  );
}
