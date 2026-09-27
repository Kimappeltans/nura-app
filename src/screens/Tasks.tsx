import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { backToSession } from '../nav';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme, PinnedPalette } from '../store';
import { search as searchTasks, toggleHabitToday, pauseHabit, resumeHabit, letGoHabit, type Task } from '../db';
import type { HabitView } from '../habits';
import { HabitRow } from '../components/HabitRow';
import { HabitSheet } from '../components/HabitSheet';
import { byPlan, reasonFor } from '../next';
import { type as T, nuTheme, type Theme } from '../theme';
import { Mica, Character } from '../ui';
import { TaskSheet } from '../components/TaskSheet';
import { TaskPeek } from '../components/TaskPeek';
import { SearchBar } from '../components/SearchField';
import { HeldRow, taskValue } from '../components/HeldRow';
import { LabelGlyph } from '../components/LabelIcon';
import { byPriority } from './Home';
import type { LabelId } from '../labels';
import { useScreen, useDesk, ROOM_MAX } from '../screen';
import { Tide, Bubbles } from '../components/Tide';
import { LinearGradient } from 'expo-linear-gradient';
import { announce, decorative } from '../a11y';

const CORAL = '#FF6B35';
const ON_CORAL = '#3B1204';
const INK_NU = '#1B1830';

/**
 * YOUR TASKS — everything sinks, one thing rises (design/nura-journey-blend-v6.html, option C).
 *
 * The one thing Nu found floats above the water, coral, with Begin — the only
 * thing here you can start. Everything else is held underwater, deeper the
 * later it is: Today just under the surface, This week lower, projects, then
 * Someday deepest and faintest. Habits come first, just under the surface:
 * they come round every day, so they're held at today's depth, and they're
 * what gets ticked most. Nu sits on the surface, holding all of it.
 * Tap a task to look at it, hold it for what you can do with it.
 * (The earlier versions are src/legacy/Tasks.tsx and the git history.)
 */
export default function Tasks() {
  const t = useTheme();
  const { width } = useScreen();
  // a wide web window: the room's content in a centred lane, the water the
  // whole width, and underwater in two columns (src/components/Desk.tsx)
  const desk = useDesk();
  const lane: ViewStyle = desk
    ? { width: '100%', maxWidth: ROOM_MAX + 80, alignSelf: 'center', paddingHorizontal: 40 }
    : { paddingHorizontal: 24 };
  const { inbox, todayPicked, projects, habits, refreshHabits, now, nowDecision, decisions, focusOn, toRa, running } = useStore();
  const [habit, setHabit] = useState<HabitView | null>(null);   // the habit's sheet (tap or hold)
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Task[]>([]);
  const [held, setHeld] = useState<Task | null>(null);     // the actions (long press)
  const [peek, setPeek] = useState<Task | null>(null);     // the task sheet (tap)

  useEffect(() => {
    let dead = false;
    (async () => { const r = q.trim() ? await searchTasks(q) : []; if (!dead) setHits(r); })();
    return () => { dead = true; };
  }, [q, inbox.length]);

  // the match count, said once the typing settles (not on every key)
  useEffect(() => {
    if (!searching || !q.trim()) return;
    const id = setTimeout(() => announce(`${hits.length} match${hits.length === 1 ? '' : 'es'}`), 900);
    return () => clearTimeout(id);
  }, [hits, q, searching]);

  const projectOf = useMemo(() => new Map(
    projects.filter(p => p.current?.task_id).map(p => [p.current!.task_id!, p.project.title])), [projects]);

  // the one that rises, and the depths everything else is held at
  const water = useMemo(() => {
    const tonight = new Date().setHours(23, 59, 59, 999);
    const weekEnd = tonight + 7 * 86400_000;
    // the planner's order (src/next.ts), the same one Home and Ra use
    const order = byPlan(decisions, byPriority);
    const today = [...todayPicked].filter(x => !x.parent_id).sort(order);
    const open = [...inbox].sort(order);
    const pick = now ?? today[0] ?? null;
    const seen = new Set<string>(pick ? [pick.id] : []);
    const take = (xs: Task[]) => xs.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    const todayRows = take([...today, ...open.filter(x => !!x.due_at && x.due_at <= tonight)]);
    const weekRows = take(open.filter(x => !!x.due_at && x.due_at <= weekEnd).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0)));
    const somedayRows = take(open);
    return { pick, today: todayRows, week: weekRows, someday: somedayRows };
  }, [inbox, todayPicked, now, decisions]);

  // underwater is Nu's water from the opening, in any appearance
  const sea = nuTheme;

  const label = (text: string, action?: { label: string; onPress: () => void }, p: Theme = t) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 2, minHeight: 20 }}>
      <Text accessibilityRole="header" accessibilityLabel={text.replace(' · ', ', ')}
        style={{ flex: 1, color: p.ink3, fontSize: 11, letterSpacing: 1.7, fontFamily: T.display }}>{text}</Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button"
          accessibilityLabel={action.label.replace(/^\+ /, '').replace(/ ›$/, '')}>
          <Text style={{ color: p.nu, fontSize: 13, fontFamily: T.display }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
  const rows = (xs: Task[], faint: 0 | 1 | 2) => xs.map(x => (
    <HeldRow key={x.id} task={x} faint={faint} meta={projectOf.get(x.id)} onPress={() => setPeek(x)} onHold={() => setHeld(x)} />
  ));

  // habits: every day, so at today's depth, first
  const habitDo = (fn: (id: string) => Promise<unknown>) => async (v: HabitView) => { await fn(v.habit.id); await refreshHabits(); };
  const tickHabit = habitDo(toggleHabitToday);
  const habitsSec = (
    <>
      {label(habits.length ? `HABITS · ${habits.length}` : 'HABITS', { label: '+ New habit', onPress: () => router.push('/habit') }, sea)}
      {habits.map(v => (
        <HabitRow key={v.habit.id} view={v} onPress={() => setHabit(v)} onTick={() => tickHabit(v)} />
      ))}
    </>
  );

  // underwater, deeper the later it is
  const todaySec = water.today.length > 0 && (
    <>
      {label(`TODAY · ${water.today.length}`, { label: 'Sort ›', onPress: () => router.push('/triage') }, sea)}
      {rows(water.today, 0)}
    </>
  );
  const weekSec = water.week.length > 0 && (
    <>
      {label(`THIS WEEK · ${water.week.length}`, undefined, sea)}
      {rows(water.week, 1)}
    </>
  );
  const somedaySec = water.someday.length > 0 && (
    <>
      {label(`SOMEDAY · ${water.someday.length}`, undefined, sea)}
      {rows(water.someday, 2)}
    </>
  );
  const project = (p: (typeof projects)[number]) => (
    <Pressable key={p.project.id} onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.project.id } })}
      accessibilityRole="button" accessibilityLabel={`${p.project.title}, ${p.total - p.done} left`}
      style={({ pressed }) => ({ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: sea.stroke, opacity: pressed ? 0.7 : 1 })}>
      {/* the path, as dots lit by the moves done */}
      <View {...decorative} style={{ width: 30, flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
        {Array.from({ length: Math.min(p.total, 6) }, (_, i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i < p.done ? CORAL : 'transparent', borderWidth: 1.2, borderColor: i < p.done ? CORAL : sea.strokeStrong }} />
        ))}
      </View>
      <Text numberOfLines={1} style={{ flex: 1, color: sea.ink, fontSize: 15.5, fontFamily: T.brand, letterSpacing: -0.3 }}>{p.project.title}</Text>
      <Text style={{ color: sea.ink, fontSize: 21, letterSpacing: -0.9, fontFamily: T.displayLight }}>
        {p.total - p.done}<Text style={{ color: sea.ink3, fontSize: 11, letterSpacing: 0, fontFamily: T.brand }}> left</Text>
      </Text>
    </Pressable>
  );
  const projHalf = Math.ceil(projects.length / 2);
  // always there, so planning something bigger has one quiet place to start
  const projSec = (
    <>
      {label(projects.length ? `PROJECTS · ${projects.length}` : 'PROJECTS', { label: '+ Plan a project', onPress: () => router.push('/project/new') }, sea)}
      {desk && projects.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 48, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{projects.slice(0, projHalf).map(project)}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{projects.slice(projHalf).map(project)}</View>
        </View>
      ) : projects.map(project)}
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* the room, and search */}
        <View style={[{ flexDirection: 'row', alignItems: 'center', paddingTop: desk ? 40 : 14 }, lane]}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>Your Tasks</Text>
          </View>
          <Pressable onPress={() => { Haptics.selectionAsync(); setSearching(v => !v); setQ(''); }} hitSlop={8}
            accessibilityRole="button" accessibilityLabel={searching ? 'Close search' : 'Search tasks and projects'}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.card,
            })}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.ink2} strokeWidth={1.8} strokeLinecap="round">
              {searching ? <Path d="M6 6l12 12M18 6L6 18" /> : <><Circle cx={11} cy={11} r={7} /><Path d="M16.3 16.3L21 21" /></>}
            </Svg>
          </Pressable>
        </View>

        {searching ? (
          <View style={[{ paddingTop: 18 }, lane]}>
            <SearchBar autoFocus value={q} onChange={setQ} placeholder="Search tasks and projects" />
            {!!q.trim() && label(`${hits.length} MATCH${hits.length === 1 ? '' : 'ES'}`)}
            {rows(hits, 0)}
          </View>
        ) : (
          <>
            {/* above the water: the one Nu found (Home's front card, a size down), held up by Nu */}
            <View style={[{ marginHorizontal: 24, marginTop: 20, zIndex: 2 }, desk && { marginHorizontal: 0, marginTop: 28, width: '100%', maxWidth: 560, alignSelf: 'center' }]}>
              {water.pick ? (
                <View style={{ borderRadius: 28, backgroundColor: CORAL, paddingHorizontal: 18, paddingVertical: 16,
                  shadowColor: '#FF8A5C', shadowOpacity: 0.4, shadowRadius: 25, shadowOffset: { width: 0, height: 0 } }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,18,4,0.10)' }}>
                      {!!water.pick.label && <LabelGlyph id={water.pick.label as LabelId} size={17} color={ON_CORAL} />}
                    </View>
                    <Text style={{ color: ON_CORAL, fontSize: 13, fontFamily: T.display }}>{projectOf.get(water.pick.id) ?? 'Nu found this one'}</Text>
                  </View>
                  <Pressable onPress={() => setPeek(water.pick!)} hitSlop={4} accessibilityRole="button" accessibilityLabel={water.pick.title}>
                    <Text style={{ color: ON_CORAL, fontSize: 21, lineHeight: 23, fontFamily: T.display, letterSpacing: -0.9, marginTop: 8, paddingRight: 30 }}>{water.pick.title}</Text>
                  </Pressable>
                  {(() => {
                    const fact = reasonFor(decisions, water.pick!.id, nowDecision);
                    return fact ? <Text style={{ color: ON_CORAL, fontSize: 12.5, fontFamily: T.brand, marginTop: 5 }}>{fact}</Text> : null;
                  })()}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
                    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); if (running?.id === water.pick!.id) backToSession(running); else focusOn(water.pick!.id); }}
                      accessibilityRole="button" accessibilityLabel={running?.id === water.pick.id ? `Back to ${water.pick.title}` : `Begin ${water.pick.title}`}
                      style={({ pressed }) => ({ minWidth: 56, minHeight: 56, paddingHorizontal: 6, borderRadius: 28, backgroundColor: INK_NU, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                      <Text style={{ color: '#FAF7F0', fontSize: 13.5, fontFamily: T.display }}>{running?.id === water.pick.id ? 'Back to it' : 'Begin'}</Text>
                    </Pressable>
                    {(() => {
                      const v = taskValue(water.pick);
                      return v ? (
                        <Text style={{ color: ON_CORAL, fontSize: 40, letterSpacing: -2, fontFamily: T.displayLight }}>
                          {v.big}<Text style={{ fontSize: 13, letterSpacing: 0, fontFamily: T.brand }}>{v.small}</Text>
                        </Text>
                      ) : null;
                    })()}
                  </View>
                </View>
              ) : inbox.length > 0 ? (
                // tasks are waiting, none on Today: a pick (Focus's "What feels doable now?"), not the planner
                <View style={{ borderRadius: 28, backgroundColor: t.card, borderWidth: 1, borderColor: t.stroke, padding: 20, gap: 10 }}>
                  <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display, letterSpacing: -0.6 }}>Nothing picked yet.</Text>
                  <Pressable onPress={toRa} hitSlop={6} style={{ paddingVertical: 6, marginVertical: -6 }} accessibilityRole="button" accessibilityLabel="Pick one for today">
                    <Text style={{ color: t.nu, fontSize: 14.5, fontFamily: T.display }}>Pick one for today ›</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ borderRadius: 28, backgroundColor: t.card, borderWidth: 1, borderColor: t.stroke, padding: 20, gap: 10 }}>
                  <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display, letterSpacing: -0.6 }}>Nothing to begin yet.</Text>
                  <Pressable onPress={() => router.push('/project/new')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Plan something bigger">
                    <Text style={{ color: t.nu, fontSize: 14.5, fontFamily: T.display }}>Plan something bigger ›</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* the surface, the story's sea, just under the card */}
            <View {...decorative} style={{ height: 28, marginTop: 72 }}>
              <Tide width={width} fill="#1C4A78" line="rgba(184,229,248,0.9)" backFill="rgba(36,99,146,0.28)" />
            </View>

            {/* underwater: everything Nu is holding, deeper the later it is */}
            <PinnedPalette.Provider value={sea}>
            <View style={{ flexGrow: 1, marginTop: -1, paddingHorizontal: desk ? 0 : 24, paddingTop: 34, paddingBottom: 48 }}>
              <LinearGradient colors={['#1C4A78', '#153E6A', '#102749', '#070F24']} locations={[0, 0.18, 0.55, 1]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
              <Bubbles width={width} />
              {/* Nu, come up to the surface, reaching up to the one */}
              <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 58, top: -71, zIndex: 3 }}>
                <Character name="nu-surface" size={116} motion="bob" />
              </View>
              {desk ? (
                <View style={lane}>
                  {(() => {
                    // two columns: Today, and everything else; projects under both
                    const left = water.today.length ? todaySec : weekSec;
                    const right = water.today.length ? <>{weekSec}{somedaySec}</> : somedaySec;
                    const both = !!(water.today.length ? water.week.length + water.someday.length : water.week.length && water.someday.length);
                    // habits at the top of the left column, above Today
                    return both ? (
                      <View style={{ flexDirection: 'row', gap: 48, alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, minWidth: 0 }}>{habitsSec}{left}</View>
                        <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
                      </View>
                    ) : <>{habitsSec}{todaySec}{weekSec}{somedaySec}</>;
                  })()}
                  <View style={{ marginTop: 24 }}>{projSec}</View>
                </View>
              ) : (
                <>
                  {habitsSec}
                  {todaySec}
                  {weekSec}
                  {projSec}
                  {somedaySec}
                </>
              )}
            </View>
            </PinnedPalette.Provider>
          </>
        )}
      </ScrollView>

      <TaskPeek task={peek} onClose={() => setPeek(null)} onMore={x => setTimeout(() => setHeld(x), 350)} />
      <TaskSheet task={held} onClose={() => setHeld(null)} />
      <HabitSheet view={habit} onClose={() => setHabit(null)} onTick={tickHabit}
        onPause={habitDo(pauseHabit)} onResume={habitDo(resumeHabit)} onLetGo={habitDo(letGoHabit)} />
    </SafeAreaView>
  );
}
