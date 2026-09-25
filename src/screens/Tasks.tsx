import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { search as searchTasks, type Task } from '../db';
import { type as T } from '../theme';
import { Mica, poseImage } from '../ui';
import { useTaskActions } from '../useTaskActions';
import { TaskLine, taskMeta } from '../components/TaskLine';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { RoomBar } from '../components/RoomBar';
import { SectionHead, ListCard } from '../components/ListCard';
import { SearchBar } from '../components/SearchField';
import { NuGlow, NU_SIZE } from '../components/NuGlow';
import { byPriority } from './Home';

type Filter = 'all' | 'today' | 'week' | 'projects' | 'later';

/** How many Nu lifts out as needing attention — more than three is a list again. */
const ATTENTION_MAX = 3;

/**
 * YOUR TASKS — what exists? Nothing hidden, and nothing decided twice.
 *
 * Nu sorts before you look: what needs attention today (what the engine
 * would hand you, anything high priority, anything due by tonight) is lifted
 * out on its own, with a way straight in; the rest of Today is under it;
 * projects run along a strip with how far along they are; everything else
 * sits quietly at the bottom. The backlog pass is "Sort", on Today.
 * (The earlier list version is src/legacy/Tasks.tsx.)
 */
export default function Tasks({ onCapture }: { onCapture: () => void }) {
  const t = useTheme();
  const { inbox, todayPicked, projects, now, focusOn } = useStore();
  const { addToToday } = useTaskActions();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [held, setHeld] = useState<Task | null>(null);     // the actions (long press)
  const [peek, setPeek] = useState<Task | null>(null);     // the task sheet (tap)

  useEffect(() => {
    let dead = false;
    (async () => { const r = q.trim() ? await searchTasks(q) : []; if (!dead) setHits(r); })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  const projectOf = useMemo(() => new Map(
    projects.filter(p => p.current?.task_id).map(p => [p.current!.task_id!, p.project.title])), [projects]);

  const sorted = useMemo(() => {
    const at = Date.now();
    const tonight = new Date().setHours(23, 59, 59, 999);
    const weekEnd = tonight + 7 * 86400_000;
    const today = [...todayPicked].filter(x => !x.parent_id).sort(byPriority);
    const open = [...inbox].sort(byPriority);
    const pressing = (x: Task) => x.id === now?.id || (x.priority ?? 0) >= 3 || (!!x.due_at && x.due_at <= tonight);
    // Nu's sort: the engine's pick first, then what's due, then what's marked high
    const attention = [...today, ...open.filter(x => !!x.due_at && x.due_at <= tonight)]
      .filter(pressing)
      .sort((a, b) => Number(b.id === now?.id) - Number(a.id === now?.id)
        || (a.due_at ?? 9e15) - (b.due_at ?? 9e15) || byPriority(a, b))
      .slice(0, ATTENTION_MAX);
    const lifted = new Set(attention.map(x => x.id));
    const todayMore = today.filter(x => !lifted.has(x.id));
    const later = open.filter(x => !lifted.has(x.id))
      .sort((a, b) => Number(!!a.snoozed_until && a.snoozed_until > at) - Number(!!b.snoozed_until && b.snoozed_until > at));
    const week = [...today, ...open].filter(x => !!x.due_at && x.due_at <= weekEnd)
      .sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
    return { attention, todayMore, later, week, todayCount: today.length + open.filter(x => !!x.due_at && x.due_at <= tonight).length };
  }, [inbox, todayPicked, now?.id]);

  const total = inbox.length + todayPicked.length;
  const quiet = total - sorted.attention.length;

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });
  const line = (task: Task, i: number, all: Task[], kind: 'start' | 'more' | 'add') => (
    <TaskLine key={task.id} title={task.title} divider={i < all.length - 1}
      meta={[projectOf.get(task.id), ...taskMeta(task)]}
      dim={!!task.snoozed_until && task.snoozed_until > Date.now()}
      onPress={() => setPeek(task)} onHold={() => setHeld(task)}
      onStart={kind === 'start' ? () => focusOn(task.id) : undefined}
      onMore={kind === 'more' ? () => setPeek(task) : undefined}
      onAdd={kind === 'add' ? () => addToToday(task) : undefined} />
  );
  const empty = (text: string) => (
    <Text style={{ color: t.ink3, fontSize: 14, lineHeight: 20, paddingVertical: 10 }}>{text}</Text>
  );

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'today', label: `Today · ${sorted.todayCount}` },
    { key: 'week', label: `This week · ${sorted.week.length}` },
    { key: 'projects', label: `Projects · ${projects.length}` },
    { key: 'later', label: `Later · ${sorted.later.length}` },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <RoomBar />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 2, paddingBottom: 14 }}>
          <Text style={{ color: t.ink, fontSize: 26, lineHeight: 31, fontFamily: T.display, letterSpacing: -0.9 }}>Your tasks</Text>
        </View>

        {/* Nu has sorted before you look */}
        {total > 0 && (
          <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: t.stroke, marginBottom: 12 }}>
            <LinearGradient colors={t.key === 'nu' ? ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.04)'] : [t.card, t.layer]}
              start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <NuGlow size={NU_SIZE}><Image source={poseImage('nu-listen')} style={{ width: NU_SIZE, height: NU_SIZE }} resizeMode="contain" /></NuGlow>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 14.5, fontFamily: T.display }}>
                  {sorted.attention.length ? 'I sorted the noise.' : 'Nothing needs you today.'}
                </Text>
                <Text style={{ color: t.ink2, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                  {sorted.attention.length
                    ? `${sorted.attention.length === 1 ? 'One thing needs' : `${sorted.attention.length} things need`} attention today.${quiet > 0 ? ` The other ${quiet} can stay out of your way.` : ''}`
                    : 'Everything here can wait its turn.'}
                </Text>
              </View>
            </View>
          </View>
        )}

        <SearchBar value={q} onChange={setQ} placeholder="Search tasks and projects" />

        {q.trim() ? (
          <>
            <SectionHead label={`${hits.length} match${hits.length === 1 ? '' : 'es'}`} style={{ marginTop: 8 }} />
            {hits.length ? <ListCard>{hits.map((x, i, all) => line(x, i, all, 'more'))}</ListCard> : empty(`Nothing matches “${q}”.`)}
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }}
              contentContainerStyle={{ paddingHorizontal: 18, gap: 7 }}>
              {FILTERS.map(f => {
                const on = f.key === filter;
                return (
                  <Pressable key={f.key} onPress={() => { Haptics.selectionAsync(); setFilter(f.key); }}
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{
                      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                      borderColor: on ? t.nu : t.strokeStrong, backgroundColor: on ? t.nuWash : t.layer,
                    }}>
                    <Text style={{ color: on ? t.ink : t.ink2, fontSize: 13, fontFamily: T.brand }}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {(filter === 'all' || filter === 'today') && (
              <>
                {sorted.attention.length > 0 && <SectionHead label={`Needs attention · ${sorted.attention.length}`} />}
                {sorted.attention.length > 0 && (
                  <View style={{ borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,140,93,0.28)', overflow: 'hidden' }}>
                    <LinearGradient colors={t.key === 'nu' ? ['rgba(255,150,100,0.10)', 'rgba(255,255,255,0.03)'] : [t.card, t.layer]}
                      start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
                    <View style={{ paddingHorizontal: 14 }}>
                      {sorted.attention.map((x, i, all) => line(x, i, all, 'start'))}
                    </View>
                  </View>
                )}

                {sorted.todayMore.length > 0 && (
                  <>
                    <SectionHead label={`Today · ${sorted.todayMore.length} more`} action="Sort" onAction={() => router.push('/triage')} />
                    <ListCard>{sorted.todayMore.map((x, i, all) => line(x, i, all, 'more'))}</ListCard>
                  </>
                )}
              </>
            )}

            {filter === 'week' && (
              <>
                <SectionHead label={`Due this week · ${sorted.week.length}`} />
                {sorted.week.length ? <ListCard>{sorted.week.map((x, i, all) => line(x, i, all, 'more'))}</ListCard>
                  : empty('Nothing this week.')}
              </>
            )}

            {(filter === 'projects' || (filter === 'all' && projects.length > 0)) && (
              <>
                <SectionHead label={`Projects · ${projects.length}`} action="Plan one" onAction={() => router.push('/project/new')} />
                {projects.length ? (
                  <ScrollView horizontal={filter === 'all'} showsHorizontalScrollIndicator={false}
                    style={filter === 'all' ? { marginHorizontal: -18 } : undefined}
                    contentContainerStyle={filter === 'all' ? { paddingHorizontal: 18, gap: 9 } : { gap: 9 }}>
                    {projects.map((p, i) => {
                      const pct = p.total ? p.done / p.total : 0;
                      return (
                        <Pressable key={p.project.id}
                          onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.project.id } })}
                          style={({ pressed }) => ({
                            width: filter === 'all' ? 176 : undefined, padding: 13, borderRadius: 15,
                            borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.layer,
                          })}>
                          <Text numberOfLines={1} style={{ color: t.ink, fontSize: 14, fontFamily: T.brand }}>{p.project.title}</Text>
                          <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 12, marginTop: 3 }}>
                            {`${p.total - p.done} next move${p.total - p.done === 1 ? '' : 's'} · ${p.total} total`}
                          </Text>
                          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, marginTop: 11, overflow: 'hidden' }}>
                            <View style={{ width: `${Math.max(4, pct * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: i % 2 ? t.ra : t.nu }} />
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </>
            )}

            {(filter === 'all' || filter === 'later') && (
              <>
                {(sorted.later.length > 0 || filter === 'later') && <SectionHead label={`Later · ${sorted.later.length}`} />}
                {sorted.later.length > 0 && <ListCard>{sorted.later.map((x, i, all) => line(x, i, all, 'add'))}</ListCard>}
                <Pressable onPress={() => router.push('/habit')} hitSlop={6} style={{ paddingTop: 16, alignSelf: 'flex-start' }}>
                  <Text style={{ color: t.nu, fontSize: 14, fontFamily: T.brand }}>New habit ›</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* add — Capture, like everywhere else */}
      <Pressable onPress={onCapture} accessibilityRole="button" accessibilityLabel="Add a task"
        style={({ pressed }) => ({ position: 'absolute', right: 18, bottom: 16, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{
          width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#FF6B35', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
        }}>
          <Text style={{ color: t.onRa, fontSize: 28, lineHeight: 31, fontFamily: T.brand }}>+</Text>
        </LinearGradient>
      </Pressable>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
    </SafeAreaView>
  );
}
