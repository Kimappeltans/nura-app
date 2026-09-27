import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, useWindowDimensions, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { useStore, useTheme } from '../store';
import { toggleHabitToday, pauseHabit, resumeHabit, letGoHabit, type Task } from '../db';
import type { HabitView } from '../habits';
import { HabitRow } from '../components/HabitRow';
import { HabitSheet } from '../components/HabitSheet';
import { TaskPeek } from '../components/TaskPeek';
import { TaskSheet } from '../components/TaskSheet';
import { byPlan } from '../next';
import { byPriority } from '../screens/Home';
import { type as T } from '../theme';
import { Mica, Character } from '../ui';
import { useTaskActions } from '../useTaskActions';
import { announce, decorative } from '../a11y';
import {
  DeskCard, DeskHeader, DeskRow, AddRow, Label, LinkButton, Empty, Key, columns, moveTo, addTo, useDeskTokens, usePageKeys,
  COL_NAME, CORAL, sameDay, type Col,
} from './kit';

const ORDER: Col[] = ['today', 'week', 'someday'];

/**
 * TASKS, ON THE DESKTOP. Everything Nu is holding, in the water: Today, This
 * week and Someday side by side, Nu floating on the surface above them.
 * Under the pointer a task shows where else it could go; J and K pick one,
 * X ticks it off, T, W and S send it. Habits and projects sit under the water.
 */
export default function DeskTasks() {
  const t = useTheme();
  const k = useDeskTokens();
  const { height: winH } = useWindowDimensions();
  const { inbox, todayPicked, projects, habits, refreshHabits, decisions } = useStore();
  const { tick } = useTaskActions();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [peek, setPeek] = useState<Task | null>(null);
  const [held, setHeld] = useState<Task | null>(null);
  const [habit, setHabit] = useState<HabitView | null>(null);

  const order = useMemo(() => byPlan(decisions, byPriority), [decisions]);
  const all = useMemo(() => columns(inbox, todayPicked, order), [inbox, todayPicked, order]);
  const cols = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    const f = (xs: Task[]) => xs.filter(x => x.title.toLowerCase().includes(s));
    return { today: f(all.today), week: f(all.week), someday: f(all.someday) };
  }, [all, q]);
  const projectOf = useMemo(() => new Map(
    projects.filter(p => p.current?.task_id).map(p => [p.current!.task_id!, p.project.title])), [projects]);

  const move = async (x: Task, c: Col) => {
    await moveTo(x, c);
    announce(`Moved to ${COL_NAME[c]}`);
  };

  // the keys: J K (or the arrows) pick, X ticks, T W S send, Enter opens, Escape lets go
  const flat = ORDER.flatMap(c => cols[c].map(x => ({ x, c })));
  usePageKeys(e => {
    const key = e.key.toLowerCase();
    const i = flat.findIndex(r => r.x.id === sel);
    if (key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setSel(flat[Math.min(flat.length - 1, i + 1)]?.x.id ?? null); return; }
    if (key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setSel(flat[Math.max(0, i - 1)]?.x.id ?? null); return; }
    const cur = flat[i];
    if (e.key === 'Escape') { setSel(null); return; }
    if (!cur) return;
    if (key === 'x') { tick(cur.x.id); return; }
    if (e.key === 'Enter') { setPeek(cur.x); return; }
    const dest = ({ t: 'today', w: 'week', s: 'someday' } as Record<string, Col>)[key];
    if (dest && dest !== cur.c) move(cur.x, dest);
  });

  const habitDo = (fn: (id: string) => Promise<unknown>) => async (v: HabitView) => { await fn(v.habit.id); await refreshHabits(); };
  const tickHabit = habitDo(toggleHabitToday);

  const lane = (c: Col) => (
    <View key={c} style={{ flex: 1, minWidth: 0, minHeight: 240, borderRadius: 16, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6, backgroundColor: k.lane }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <Label color={k.seaInk}>{COL_NAME[c]}</Label>
        <Text style={{ color: k.seaInk, fontSize: 14, fontFamily: T.brand }}>{cols[c].length}</Text>
      </View>
      {cols[c].map(x => (
        <DeskRow key={x.id} task={x} col={c} selected={sel === x.id} hideDue={c === 'today' && !x.has_time && sameDay(x.due_at, Date.now())} meta={projectOf.get(x.id)}
          onOpen={() => { setSel(x.id); setPeek(x); }} onHold={() => setHeld(x)} onDone={() => tick(x.id)} onMove={to => move(x, to)} />
      ))}
      {!cols[c].length && (
        c === 'today' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: k.seaInk, fontSize: 16, lineHeight: 24, fontFamily: T.brand }}>{q ? 'Nothing here.' : 'Nothing picked yet. Select one and press '}</Text>
            {!q && <><Key k="T" /><Text style={{ color: k.seaInk, fontSize: 16, fontFamily: T.brand }}>.</Text></>}
          </View>
        ) : <Empty color={k.seaInk}>{q ? 'Nothing here.' : c === 'week' ? 'Nothing planned this week.' : 'Ideas and maybes live here.'}</Empty>
      )}
      {!q && <AddRow placeholder="Add a task…" ink={k.seaInk} onAdd={v => addTo(v, c)} />}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Mica />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexGrow: 1, width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 40, paddingBottom: 28 }}>
          <DeskHeader title="Tasks">
            <View style={{
              marginLeft: 10, width: 280, height: 46, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
              backgroundColor: k.field, borderWidth: 1, borderColor: t.stroke,
            }}>
              <View {...decorative}>
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={t.ink3} strokeWidth={1.8} strokeLinecap="round">
                  <Circle cx={11} cy={11} r={6.5} /><Path d="m20 20-4.2-4.2" />
                </Svg>
              </View>
              <TextInput value={q} onChangeText={setQ} placeholder="Search tasks" placeholderTextColor={t.ink3} accessibilityLabel="Search tasks"
                onKeyPress={e => { if ((e.nativeEvent as { key: string }).key === 'Escape') setQ(''); }}
                style={{ flex: 1, minWidth: 0, color: t.ink, fontSize: 16.5, fontFamily: T.brand, outlineStyle: 'none' } as unknown as TextStyle} />
            </View>
          </DeskHeader>

          <View style={{ minHeight: winH - 124 }}>
            {/* the water: Nu on the surface, everything held under it */}
            <View style={{ flex: 1, marginTop: 96, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingTop: 22, paddingHorizontal: 22, paddingBottom: 18 }}>
              <LinearGradient pointerEvents="none" colors={k.sea} locations={[0, 0.4, 1]}
                style={{ position: 'absolute', inset: 0, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }} />
              <View {...decorative} style={{ position: 'absolute', left: 0, right: 0, top: -27, height: 28 }}>
                <Wave fill={k.sea[0]} line={k.seaLine} />
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', top: -122, left: 40 }}>
                <Character name="nu-rest" size={150} motion="bob" />
              </View>
              <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
                {ORDER.map(lane)}
              </View>
            </View>

            {/* under the water: habits and projects */}
            <View style={{ flexDirection: 'row', gap: 20, marginTop: 20, alignItems: 'flex-start' }}>
              <DeskCard style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 24 }}>
                  <Label>{habits.length ? `Habits · ${habits.length}` : 'Habits'}</Label>
                  <LinkButton label="+ New habit" accessibilityLabel="New habit" onPress={() => router.push('/habit')} />
                </View>
                {habits.map(v => <HabitRow key={v.habit.id} view={v} onPress={() => setHabit(v)} onTick={() => tickHabit(v)} />)}
                {!habits.length && <Empty>No habits yet.</Empty>}
              </DeskCard>
              <DeskCard style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 24 }}>
                  <Label>{projects.length ? `Projects · ${projects.length}` : 'Projects'}</Label>
                  <LinkButton label="+ Plan a project" accessibilityLabel="Plan a project" onPress={() => router.push('/project/new')} />
                </View>
                {projects.map(p => (
                  <ProjectRow key={p.project.id} title={p.project.title} total={p.total} done={p.done}
                    onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.project.id } })} />
                ))}
                {!projects.length && <Text style={{ color: t.ink, fontSize: 18, fontFamily: T.display, paddingVertical: 8 }}>Break a big goal into steps.</Text>}
              </DeskCard>
            </View>

            <View {...decorative} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
              <Key k="J" /><Key k="K" /><Hint> select · </Hint><Key k="X" /><Hint> complete · </Hint>
              <Key k="T" /><Key k="W" /><Key k="S" /><Hint> send to Today, This week or Someday</Hint>
            </View>
          </View>
        </View>
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <HabitSheet view={habit} onClose={() => setHabit(null)} onTick={tickHabit}
        onPause={habitDo(pauseHabit)} onResume={habitDo(resumeHabit)} onLetGo={habitDo(letGoHabit)} />
    </View>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.ink3, fontSize: 14, fontFamily: T.brand }}>{children}</Text>;
}

/** The surface: a soft wave across the top of the water. */
function Wave({ fill, line }: { fill: string; line: string }) {
  let d = 'M0 14';
  for (let x = 0; x < 1000; x += 50) d += ` Q${x + 12.5} ${x % 100 ? 22 : 6} ${x + 25} 14 T${x + 50} 14`;
  return (
    <Svg width="100%" height={28} viewBox="0 0 1000 28" preserveAspectRatio="none">
      <Path d={`${d} V28 H0Z`} fill={fill} />
      <Path d={d} fill="none" stroke={line} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}

/** A project: its path as dots lit by the moves done, its name, how many are left. */
function ProjectRow({ title, total, done, onPress }: { title: string; total: number; done: number; onPress: () => void }) {
  const t = useTheme();
  const k = useDeskTokens();
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      accessibilityRole="button" accessibilityLabel={`${title}, ${total - done} left`}
      style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: hover ? k.wash : 'transparent' }}>
      <View {...decorative} style={{ width: 30, flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
        {Array.from({ length: Math.min(total, 6) }, (_, i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i < done ? CORAL : 'transparent', borderWidth: 1.2, borderColor: i < done ? CORAL : t.strokeStrong }} />
        ))}
      </View>
      <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 16.5, fontFamily: T.brand, letterSpacing: -0.2 }}>{title}</Text>
      <Text style={{ color: t.ink, fontSize: 21, letterSpacing: -0.9, fontFamily: T.displayLight }}>
        {total - done}<Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 0, fontFamily: T.brand }}> left</Text>
      </Text>
    </Pressable>
  );
}
