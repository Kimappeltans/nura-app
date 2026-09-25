import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { search as searchTasks, type Task } from '../db';
import { type as T } from '../theme';
import { Mica, IconChevron } from '../ui';
import { useTaskActions } from '../useTaskActions';
import { TaskRow } from '../components/TaskRow';
import { TaskSheet } from '../components/TaskSheet';
import { RoomBar } from '../components/RoomBar';
import { SectionHead, ListCard } from '../components/ListCard';
import { SearchBar } from '../components/SearchField';
import { byPriority } from './Home';

type Filter = 'all' | 'today' | 'week' | 'projects' | 'later';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'projects', label: 'Projects' },
  { key: 'later', label: 'Later' },
];

/**
 * MY TASKS — what exists? Everything, in one place: Today, the projects and
 * their moves, the rest, and what you've put off for later. The backlog pass
 * and new habits live here too, as things you do to this list rather than
 * places of their own. Adding goes through Capture, like everywhere else.
 */
export default function Tasks({ onCapture }: { onCapture: () => void }) {
  const t = useTheme();
  const { inbox, todayPicked, projects, focusOn } = useStore();
  const { tick, addToToday } = useTaskActions();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [held, setHeld] = useState<Task | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => { const r = q.trim() ? await searchTasks(q) : []; if (!dead) setHits(r); })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  const projectOf = useMemo(() => new Map(
    projects.filter(p => p.current?.task_id).map(p => [p.current!.task_id!, p.project.title])), [projects]);

  const groups = useMemo(() => {
    const at = Date.now();
    const later = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
    const today = [...todayPicked].filter(x => !x.parent_id).sort(byPriority);
    const open = [...inbox].filter(x => !later(x)).sort(byPriority);
    const put = [...inbox].filter(later).sort((a, b) => (a.snoozed_until ?? 0) - (b.snoozed_until ?? 0));
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7); weekEnd.setHours(23, 59, 59, 999);
    const thisWeek = [...today, ...open].filter(x => x.due_at && x.due_at <= weekEnd.getTime())
      .sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
    return { today, open, put, thisWeek };
  }, [inbox, todayPicked]);

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });

  const list = (tasks: Task[], kind: 'today' | 'open' | 'later') => (
    <ListCard>
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} divider={i < tasks.length - 1}
          caption={projectOf.get(task.id)}
          onPress={() => (kind === 'today' ? focusOn(task.id) : open(task))}
          onHold={() => setHeld(task)}
          onTick={kind === 'today' ? () => tick(task.id) : undefined}
          onStart={kind === 'today' ? () => focusOn(task.id) : undefined}
          onAdd={kind === 'open' ? () => addToToday(task) : undefined}
          onMore={kind === 'later' ? () => setHeld(task) : undefined} />
      ))}
    </ListCard>
  );

  const empty = (text: string) => (
    <Text style={{ color: t.ink3, fontSize: 14.5, lineHeight: 20, paddingVertical: 12 }}>{text}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <RoomBar title="Everything" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 2, paddingBottom: 12 }}>
          <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 2, fontFamily: T.brand }}>ALL YOUR WORK</Text>
          <Text style={{ color: t.ink, fontSize: 25, lineHeight: 30, fontFamily: T.display, letterSpacing: -0.8, marginTop: 4 }}>My tasks</Text>
        </View>

        <SearchBar value={q} onChange={setQ} placeholder="Search tasks" />

        {q.trim() ? (
          <>
            <SectionHead label={`${hits.length} match${hits.length === 1 ? '' : 'es'}`} style={{ marginTop: 8 }} />
            {hits.length ? list(hits, 'open') : empty(`Nothing matches “${q}”.`)}
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
                <SectionHead label={`Today · ${groups.today.length}`} />
                {groups.today.length ? list(groups.today, 'today')
                  : empty('Nothing on Today yet. The + on a task puts it here.')}
              </>
            )}

            {filter === 'week' && (
              <>
                <SectionHead label={`Due this week · ${groups.thisWeek.length}`} />
                {groups.thisWeek.length ? list(groups.thisWeek, 'open') : empty('Nothing with a date in the next seven days.')}
              </>
            )}

            {(filter === 'all' || filter === 'projects') && (projects.length > 0 || filter === 'projects') && (
              <>
                <SectionHead label={`Projects · ${projects.length}`} action="Plan one" onAction={() => router.push('/project/new')} />
                {projects.length ? (
                  <ListCard>
                    {projects.map((p, i) => (
                      <Pressable key={p.project.id}
                        onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.project.id } })}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
                          borderBottomWidth: i < projects.length - 1 ? 1 : 0, borderBottomColor: t.stroke,
                          backgroundColor: pressed ? t.subtle : 'transparent',
                        })}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15 }}>{p.project.title}</Text>
                          <Text numberOfLines={1} style={{ color: t.ink3, fontSize: 12.5 }}>
                            {p.current ? `Now: ${p.current.title}` : 'No move chosen yet'} · {p.done} of {p.total}
                          </Text>
                        </View>
                        <IconChevron size={15} color={t.ink3} />
                      </Pressable>
                    ))}
                  </ListCard>
                ) : empty('Something bigger than a task? Nu turns it into a short path.')}
              </>
            )}

            {filter === 'all' && (
              <>
                <SectionHead label={`Everything else · ${groups.open.length}`} note="Hold to set priority" />
                {groups.open.length ? list(groups.open, 'open') : empty('Nothing else. That’s allowed.')}
              </>
            )}

            {(filter === 'all' || filter === 'later') && (groups.put.length > 0 || filter === 'later') && (
              <>
                <SectionHead label={`Later · ${groups.put.length}`} />
                {groups.put.length ? list(groups.put, 'later') : empty('Nothing put off.')}
              </>
            )}

            {/* things you do to the list, rather than places */}
            {filter === 'all' && (
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 24 }}>
                <Tool label="Backlog pass" sub="sort them in one go" onPress={() => router.push('/triage')} />
                <Tool label="New habit" sub="something to repeat" onPress={() => router.push('/habit')} />
              </View>
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

      <TaskSheet task={held} onClose={() => setHeld(null)} />
    </SafeAreaView>
  );
}

function Tool({ label, sub, onPress }: { label: string; sub: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({
      flex: 1, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: t.stroke,
      backgroundColor: pressed ? t.subtle : t.layer,
    })}>
      <Text style={{ color: t.ink, fontSize: 14.5, fontFamily: T.brand }}>{label}</Text>
      <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 2 }}>{sub}</Text>
    </Pressable>
  );
}
