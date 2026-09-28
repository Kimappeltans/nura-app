import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, type TextStyle } from 'react-native';
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
  DeskCard, DeskHeader, DeskRow, AddRow, Label, LinkButton, Empty, Key, columns, moveTo, addTo, deleteTask, useDeskTokens, usePageKeys, useRoom,
  COL_NAME, CORAL, sameDay, type Col,
} from './kit';
import { reasonFor } from '../next';

const ORDER: Col[] = ['today', 'week', 'someday'];

/**
 * TASKS, ON THE DESKTOP. Everything Nu is holding, as one list in the water:
 * Today, This week and Someday, Nu floating on the surface above it. Under
 * the pointer a task shows where else it could go and a bin; J and K pick
 * one, X ticks it off, T, W and S send it, Delete deletes it (with Undo).
 * With nothing on Today, Nu says which one it would start with, and why.
 * Habits and projects sit beside the water on a wide window, under it on a
 * narrower one.
 */
export default function DeskTasks() {
  const t = useTheme();
  const k = useDeskTokens();
  const { inbox, todayPicked, projects, habits, refreshHabits, decisions } = useStore();
  const { pad, inner } = useRoom();
  // habits and projects beside the list when there's room for both
  const side = inner >= 900;
  const { tick } = useTaskActions();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
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
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setSel(flat[i + 1]?.x.id ?? flat[i - 1]?.x.id ?? null); deleteTask(cur.x); return; }
    if (e.key === 'Enter') { setPeek(cur.x); return; }
    const dest = ({ t: 'today', w: 'week', s: 'someday' } as Record<string, Col>)[key];
    if (dest && dest !== cur.c) move(cur.x, dest);
  });

  const habitDo = (fn: (id: string) => Promise<unknown>) => async (v: HabitView) => { await fn(v.habit.id); await refreshHabits(); };
  const tickHabit = habitDo(toggleHabitToday);

  // with nothing on Today, the one Nu would start with (the planner's first), and why
  const idea = !all.today.length ? decisions.find(d => d.task.state !== 'done') ?? null : null;
  const ideaWhy = idea ? reasonFor(decisions, idea.taskId) : null;

  const section = (c: Col, i: number) => (
    <View key={c} style={{ paddingTop: i ? 14 : 4, marginTop: i ? 10 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: t.stroke }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
        <Label color={k.seaInk}>{COL_NAME[c]}</Label>
        <Text style={{ color: t.ink3, fontSize: 14, fontFamily: T.brand }}>{cols[c].length}</Text>
      </View>
      {cols[c].map(x => (
        <DeskRow key={x.id} task={x} col={c} selected={sel === x.id} hideDue={c === 'today' && !x.has_time && sameDay(x.due_at, Date.now())} meta={projectOf.get(x.id)}
          onOpen={() => { setSel(x.id); setPeek(x); }} onHold={() => setHeld(x)} onDone={() => tick(x.id)} onMove={to => move(x, to)}
          onDelete={() => deleteTask(x)} />
      ))}
      {!cols[c].length && c === 'today' && !q && idea && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.raWash }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: k.raText, fontSize: 13, fontFamily: T.display }}>Nu would start with</Text>
            <Text numberOfLines={1} style={{ color: t.ink, fontSize: 17, fontFamily: T.display, letterSpacing: -0.3, marginTop: 1 }}>{idea.task.title}</Text>
            {!!ideaWhy && <Text numberOfLines={1} style={{ color: t.ink2, fontSize: 14, fontFamily: T.brand, marginTop: 2 }}>{ideaWhy}</Text>}
          </View>
          <LinkButton label="Add to Today" onPress={() => move(idea.task, 'today')} accessibilityLabel={`Add ${idea.task.title} to Today`} />
        </View>
      )}
      {!cols[c].length && !(c === 'today' && !q && idea) && (
        <Empty color={k.seaInk}>{q ? 'Nothing here.' : c === 'today' ? 'Nothing on today yet.' : c === 'week' ? 'Nothing planned this week.' : 'Ideas and maybes live here.'}</Empty>
      )}
      {!q && <AddRow placeholder={`Add to ${COL_NAME[c]}…`} ink={k.seaInk} onAdd={v => addTo(v, c)} />}
    </View>
  );

  const aside = (
    <View style={{ gap: 20, ...(side ? { width: 340, marginTop: 96 } : { flexDirection: 'row', marginTop: 20 }) }}>
      <DeskCard style={side ? {} : { flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 24 }}>
          <Label>{habits.length ? `Habits · ${habits.length}` : 'Habits'}</Label>
          <LinkButton label="+ New habit" accessibilityLabel="New habit" onPress={() => router.push('/habit')} />
        </View>
        {habits.map(v => <HabitRow key={v.habit.id} view={v} onPress={() => setHabit(v)} onTick={() => tickHabit(v)} />)}
        {!habits.length && <Empty>No habits yet.</Empty>}
      </DeskCard>
      <DeskCard style={side ? {} : { flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 24 }}>
          <Label>{projects.length ? `Projects · ${projects.length}` : 'Projects'}</Label>
          <LinkButton label="+ Plan a project" accessibilityLabel="Plan a project" onPress={() => router.push('/project/new')} />
        </View>
        {projects.map(p => (
          <ProjectRow key={p.project.id} title={p.project.title} total={p.total} done={p.done}
            onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.project.id } })} />
        ))}
        {!projects.length && <Empty>Type a goal into Tell Nu, like “launch my website”, and Nu plans the steps.</Empty>}
      </DeskCard>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Mica />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexGrow: 1, width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: pad, paddingBottom: 28 }}>
          <DeskHeader title="Tasks">
            <View style={{
              marginLeft: 10, width: inner < 900 ? 320 : 280, maxWidth: '100%', height: 46, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
              backgroundColor: k.field, borderWidth: 1, borderColor: searching ? t.ink3 : t.stroke,
            }}>
              <View {...decorative}>
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={t.ink3} strokeWidth={1.8} strokeLinecap="round">
                  <Circle cx={11} cy={11} r={6.5} /><Path d="m20 20-4.2-4.2" />
                </Svg>
              </View>
              <TextInput value={q} onChangeText={setQ} placeholder="Search tasks" placeholderTextColor={t.ink3} accessibilityLabel="Search tasks"
                {...({ dataSet: { ownFocus: '1' } } as object)}
                onFocus={() => setSearching(true)} onBlur={() => setSearching(false)}
                onKeyPress={e => { if ((e.nativeEvent as { key: string }).key === 'Escape') setQ(''); }}
                style={{ flex: 1, minWidth: 0, color: t.ink, fontSize: 16.5, fontFamily: T.brand, outlineStyle: 'none' } as unknown as TextStyle} />
            </View>
          </DeskHeader>

          <View style={{ flexDirection: side ? 'row' : 'column', gap: 20, alignItems: side ? 'flex-start' : 'stretch' }}>
            {/* the water: Nu on the surface, everything held under it, as one list */}
            <View style={{ flex: side ? 1 : undefined, minWidth: 0, marginTop: 96, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 20 }}>
              <LinearGradient pointerEvents="none" colors={k.sea} locations={[0, 0.4, 1]}
                style={{ position: 'absolute', inset: 0, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }} />
              <View {...decorative} style={{ position: 'absolute', left: 0, right: 0, top: -27, height: 28 }}>
                <Wave fill={k.sea[0]} line={k.seaLine} />
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', top: -112, left: 36 }}>
                <Character name="nu-rest" size={136} motion="bob" />
              </View>
              <View style={{ borderRadius: 16, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 8, backgroundColor: k.lane }}>
                {ORDER.map(section)}
              </View>
            </View>
            {aside}
          </View>

          <View {...decorative} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
            <Key k="J" /><Key k="K" /><Hint> select · </Hint><Key k="X" /><Hint> complete · </Hint>
            <Key k="T" /><Key k="W" /><Key k="S" /><Hint> send to Today, This week or Someday · </Hint>
            <Key k="⌫" /><Hint> delete</Hint>
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
