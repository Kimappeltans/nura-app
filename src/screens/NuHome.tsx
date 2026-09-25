import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../store';
import { search as searchTasks, type Task } from '../db';
import { type as T } from '../theme';
import { Mica, Surface, Character, IconCalendar, IconSearch } from '../ui';
import { useTaskActions } from '../useTaskActions';
import { HomeScene } from '../components/HomeScene';
import { OneThing } from '../components/OneThing';
import { TaskRow, SectionRule } from '../components/TaskRow';
import { TaskSheet } from '../components/TaskSheet';
import { AppMenu } from '../components/AppMenu';
import { IconButton, MenuGlyph } from '../components/IconButton';
import { SearchField } from '../components/SearchField';
import { SlippingCheckIn } from '../components/SlippingCheckIn';
import { HomeAsks } from '../components/HomeAsks';

/** High before Medium before Low before none; then the soonest date; then the oldest. */
const byPriority = (a: Task, b: Task) =>
  (b.priority ?? 0) - (a.priority ?? 0)
  || (a.due_at ?? 9e15) - (b.due_at ?? 9e15)
  || a.created_at - b.created_at;

/**
 * NU, as a place: the sea where everything is held, and the one thing to
 * begin, lit by Ra's path across it.
 *
 *   - the scene (HomeScene): Nu in the water, Ra on a rock, the light between;
 *   - ONE THING TO BEGIN (OneThing): what you chose, the top of your Today,
 *     or a project's next move — with "Begin with Ra";
 *   - EVERYTHING ELSE: the rest of Today, your projects' moves and the plain
 *     list, quiet, underneath;
 *   - Add anything, where the thumb is.
 *
 * This screen is layout; what a task can do lives in useTaskActions and the
 * shared components. The earlier home (Nu.tsx) uses the same pieces and is
 * kept: index.tsx picks one.
 */
export default function NuHome() {
  const t = useTheme();
  const { inbox, todayPicked, projects, moveIds, now, focusOn, wins, profile } = useStore();
  const { tick, addToToday } = useTaskActions();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [searching, setSearching] = useState(false);
  const [held, setHeld] = useState<Task | null>(null);       // the long-press sheet
  const [nav, setNav] = useState(false);                     // the menu

  const today = useMemo(() => [...todayPicked].filter(x => !x.parent_id).sort(byPriority), [todayPicked]);
  const projectOf = useMemo(() => new Map(
    projects.filter(p => p.current?.task_id).map(p => [p.current!.task_id!, p])), [projects]);

  // the one thing: what you chose or the top of Today (store.now), else a
  // project's next move
  const one: Task | null = useMemo(() => {
    if (now) return now;
    const p = projects.find(x => x.current?.task_id);
    return p ? inbox.find(x => x.id === p.current!.task_id) ?? null : null;
  }, [now, projects, inbox]);
  const oneProject = one ? projectOf.get(one.id) : undefined;
  const oneFrom = oneProject ? oneProject.project.title
    : one && (one.state === 'today' || one.state === 'doing') ? 'From your Today' : one ? 'Your pick' : null;

  // everything else: the rest of Today, then projects' moves, then the rest
  const todayRest = today.filter(x => x.id !== one?.id);
  const moves = projects
    .filter(p => p.current?.task_id && p.current.task_id !== one?.id)
    .map(p => ({ p, task: [...inbox, ...todayPicked].find(x => x.id === p.current!.task_id) }))
    .filter((m): m is { p: typeof m.p; task: Task } => !!m.task);
  const rest = useMemo(() => {
    const at = Date.now();
    const snoozed = (x: Task) => !!x.snoozed_until && x.snoozed_until > at;
    return [...inbox].filter(x => !moveIds.includes(x.id) && x.id !== one?.id)
      .sort((a, b) => Number(snoozed(a)) - Number(snoozed(b)) || byPriority(a, b));
  }, [inbox, moveIds, one?.id]);
  const elseCount = todayRest.length + moves.length + rest.length;
  const watched = useMemo(() => [...today, ...rest], [today, rest]);   // for the slipping check-in

  const doneToday = wins.filter(w => w.completed_at && w.completed_at >= new Date().setHours(0, 0, 0, 0)).length;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile.name || '').split(' ')[0];
  const date = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  useEffect(() => {
    let dead = false;
    (async () => { const r = q.trim() ? await searchTasks(q) : []; if (!dead) setHits(r); })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  const open = (task: Task) => router.push({ pathname: '/task/[id]', params: { id: task.id } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />

      {/* the date, and the tools: calendar, search, the menu */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4 }}>
        {searching ? (
          <SearchField value={q} onChange={setQ} onCancel={() => setSearching(false)} />
        ) : (
          <>
            <IconButton label="Calendar" onPress={() => router.push('/calendar')}><IconCalendar size={21} color={t.ink} /></IconButton>
            <Text style={{ flex: 1, color: t.ink2, fontSize: 15 }}>{date}</Text>
            <IconButton label="Search" onPress={() => setSearching(true)}><IconSearch size={21} color={t.ink} /></IconButton>
            <IconButton label="Menu" onPress={() => setNav(true)}><MenuGlyph /></IconButton>
          </>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {q.trim() ? (
          <View style={{ marginTop: 12 }}>
            <SectionRule title={`${hits.length} match${hits.length === 1 ? '' : 'es'}`} />
            {!hits.length
              ? <Text style={{ color: t.ink3, fontSize: 14.5, paddingVertical: 14 }}>Nothing matches “{q}”.</Text>
              : hits.map(task => <TaskRow key={task.id} task={task} onPress={() => open(task)} onHold={() => setHeld(task)} />)}
          </View>
        ) : (
          <>
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: t.ink, fontSize: 27, lineHeight: 33, fontFamily: T.display, letterSpacing: -0.7 }}>
                {greeting}{firstName ? `, ${firstName}` : ''}.
              </Text>
              <Pressable onPress={() => router.push('/tide')} hitSlop={6}>
                <Text style={{ color: t.ink2, fontSize: 14, marginTop: 3 }}>
                  {doneToday ? `${doneToday} done today · ` : ''}<Text style={{ color: t.nu, fontFamily: T.brand }}>Your day ›</Text>
                </Text>
              </Pressable>
            </View>

            {/* Nu's water, and Ra's path across it */}
            <View style={{ marginHorizontal: -18, marginTop: 4 }}>
              <HomeScene />
            </View>

            <View style={{ marginTop: -8 }}>
              <OneThing task={one} from={oneFrom}
                onBegin={() => one && focusOn(one.id)} onOpen={() => one && open(one)}
                onPlan={() => router.push('/project/new')} />
            </View>

            {/* everything else, quiet */}
            {elseCount > 0 && (
              <View style={{ marginTop: 34 }}>
                <SectionRule title="Everything else" count={elseCount} />
                {todayRest.map(task => (
                  <TaskRow key={task.id} task={task} caption="Today" onPress={() => focusOn(task.id)}
                    onHold={() => setHeld(task)} onTick={() => tick(task.id)} />
                ))}
                {moves.map(({ p, task }) => (
                  <TaskRow key={task.id} task={task} caption={p.project.title} onPress={() => focusOn(task.id)}
                    onHold={() => setHeld(task)} />
                ))}
                {rest.map(task => (
                  <TaskRow key={task.id} task={task} onPress={() => open(task)}
                    onHold={() => setHeld(task)} onAdd={() => addToToday(task)} />
                ))}
                <Pressable onPress={() => router.push('/project/new')} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16 }}>
                  <Character name="nu-thinking" size={26} motion="none" />
                  <Text style={{ color: t.ink2, fontSize: 14 }}>
                    Something bigger? <Text style={{ color: t.nu, fontFamily: T.brand }}>Plan it with Nu ›</Text>
                  </Text>
                </Pressable>
              </View>
            )}

            <HomeAsks taskCount={inbox.length + todayPicked.length} style={{ marginTop: 22 }} />
          </>
        )}
      </ScrollView>

      {/* add anything, where the thumb is */}
      {!searching && (
        <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 8 }}>
          <Pressable onPress={() => router.push('/compose')} accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
            <Surface>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, gap: 14 }}>
                <LinearGradient colors={t.nuBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 21, lineHeight: 24, fontFamily: T.brand }}>+</Text>
                </LinearGradient>
                <Text style={{ flex: 1, color: t.ink3, fontSize: 15.5 }}>Add anything…</Text>
              </View>
            </Surface>
          </Pressable>
        </View>
      )}

      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <AppMenu visible={nav} onClose={() => setNav(false)} />
      <SlippingCheckIn tasks={watched} paused={!!q.trim()} />
    </SafeAreaView>
  );
}
