import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../store';
import { search as searchTasks, type Task } from '../db';
import { whyLine } from '../priority';
import { type as T } from '../theme';
import { Mica, poseImage } from '../ui';
import { SearchBar } from '../components/SearchField';
import { NuGlow, NU_SIZE } from '../components/NuGlow';
import { useTaskActions } from '../useTaskActions';
import { NowCard } from '../components/NowCard';
import { TaskRow } from '../components/TaskRow';
import { TaskSheet } from '../components/TaskSheet';
import { RoomBar } from '../components/RoomBar';
import { SectionHead, ListCard } from '../components/ListCard';
import { SlippingCheckIn } from '../components/SlippingCheckIn';
import { HomeAsks } from '../components/HomeAsks';
import type { Tab } from '../components/TabBar';

/** High before Medium before Low before none; then the soonest date; then the oldest. */
export const byPriority = (a: Task, b: Task) =>
  (b.priority ?? 0) - (a.priority ?? 0)
  || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)
  || a.created_at - b.created_at;

/** How much of "everything else" Home shows before handing over to Your tasks. */
const ELSE_MAX = 5;

/**
 * HOME — what should I do now?
 *
 *   - put anything down (Capture — Nu takes it, whatever shape it is);
 *   - YOUR NEXT CLEAR STEP: one move, why it's this one, and Begin;
 *   - the rest of Today, and a few of everything else — all of it is in
 *     Your tasks, one tab over.
 *
 * LEGACY — the first three-room Home (search, Add anything + Nu, then the
 * next step). Replaced by the redesign; kept to restore.
 */
export default function Home({ onTab, onCapture }: { onTab: (t: Tab) => void; onCapture: () => void }) {
  const t = useTheme();
  const { inbox, todayPicked, projects, moveIds, now, nowRule, energy, focusOn, wins, profile } = useStore();
  const { tick, addToToday } = useTaskActions();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [held, setHeld] = useState<Task | null>(null);

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

  const todayRest = today.filter(x => x.id !== one?.id);
  const rest = useMemo(() => {
    const at = Date.now();
    const snoozed = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
    return [...inbox].filter(x => x.id !== one?.id)
      .sort((a, b) => Number(snoozed(a)) - Number(snoozed(b))
        || Number(moveIds.includes(b.id)) - Number(moveIds.includes(a.id)) || byPriority(a, b));
  }, [inbox, moveIds, one?.id]);
  const watched = useMemo(() => [...today, ...rest], [today, rest]);   // for the slipping check-in

  const doneToday = wins.filter(w => w.completed_at && w.completed_at >= new Date().setHours(0, 0, 0, 0)).length;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile.name || '').split(' ')[0];

  useEffect(() => {
    let dead = false;
    (async () => { const r = q.trim() ? await searchTasks(q) : []; if (!dead) setHits(r); })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <RoomBar />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={{ paddingTop: 2, paddingBottom: 14 }}>
          <Text style={{ color: t.ink, fontSize: 25, lineHeight: 30, fontFamily: T.display, letterSpacing: -0.8 }}>
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </Text>
          {doneToday > 0 && (
            <Text style={{ color: t.ink2, fontSize: 13.5, marginTop: 4 }}>{doneToday} done today.</Text>
          )}
        </View>

        <SearchBar value={q} onChange={setQ} placeholder="Search your tasks" />

        {q.trim() ? (
          <>
            <SectionHead label={`${hits.length} match${hits.length === 1 ? '' : 'es'}`} style={{ marginTop: 8 }} />
            {!hits.length
              ? <Text style={{ color: t.ink3, fontSize: 14.5, paddingVertical: 10 }}>Nothing matches “{q}”.</Text>
              : <ListCard>{hits.map((task, i) => (
                  <TaskRow key={task.id} task={task} divider={i < hits.length - 1}
                    onPress={() => open(task)} onHold={() => setHeld(task)} onMore={() => setHeld(task)} />
                ))}</ListCard>}
          </>
        ) : (
          <>
            {/* put anything down — Nu works out what it is */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, marginTop: NU_SIZE - 60, marginBottom: 20 }}>
              <Pressable onPress={onCapture} accessibilityRole="button" accessibilityLabel="Add anything"
                style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.9 : 1 })}>
                <View style={{ height: 60, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: t.strokeStrong }}>
                  <LinearGradient colors={t.key === 'nu' ? ['rgba(140,151,246,0.24)', 'rgba(140,151,246,0.10)'] : [t.card, t.layer]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12 }}>
                    <LinearGradient colors={t.nuBtn} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 18, lineHeight: 21, fontFamily: T.brand }}>+</Text>
                    </LinearGradient>
                    <Text style={{ color: t.ink2, fontSize: 15 }}>Add anything…</Text>
                  </LinearGradient>
                </View>
              </Pressable>
              <Pressable onPress={onCapture} accessibilityRole="button" accessibilityLabel="Tell Nu"
                style={({ pressed }) => ({
                  width: 74, height: 60, borderRadius: 15, alignItems: 'center', justifyContent: 'flex-end',
                  overflow: 'visible', borderWidth: 1, borderColor: t.strokeStrong,
                  backgroundColor: pressed ? t.subtle : t.nuTile ?? (t.key === 'nu' ? '#1C2550' : t.layer),
                })}>
                {/* Nu stands up out of his tile */}
                <NuGlow size={NU_SIZE}>
                  <Image source={poseImage('nu-listen')} style={{ width: NU_SIZE, height: NU_SIZE }} resizeMode="contain" />
                </NuGlow>
              </Pressable>
            </View>

            <NowCard task={one} why={why} from={oneProject?.project.title}
              onBegin={() => one && focusOn(one.id)} onOpen={() => one && open(one)}
              onAnother={() => onTab('tasks')} onPlan={() => router.push('/project/new')} />

            {todayRest.length > 0 && (
              <>
                <SectionHead label={`Today · ${todayRest.length}`} action="See all" onAction={() => onTab('tasks')} />
                <ListCard>
                  {todayRest.map((task, i) => (
                    <TaskRow key={task.id} task={task} divider={i < todayRest.length - 1}
                      caption={projectOf.get(task.id)?.project.title}
                      onPress={() => focusOn(task.id)} onHold={() => setHeld(task)}
                      onTick={() => tick(task.id)} onMore={() => setHeld(task)} />
                  ))}
                </ListCard>
              </>
            )}

            {rest.length > 0 && (
              <>
                <SectionHead label={`Everything else · ${rest.length}`} note="Hold to set priority" />
                <ListCard>
                  {rest.slice(0, ELSE_MAX).map((task, i, all) => (
                    <TaskRow key={task.id} task={task} divider={i < all.length - 1}
                      caption={projectOf.get(task.id)?.project.title}
                      onPress={() => open(task)} onHold={() => setHeld(task)} onAdd={() => addToToday(task)} />
                  ))}
                </ListCard>
                {rest.length > ELSE_MAX && (
                  <Pressable onPress={() => onTab('tasks')} hitSlop={6} style={{ paddingTop: 12, alignSelf: 'flex-start' }}>
                    <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>All {rest.length} in Your tasks ›</Text>
                  </Pressable>
                )}
              </>
            )}

            <HomeAsks taskCount={inbox.length + todayPicked.length} style={{ marginTop: 22 }} />
          </>
        )}
      </ScrollView>

      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <SlippingCheckIn tasks={watched} paused={!!q.trim()} />
    </SafeAreaView>
  );
}
