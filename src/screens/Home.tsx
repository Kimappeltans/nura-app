import { useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../store';
import type { Task } from '../db';
import { type as T } from '../theme';
import { Mica } from '../ui';
import { NuHolds, Stones } from '../components/NuHolds';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { RoomBar } from '../components/RoomBar';
import { SectionHead } from '../components/ListCard';
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
export default function Home({ onTab }: { onTab: (t: Tab) => void }) {
  const t = useTheme();
  const { inbox, todayPicked, projects, now, focusOn, wins, profile } = useStore();
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
  // Choose another: what you picked instead, until it's begun or gone
  const [choosing, setChoosing] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = pickedId ? [...today, ...inbox].find(x => x.id === pickedId) ?? null : null;
  const held_ = picked ?? one;
  const oneProject = held_ ? projectOf.get(held_.id) : undefined;

  // still here: the rest of Today, then everything else
  const still = useMemo(() => {
    const at = Date.now();
    const later = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
    const rest = [...inbox].filter(x => !later(x)).sort(byPriority);
    return [...today, ...rest].filter(x => x.id !== held_?.id);
  }, [today, inbox, held_?.id]);
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

        {/* Nu holds it: the one thing, Begin, or Choose another */}
        <NuHolds task={held_} from={oneProject?.project.title} yours={!!picked} choosing={choosing} others={still.slice(0, 4)}
          onBegin={() => { if (held_) { setChoosing(false); setPickedId(null); focusOn(held_.id); } }}
          onOpen={() => held_ && setPeek(held_)}
          onChoose={() => setChoosing(c => !c)}
          onPick={x => { setPickedId(x.id); setChoosing(false); }}
          onPlan={() => router.push('/project/new')} />

        {/* the rest of what Nu is holding */}
        {still.length > 0 && !choosing && (
          <>
            <SectionHead label={`Nu is holding · ${still.length}`} action="See all" onAction={() => onTab('tasks')} />
            <Stones tasks={still.slice(0, STILL_MAX)} onPress={setPeek} onHold={setHeld} />
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
